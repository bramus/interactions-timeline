/**
 * DOM, Animation, and Security-Safe Element Utilities for <timeline-visualizer>
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Formats an element into a readable selector label such as `div#hero.card.active`.
 *
 * @param {Element|Window|Document|object|null} el
 * @returns {string}
 */
export function formatElementLabel(el) {
  if (!el) return 'unknown';

  if (
    (typeof window !== 'undefined' && el === window) ||
    (typeof document !== 'undefined' &&
      (el === document || el === document.documentElement))
  ) {
    return 'window / document';
  }

  const rawTag = el.tagName || el.nodeName || el.localName || 'element';
  const tag = String(rawTag).toLowerCase();

  if (tag === '#document' || tag === 'html') {
    return 'window / document';
  }

  const idPart = el.id ? `#${String(el.id).trim()}` : '';

  let classes = [];
  if (el.classList && typeof el.classList[Symbol.iterator] === 'function') {
    classes = Array.from(el.classList).filter(Boolean);
  } else if (typeof el.className === 'string' && el.className.trim()) {
    classes = el.className.trim().split(/\s+/).filter(Boolean);
  } else if (el.className && typeof el.className.baseVal === 'string' && el.className.baseVal.trim()) {
    classes = el.className.baseVal.trim().split(/\s+/).filter(Boolean);
  }

  const classPart = classes.length > 0 ? `.${classes.join('.')}` : '';

  return `${tag}${idPart}${classPart}`;
}

/**
 * Checks whether a DOM node is the recorder element itself or inside its subtree / Shadow DOM.
 *
 * @param {Node|EventTarget|null} node
 * @param {Element|null} recorderElement
 * @param {ShadowRoot|null} shadowRoot
 * @returns {boolean}
 */
export function isElementInRecorder(node, recorderElement, shadowRoot) {
  if (!node || typeof node !== 'object') return false;

  if (recorderElement && node === recorderElement) return true;
  if (shadowRoot && node === shadowRoot) return true;

  let current = node;
  let depth = 0;
  while (current && depth < 100) {
    depth += 1;
    if (recorderElement && current === recorderElement) return true;
    if (shadowRoot && current === shadowRoot) return true;

    const localName = current.localName || (current.tagName ? String(current.tagName).toLowerCase() : '');
    if (localName === 'timeline-visualizer') return true;

    if (typeof current.getRootNode === 'function') {
      const root = current.getRootNode();
      if (shadowRoot && root === shadowRoot) return true;
      if (root && root !== current && root.host) {
        current = root.host;
        continue;
      }
    }

    current = current.parentNode || current.host || null;
  }

  return false;
}

/**
 * Checks whether a DOM event originated from or passed through the recorder's own DOM subtree.
 *
 * @param {Event|null} event
 * @param {Element|null} recorderElement
 * @param {ShadowRoot|null} shadowRoot
 * @returns {boolean}
 */
export function isEventFromRecorder(event, recorderElement, shadowRoot) {
  if (!event) return false;

  if (typeof event.composedPath === 'function') {
    const path = event.composedPath();
    for (const node of path) {
      if (isElementInRecorder(node, recorderElement, shadowRoot)) {
        return true;
      }
    }
  }

  return isElementInRecorder(event.target, recorderElement, shadowRoot);
}

/**
 * Extracts a finite JavaScript number from a plain number, CSSNumericValue (e.g. CSSUnitValue), or numeric string.
 *
 * @param {unknown} val
 * @param {number|null} [fallback=null]
 * @returns {number|null}
 */
