/**
 * TimelineStore
 * Manages recorded timeline tracks, animations, transitions, discrete events,
 * scroller samples, DOM disconnection tracking, sub-lane packing, and time-scrub interpolation.
 */

import {
  formatElementLabel,
  extractNumericValue,
  sanitizeKeyframes,
  sanitizeTiming,
  detectTimelineInfo,
  detectAnimationCategory,
} from './dom-utils.js';

/**
 * Normalizes a CSS property name to kebab-case so `backgroundColor` and `background-color` match.
 *
 * @param {string} prop
 * @returns {string}
 */
export function normalizePropertyName(prop) {
  if (!prop || typeof prop !== 'string') return '';
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * Linearly interpolates `{ scrollTop, scrollLeft }` from sorted scroll samples at relative time `t`.
 *
 * @param {Array<{ t: number, scrollTop: number, scrollLeft: number }>} samples
 * @param {number} t
 * @returns {{ scrollTop: number, scrollLeft: number } | null}
 */
export function interpolateScroll(samples, t) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  if (samples.length === 1 || t <= samples[0].t) {
    return {
      scrollTop: samples[0].scrollTop,
      scrollLeft: samples[0].scrollLeft,
    };
  }
  const last = samples[samples.length - 1];
  if (t >= last.t) {
    return {
      scrollTop: last.scrollTop,
      scrollLeft: last.scrollLeft,
    };
  }

  // Binary search for bracketing samples
  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const s0 = samples[lo];
  const s1 = samples[hi];
  const dt = s1.t - s0.t;
  if (dt <= 0) {
    return { scrollTop: s0.scrollTop, scrollLeft: s0.scrollLeft };
  }

  const ratio = Math.max(0, Math.min(1, (t - s0.t) / dt));
  return {
    scrollTop: s0.scrollTop + (s1.scrollTop - s0.scrollTop) * ratio,
    scrollLeft: s0.scrollLeft + (s1.scrollLeft - s0.scrollLeft) * ratio,
  };
}

/**
 * Computes the interpolated state (`phase`, `currentTime`, `progress`, `currentIteration`)
 * of an `AnimationRecord` at relative timeline timestamp `t` (in ms).
 *
 * @param {object} record
 * @param {number} t
 * @returns {{ phase: 'before'|'delay'|'active'|'after'|'cancelled', currentTime: number, progress: number }}
 */
export function interpolateAnimationState(record, t) {
  if (!record) {
    return { phase: 'before', currentTime: 0, progress: 0 };
  }

  const isScrollDriven = record.timelineType === 'scroll' || record.timelineType === 'view';

  if (isScrollDriven) {
    const sampled = interpolateSampleAt(record.samples, t);
    const progress = sampled ? Math.max(0, Math.min(1, sampled.progress ?? 0)) : 0;
    const currentTime = sampled?.currentTime ?? progress * 100;
    return {
      phase: progress > 0 && progress < 1 ? 'active' : 'after',
      currentTime,
      progress,
    };
  }

  const runTime = record.runTime ?? record.startTime ?? 0;
  const startTime = record.startTime ?? runTime;
  const endTime = record.endTime ?? startTime;

  if (t < runTime) {
    return { phase: 'before', currentTime: 0, progress: 0 };
  }

  if (t < startTime) {
    return { phase: 'delay', currentTime: 0, progress: 0 };
  }

  const duration = Math.max(
    1,
    extractNumericValue(record.timing?.duration, 0) || Math.max(1, endTime - startTime)
  );
  const iterations =
    record.timing?.iterations === Infinity
      ? Infinity
      : Math.max(1, extractNumericValue(record.timing?.iterations, 1) || 1);
  const totalActiveDuration =
    iterations === Infinity ? Infinity : duration * iterations;

  if (t > endTime) {
    if (record.cancelTime !== null && record.cancelTime !== undefined) {
      const lastSample = record.samples?.[record.samples.length - 1];
      return {
        phase: 'cancelled',
        currentTime: lastSample?.currentTime ?? Math.max(0, record.cancelTime - startTime),
        progress: lastSample?.progress ?? 0,
      };
    }

    const finalTime = Number.isFinite(totalActiveDuration)
      ? totalActiveDuration
      : Math.max(0, endTime - startTime) + (record.initialCurrentTime || 0);
    return {
      phase: 'after',
      currentTime: finalTime,
      progress: 1,
    };
  }

  // Within active interval [startTime, endTime]
  const sampled = interpolateSampleAt(record.samples, t);
  const elapsed = Math.max(0, t - startTime);
  const computedCurrentTime = (record.initialCurrentTime || 0) + elapsed;

  const currentTime =
    sampled && Number.isFinite(sampled.currentTime)
      ? sampled.currentTime
      : computedCurrentTime;

  // Compute progress (0..1 within current iteration) from currentTime & direction
  const rawIter = duration > 0 ? currentTime / duration : 0;
  const iterIndex = Math.floor(rawIter);
  let iterProgress = rawIter - iterIndex;
  if (rawIter > 0 && iterProgress === 0 && currentTime >= duration) {
    iterProgress = 1;
  }

  const direction = record.timing?.direction || 'normal';
  const isEvenIter = iterIndex % 2 === 0;
  if (direction === 'reverse') {
    iterProgress = 1 - iterProgress;
  } else if (direction === 'alternate' && !isEvenIter) {
    iterProgress = 1 - iterProgress;
  } else if (direction === 'alternate-reverse' && isEvenIter) {
    iterProgress = 1 - iterProgress;
  }

  const progress =
    sampled && Number.isFinite(sampled.progress)
      ? Math.max(0, Math.min(1, sampled.progress))
      : Math.max(0, Math.min(1, iterProgress));

  return {
    phase: 'active',
    currentTime,
    progress,
  };
}

