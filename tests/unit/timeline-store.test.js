import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatElementLabel,
  isElementInRecorder,
  isEventFromRecorder,
  extractNumericValue,
  sanitizeKeyframes,
  sanitizeTiming,
  detectTimelineInfo,
  detectAnimationCategory,
  TimelineStore,
  normalizePropertyName,
  interpolateScroll,
  interpolateAnimationState,
  assignAnimationLanes,
} from '../../src/js/timeline-visualizer/index.js';

describe('DOM & Animation Utilities (dom-utils)', () => {
  it('formats element labels as tag#id.class', () => {
    assert.equal(
      formatElementLabel({ tagName: 'DIV', id: 'hero', className: 'card active' }),
      'div#hero.card.active'
    );
    assert.equal(
      formatElementLabel({ tagName: 'BUTTON', id: '', classList: ['btn', 'primary'] }),
      'button.btn.primary'
    );
    assert.equal(
      formatElementLabel({ tagName: 'SPAN', id: 'badge', className: '' }),
      'span#badge'
    );
    assert.equal(
      formatElementLabel({ tagName: 'HTML' }),
      'window / document'
    );
  });

  it('detects nodes and events inside the recorder Shadow DOM subtree', () => {
    const recorderHost = { localName: 'timeline-visualizer' };
    const shadowRoot = { host: recorderHost };
    const innerButton = {
      localName: 'button',
      parentNode: shadowRoot,
      getRootNode: () => shadowRoot,
    };
    const pageElement = {
      localName: 'div',
      parentNode: null,
      getRootNode: () => ({}),
    };

    assert.equal(isElementInRecorder(recorderHost, recorderHost, shadowRoot), true);
    assert.equal(isElementInRecorder(innerButton, recorderHost, shadowRoot), true);
    assert.equal(isElementInRecorder(pageElement, recorderHost, shadowRoot), false);

    const recorderEvent = {
      target: pageElement,
      composedPath: () => [innerButton, shadowRoot, recorderHost],
    };
    const pageEvent = {
      target: pageElement,
      composedPath: () => [pageElement],
    };

    assert.equal(isEventFromRecorder(recorderEvent, recorderHost, shadowRoot), true);
    assert.equal(isEventFromRecorder(pageEvent, recorderHost, shadowRoot), false);
  });

  it('extracts numeric values from numbers, CSSNumericValue objects, and strings', () => {
    assert.equal(extractNumericValue(250), 250);
    assert.equal(extractNumericValue({ value: 65.5, unit: 'percent' }), 65.5);
    assert.equal(extractNumericValue('42'), 42);
    assert.equal(extractNumericValue(NaN, 0), 0);
  });

  it('sanitizes keyframes by removing computedOffset while preserving offset and CSS properties', () => {
    const raw = [
      { offset: null, computedOffset: 0, easing: 'ease', transform: 'translateX(0px)' },
      { offset: 1, computedOffset: 1, easing: 'linear', transform: 'translateX(100px)' },
    ];
    const cleaned = sanitizeKeyframes(raw);
    assert.equal(cleaned.length, 2);
    assert.equal('computedOffset' in cleaned[0], false);
    assert.equal(cleaned[0].offset, 0);
    assert.equal(cleaned[0].transform, 'translateX(0px)');
    assert.equal(cleaned[1].offset, 1);
    assert.equal(cleaned[1].transform, 'translateX(100px)');
  });

  it('normalizes computed timing including CSSNumericValue and Infinite iterations', () => {
    const timing = sanitizeTiming({
      delay: 120,
      duration: { value: 100, unit: 'percent' },
      iterations: Infinity,
      direction: 'alternate',
      easing: 'ease-in-out',
      fill: 'forwards',
      progress: 0.4,
    });
    assert.equal(timing.delay, 120);
    assert.equal(timing.duration, 100);
    assert.equal(timing.iterations, Infinity);
    assert.equal(timing.direction, 'alternate');
    assert.equal(timing.fill, 'forwards');
    assert.equal(timing.progress, 0.4);
  });

  it('detects timeline type (DocumentTimeline vs ScrollTimeline vs ViewTimeline)', () => {
    const timeAnim = { timeline: {} };
    assert.equal(detectTimelineInfo(timeAnim).type, 'time');
    assert.equal(detectTimelineInfo(timeAnim).isScrollDriven, false);

    const scrollAnim = { timeline: { source: {}, axis: 'block' } };
    assert.equal(detectTimelineInfo(scrollAnim).type, 'scroll');
    assert.equal(detectTimelineInfo(scrollAnim).isScrollDriven, true);

    const viewAnim = { timeline: { subject: {}, axis: 'block' } };
    assert.equal(detectTimelineInfo(viewAnim).type, 'view');
    assert.equal(detectTimelineInfo(viewAnim).isScrollDriven, true);
  });

  it('detects animation category (transition, css-animation, waapi)', () => {
    assert.deepEqual(detectAnimationCategory({ transitionProperty: 'transform' }), {
      category: 'transition',
      name: 'transform',
    });
    assert.deepEqual(detectAnimationCategory({ animationName: 'pulse' }), {
      category: 'css-animation',
      name: 'pulse',
    });
    assert.deepEqual(detectAnimationCategory({ id: 'custom-waapi' }), {
      category: 'waapi',
      name: 'custom-waapi',
    });
  });
});