export function extractNumericValue(val, fallback = null) {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }
  if (val && typeof val === 'object' && 'value' in val && typeof val.value === 'number') {
    return Number.isFinite(val.value) ? val.value : fallback;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Sanitizes keyframes returned by `effect.getKeyframes()` so they can be passed
 * back into `new KeyframeEffect(target, keyframes, timing)` for scrubbing.
 *
 * @param {Array<object>} rawKeyframes
 * @returns {Array<object>}
 */
export function sanitizeKeyframes(rawKeyframes) {
  if (!Array.isArray(rawKeyframes)) return [];

  return rawKeyframes.map((kf) => {
    if (!kf || typeof kf !== 'object') return {};
    const cleaned = {};
    for (const [key, value] of Object.entries(kf)) {
      if (key === 'computedOffset') continue;
      if (value === undefined) continue;
      cleaned[key] = value;
    }
    if (
      (cleaned.offset === null || cleaned.offset === undefined) &&
      typeof kf.computedOffset === 'number' &&
      Number.isFinite(kf.computedOffset)
    ) {
      cleaned.offset = kf.computedOffset;
    }
    return cleaned;
  });
}

/**
 * Normalizes `effect.getComputedTiming()` into a plain, serializable timing snapshot.
 *
 * @param {object|null} rawTiming
 * @param {number} [fallbackDuration=0]
 * @returns {object}
 */
export function sanitizeTiming(rawTiming, fallbackDuration = 0) {
  if (!rawTiming || typeof rawTiming !== 'object') {
    return {
      delay: 0,
      endDelay: 0,
      fill: 'both',
      iterationStart: 0,
      iterations: 1,
      duration: fallbackDuration,
      direction: 'normal',
      easing: 'linear',
      activeDuration: fallbackDuration,
      localTime: null,
      progress: null,
      currentIteration: null,
    };
  }

  const delay = extractNumericValue(rawTiming.delay, 0) ?? 0;
  const endDelay = extractNumericValue(rawTiming.endDelay, 0) ?? 0;
  const iterationStart = extractNumericValue(rawTiming.iterationStart, 0) ?? 0;

  let iterations = 1;
  if (rawTiming.iterations === Infinity) {
    iterations = Infinity;
  } else {
    iterations = extractNumericValue(rawTiming.iterations, 1) ?? 1;
  }

  const duration = extractNumericValue(rawTiming.duration, fallbackDuration) ?? fallbackDuration;
  const activeDuration =
    rawTiming.activeDuration === Infinity
      ? Infinity
      : (extractNumericValue(rawTiming.activeDuration, duration * (Number.isFinite(iterations) ? iterations : 1)) ?? duration);

  return {
    delay,
    endDelay,
    fill: typeof rawTiming.fill === 'string' && rawTiming.fill !== 'auto' ? rawTiming.fill : 'none',
    iterationStart,
    iterations,
    duration,
    direction: typeof rawTiming.direction === 'string' ? rawTiming.direction : 'normal',
    easing: typeof rawTiming.easing === 'string' ? rawTiming.easing : 'linear',
    activeDuration,
    localTime: extractNumericValue(rawTiming.localTime, null),
    progress: extractNumericValue(rawTiming.progress, null),
    currentIteration: extractNumericValue(rawTiming.currentIteration, null),
  };
}

/**
 * Detects whether an Animation's timeline is a ViewTimeline, ScrollTimeline, or DocumentTimeline (time-driven).
 *
 * @param {Animation|object|null} animation
 * @returns {{ type: 'view'|'scroll'|'time', isScrollDriven: boolean, label: string, axis: string|null, source: Element|null }}
 */
export function detectTimelineInfo(animation) {
  const tl = animation?.timeline;
  if (!tl) {
    return {
      type: 'time',
      isScrollDriven: false,
      label: 'DocumentTimeline',
      axis: null,
      source: null,
    };
  }

  const ctorName = tl.constructor?.name || '';
  const isView =
    (typeof ViewTimeline !== 'undefined' && tl instanceof ViewTimeline) ||
    ctorName === 'ViewTimeline' ||
    'subject' in tl;

  if (isView) {
    return {
      type: 'view',
      isScrollDriven: true,
      label: 'ViewTimeline',
      axis: tl.axis || 'block',
      source: tl.subject || tl.source || null,
    };
  }

  const isScroll =
    (typeof ScrollTimeline !== 'undefined' && tl instanceof ScrollTimeline) ||
    ctorName === 'ScrollTimeline' ||
    'source' in tl;

  if (isScroll) {
    return {
      type: 'scroll',
      isScrollDriven: true,
      label: 'ScrollTimeline',
      axis: tl.axis || 'block',
      source: tl.source || null,
    };
  }

  // Fallback check if currentTime is a percentage CSSUnitValue
  const ct = animation?.currentTime;
  if (ct && typeof ct === 'object' && ct.unit === 'percent') {
    return {
      type: 'scroll',
      isScrollDriven: true,
      label: 'ScrollTimeline',
      axis: 'block',
      source: null,
    };
  }

  return {
    type: 'time',
    isScrollDriven: false,
    label: 'DocumentTimeline',
    axis: null,
    source: null,
  };
}

/**
 * Detects whether an Animation instance is a CSS Transition, CSS Animation, or WAAPI animation.
 *
 * @param {Animation|object|null} animation
 * @returns {{ category: 'transition'|'css-animation'|'waapi', name: string }}
 */
export function detectAnimationCategory(animation) {
  if (!animation) {
    return { category: 'waapi', name: 'animation' };
  }

  const ctorName = animation.constructor?.name || '';

  if (
    (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition) ||
    ctorName === 'CSSTransition' ||
    typeof animation.transitionProperty === 'string'
  ) {
    return {
      category: 'transition',
      name: animation.transitionProperty || animation.id || 'transition',
    };
  }

  if (
    (typeof CSSAnimation !== 'undefined' && animation instanceof CSSAnimation) ||
    ctorName === 'CSSAnimation' ||
    typeof animation.animationName === 'string'
  ) {
    return {
      category: 'css-animation',
      name: animation.animationName || animation.id || 'keyframes',
    };
  }

  // Try to summarize animated properties from keyframes if WAAPI animation has no id
  let name = animation.id ? String(animation.id) : '';
  if (!name && typeof animation.effect?.getKeyframes === 'function') {
    try {
      const kfs = animation.effect.getKeyframes();
      const props = new Set();
      for (const kf of kfs) {
        for (const k of Object.keys(kf)) {
          if (k !== 'offset' && k !== 'computedOffset' && k !== 'easing' && k !== 'composite') {
            props.add(k);
          }
        }
      }
      if (props.size > 0) {
        name = `animate(${Array.from(props).slice(0, 2).join(', ')})`;
      }
    } catch {
      // Ignore keyframe inspection errors
    }
  }

  return {
    category: 'waapi',
    name: name || 'element.animate()',
  };
}

/**
 * Creates a DOM element safely using `document.createElement` without `innerHTML`.
 *
 * @param {string} tag
 * @param {Record<string, any>|null} [attrs=null]
 * @param  {...any} children
 * @returns {HTMLElement}
 */
export function createDomElement(tag, attrs = null, ...children) {
  const el = document.createElement(tag);
  if (attrs && typeof attrs === 'object') {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') {
        el.className = String(value);
      } else if (key === 'textContent') {
        el.textContent = String(value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'dataset' && typeof value === 'object') {
        for (const [dKey, dVal] of Object.entries(value)) {
          if (dVal !== undefined && dVal !== null) {
            el.dataset[dKey] = String(dVal);
          }
        }
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  appendChildren(el, children);
  return el;
}

/**
 * Creates an SVG element safely using `document.createElementNS` without `innerHTML`.
 *
 * @param {string} tag
 * @param {Record<string, any>|null} [attrs=null]
 * @param  {...any} children
 * @returns {SVGElement}
 */
export function createSvgElement(tag, attrs = null, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs && typeof attrs === 'object') {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      el.setAttribute(key, String(value));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(parent, child);
    } else if (typeof Node !== 'undefined' && child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}