function interpolateSampleAt(samples, t) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  if (samples.length === 1 || t <= samples[0].t) {
    return samples[0];
  }
  const last = samples[samples.length - 1];
  if (t >= last.t) {
    return last;
  }

  let lo = 0;
  let hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const s0 = samples[lo];
  const s1 = samples[hi];
  const dt = s1.t - s0.t;
  if (dt <= 0) return s0;

  const ratio = Math.max(0, Math.min(1, (t - s0.t) / dt));

  const ct0 = s0.currentTime ?? 0;
  const ct1 = s1.currentTime ?? ct0;
  const p0 = s0.progress ?? 0;
  const p1 = s1.progress ?? p0;

  // Avoid interpolating across an iteration wrap-around (e.g. 0.98 -> 0.02)
  const wrapped = p1 < p0 - 0.4;
  return {
    t,
    currentTime: ct0 + (ct1 - ct0) * ratio,
    progress: wrapped ? p0 : p0 + (p1 - p0) * ratio,
  };
}

/**
 * Assigns non-overlapping sub-row lane indices (`0, 1, 2, ...`) to animation records
 * so concurrent animations on the same element stack cleanly without overlapping.
 *
 * @param {Array<object>} animations
 * @returns {number} Total number of lanes used (minimum 1)
 */
export function assignAnimationLanes(animations) {
  if (!Array.isArray(animations) || animations.length === 0) return 1;

  const sorted = [...animations].sort((a, b) => {
    const startA = a.runTime ?? a.startTime ?? 0;
    const startB = b.runTime ?? b.startTime ?? 0;
    return startA - startB;
  });

  const laneEndTimes = [];

  for (const anim of sorted) {
    const start = anim.runTime ?? anim.startTime ?? 0;
    const end = Math.max(start + 1, anim.endTime ?? start + 1);

    let assignedLane = -1;
    for (let i = 0; i < laneEndTimes.length; i++) {
      if (laneEndTimes[i] <= start + 0.5) {
        assignedLane = i;
        laneEndTimes[i] = end;
        break;
      }
    }

    if (assignedLane === -1) {
      assignedLane = laneEndTimes.length;
      laneEndTimes.push(end);
    }

    anim.lane = assignedLane;
  }

  return Math.max(1, laneEndTimes.length);
}