describe('TimelineStore & Interpolation Logic', () => {
  it('interpolates scroll positions accurately across timestamps', () => {
    const samples = [
      { t: 0, scrollTop: 0, scrollLeft: 0 },
      { t: 100, scrollTop: 200, scrollLeft: 50 },
      { t: 300, scrollTop: 600, scrollLeft: 50 },
    ];

    assert.deepEqual(interpolateScroll(samples, 0), { scrollTop: 0, scrollLeft: 0 });
    assert.deepEqual(interpolateScroll(samples, 50), { scrollTop: 100, scrollLeft: 25 });
    assert.deepEqual(interpolateScroll(samples, 200), { scrollTop: 400, scrollLeft: 50 });
    assert.deepEqual(interpolateScroll(samples, 500), { scrollTop: 600, scrollLeft: 50 });
  });

  it('interpolates animation phase, currentTime, and progress with delays and directions', () => {
    const record = {
      timelineType: 'time',
      runTime: 100,
      startTime: 250,
      endTime: 650,
      cancelTime: null,
      initialCurrentTime: 0,
      timing: {
        duration: 200,
        iterations: 2,
        direction: 'alternate',
      },
      samples: [],
    };

    assert.equal(interpolateAnimationState(record, 50).phase, 'before');
    assert.equal(interpolateAnimationState(record, 180).phase, 'delay');

    const midFirstIter = interpolateAnimationState(record, 350); // 100ms into first 200ms iteration
    assert.equal(midFirstIter.phase, 'active');
    assert.equal(midFirstIter.currentTime, 100);
    assert.ok(Math.abs(midFirstIter.progress - 0.5) < 0.01);

    const afterState = interpolateAnimationState(record, 800);
    assert.equal(afterState.phase, 'after');
    assert.equal(afterState.currentTime, 400);
  });

  it('packs non-overlapping animations into lane 0 and overlapping animations into separate lanes', () => {
    const anims = [
      { id: 'a1', runTime: 0, endTime: 200 },
      { id: 'a2', runTime: 100, endTime: 350 },
      { id: 'a3', runTime: 220, endTime: 400 },
    ];

    const laneCount = assignAnimationLanes(anims);
    assert.equal(laneCount, 2);
    assert.equal(anims[0].lane, 0);
    assert.equal(anims[1].lane, 1);
    assert.equal(anims[2].lane, 0);
  });

  it('tracks transitionrun -> delay -> transitionstart -> transitionend and disconnected elements', () => {
    const store = new TimelineStore();
    store.start(1000);

    const mockEl = {
      tagName: 'DIV',
      id: 'card',
      className: 'box',
      isConnected: true,
    };

    // transitionrun at t = 50ms
    store.handleLifecycleEvent(mockEl, 'transitionrun', 50, { propertyName: 'transform' });
    // transitionstart at t = 170ms (120ms delay)
    store.handleLifecycleEvent(mockEl, 'transitionstart', 170, { propertyName: 'transform' });
    // transitionend at t = 470ms
    store.handleLifecycleEvent(mockEl, 'transitionend', 470, { propertyName: 'transform' });

    const track = store.getOrCreateElementTrack(mockEl);
    assert.equal(track.label, 'div#card.box');
    assert.equal(track.animations.length, 1);
    assert.equal(track.animations[0].runTime, 50);
    assert.equal(track.animations[0].startTime, 170);
    assert.equal(track.animations[0].endTime, 470);
    assert.equal(track.animations[0].finishTime, 470);

    // Simulate element disconnection from DOM at t = 600ms
    mockEl.isConnected = false;
    store.checkDisconnectedElements(600);
    assert.equal(track.removed, true);
    assert.equal(track.removedAt, 600);
    assert.ok(track.events.some((e) => e.type === 'removed' && e.timestamp === 600));
  });
});
