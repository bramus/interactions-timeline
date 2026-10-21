/**
 * <interactions-timeline> Entry Point
 * Registers the <interactions-timeline> custom element, auto-mounts the recorder UI,
 * and exports public classes and utilities.
 */

import {
  InteractionsTimeline,
  ensureInteractionsTimelineMounted,
} from './components/interactions-timeline.js';
import {
  formatElementLabel,
  isElementInRecorder,
  isEventFromRecorder,
  extractNumericValue,
  sanitizeKeyframes,
  sanitizeTiming,
  detectTimelineInfo,
  detectAnimationCategory,
  createDomElement,
  createSvgElement,
} from './utils/dom-utils.js';
import {
  TimelineStore,
  normalizePropertyName,
  interpolateScroll,
  interpolateAnimationState,
  assignAnimationLanes,
} from './utils/timeline-store.js';

export {
  InteractionsTimeline,
  ensureInteractionsTimelineMounted,
  TimelineStore,
  formatElementLabel,
  isElementInRecorder,
  isEventFromRecorder,
  extractNumericValue,
  sanitizeKeyframes,
  sanitizeTiming,
  detectTimelineInfo,
  detectAnimationCategory,
  createDomElement,
  createSvgElement,
  normalizePropertyName,
  interpolateScroll,
  interpolateAnimationState,
  assignAnimationLanes,
};

export default InteractionsTimeline;