export class TimelineStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = 0;
    this.duration = 0;
    this._nextTrackId = 1;
    this._nextAnimId = 1;
    this._nextEventId = 1;

    this.globalRow = {
      id: 'global-window',
      label: 'window / document',
      events: [],
      scrollSamples: [],
      scrollSpans: [],
      scrollEnabled: true,
    };

    /** @type {Map<Element, object>} */
    this.elementTracks = new Map();

    /** @type {WeakMap<Animation, object>} */
    this.animationMap = new WeakMap();
  }

  start(startTimeMs = 0) {
    this.reset();
    this.startTime = startTimeMs;
  }

  /**
   * Gets or creates an ElementTrack for a given DOM Element.
   *
   * @param {Element} element
   * @param {number} [timestamp=0]
   * @returns {object|null}
   */
  getOrCreateElementTrack(element, timestamp = 0) {
    if (!element || typeof element !== 'object') return null;

    let track = this.elementTracks.get(element);
    if (!track) {
      const isConnected = element.isConnected !== undefined ? Boolean(element.isConnected) : true;
      track = {
        id: `track-${this._nextTrackId++}`,
        element,
        label: formatElementLabel(element),
        firstSeenAt: timestamp,
        removed: !isConnected,
        removedAt: !isConnected ? timestamp : null,
        animations: [],
        events: [],
        scrollSamples: [],
        scrollSpans: [],
        valueSamples: [],
        scrollEnabled: true,
        laneCount: 1,
      };
      this.elementTracks.set(element, track);
    } else {
      // Refresh label if element gained an ID or classes while still connected
      if (element.isConnected && track.label === element.tagName?.toLowerCase()) {
        const updatedLabel = formatElementLabel(element);
        if (updatedLabel.length > track.label.length) {
          track.label = updatedLabel;
        }
      }
    }

    return track;
  }

  /**
   * Records a global event on `window / document` (e.g. root scroll, global keydown/keyup).
   *
   * @param {object} eventInfo
   */
  recordGlobalEvent(eventInfo) {
    const entry = {
      id: `evt-${this._nextEventId++}`,
      type: eventInfo.type,
      timestamp: Math.max(0, eventInfo.timestamp ?? 0),
      key: eventInfo.key || null,
      code: eventInfo.code || null,
      detail: eventInfo.detail || '',
    };
    this.globalRow.events.push(entry);
    return entry;
  }

  /**
   * Records a root `window / document` scroll position sample.
   *
   * @param {number} timestamp
   * @param {number} scrollTop
   * @param {number} scrollLeft
   * @param {number} [maxScrollTop=0]
   * @param {number} [maxScrollLeft=0]
   * @param {boolean} [isDiscreteScrollEvent=false]
   */
  recordGlobalScroll(
    timestamp,
    scrollTop,
    scrollLeft,
    maxScrollTop = 0,
    maxScrollLeft = 0,
    isDiscreteScrollEvent = false
  ) {
    const t = Math.max(0, timestamp);
    const samples = this.globalRow.scrollSamples;
    const prev = samples[samples.length - 1];

    if (
      !prev ||
      prev.scrollTop !== scrollTop ||
      prev.scrollLeft !== scrollLeft ||
      isDiscreteScrollEvent
    ) {
      samples.push({
        t,
        scrollTop,
        scrollLeft,
        maxScrollTop,
        maxScrollLeft,
      });
    }

    if (isDiscreteScrollEvent) {
      this._appendScrollSpan(this.globalRow.scrollSpans, t);
      this.recordGlobalEvent({
        type: 'scroll',
        timestamp: t,
        detail: `scrollTop: ${Math.round(scrollTop)}px, scrollLeft: ${Math.round(scrollLeft)}px`,
      });
    }
  }

  /**
   * Records a scroll sample on a scrollable container element.
   *
   * @param {Element} element
   * @param {number} timestamp
   * @param {number} scrollTop
   * @param {number} scrollLeft
   * @param {number} [maxScrollTop=0]
   * @param {number} [maxScrollLeft=0]
   * @param {boolean} [isDiscreteScrollEvent=false]
   */
  recordElementScroll(
    element,
    timestamp,
    scrollTop,
    scrollLeft,
    maxScrollTop = 0,
    maxScrollLeft = 0,
    isDiscreteScrollEvent = false
  ) {
    const track = this.getOrCreateElementTrack(element, timestamp);
    if (!track) return;

    const t = Math.max(0, timestamp);
    const samples = track.scrollSamples;
    const prev = samples[samples.length - 1];

    if (
      !prev ||
      prev.scrollTop !== scrollTop ||
      prev.scrollLeft !== scrollLeft ||
      isDiscreteScrollEvent
    ) {
      samples.push({
        t,
        scrollTop,
        scrollLeft,
        maxScrollTop,
        maxScrollLeft,
      });
    }

    if (isDiscreteScrollEvent) {
      this._appendScrollSpan(track.scrollSpans, t);
      this.recordElementEvent(element, {
        type: 'scroll',
        timestamp: t,
        detail: `scrollTop: ${Math.round(scrollTop)}px, scrollLeft: ${Math.round(scrollLeft)}px`,
      });
    }
  }

  _appendScrollSpan(spans, t) {
    const GAP_THRESHOLD_MS = 180;
    const last = spans[spans.length - 1];
    if (last && t - last.endTime <= GAP_THRESHOLD_MS) {
      last.endTime = Math.max(last.endTime, t + 16);
    } else {
      spans.push({
        startTime: t,
        endTime: t + 24,
      });
    }
  }

  /**
   * Records a discrete event on a tracked element (`click`, `keydown`, `animationiteration`, etc.).
   *
   * @param {Element} element
   * @param {object} eventInfo
   */
  recordElementEvent(element, eventInfo) {
    const track = this.getOrCreateElementTrack(element, eventInfo.timestamp ?? 0);
    if (!track) return null;

    const entry = {
      id: `evt-${this._nextEventId++}`,
      type: eventInfo.type,
      timestamp: Math.max(0, eventInfo.timestamp ?? 0),
      name: eventInfo.name || null,
      key: eventInfo.key || null,
      detail: eventInfo.detail || '',
    };
    track.events.push(entry);
    return entry;
  }

  /**
   * Registers or updates an `Animation` object discovered via `document.getAnimations()`,
   * `element.animate()`, or animation/transition DOM events.
   *
   * @param {Animation} animation
   * @param {number} timestamp
   * @param {object} [options={}]
   * @returns {object|null}
   */
  registerAnimation(animation, timestamp, options = {}) {
    const target = options.target || animation?.effect?.target;
    if (!target) return null;

    const track = this.getOrCreateElementTrack(target, timestamp);
    if (!track) return null;

    if (animation && typeof animation === 'object' && this.animationMap.has(animation)) {
      const existing = this.animationMap.get(animation);
      this._refreshAnimationSnapshot(existing, animation, timestamp);
      return existing;
    }

    const { category, name } = options.category
      ? { category: options.category, name: options.name || 'animation' }
      : detectAnimationCategory(animation);

    const tlInfo = detectTimelineInfo(animation);

    // Check if there is already an open DOM-event-initiated record for the same property/animationName
    const normalizedName = normalizePropertyName(name);
    let record = track.animations.find(
      (a) =>
        !a.completed &&
        !a.animation &&
        a.category === category &&
        normalizePropertyName(a.name) === normalizedName
    );

    let keyframes = [];
    let rawTiming = null;
    try {
      if (typeof animation?.effect?.getKeyframes === 'function') {
        keyframes = sanitizeKeyframes(animation.effect.getKeyframes());
      }
      if (typeof animation?.effect?.getComputedTiming === 'function') {
        rawTiming = animation.effect.getComputedTiming();
      }
    } catch {
      // Ignore security or detached effect errors
    }

    const timing = sanitizeTiming(rawTiming, options.duration || 0);
    const currentTimeNum = extractNumericValue(animation?.currentTime, 0) ?? 0;
    const progressNum =
      timing.progress !== null
        ? timing.progress
        : tlInfo.isScrollDriven
          ? Math.max(0, Math.min(1, currentTimeNum / 100))
          : 0;

    if (!record) {
      const delayMs = !tlInfo.isScrollDriven && timing.delay > 0 ? timing.delay : 0;
      const isAtRecordingStart = Boolean(options.atRecordingStart);

      const runTime = options.runTime ?? Math.max(0, timestamp);
      const startTime =
        options.startTime ??
        (isAtRecordingStart ? 0 : runTime + (currentTimeNum < 0 ? Math.abs(currentTimeNum) : delayMs));

      record = {
        id: `anim-${this._nextAnimId++}`,
        animation: animation || null,
        element: target,
        category,
        name,
        timelineType: tlInfo.type,
        timelineLabel: tlInfo.label,
        isScrollDriven: tlInfo.isScrollDriven,
        scrollSource: tlInfo.source,
        runTime,
        startTime,
        endTime: null,
        finishTime: null,
        cancelTime: null,
        iterations: [],
        keyframes,
        timing,
        initialCurrentTime: Math.max(0, currentTimeNum),
        wasRunningAtStart: isAtRecordingStart,
        wasRunningAtEnd: false,
        completed: false,
        samples: [],
        lane: 0,
      };
      track.animations.push(record);
    } else {
      record.animation = animation || null;
      record.timelineType = tlInfo.type;
      record.timelineLabel = tlInfo.label;
      record.isScrollDriven = tlInfo.isScrollDriven;
      record.scrollSource = tlInfo.source;
      if (keyframes.length > 0) record.keyframes = keyframes;
      record.timing = timing;
      record.initialCurrentTime = Math.max(0, currentTimeNum);
    }

    if (animation && typeof animation === 'object') {
      this.animationMap.set(animation, record);
    }

    this._recordSampleOnAnimation(record, timestamp, currentTimeNum, progressNum, timing.currentIteration, animation?.playState);
    return record;
  }

  _refreshAnimationSnapshot(record, animation, timestamp) {
    if (!record || !animation) return;
    try {
      if (
        (!record.keyframes || record.keyframes.length === 0) &&
        typeof animation.effect?.getKeyframes === 'function'
      ) {
        record.keyframes = sanitizeKeyframes(animation.effect.getKeyframes());
      }
      if (typeof animation.effect?.getComputedTiming === 'function') {
        const rawTiming = animation.effect.getComputedTiming();
        const updatedTiming = sanitizeTiming(rawTiming, record.timing?.duration || 0);
        record.timing = updatedTiming;
        const ct = extractNumericValue(animation.currentTime, null);
        const prog =
          updatedTiming.progress !== null
            ? updatedTiming.progress
            : record.isScrollDriven && ct !== null
              ? Math.max(0, Math.min(1, ct / 100))
              : null;
        this._recordSampleOnAnimation(
          record,
          timestamp,
          ct,
          prog,
          updatedTiming.currentIteration,
          animation.playState
        );
      }
    } catch {
      // Ignore errors
    }
  }

  _recordSampleOnAnimation(record, timestamp, currentTime, progress, currentIteration, playState) {
    if (!record) return;
    const t = Math.max(0, timestamp);
    const samples = record.samples;
    const prev = samples[samples.length - 1];

    // Detect WAAPI iteration increments if DOM `animationiteration` does not fire
    if (
      record.category === 'waapi' &&
      typeof currentIteration === 'number' &&
      prev &&
      typeof prev.currentIteration === 'number' &&
      currentIteration > prev.currentIteration
    ) {
      const lastIter = record.iterations[record.iterations.length - 1];
      if (lastIter === undefined || Math.abs(t - lastIter) > 15) {
        record.iterations.push(t);
        this.recordElementEvent(record.element, {
          type: 'animationiteration',
          timestamp: t,
          name: record.name,
          detail: `Iteration ${currentIteration}`,
        });
      }
    }

    const ct = currentTime !== null && currentTime !== undefined ? currentTime : (prev?.currentTime ?? 0);
    const prog = progress !== null && progress !== undefined ? progress : (prev?.progress ?? 0);

    if (
      !prev ||
      Math.abs(t - prev.t) >= 8 ||
      Math.abs(ct - prev.currentTime) > 0.5 ||
      Math.abs(prog - prev.progress) > 0.005
    ) {
      samples.push({
        t,
        currentTime: ct,
        progress: prog,
        currentIteration: currentIteration ?? prev?.currentIteration ?? 0,
        playState: playState || 'running',
      });
    }
  }

  /**
   * Handles a lifecycle DOM event for a CSS Animation or CSS Transition:
   * `animationstart`, `animationiteration`, `animationend`, `animationcancel`,
   * `transitionrun`, `transitionstart`, `transitionend`, `transitioncancel`.
   *
   * @param {Element} element
   * @param {string} eventType
   * @param {number} timestamp
   * @param {object} meta
   * @param {Animation|null} [matchedAnimation=null]
   */
  handleLifecycleEvent(element, eventType, timestamp, meta = {}, matchedAnimation = null) {
    const t = Math.max(0, timestamp);
    const isTransition = eventType.startsWith('transition');
    const category = isTransition ? 'transition' : 'css-animation';
    const rawName = isTransition
      ? meta.propertyName || 'transition'
      : meta.animationName || 'animation';
    const normalizedName = normalizePropertyName(rawName);

    const track = this.getOrCreateElementTrack(element, t);
    if (!track) return null;

    // Record the discrete marker event on the element track
    this.recordElementEvent(element, {
      type: eventType,
      timestamp: t,
      name: rawName,
      detail: `${eventType} (${rawName})`,
    });

    let record = null;
    if (matchedAnimation && this.animationMap.has(matchedAnimation)) {
      record = this.animationMap.get(matchedAnimation);
    }

    if (!record) {
      // Find matching open record on this element
      for (let i = track.animations.length - 1; i >= 0; i--) {
        const candidate = track.animations[i];
        if (
          !candidate.completed &&
          candidate.category === category &&
          normalizePropertyName(candidate.name) === normalizedName
        ) {
          record = candidate;
          break;
        }
      }
    }

    if (eventType === 'transitionrun') {
      // If there's already an active transition on the same property that hasn't completed,
      // a new transitionrun means the previous one is being replaced/retried or this is a brand new one.
      if (record && record.startTime !== null && t > record.startTime + 4) {
        record.endTime = t;
        record.cancelTime = t;
        record.completed = true;
        record = null;
      }

      if (!record) {
        record = this.registerAnimation(matchedAnimation, t, {
          target: element,
          category: 'transition',
          name: rawName,
          runTime: t,
          startTime: t,
        });
      } else {
        record.runTime = Math.min(record.runTime ?? t, t);
        if (matchedAnimation) {
          record.animation = matchedAnimation;
          this.animationMap.set(matchedAnimation, record);
          this._refreshAnimationSnapshot(record, matchedAnimation, t);
        }
      }
      return record;
    }

    if (eventType === 'transitionstart' || eventType === 'animationstart') {
      if (!record) {
        record = this.registerAnimation(matchedAnimation, t, {
          target: element,
          category,
          name: rawName,
          runTime: t,
          startTime: t,
        });
      } else {
        record.startTime = t;
        if (record.runTime === null || record.runTime === undefined || record.runTime > t) {
          const delay = Math.max(0, record.timing?.delay || 0);
          record.runTime = Math.max(0, t - delay);
        }
        if (matchedAnimation) {
          record.animation = matchedAnimation;
          this.animationMap.set(matchedAnimation, record);
          this._refreshAnimationSnapshot(record, matchedAnimation, t);
        }
      }
      this._recordSampleOnAnimation(record, t, 0, 0, 0, 'running');
      return record;
    }

    if (eventType === 'animationiteration') {
      if (!record) {
        record = this.registerAnimation(matchedAnimation, t, {
          target: element,
          category: 'css-animation',
          name: rawName,
          runTime: 0,
          startTime: 0,
        });
      }
      const lastIter = record.iterations[record.iterations.length - 1];
      if (lastIter === undefined || Math.abs(t - lastIter) > 5) {
        record.iterations.push(t);
      }
      if (matchedAnimation) {
        this._refreshAnimationSnapshot(record, matchedAnimation, t);
      }
      return record;
    }

    if (eventType === 'transitionend' || eventType === 'animationend') {
      if (!record) {
        const fallbackDur = (meta.elapsedTime ? meta.elapsedTime * 1000 : 200);
        const start = Math.max(0, t - fallbackDur);
        record = this.registerAnimation(matchedAnimation, t, {
          target: element,
          category,
          name: rawName,
          runTime: start,
          startTime: start,
          duration: fallbackDur,
        });
      }
      record.finishTime = t;
      if (!record.isScrollDriven) {
        record.endTime = t;
        record.completed = true;
      }
      const elapsedMs = Math.max(1, t - (record.startTime ?? record.runTime ?? 0));
      if (!record.timing.duration || record.timing.duration <= 0) {
        record.timing.duration = elapsedMs;
        record.timing.activeDuration = elapsedMs;
      }
      this._recordSampleOnAnimation(record, t, elapsedMs, 1, record.iterations.length, 'finished');
      return record;
    }

    if (eventType === 'transitioncancel' || eventType === 'animationcancel') {
      if (!record) {
        record = this.registerAnimation(matchedAnimation, t, {
          target: element,
          category,
          name: rawName,
          runTime: Math.max(0, t - 50),
          startTime: Math.max(0, t - 50),
        });
      }
      record.endTime = t;
      record.cancelTime = t;
      record.completed = true;
      if (matchedAnimation) {
        this._refreshAnimationSnapshot(record, matchedAnimation, t);
      }
      return record;
    }

    return record;
  }

  /**
   * Marks any tracked elements that have been disconnected from the DOM (`!element.isConnected`).
   *
   * @param {number} timestamp
   */
  checkDisconnectedElements(timestamp) {
    const t = Math.max(0, timestamp);
    for (const [el, track] of this.elementTracks.entries()) {
      const isConnected = el.isConnected !== undefined ? Boolean(el.isConnected) : true;
      if (!isConnected && !track.removed) {
        track.removed = true;
        track.removedAt = t;
        track.events.push({
          id: `evt-${this._nextEventId++}`,
          type: 'removed',
          timestamp: t,
          name: 'disconnected',
          detail: `Element removed from DOM at ${Math.round(t)}ms`,
        });

        // Close any open animations on this disconnected element
        for (const anim of track.animations) {
          if (!anim.completed) {
            anim.endTime = t;
            anim.cancelTime = t;
            anim.completed = true;
          }
        }
      } else if (isConnected && track.removed) {
        // In case the element was re-attached
        track.removed = false;
      }
    }
  }

  /**
   * Finalizes the recording at `totalDurationMs`, closing open animations and assigning sub-lanes.
   *
   * @param {number} totalDurationMs
   */
  finalize(totalDurationMs) {
    this.duration = Math.max(50, totalDurationMs);
    this.checkDisconnectedElements(this.duration);

    for (const track of this.elementTracks.values()) {
      for (const anim of track.animations) {
        if (anim.runTime === null || anim.runTime === undefined) {
          anim.runTime = 0;
        }
        if (anim.startTime === null || anim.startTime === undefined) {
          anim.startTime = anim.runTime;
        }
        if (!anim.completed || anim.endTime === null || anim.endTime === undefined) {
          anim.endTime = this.duration;
          anim.wasRunningAtEnd = true;
        }
        if (anim.endTime < anim.runTime) {
          anim.endTime = anim.runTime;
        }
      }
      track.laneCount = assignAnimationLanes(track.animations);
    }
  }

  /**
   * Returns all tracked element rows in discovery order.
   *
   * @returns {Array<object>}
   */
  getTracks() {
    return Array.from(this.elementTracks.values());
  }

  /**
   * Interpolates root `window / document` scroll position at relative time `t`.
   *
   * @param {number} t
   * @returns {{ scrollTop: number, scrollLeft: number } | null}
   */
  getGlobalScrollAt(t) {
    return interpolateScroll(this.globalRow.scrollSamples, t);
  }

  /**
   * Interpolates an element's scroll position at relative time `t`.
   *
   * @param {Element} element
   * @param {number} t
   * @returns {{ scrollTop: number, scrollLeft: number } | null}
   */
  getElementScrollAt(element, t) {
    const track = this.elementTracks.get(element);
    if (!track) return null;
    return interpolateScroll(track.scrollSamples, t);
  }

  /**
   * Records a text input / textarea value snapshot on a tracked element.
   *
   * @param {Element} element
   * @param {number} timestamp
   * @param {string} value
   */
  recordElementValue(element, timestamp, value) {
    const track = this.getOrCreateElementTrack(element, timestamp);
    if (!track) return;

    const t = Math.max(0, timestamp);
    const strVal = String(value ?? '');
    const samples = track.valueSamples;
    const prev = samples[samples.length - 1];

    if (!prev || prev.value !== strVal) {
      samples.push({ t, value: strVal });
    }
  }

  /**
   * Returns the recorded value of an input/textarea element at relative time `t`.
   *
   * @param {Element} element
   * @param {number} t
   * @returns {string|null}
   */
  getElementValueAt(element, t) {
    const track = this.elementTracks.get(element);
    if (!track || !Array.isArray(track.valueSamples) || track.valueSamples.length === 0) {
      return null;
    }
    const samples = track.valueSamples;
    let current = samples[0].value;
    for (const s of samples) {
      if (s.t <= t) {
        current = s.value;
      } else {
        break;
      }
    }
    return current;
  }
}
