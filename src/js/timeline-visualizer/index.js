/**
 * <timeline-visualizer> Entry Point
 * Registers the <timeline-visualizer> custom element, auto-mounts the recorder UI,
 * and exports public classes and utilities.
 */

import {
  TimelineVisualizer,
  ensureTimelineVisualizerMounted,
} from './components/timeline-visualizer.js';
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
  TimelineVisualizer,
  ensureTimelineVisualizerMounted,
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

export default TimelineVisualizer;
