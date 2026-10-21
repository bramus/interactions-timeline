/**
 * <interactions-timeline> Custom Element
 * Encapsulates a page interactions/animations recorder and collapsible/resizable timeline visualizer
 * inside Shadow DOM, ignoring its own DOM subtree during recording and pausing/scrubbing.
 */

import {
  formatElementLabel,
  isElementInRecorder,
  isEventFromRecorder,
  extractNumericValue,
  createDomElement as h,
  createSvgElement as svg,
} from '../utils/dom-utils.js';
import {
  TimelineStore,
  interpolateAnimationState,
  normalizePropertyName,
} from '../utils/timeline-store.js';

const COMPONENT_STYLES = `
  :host {
    all: initial;
  }

  :host,
  .bottom-sheet,
  .recorder-floating-bar {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #e2e8f0;
    box-sizing: border-box;
    --sheet-height: 400px;
    --sheet-width: 620px;
    --label-col-width: 250px;
    --bg-panel: #0f172a;
    --bg-panel-elevated: #1e293b;
    --bg-row-hover: rgba(56, 189, 248, 0.08);
    --bg-pinned: #131c31;
    --border-subtle: #334155;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --accent-primary: #38bdf8;
    --color-run: #06b6d4;
    --color-start: #10b981;
    --color-iteration: #f59e0b;
    --color-end: #3b82f6;
    --color-cancel: #ef4444;
    --color-click: #ec4899;
    --color-key: #a855f7;
    --color-scroll: #14b8a6;
    --color-removed: #f97316;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  /* Top-Right Floating Recorder Controls */
  .recorder- launcher,
  .recorder-floating-bar {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(10px);
    padding: 6px 8px;
    border-radius: 9999px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 4px 10px -2px rgba(0, 0, 0, 0.3);
    user-select: none;
  }

  .rec-btn {
    appearance: none;
    border: none;
    outline: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-radius: 9999px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #ffffff;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
    transition: transform 0.12s ease, filter 0.12s ease;
  }

  .rec-btn:hover {
    filter: brightness(1.08);
  }

  .rec-btn:active {
    transform: scale(0.97);
  }

  .rec-btn.is-recording {
    background: linear-gradient(135deg, #f97316, #ea580c);
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.32);
  }

  .rec-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ffffff;
    display: inline-block;
    flex-shrink: 0;
  }

  .rec-btn.is-recording .rec-dot {
    border-radius: 2px;
    animation: rec-pulse 1s infinite ease-in-out;
  }

  @keyframes rec-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.85); }
  }

  .rec-timer {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: #f8fafc;
    padding: 0 6px;
  }

  .rec-secondary-btn {
    appearance: none;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(30, 41, 59, 0.9);
    color: #e2e8f0;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 9999px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .rec-secondary-btn:hover {
    background: #334155;
    color: #ffffff;
  }

  .rec-secondary-btn[hidden] {
    display: none !important;
  }

  /* Page Element Hover Highlight Overlay */
  .page-highlight-overlay {
    position: fixed;
    pointer-events: none;
    z-index: 2147483645;
    border: 2px solid #38bdf8;
    background: rgba(56, 189, 248, 0.16);
    box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.4), inset 0 0 12px rgba(56, 189, 248, 0.25);
    border-radius: 4px;
    transition: all 0.06s ease-out;
  }

  .page-highlight-overlay[hidden] {
    display: none !important;
  }

  .page-highlight-badge {
    position: absolute;
    top: -24px;
    left: -2px;
    background: #0284c7;
    color: #ffffff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }

  /* Collapsible / Resizable Visualizer Panel (Bottom, Right, or Popout) */
  .bottom-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--sheet-height);
    min-height: 160px;
    max-height: 88vh;
    z-index: 2147483646;
    background: var(--bg-panel);
    border-top: 1px solid var(--border-subtle);
    box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    color: var(--text-main);
    user-select: none;
  }

  .bottom-sheet[hidden] {
    display: none !important;
  }

  .bottom-sheet.dock-left {
    top: 0;
    left: 0;
    bottom: 0;
    right: auto;
    width: var(--sheet-width, 620px);
    min-width: 360px;
    max-width: 92vw;
    height: 100vh !important;
    max-height: 100vh !important;
    border-top: none;
    border-right: 1px solid var(--border-subtle);
    box-shadow: 12px 0 32px rgba(0, 0, 0, 0.55);
    padding-right: 7px;
  }

  .bottom-sheet.dock-right {
    top: 0;
    right: 0;
    bottom: 0;
    left: auto;
    width: var(--sheet-width, 620px);
    min-width: 360px;
    max-width: 92vw;
    height: 100vh !important;
    max-height: 100vh !important;
    border-top: none;
    border-left: 1px solid var(--border-subtle);
    box-shadow: -12px 0 32px rgba(0, 0, 0, 0.55);
    padding-left: 7px;
  }

  .bottom-sheet.dock-popout {
    position: fixed;
    inset: 0;
    width: 100vw !important;
    height: 100vh !important;
    min-height: 100vh !important;
    max-height: 100vh !important;
    border: none;
    box-shadow: none;
  }

  .bottom-sheet.dock-bottom.is-collapsed {
    height: 46px !important;
    min-height: 46px !important;
    overflow: hidden;
  }

  .resize-handle {
    height: 7px;
    width: 100%;
    cursor: ns-resize;
    background: linear-gradient(to bottom, rgba(56, 189, 248, 0.25), transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .resize-handle[hidden] {
    display: none !important;
  }

  .resize-handle::after {
    content: "";
    width: 44px;
    height: 3px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.5);
  }

  .resize-handle:hover::after {
    background: #38bdf8;
  }

  .bottom-sheet.dock-left .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: auto;
    width: 7px;
    height: 100%;
    cursor: ew-resize;
    background: linear-gradient(to left, rgba(56, 189, 248, 0.25), transparent);
  }

  .bottom-sheet.dock-right .resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 7px;
    height: 100%;
    cursor: ew-resize;
    background: linear-gradient(to right, rgba(56, 189, 248, 0.25), transparent);
  }

  .bottom-sheet.dock-left .resize-handle::after,
  .bottom-sheet.dock-right .resize-handle::after {
    width: 3px;
    height: 44px;
  }

  /* Sheet Header / Toolbar */
  .sheet-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 6px 10px;
    background: var(--bg-panel-elevated);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .toolbar-left,
  .toolbar-center,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .toolbar-title {
    font-weight: 700;
    font-size: 13px;
    color: #f8fafc;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-pill {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.16);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  .scrubber-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(15, 23, 42, 0.7);
    padding: 2px 8px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
  }

  /* Playback Speed Multi-Button Chooser */
  .speed-chooser {
    display: inline-flex;
    align-items: center;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 6px;
    overflow: hidden;
  }

  .speed-btn {
    appearance: none;
    border: none;
    border-right: 1px solid rgba(148, 163, 184, 0.2);
    background: transparent;
    color: #94a3b8;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 6px;
    cursor: pointer;
    line-height: 1.2;
    transition: background-color 0.12s ease, color 0.12s ease;
  }

  .speed-btn:last-child {
    border-right: none;
  }

  .speed-btn:hover {
    background: rgba(51, 65, 85, 0.65);
    color: #f8fafc;
  }

  .speed-btn.is-active {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
  }

  /* Docking Position Icon Chooser */
  .dock-chooser {
    display: inline-flex;
    align-items: center;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 6px;
    position: relative;
  }

  .dock-btn {
    position: relative;
    appearance: none;
    border: none;
    border-right: 1px solid rgba(148, 163, 184, 0.2);
    background: transparent;
    color: #94a3b8;
    font-family: inherit;
    padding: 5px 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.12s ease, color 0.12s ease;
  }

  .dock-btn:first-child {
    border-top-left-radius: 5px;
    border-bottom-left-radius: 5px;
  }

  .dock-btn:last-child {
    border-right: none;
    border-top-right-radius: 5px;
    border-bottom-right-radius: 5px;
  }

  .dock-btn svg {
    width: 14px;
    height: 14px;
    display: block;
    pointer-events: none;
  }

  .dock-btn:hover {
    background: rgba(51, 65, 85, 0.65);
    color: #f8fafc;
  }

  .dock-btn.is-active {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
  }

  .dock-btn::after {
    content: attr(data-tooltip);
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) translateY(-2px);
    background: #020617;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s ease;
    z-index: 2147483647;
  }

  .dock-btn:hover::after,
  .dock-btn:focus-visible::after {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
  }

  .icon-btn {
    appearance: none;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: #1e293b;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 4px 8px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .icon-btn[hidden] {
    display: none !important;
  }

  .icon-btn:hover {
    background: #334155;
    color: #ffffff;
  }

  .icon-btn.danger:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: #ef4444;
    color: #fecaca;
  }

  .scrubber-slider {
    width: 108px;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .time-readout {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    color: #38bdf8;
    min-width: 96px;
    text-align: right;
  }

  /* Legend Bar */
  .legend-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 5px 14px;
    background: #0b1120;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .legend-group {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .legend-swatch {
    width: 3px;
    height: 12px;
    border-radius: 1px;
    display: inline-block;
  }

  .legend-box-swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    display: inline-block;
  }

  /* Main Timeline Grid Container */
  .timeline-viewport {
    position: relative;
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
  }

  /* Sticky Time Ruler + Pinned Global Row Header */
  .sticky-top-section {
    position: sticky;
    top: 0;
    z-index: 20;
    width: calc(var(--label-col-width) + (100% - var(--label-col-width)) * var(--timeline-zoom, 1));
    min-width: 100%;
    background: var(--bg-pinned);
    border-bottom: 2px solid #334155;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  }

  .timeline-body-wrapper {
    position: relative;
    flex: 1 0 auto;
    width: calc(var(--label-col-width) + (100% - var(--label-col-width)) * var(--timeline-zoom, 1));
    min-width: 100%;
  }

  .ruler-row {
    display: grid;
    grid-template-columns: var(--label-col-width) 1fr;
    height: 26px;
    border-bottom: 1px solid var(--border-subtle);
    background: #090e1a;
  }

  .ruler-corner {
    position: sticky;
    left: 0;
    z-index: 15;
    background: #090e1a;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    border-right: 1px solid var(--border-subtle);
  }

  .ruler-track {
    position: relative;
    cursor: ew-resize;
    overflow: hidden;
  }

  .ruler-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px solid rgba(148, 163, 184, 0.25);
    padding-left: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    color: var(--text-muted);
    line-height: 24px;
    pointer-events: none;
  }

  /* Timeline Rows */
  .timeline-row {
    display: grid;
    grid-template-columns: var(--label-col-width) 1fr;
    min-height: 44px;
    border-bottom: 1px solid rgba(51, 65, 85, 0.65);
    position: relative;
    transition: background-color 0.1s ease;
  }

  .timeline-row:hover {
    background: var(--bg-row-hover);
  }

  .timeline-row.is-pinned {
    background: var(--bg-pinned);
    min-height: 48px;
  }

  /* Removed Element Row Styling */
  .timeline-row.is-removed {
    background: rgba(15, 23, 42, 0.6);
    color: #64748b;
    opacity: 0.72;
  }

  .timeline-row.is-removed .row-selector {
    color: #94a3b8;
    text-decoration: line-through;
    text-decoration-color: rgba(249, 115, 22, 0.6);
  }

  .row-header {
    position: sticky;
    left: 0;
    z-index: 15;
    background: var(--bg-panel);
    padding: 6px 10px;
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    min-width: 0;
    overflow: hidden;
  }

  .timeline-row:hover .row-header {
    background: #172338;
  }

  .timeline-row.is-pinned .row-header {
    background: var(--bg-pinned);
  }

  .timeline-row.is-removed .row-header {
    background: #111a2e;
  }

  .row-title-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .row-selector {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    font-weight: 600;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-meta-line {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .badge-pinned {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.35);
  }

  .badge-removed {
    background: rgba(249, 115, 22, 0.16);
    color: #fb923c;
    border: 1px solid rgba(249, 115, 22, 0.45);
  }

  .badge-scroller {
    background: rgba(20, 184, 166, 0.15);
    color: #2dd4bf;
    border: 1px solid rgba(20, 184, 166, 0.35);
  }

  .scroller-checkbox-label {
    cursor: pointer;
    user-select: none;
    gap: 4px;
    transition: opacity 0.12s ease, border-color 0.12s ease, background-color 0.12s ease;
  }

  .scroller-checkbox-label:hover {
    border-color: rgba(45, 212, 191, 0.75);
    background: rgba(20, 184, 166, 0.24);
  }

  .scroller-checkbox-label.is-unchecked {
    background: rgba(15, 23, 42, 0.45);
    color: #94a3b8;
    border-color: rgba(100, 116, 139, 0.4);
    opacity: 0.75;
  }

  .scroller-checkbox {
    accent-color: #14b8a6;
    cursor: pointer;
    margin: 0;
    width: 11px;
    height: 11px;
  }

  /* Track Canvas Area inside each Row */
  .row-track {
    position: relative;
    min-height: 44px;
    overflow: hidden;
    cursor: pointer;
    background-image: linear-gradient(
      to right,
      rgba(148, 163, 184, 0.06) 1px,
      transparent 1px
    );
    background-size: 10% 100%;
  }

  /* Recorded Animation / Transition Duration Boxes */
  .timeline-box {
    position: absolute;
    height: 28px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    overflow: hidden;
    font-size: 11px;
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    z-index: 3;
    min-width: 4px;
  }

  .timeline-box.category-css-animation {
    background: rgba(59, 130, 246, 0.32);
    border: 1px solid rgba(96, 165, 250, 0.65);
  }

  .timeline-box.category-transition {
    background: rgba(16, 185, 129, 0.3);
    border: 1px solid rgba(52, 211, 153, 0.65);
  }

  .timeline-box.category-waapi {
    background: rgba(168, 85, 247, 0.32);
    border: 1px solid rgba(192, 132, 252, 0.65);
  }

  .timeline-box.driver-scroll,
  .timeline-box.driver-view {
    background: rgba(245, 158, 11, 0.28);
    border: 1px solid rgba(251, 191, 36, 0.75);
  }

  /* Outlines for Removed Elements */
  .timeline-box.is-outline {
    background: transparent !important;
    border-width: 1.5px !important;
    border-style: dashed !important;
    box-shadow: none !important;
    color: #cbd5e1;
  }

  /* Delay region between transitionrun and transitionstart (or animation delay) */
  .box-delay-segment {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: repeating-linear-gradient(
      -45deg,
      rgba(6, 182, 212, 0.28),
      rgba(6, 182, 212, 0.28) 4px,
      rgba(15, 23, 42, 0.35) 4px,
      rgba(15, 23, 42, 0.35) 8px
    );
    border-right: 1px dashed var(--color-start);
    pointer-events: none;
  }

  .timeline-box.is-outline .box-delay-segment {
    background: transparent;
    border-right: 1px dotted var(--color-start);
  }

  /* Color-coded lifecycle lines on animation/transition boxes */
  .box-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 3px;
    z-index: 5;
    pointer-events: none;
  }

  .box-line.line-run {
    left: 0;
    background: var(--color-run);
  }

  .box-line.line-start {
    background: var(--color-start);
  }

  .box-line.line-iteration {
    width: 2px;
    background: var(--color-iteration);
  }

  .box-line.line-end {
    right: 0;
    background: var(--color-end);
  }

  .box-line.line-cancel {
    right: 0;
    background: var(--color-cancel);
  }

  /* Progress Sparkline SVG inside Box */
  .progress-sparkline {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
  }

  .box-content {
    position: relative;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
  }

  .driver-badge {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.22);
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }

  .driver-badge[data-driver="scroll"],
  .driver-badge[data-driver="view"] {
    color: #fde68a;
    border-color: rgba(251, 191, 36, 0.55);
  }

  .driver-badge[data-driver="time"] {
    color: #bae6fd;
  }

  /* Scroll Activity Box & Curve */
  .scroll-span-box {
    position: absolute;
    top: 6px;
    bottom: 6px;
    background: rgba(20, 184, 166, 0.16);
    border: 1px solid rgba(20, 184, 166, 0.45);
    border-radius: 3px;
    pointer-events: none;
    z-index: 1;
  }

  .scroll-span-box.is-outline {
    background: transparent !important;
    border-style: dashed !important;
  }

  .scroll-curve-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
  }

  /* Discrete Event Vertical Lines / Markers */
  .event-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    z-index: 6;
    transform: translateX(-1px);
    pointer-events: auto;
  }

  .event-marker-dot {
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid #0f172a;
  }

  .event-marker-label {
    position: absolute;
    top: 2px;
    left: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 9.5px;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(15, 23, 42, 0.85);
    color: #f8fafc;
    white-space: nowrap;
    pointer-events: none;
  }

  .event-marker.type-click {
    background: var(--color-click);
  }
  .event-marker.type-click .event-marker-dot {
    background: var(--color-click);
  }

  .event-marker.type-keydown,
  .event-marker.type-keyup {
    background: var(--color-key);
  }
  .event-marker.type-keydown .event-marker-dot,
  .event-marker.type-keyup .event-marker-dot {
    background: var(--color-key);
  }

  .event-marker.type-scroll {
    background: var(--color-scroll);
    opacity: 0.65;
  }
  .event-marker.type-scroll .event-marker-dot {
    background: var(--color-scroll);
    width: 6px;
    height: 6px;
  }

  .event-marker.type-animationiteration {
    background: var(--color-iteration);
  }
  .event-marker.type-animationiteration .event-marker-dot {
    background: var(--color-iteration);
  }

  .event-marker.type-animationstart,
  .event-marker.type-transitionstart {
    background: var(--color-start);
  }
  .event-marker.type-animationstart .event-marker-dot,
  .event-marker.type-transitionstart .event-marker-dot {
    background: var(--color-start);
  }

  .event-marker.type-transitionrun {
    background: var(--color-run);
  }
  .event-marker.type-transitionrun .event-marker-dot {
    background: var(--color-run);
  }

  .event-marker.type-animationend,
  .event-marker.type-transitionend {
    background: var(--color-end);
  }
  .event-marker.type-animationend .event-marker-dot,
  .event-marker.type-transitionend .event-marker-dot {
    background: var(--color-end);
  }

  .event-marker.type-animationcancel,
  .event-marker.type-transitioncancel {
    background: var(--color-cancel);
  }
  .event-marker.type-animationcancel .event-marker-dot,
  .event-marker.type-transitioncancel .event-marker-dot {
    background: var(--color-cancel);
  }

  .event-marker.type-removed {
    background: var(--color-removed);
    width: 2px;
  }
  .event-marker.type-removed .event-marker-dot {
    background: var(--color-removed);
    border-radius: 2px;
  }

  /* Outline markers for removed elements */
  .event-marker.is-outline {
    background: transparent !important;
    border-left: 1.5px dashed currentColor;
  }
  .event-marker.is-outline .event-marker-dot {
    background: #0f172a !important;
    border: 1.5px solid #fb923c !important;
  }

  /* Playhead Vertical Scrubber Line */
  .playhead-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--label-col-width) + (100% - var(--label-col-width)) * var(--playhead-ratio, 1));
    width: 2px;
    background: #f43f5e;
    z-index: 10;
    pointer-events: none;
    box-shadow: 0 0 8px rgba(244, 63, 94, 0.7);
  }

  .playhead-cap {
    position: absolute;
    top: 0;
    left: -6px;
    width: 14px;
    height: 14px;
    background: #f43f5e;
    clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%);
  }

  .bottom-sheet:focus,
  .timeline-viewport:focus {
    outline: none;
  }

  .empty-state {
    padding: 28px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }
`;

export const STORAGE_KEY_PLAYBACK_RATE = 'interactions-timeline:playback-rate';
export const STORAGE_KEY_DOCK_POSITION = 'interactions-timeline:dock-position';

const BaseHTMLElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

export class InteractionsTimeline extends BaseHTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this.store = new TimelineStore();
    this.isRecording = false;
    this.isVisualizing = false;
    this.isCollapsed = false;
    this.currentScrubTime = 0;
    this.dockPosition = 'bottom';
    this.playbackRate = 1;
    this.zoomLevel = 1;

    this._sheetHeightPx = 400;
    this._sheetWidthPx = 620;
    this._popupWindow = null;
    this._isClosingPopoutProgrammatically = false;

    this._isScrubbing = false;
    this._rafId = null;
    this._timerInterval = null;
    this._playbackRafId = null;
    this._mutationObserver = null;
    this._originalElementAnimate = null;

    /** @type {Set<Animation>} Synthetic animations created for scrubbing */
    this._scrubAnimationSet = new Set();
    /** @type {Map<object, Animation>} Map from AnimationRecord to synthetic scrub Animation */
    this._recordScrubAnimMap = new Map();
    /** @type {Array<{ animation: Animation, playState: string, currentTime: any }>} */
    this._pausedPageAnimations = [];
    /** @type {{ scrollTop: number, scrollLeft: number } | null} */
    this._savedWindowScroll = null;
    /** @type {Map<Element, { scrollTop: number, scrollLeft: number }>} */
    this._savedElementScrolls = new Map();

    this._boundLifecycleHandler = this._onLifecycleEvent.bind(this);
    this._boundClickHandler = this._onClickEvent.bind(this);
    this._boundKeyHandler = this._onKeyEvent.bind(this);
    this._boundScrollHandler = this._onScrollEvent.bind(this);

    this._buildShadowDom();
    this._loadPersistedSettings();
  }

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
    }
  }

  disconnectedCallback() {
    if (this.isRecording) {
      this._detachRecordingListeners();
    }
    this._closePopoutWindow();
    this.restorePageState();
  }

  _buildShadowDom() {
    const style = h('style', { textContent: COMPONENT_STYLES });

    // 1. Top-Right Floating Control Bar
    this._recDot = h('span', { className: 'rec-dot' });
    this._recBtnLabel = h('span', { textContent: 'Start Recording' });
    this._recBtn = h(
      'button',
      {
        type: 'button',
        className: 'rec-btn',
        part: 'record-button',
        'data-testid': 'record-btn',
        'aria-label': 'Start or stop timeline recording',
        onClick: () => this.toggleRecording(),
      },
      this._recDot,
      this._recBtnLabel
    );

    this._recTimer = h('span', {
      className: 'rec-timer',
      'data-testid': 'record-timer',
      hidden: true,
      textContent: '0.0s',
    });

    this._reopenSheetBtn = h(
      'button',
      {
        type: 'button',
        className: 'rec-secondary-btn',
        'data-testid': 'reopen-sheet-btn',
        hidden: true,
        onClick: () => this.openVisualizer(),
      },
      'Show Timeline'
    );

    this._floatingBar = h(
      'div',
      {
        className: 'recorder-floating-bar',
        part: 'floating-bar',
      },
      this._recBtn,
      this._recTimer,
      this._reopenSheetBtn
    );

    // 2. Page Element Highlight Overlay (for row hover)
    this._highlightBadge = h('div', { className: 'page-highlight-badge' });
    this._highlightOverlay = h(
      'div',
      {
        className: 'page-highlight-overlay',
        'data-testid': 'element-highlight-overlay',
        hidden: true,
      },
      this._highlightBadge
    );

    // 3. Collapsible / Resizable Bottom Sheet
    this._resizeHandle = h('div', {
      className: 'resize-handle',
      part: 'resize-handle',
      'data-testid': 'resize-handle',
      title: 'Drag to resize timeline panel',
    });
    this._setupResizeHandle();

    this._statusPill = h('span', {
      className: 'status-pill',
      'data-testid': 'visualizer-status',
      textContent: 'Page Paused · Scrub Mode',
    });

    // Playback Speed Multi-Button Chooser: 25% | 50% | 100% (default 100%)
    this._speedBtn25 = h(
      'button',
      {
        type: 'button',
        className: 'speed-btn',
        'data-testid': 'speed-btn-25',
        'data-speed': '0.25',
        'aria-label': '25% playback speed',
        'aria-pressed': 'false',
        title: '25% playback speed',
        onClick: () => this.setPlaybackRate(0.25),
      },
      '25%'
    );

    this._speedBtn50 = h(
      'button',
      {
        type: 'button',
        className: 'speed-btn',
        'data-testid': 'speed-btn-50',
        'data-speed': '0.5',
        'aria-label': '50% playback speed',
        'aria-pressed': 'false',
        title: '50% playback speed',
        onClick: () => this.setPlaybackRate(0.5),
      },
      '50%'
    );

    this._speedBtn100 = h(
      'button',
      {
        type: 'button',
        className: 'speed-btn is-active',
        'data-testid': 'speed-btn-100',
        'data-speed': '1',
        'aria-label': '100% playback speed',
        'aria-pressed': 'true',
        title: '100% playback speed',
        onClick: () => this.setPlaybackRate(1),
      },
      '100%'
    );

    this._speedChooser = h(
      'div',
      {
        className: 'speed-chooser',
        role: 'group',
        'aria-label': 'Playback speed',
        'data-testid': 'speed-chooser',
      },
      this._speedBtn25,
      this._speedBtn50,
      this._speedBtn100
    );

    this._playScrubBtn = h(
      'button',
      {
        type: 'button',
        className: 'icon-btn',
        'data-testid': 'play-scrub-btn',
        title: 'Replay recorded timeline',
        onClick: () => this._toggleTimelineReplay(),
      },
      '▶ Replay'
    );

    this._scrubberSlider = h('input', {
      type: 'range',
      className: 'scrubber-slider',
      'data-testid': 'scrubber-slider',
      min: '0',
      max: '1000',
      step: '1',
      value: '1000',
      'aria-label': 'Scrub timeline playhead',
      onInput: (e) => {
        this._stopTimelineReplay();
        const t = Number(e.target.value);
        this.scrubToTime(t);
      },
    });

    this._timeReadout = h('span', {
      className: 'time-readout',
      'data-testid': 'time-readout',
      textContent: '0 ms / 0 ms',
    });

    // Docking Position Icon-Only Chooser: left | bottom | right | popout
    this._dockBtnLeft = h(
      'button',
      {
        type: 'button',
        className: 'dock-btn',
        'data-testid': 'dock-btn-left',
        'data-dock': 'left',
        'data-tooltip': 'Dock to left',
        'aria-label': 'Dock to left',
        'aria-pressed': 'false',
        title: 'Dock to left',
        onClick: () => this.setDockPosition('left'),
      },
      this._createDockIcon('left')
    );

    this._dockBtnBottom = h(
      'button',
      {
        type: 'button',
        className: 'dock-btn is-active',
        'data-testid': 'dock-btn-bottom',
        'data-dock': 'bottom',
        'data-tooltip': 'Dock to bottom',
        'aria-label': 'Dock to bottom',
        'aria-pressed': 'true',
        title: 'Dock to bottom',
        onClick: () => this.setDockPosition('bottom'),
      },
      this._createDockIcon('bottom')
    );

    this._dockBtnRight = h(
      'button',
      {
        type: 'button',
        className: 'dock-btn',
        'data-testid': 'dock-btn-right',
        'data-dock': 'right',
        'data-tooltip': 'Dock to right',
        'aria-label': 'Dock to right',
        'aria-pressed': 'false',
        title: 'Dock to right',
        onClick: () => this.setDockPosition('right'),
      },
      this._createDockIcon('right')
    );

    this._dockBtnPopout = h(
      'button',
      {
        type: 'button',
        className: 'dock-btn',
        'data-testid': 'dock-btn-popout',
        'data-dock': 'popout',
        'data-tooltip': 'Pop out into window',
        'aria-label': 'Pop out into window',
        'aria-pressed': 'false',
        title: 'Pop out into window',
        onClick: () => this.setDockPosition('popout'),
      },
      this._createDockIcon('popout')
    );

    this._dockChooser = h(
      'div',
      {
        className: 'dock-chooser',
        role: 'group',
        'aria-label': 'Docking position',
        'data-testid': 'dock-chooser',
      },
      this._dockBtnLeft,
      this._dockBtnBottom,
      this._dockBtnRight,
      this._dockBtnPopout
    );

    this._collapseBtn = h(
      'button',
      {
        type: 'button',
        className: 'icon-btn',
        'data-testid': 'collapse-btn',
        title: 'Collapse or expand panel',
        onClick: () => this.toggleCollapse(),
      },
      '▾ Collapse'
    );

    this._resetBtn = h(
      'button',
      {
        type: 'button',
        className: 'icon-btn danger',
        'data-testid': 'reset-btn',
        title: 'Reset recording and restore page animations',
        onClick: () => this.reset(),
      },
      '↺ Reset & Restore'
    );

    this._closeBtn = h(
      'button',
      {
        type: 'button',
        className: 'icon-btn',
        'data-testid': 'close-btn',
        title: 'Close visualizer and unpause page',
        onClick: () => this.closeVisualizer(),
      },
      '✕ Close'
    );

    const toolbar = h(
      'div',
      { className: 'sheet-toolbar', part: 'toolbar' },
      h(
        'div',
        { className: 'toolbar-left' },
        h('span', { className: 'toolbar-title', textContent: 'Timeline Visualizer' }),
        this._statusPill,
        this._speedChooser
      ),
      h(
        'div',
        { className: 'toolbar-center' },
        h(
          'div',
          { className: 'scrubber-controls' },
          this._playScrubBtn,
          this._scrubberSlider,
          this._timeReadout
        )
      ),
      h(
        'div',
        { className: 'toolbar-right' },
        this._dockChooser,
        this._collapseBtn,
        this._resetBtn,
        this._closeBtn
      )
    );

    const legendBar = this._buildLegendBar();

    this._rulerCorner = h(
      'div',
      { className: 'ruler-corner' },
      h('span', { textContent: 'Target / Selector' }),
      h('span', { textContent: 'Timeline' })
    );
    this._rulerTrack = h('div', {
      className: 'ruler-track',
      'data-testid': 'ruler-track',
    });
    this._setupTrackScrubbing(this._rulerTrack);

    const rulerRow = h('div', { className: 'ruler-row' }, this._rulerCorner, this._rulerTrack);

    this._pinnedRowContainer = h('div', {
      className: 'pinned-row-container',
      'data-testid': 'pinned-row-container',
    });

    this._playheadLine = h(
      'div',
      {
        className: 'playhead-line',
        'data-testid': 'playhead-line',
      },
      h('div', { className: 'playhead-cap' })
    );

    const stickyTop = h(
      'div',
      { className: 'sticky-top-section' },
      rulerRow,
      this._pinnedRowContainer,
      this._playheadLine
    );

    this._elementRowsContainer = h('div', {
      className: 'element-rows-container',
      'data-testid': 'element-rows-container',
    });

    this._playheadBodyLine = h('div', {
      className: 'playhead-line playhead-body-line',
      'data-testid': 'playhead-body-line',
    });

    this._timelineBodyWrapper = h(
      'div',
      {
        className: 'timeline-body-wrapper',
        'data-testid': 'timeline-body-wrapper',
      },
      this._elementRowsContainer,
      this._playheadBodyLine
    );

    this._timelineViewport = h(
      'div',
      {
        className: 'timeline-viewport',
        'data-testid': 'timeline-viewport',
        tabindex: '0',
      },
      stickyTop,
      this._timelineBodyWrapper
    );
    this._setupTimelineZoomAndPan();

    this._bottomSheet = h(
      'section',
      {
        className: 'bottom-sheet dock-bottom',
        part: 'bottom-sheet',
        'data-testid': 'bottom-sheet',
        'data-dock': 'bottom',
        'aria-label': 'Recorded timeline visualizer',
        tabindex: '0',
        hidden: true,
      },
      this._resizeHandle,
      toolbar,
      legendBar,
      this._timelineViewport
    );
    this._setupKeyboardShortcuts();

    this.shadowRoot.replaceChildren(
      style,
      this._floatingBar,
      this._highlightOverlay,
      this._bottomSheet
    );
  }

  _createDockIcon(mode) {
    if (mode === 'left') {
      return svg(
        'svg',
        { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        svg('rect', {
          x: '1.5',
          y: '2.5',
          width: '13',
          height: '11',
          rx: '1.5',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.3',
        }),
        svg('rect', {
          x: '2',
          y: '3',
          width: '4.5',
          height: '10',
          rx: '0.5',
          fill: 'currentColor',
        })
      );
    }

    if (mode === 'right') {
      return svg(
        'svg',
        { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        svg('rect', {
          x: '1.5',
          y: '2.5',
          width: '13',
          height: '11',
          rx: '1.5',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.3',
        }),
        svg('rect', {
          x: '9.5',
          y: '3',
          width: '4.5',
          height: '10',
          rx: '0.5',
          fill: 'currentColor',
        })
      );
    }

    if (mode === 'popout') {
      return svg(
        'svg',
        { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        svg('path', {
          d: 'M5 4.5H2.8C2.08 4.5 1.5 5.08 1.5 5.8v6.4c0 .72.58 1.3 1.3 1.3h7.4c.72 0 1.3-.58 1.3-1.3V10',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.3',
          'stroke-linecap': 'round',
        }),
        svg('rect', {
          x: '6',
          y: '2',
          width: '8.5',
          height: '6.5',
          rx: '1.2',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.3',
        }),
        svg('rect', {
          x: '6.5',
          y: '2.5',
          width: '7.5',
          height: '2',
          fill: 'currentColor',
        })
      );
    }

    // Default: 'bottom'
    return svg(
      'svg',
      { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
      svg('rect', {
        x: '1.5',
        y: '2.5',
        width: '13',
        height: '11',
        rx: '1.5',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.3',
      }),
      svg('rect', {
        x: '2',
        y: '9',
        width: '12',
        height: '4',
        rx: '0.5',
        fill: 'currentColor',
      })
    );
  }

  _buildLegendBar() {
    const lineItem = (color, label) =>
      h(
        'span',
        { className: 'legend-item' },
        h('span', { className: 'legend-swatch', style: { background: color } }),
        h('span', { textContent: label })
      );

    const dotItem = (color, label) =>
      h(
        'span',
        { className: 'legend-item' },
        h('span', {
          className: 'legend-box-swatch',
          style: { background: color, borderRadius: '50%' },
        }),
        h('span', { textContent: label })
      );

    return h(
      'div',
      { className: 'legend-bar' },
      h(
        'div',
        { className: 'legend-group' },
        h('strong', { textContent: 'Box Lines:' }),
        lineItem('var(--color-run)', 'run / delay'),
        lineItem('var(--color-start)', 'start'),
        lineItem('var(--color-iteration)', 'iteration'),
        lineItem('var(--color-end)', 'end'),
        lineItem('var(--color-cancel)', 'cancel')
      ),
      h(
        'div',
        { className: 'legend-group' },
        h('strong', { textContent: 'Events:' }),
        dotItem('var(--color-click)', 'click'),
        dotItem('var(--color-key)', 'keyboard'),
        dotItem('var(--color-scroll)', 'scroll'),
        dotItem('var(--color-removed)', 'removed (!isConnected)')
      )
    );
  }

  _setupResizeHandle() {
    let startX = 0;
    let startY = 0;
    let startWidth = 620;
    let startHeight = 400;

    const onPointerMove = (e) => {
      if (this.dockPosition === 'right') {
        const deltaX = startX - e.clientX;
        const maxW = Math.floor(window.innerWidth * 0.9);
        const nextWidth = Math.max(360, Math.min(maxW, startWidth + deltaX));
        this.setSheetWidth(nextWidth);
      } else if (this.dockPosition === 'left') {
        const deltaX = e.clientX - startX;
        const maxW = Math.floor(window.innerWidth * 0.9);
        const nextWidth = Math.max(360, Math.min(maxW, startWidth + deltaX));
        this.setSheetWidth(nextWidth);
      } else {
        const deltaY = startY - e.clientY;
        const maxH = Math.floor(window.innerHeight * 0.88);
        const nextHeight = Math.max(160, Math.min(maxH, startHeight + deltaY));
        this.setSheetHeight(nextHeight);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    this._resizeHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.isCollapsed) {
        this.toggleCollapse(false);
      }
      const rect = this._bottomSheet.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startWidth = rect.width || this._sheetWidthPx || 620;
      startHeight = rect.height || this._sheetHeightPx || 400;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  /**
   * Sets the bottom sheet height in pixels (used when docked to bottom).
   *
   * @param {number} heightPx
   */
  setSheetHeight(heightPx) {
    const clamped = Math.max(160, Math.min(Math.floor(window.innerHeight * 0.88), Number(heightPx) || 400));
    this._sheetHeightPx = clamped;
    this.style.setProperty('--sheet-height', `${clamped}px`);
    if (this.dockPosition === 'bottom') {
      this._bottomSheet.style.height = `${clamped}px`;
    }
  }

  /**
   * Sets the side-docked sheet width in pixels (used when docked to left or right).
   *
   * @param {number} widthPx
   */
  setSheetWidth(widthPx) {
    const clamped = Math.max(360, Math.min(Math.floor(window.innerWidth * 0.9), Number(widthPx) || 620));
    this._sheetWidthPx = clamped;
    this.style.setProperty('--sheet-width', `${clamped}px`);
    if (this.dockPosition === 'right' || this.dockPosition === 'left') {
      this._bottomSheet.style.width = `${clamped}px`;
    }
  }

  /**
   * Sets the docking position of the visualizer panel: 'left', 'bottom', 'right', or 'popout'.
   *
   * @param {'left' | 'bottom' | 'right' | 'popout'} position
   * @param {{ persist?: boolean }} [options]
   */
  setDockPosition(position, { persist = true } = {}) {
    const valid =
      position === 'left' || position === 'right' || position === 'popout'
        ? position
        : 'bottom';
    this.dockPosition = valid;
    if (persist) {
      this._saveSetting(STORAGE_KEY_DOCK_POSITION, valid);
    }

    const buttons = [
      [this._dockBtnLeft, 'left'],
      [this._dockBtnBottom, 'bottom'],
      [this._dockBtnRight, 'right'],
      [this._dockBtnPopout, 'popout'],
    ];
    for (const [btn, mode] of buttons) {
      if (!btn) continue;
      const active = mode === valid;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    this._bottomSheet.classList.toggle('dock-left', valid === 'left');
    this._bottomSheet.classList.toggle('dock-bottom', valid === 'bottom');
    this._bottomSheet.classList.toggle('dock-right', valid === 'right');
    this._bottomSheet.classList.toggle('dock-popout', valid === 'popout');
    this._bottomSheet.setAttribute('data-dock', valid);

    if (valid !== 'bottom' && this.isCollapsed) {
      this.toggleCollapse(false);
    }
    this._collapseBtn.hidden = valid !== 'bottom';

    if (valid === 'popout') {
      this._resizeHandle.hidden = true;
      this._bottomSheet.style.height = '';
      this._bottomSheet.style.width = '';
      if (this.isVisualizing || !this._bottomSheet.hidden) {
        this._openInPopoutWindow();
      }
      return;
    }

    this._closePopoutWindow();
    if (this._bottomSheet.parentNode !== this.shadowRoot) {
      this.shadowRoot.appendChild(this._bottomSheet);
    }
    this._resizeHandle.hidden = false;

    if (valid === 'right' || valid === 'left') {
      this._bottomSheet.style.height = '';
      this.setSheetWidth(this._sheetWidthPx);
    } else {
      this._bottomSheet.style.width = '';
      this.setSheetHeight(this._sheetHeightPx);
    }
  }

  _openInPopoutWindow() {
    let popup = this._popupWindow;
    if (!popup || popup.closed) {
      popup = window.open(
        '',
        'interactions-timeline-popout',
        'popup=yes,width=980,height=520'
      );
      this._popupWindow = popup;
    }

    if (!popup || !popup.document) {
      this.setDockPosition('bottom', { persist: false });
      return null;
    }

    const popDoc = popup.document;
    popDoc.title = 'Interactions Timeline';

    if (!popDoc.getElementById('interactions-timeline-popout-styles')) {
      const popStyle = popDoc.createElement('style');
      popStyle.id = 'interactions-timeline-popout-styles';
      popStyle.textContent = `
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background: #0f172a;
          color: #f8fafc;
          overflow: hidden;
        }
        ${COMPONENT_STYLES}
      `;
      (popDoc.head || popDoc.documentElement).appendChild(popStyle);
    }

    this._bottomSheet.hidden = false;
    if (this._bottomSheet.parentNode !== popDoc.body) {
      popDoc.body.replaceChildren(this._bottomSheet);
    }

    if (!popup._hasVisualizerUnloadHook) {
      popup._hasVisualizerUnloadHook = true;
      popup.addEventListener('pagehide', () => {
        if (popup._closedProgrammatically || this._isClosingPopoutProgrammatically) return;
        this._popupWindow = null;
        this.shadowRoot.appendChild(this._bottomSheet);
        this.setDockPosition('bottom', { persist: false });
        if (this.isVisualizing) {
          this.closeVisualizer();
        }
      });
    }

    try {
      popup.focus();
      this._bottomSheet.focus({ preventScroll: true });
    } catch {
      // Ignore focus restrictions
    }

    return popup;
  }

  _closePopoutWindow() {
    if (this._bottomSheet && this._bottomSheet.parentNode !== this.shadowRoot) {
      this.shadowRoot.appendChild(this._bottomSheet);
    }
    if (this._popupWindow && !this._popupWindow.closed) {
      this._popupWindow._closedProgrammatically = true;
      this._isClosingPopoutProgrammatically = true;
      try {
        this._popupWindow.close();
      } catch {
        // Ignore close errors
      } finally {
        this._isClosingPopoutProgrammatically = false;
      }
    }
    this._popupWindow = null;
  }

  _setupTrackScrubbing(trackEl) {
    let activeWin = window;

    const scrubFromPointer = (clientX) => {
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetTime = ratio * (this.store.duration || 0);
      this._stopTimelineReplay();
      this.scrubToTime(targetTime);
    };

    const onPointerMove = (e) => {
      scrubFromPointer(e.clientX);
    };

    const onPointerUp = () => {
      activeWin.removeEventListener('pointermove', onPointerMove);
      activeWin.removeEventListener('pointerup', onPointerUp);
    };

    trackEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        this._bottomSheet?.focus({ preventScroll: true });
      } catch {
        // Ignore focus errors
      }
      activeWin = trackEl.ownerDocument?.defaultView || window;
      scrubFromPointer(e.clientX);
      activeWin.addEventListener('pointermove', onPointerMove);
      activeWin.addEventListener('pointerup', onPointerUp);
    });
  }

  _setupKeyboardShortcuts() {
    const onKeyDown = (e) => this._onVisualizerKeyDown(e);
    this._bottomSheet.addEventListener('keydown', onKeyDown);
    this.addEventListener('keydown', onKeyDown);
  }

  _onVisualizerKeyDown(e) {
    if (e._timelineShortcutHandled) return;
    if (!this.isVisualizing || this._bottomSheet.hidden) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const key = e.key;

    // 1. Left / Right arrow = nudge the scrubber in that direction
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      e._timelineShortcutHandled = true;
      e.preventDefault();
      this._stopTimelineReplay();
      const stepMs = e.shiftKey ? 100 : 20;
      const delta = key === 'ArrowRight' ? stepMs : -stepMs;
      this.scrubToTime(this.currentScrubTime + delta);
      return;
    }

    // 2. Space = Play / Pause the recording (re)playing
    if (key === ' ' || e.code === 'Space') {
      if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
        return;
      }
      e._timelineShortcutHandled = true;
      e.preventDefault();
      this._toggleTimelineReplay();
      return;
    }

    // 3. < and > to decrease/increase the playback speed (25% / 50% / 100%)
    if (key === '<' || key === ',') {
      e._timelineShortcutHandled = true;
      e.preventDefault();
      const speeds = [0.25, 0.5, 1];
      const idx = speeds.indexOf(this.playbackRate);
      const nextIdx = idx > 0 ? idx - 1 : 0;
      this.setPlaybackRate(speeds[nextIdx]);
      return;
    }

    if (key === '>' || key === '.') {
      e._timelineShortcutHandled = true;
      e.preventDefault();
      const speeds = [0.25, 0.5, 1];
      const idx = speeds.indexOf(this.playbackRate);
      const nextIdx = idx >= 0 && idx < speeds.length - 1 ? idx + 1 : speeds.length - 1;
      this.setPlaybackRate(speeds[nextIdx]);
      return;
    }

    // 4. + and - to zoom in/out
    if (key === '+' || key === '=') {
      e._timelineShortcutHandled = true;
      e.preventDefault();
      this.setZoomLevel(this.zoomLevel * 1.35);
      return;
    }

    if (key === '-' || key === '_') {
      e._timelineShortcutHandled = true;
      e.preventDefault();
      this.setZoomLevel(this.zoomLevel / 1.35);
      return;
    }
  }

  _saveSetting(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, String(value));
      }
    } catch {
      // Ignore storage access errors
    }
  }

  _loadPersistedSettings() {
    try {
      if (typeof localStorage === 'undefined') return;
      const savedRate = localStorage.getItem(STORAGE_KEY_PLAYBACK_RATE);
      if (savedRate !== null) {
        const parsedRate = Number(savedRate);
        if (parsedRate === 0.25 || parsedRate === 0.5 || parsedRate === 1) {
          this.setPlaybackRate(parsedRate, { persist: false });
        }
      }
      const savedDock = localStorage.getItem(STORAGE_KEY_DOCK_POSITION);
      if (
        savedDock === 'left' ||
        savedDock === 'bottom' ||
        savedDock === 'right' ||
        savedDock === 'popout'
      ) {
        this.setDockPosition(savedDock, { persist: false });
      }
    } catch {
      // Ignore storage access errors
    }
  }

  _setupTimelineZoomAndPan() {
    this._timelineViewport.addEventListener(
      'wheel',
      (e) => this._onTimelineWheel(e),
      { passive: false }
    );
  }

  _onTimelineWheel(e) {
    if (!this._timelineViewport) return;

    // 1. CMD or CTRL + Scroll up/down => ZOOM in/out on the horizontal axis ONLY
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      const rawDelta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (rawDelta === 0) return;
      const clampedDelta = Math.max(-200, Math.min(200, rawDelta));
      const factor = Math.exp(-clampedDelta * 0.003);
      this.setZoomLevel(this.zoomLevel * factor, e.clientX);
      return;
    }

    // 2. SHIFT + Scroll up/down => horizontal scroll
    if (e.shiftKey) {
      e.preventDefault();
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      this._timelineViewport.scrollLeft += delta;
      return;
    }

    // 3. Regular Scroll up/down (vertical axis) and Scroll left/right (horizontal axis)
    e.preventDefault();
    if (e.deltaY !== 0) {
      this._timelineViewport.scrollTop += e.deltaY;
    }
    if (e.deltaX !== 0) {
      this._timelineViewport.scrollLeft += e.deltaX;
    }
  }

  /**
   * Sets the horizontal zoom level of the timeline (1 = 100%, up to 20 = 2000%).
   * Only zooms the horizontal timeline axis; vertical row heights and scrollTop are untouched.
   *
   * @param {number} zoom
   * @param {number} [anchorClientX] Optional pointer clientX to anchor the zoom around
   */
  setZoomLevel(zoom, anchorClientX) {
    const prevZoom = this.zoomLevel || 1;
    let nextZoom = Math.max(1, Math.min(20, Number(zoom) || 1));
    if (nextZoom < 1.005) {
      nextZoom = 1;
    }

    const viewport = this._timelineViewport;
    if (!viewport) {
      this.zoomLevel = nextZoom;
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const labelColWidth = this._rulerCorner?.getBoundingClientRect().width || 250;
    const baseTrackWidth = Math.max(1, viewport.clientWidth - labelColWidth);

    let cursorOffsetInTrack = baseTrackWidth / 2;
    if (typeof anchorClientX === 'number' && anchorClientX > 0) {
      cursorOffsetInTrack = Math.max(
        0,
        Math.min(baseTrackWidth, anchorClientX - viewportRect.left - labelColWidth)
      );
    }

    const prevScrollLeft = viewport.scrollLeft;
    this.zoomLevel = nextZoom;
    viewport.style.setProperty('--timeline-zoom', String(nextZoom));

    const prevTickBucket = Math.min(80, Math.max(10, Math.round(10 * prevZoom)));
    const nextTickBucket = Math.min(80, Math.max(10, Math.round(10 * nextZoom)));
    if (prevTickBucket !== nextTickBucket && this.isVisualizing) {
      this._renderRuler();
    }

    if (nextZoom === 1) {
      viewport.scrollLeft = 0;
    } else {
      const nextScrollLeft =
        (prevScrollLeft + cursorOffsetInTrack) * (nextZoom / prevZoom) -
        cursorOffsetInTrack;
      viewport.scrollLeft = Math.max(0, nextScrollLeft);
    }
  }

  /**
   * Checks whether a DOM node is part of `<interactions-timeline>` or its Shadow DOM / Popout window.
   *
   * @param {Node|EventTarget|null} node
   * @returns {boolean}
   */
  isOwnNode(node) {
    if (this._bottomSheet && node instanceof Node && this._bottomSheet.contains(node)) {
      return true;
    }
    return isElementInRecorder(node, this, this.shadowRoot);
  }

  /**
   * Toggles between starting and stopping a recording.
   */
  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  /**
   * Starts recording animations, transitions, user interactions, scrolls, and DOM removals.
   */
  startRecording() {
    if (this.isRecording) return;

    // If visualizing a previous recording, unpause and restore page first
    this._stopTimelineReplay();
    this._closePopoutWindow();
    this.restorePageState();
    this._bottomSheet.hidden = true;
    this._reopenSheetBtn.hidden = true;
    this.isVisualizing = false;

    const now = performance.now();
    this.store.start(now);
    this.isRecording = true;

    // Update top-right button UI
    this._recBtn.classList.add('is-recording');
    this._recBtnLabel.textContent = 'Stop Recording';
    this._recTimer.hidden = false;
    this._recTimer.textContent = '0.0s';

    // 1. Snapshot initial window scroll and scrollable container positions at t = 0
    this._captureInitialScrollPositions();

    // 2. Capture any animations already active on the page at t = 0 via document.getAnimations()
    this._scanDocumentAnimations(0, true);

    // 3. Attach capture-phase listeners and hooks
    this._attachRecordingListeners();

    // 4. Start rAF sampling loop
    const sampleLoop = () => {
      if (!this.isRecording) return;
      const elapsed = Math.max(0, performance.now() - this.store.startTime);
      this._scanDocumentAnimations(elapsed, false);
      this.store.checkDisconnectedElements(elapsed);
      this._recTimer.textContent = `${(elapsed / 1000).toFixed(1)}s`;
      this._rafId = requestAnimationFrame(sampleLoop);
    };
    this._rafId = requestAnimationFrame(sampleLoop);
  }

  /**
   * Stops the active recording, pauses all page animations/transitions, and presents the bottom sheet visualizer.
   *
   * @returns {TimelineStore}
   */
  stopRecording() {
    if (!this.isRecording) return this.store;

    const totalDuration = Math.max(60, performance.now() - this.store.startTime);
    this.isRecording = false;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    // Final scan before detaching
    this._scanDocumentAnimations(totalDuration, false);
    this._captureCurrentScrollSamples(totalDuration, false);
    this._detachRecordingListeners();

    this.store.finalize(totalDuration);

    // Update top-right button UI
    this._recBtn.classList.remove('is-recording');
    this._recBtnLabel.textContent = 'Start Recording';
    this._recTimer.hidden = true;

    // Present visualizer and pause page animations
    this.openVisualizer();

    // Observe subsequent DOM removals while visualizer is open
    this._startVisualizerMutationObserver();

    return this.store;
  }

  _captureInitialScrollPositions() {
    const docEl = document.scrollingElement || document.documentElement;
    const winTop = window.scrollY ?? docEl?.scrollTop ?? 0;
    const winLeft = window.scrollX ?? docEl?.scrollLeft ?? 0;
    const maxWinTop = Math.max(0, (docEl?.scrollHeight || 0) - window.innerHeight);
    const maxWinLeft = Math.max(0, (docEl?.scrollWidth || 0) - window.innerWidth);

    this.store.recordGlobalScroll(0, winTop, winLeft, maxWinTop, maxWinLeft, false);

    // Find scrollable elements in the document (excluding recorder's subtree)
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (this.isOwnNode(el)) continue;
      if (el === document.body || el === document.documentElement) continue;

      const hasScrollOffset = el.scrollTop > 0 || el.scrollLeft > 0;
      const isScrollableSize =
        el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;

      if (hasScrollOffset || isScrollableSize) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        const canScroll =
          hasScrollOffset ||
          overflowY === 'auto' ||
          overflowY === 'scroll' ||
          overflowX === 'auto' ||
          overflowX === 'scroll';
        if (canScroll) {
          const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
          const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
          this.store.recordElementScroll(el, 0, el.scrollTop, el.scrollLeft, maxTop, maxLeft, false);
        }
      }
    }
  }

  _captureCurrentScrollSamples(elapsed, isEvent = false) {
    const docEl = document.scrollingElement || document.documentElement;
    const winTop = window.scrollY ?? docEl?.scrollTop ?? 0;
    const winLeft = window.scrollX ?? docEl?.scrollLeft ?? 0;
    const maxWinTop = Math.max(0, (docEl?.scrollHeight || 0) - window.innerHeight);
    const maxWinLeft = Math.max(0, (docEl?.scrollWidth || 0) - window.innerWidth);

    this.store.recordGlobalScroll(elapsed, winTop, winLeft, maxWinTop, maxWinLeft, isEvent);

    for (const [el, track] of this.store.elementTracks.entries()) {
      if (track.scrollSamples.length > 0 && el.isConnected) {
        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
        const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
        this.store.recordElementScroll(el, elapsed, el.scrollTop, el.scrollLeft, maxTop, maxLeft, false);
      }
    }
  }

  _scanDocumentAnimations(elapsed, isStart = false) {
    if (typeof document.getAnimations !== 'function') return;

    const animations = document.getAnimations({ subtree: true });
    for (const anim of animations) {
      if (this._scrubAnimationSet.has(anim)) continue;
      const target = anim.effect?.target;
      if (!target || this.isOwnNode(target)) continue;

      const record = this.store.registerAnimation(anim, elapsed, {
        atRecordingStart: isStart,
      });

      if (record && !anim.__timelineVisualizerHooked) {
        anim.__timelineVisualizerHooked = true;
        anim.addEventListener('finish', () => {
          if (!this.isRecording) return;
          const t = Math.max(0, performance.now() - this.store.startTime);
          record.endTime = t;
          record.finishTime = t;
          record.completed = true;
          if (record.category === 'waapi') {
            this.store.recordElementEvent(target, {
              type: 'animationend',
              timestamp: t,
              name: record.name,
              detail: `WAAPI finish (${record.name})`,
            });
          }
        });
        anim.addEventListener('cancel', () => {
          if (!this.isRecording) return;
          const t = Math.max(0, performance.now() - this.store.startTime);
          record.endTime = t;
          record.cancelTime = t;
          record.completed = true;
          if (record.category === 'waapi') {
            this.store.recordElementEvent(target, {
              type: 'animationcancel',
              timestamp: t,
              name: record.name,
              detail: `WAAPI cancel (${record.name})`,
            });
          }
        });
      }
    }
  }

  _attachRecordingListeners() {
    const lifecycleEvents = [
      'animationstart',
      'animationiteration',
      'animationend',
      'animationcancel',
      'transitionrun',
      'transitionstart',
      'transitionend',
      'transitioncancel',
    ];

    for (const type of lifecycleEvents) {
      window.addEventListener(type, this._boundLifecycleHandler, { capture: true, passive: true });
    }

    window.addEventListener('click', this._boundClickHandler, { capture: true, passive: true });
    window.addEventListener('keydown', this._boundKeyHandler, { capture: true, passive: true });
    window.addEventListener('keyup', this._boundKeyHandler, { capture: true, passive: true });
    window.addEventListener('scroll', this._boundScrollHandler, { capture: true, passive: true });
    document.addEventListener('scroll', this._boundScrollHandler, { capture: true, passive: true });

    // Hook Element.prototype.animate so JS-driven WAAPI calls are captured at invocation time
    if (typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function' && !this._originalElementAnimate) {
      const self = this;
      const origAnimate = Element.prototype.animate;
      this._originalElementAnimate = origAnimate;

      Element.prototype.animate = function patchedAnimate(keyframes, options) {
        const anim = origAnimate.apply(this, [keyframes, options]);
        if (self.isRecording && !self._isScrubbing && !self.isOwnNode(this)) {
          const t = Math.max(0, performance.now() - self.store.startTime);
          self.store.recordElementEvent(this, {
            type: 'animationstart',
            timestamp: t,
            name: anim.id || 'element.animate()',
            detail: 'WAAPI element.animate() started',
          });
          self.store.registerAnimation(anim, t, {
            target: this,
            runTime: t,
            startTime: t,
          });
          self._scanDocumentAnimations(t, false);
        }
        return anim;
      };
    }

    // Observe DOM mutations to detect when tracked elements get disconnected
    if (typeof MutationObserver !== 'undefined') {
      this._mutationObserver = new MutationObserver((mutations) => {
        if (!this.isRecording) return;
        let hasRemovals = false;
        for (const m of mutations) {
          if (m.removedNodes && m.removedNodes.length > 0) {
            hasRemovals = true;
            break;
          }
        }
        if (hasRemovals) {
          const t = Math.max(0, performance.now() - this.store.startTime);
          this.store.checkDisconnectedElements(t);
        }
      });
      this._mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  _detachRecordingListeners() {
    const lifecycleEvents = [
      'animationstart',
      'animationiteration',
      'animationend',
      'animationcancel',
      'transitionrun',
      'transitionstart',
      'transitionend',
      'transitioncancel',
    ];

    for (const type of lifecycleEvents) {
      window.removeEventListener(type, this._boundLifecycleHandler, { capture: true });
    }

    window.removeEventListener('click', this._boundClickHandler, { capture: true });
    window.removeEventListener('keydown', this._boundKeyHandler, { capture: true });
    window.removeEventListener('keyup', this._boundKeyHandler, { capture: true });
    window.removeEventListener('scroll', this._boundScrollHandler, { capture: true });
    document.removeEventListener('scroll', this._boundScrollHandler, { capture: true });

    if (this._originalElementAnimate) {
      Element.prototype.animate = this._originalElementAnimate;
      this._originalElementAnimate = null;
    }

    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }
  }

  _startVisualizerMutationObserver() {
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
    }
    if (typeof MutationObserver === 'undefined') return;

    this._mutationObserver = new MutationObserver(() => {
      if (!this.isVisualizing) return;
      let changed = false;
      for (const [el, track] of this.store.elementTracks.entries()) {
        const isConn = Boolean(el.isConnected);
        if (!isConn && !track.removed) {
          track.removed = true;
          if (track.removedAt === null) {
            track.removedAt = this.store.duration;
          }
          changed = true;
        }
      }
      if (changed) {
        this._renderTimelineRows();
      }
    });

    this._mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  _onLifecycleEvent(event) {
    if (!this.isRecording || this._isScrubbing) return;
    if (isEventFromRecorder(event, this, this.shadowRoot)) return;

    const target = event.target;
    if (!target || !(target instanceof Element) || this.isOwnNode(target)) return;

    const t = Math.max(0, performance.now() - this.store.startTime);
    const isTransition = event.type.startsWith('transition');
    const propOrAnimName = isTransition ? event.propertyName : event.animationName;
    const normalizedTargetName = normalizePropertyName(propOrAnimName || '');

    // Locate matching Animation instance on target before browser removes it
    let matchedAnim = null;
    if (typeof target.getAnimations === 'function') {
      const anims = target.getAnimations();
      for (const a of anims) {
        if (this._scrubAnimationSet.has(a)) continue;
        if (isTransition && normalizePropertyName(a.transitionProperty || '') === normalizedTargetName) {
          matchedAnim = a;
          break;
        }
        if (!isTransition && a.animationName === propOrAnimName) {
          matchedAnim = a;
          break;
        }
      }
      if (!matchedAnim && anims.length === 1 && !this._scrubAnimationSet.has(anims[0])) {
        matchedAnim = anims[0];
      }
    }

    this.store.handleLifecycleEvent(
      target,
      event.type,
      t,
      {
        propertyName: event.propertyName,
        animationName: event.animationName,
        elapsedTime: event.elapsedTime,
      },
      matchedAnim
    );
  }

  _onClickEvent(event) {
    if (!this.isRecording || this._isScrubbing) return;
    if (isEventFromRecorder(event, this, this.shadowRoot)) return;

    const t = Math.max(0, performance.now() - this.store.startTime);
    const target = event.target;

    if (!target || target === document || target === window || target === document.documentElement || target === document.body) {
      this.store.recordGlobalEvent({
        type: 'click',
        timestamp: t,
        detail: `Click (${Math.round(event.clientX || 0)}, ${Math.round(event.clientY || 0)})`,
      });
      return;
    }

    if (target instanceof Element && !this.isOwnNode(target)) {
      this.store.recordElementEvent(target, {
        type: 'click',
        timestamp: t,
        detail: `Click on ${formatElementLabel(target)}`,
      });
    }
  }

  _onKeyEvent(event) {
    if (!this.isRecording || this._isScrubbing) return;
    if (isEventFromRecorder(event, this, this.shadowRoot)) return;

    const t = Math.max(0, performance.now() - this.store.startTime);
    const keyLabel = event.key || event.code || 'Key';

    // Always record keyboard event in pinned global window/document row
    this.store.recordGlobalEvent({
      type: event.type,
      timestamp: t,
      key: keyLabel,
      code: event.code || null,
      detail: `${event.type}: ${keyLabel}`,
    });

    // Also record on target element if focused on a specific element
    const target = event.target;
    if (
      target instanceof Element &&
      target !== document.body &&
      target !== document.documentElement &&
      !this.isOwnNode(target)
    ) {
      this.store.recordElementEvent(target, {
        type: event.type,
        timestamp: t,
        key: keyLabel,
        detail: `${event.type}: ${keyLabel}`,
      });
    }
  }

  _onScrollEvent(event) {
    if (!this.isRecording || this._isScrubbing) return;
    if (isEventFromRecorder(event, this, this.shadowRoot)) return;

    const t = Math.max(0, performance.now() - this.store.startTime);
    const target = event.target;

    const isRootScroller =
      !target ||
      target === document ||
      target === window ||
      target === document.documentElement ||
      target === document.body;

    if (isRootScroller) {
      const docEl = document.scrollingElement || document.documentElement;
      const winTop = window.scrollY ?? docEl?.scrollTop ?? 0;
      const winLeft = window.scrollX ?? docEl?.scrollLeft ?? 0;
      const maxWinTop = Math.max(0, (docEl?.scrollHeight || 0) - window.innerHeight);
      const maxWinLeft = Math.max(0, (docEl?.scrollWidth || 0) - window.innerWidth);
      this.store.recordGlobalScroll(t, winTop, winLeft, maxWinTop, maxWinLeft, true);
    } else if (target instanceof Element && !this.isOwnNode(target)) {
      const track = this.store.getOrCreateElementTrack(target, t);
      if (track && track.scrollSamples.length === 0 && t > 0) {
        // Ensure a t = 0 baseline sample exists for scrubbing back to start
        const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
        const maxLeft = Math.max(0, target.scrollWidth - target.clientWidth);
        this.store.recordElementScroll(target, 0, 0, 0, maxTop, maxLeft, false);
      }
      const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
      const maxLeft = Math.max(0, target.scrollWidth - target.clientWidth);
      this.store.recordElementScroll(
        target,
        t,
        target.scrollTop,
        target.scrollLeft,
        maxTop,
        maxLeft,
        true
      );
    }

    // Sample any scroll-driven animations immediately on scroll
    this._scanDocumentAnimations(t, false);
  }

  /**
   * Opens the bottom sheet visualizer, pauses all page animations/transitions, and renders the timeline.
   */
  openVisualizer() {
    this._loadPersistedSettings();
    this.isVisualizing = true;
    this.isCollapsed = false;
    this._bottomSheet.classList.remove('is-collapsed');
    this._collapseBtn.textContent = '▾ Collapse';
    this._bottomSheet.hidden = false;
    this._reopenSheetBtn.hidden = true;

    if (this.dockPosition === 'popout') {
      this._openInPopoutWindow();
    } else {
      try {
        this._bottomSheet.focus({ preventScroll: true });
      } catch {
        // Ignore focus errors
      }
    }

    this._pauseAllPageAnimations();

    const duration = Math.max(1, Math.round(this.store.duration || 1000));
    this._scrubberSlider.max = String(duration);
    this._scrubberSlider.value = String(duration);

    this._renderRuler();
    this._renderTimelineRows();
    this.scrubToTime(this.store.duration);
  }

  /**
   * Closes the visualizer and restores/unpauses the page back to its normal interactive state.
   */
  closeVisualizer() {
    this._stopTimelineReplay();
    this._closePopoutWindow();
    this.restorePageState();
    this.isVisualizing = false;
    this._bottomSheet.hidden = true;
    this._hideHighlightOverlay();

    if (this.store.duration > 0) {
      this._reopenSheetBtn.hidden = false;
    }
  }

  /**
   * Resets all recorded data, closes the visualizer, and restores the page to its normal interactive state.
   */
  reset() {
    this._stopTimelineReplay();
    this._closePopoutWindow();
    if (this.isRecording) {
      this._detachRecordingListeners();
      this.isRecording = false;
    }
    this.restorePageState();
    this.store.reset();
    this.setZoomLevel(1);
    this.isVisualizing = false;
    this._bottomSheet.hidden = true;
    this._reopenSheetBtn.hidden = true;
    this._hideHighlightOverlay();
    this._pinnedRowContainer.replaceChildren();
    this._elementRowsContainer.replaceChildren();
  }

  /**
   * Toggles the collapsed state of the bottom sheet (only allowed when docked to the bottom).
   *
   * @param {boolean} [forceState]
   */
  toggleCollapse(forceState) {
    const requested = typeof forceState === 'boolean' ? forceState : !this.isCollapsed;
    this.isCollapsed = this.dockPosition === 'bottom' ? requested : false;
    this._bottomSheet.classList.toggle('is-collapsed', this.isCollapsed);
    this._collapseBtn.textContent = this.isCollapsed ? '▴ Expand' : '▾ Collapse';
  }

  /**
   * Pauses all active animations and transitions on the page (excluding the recorder's own subtree)
   * and saves their state so they can be restored when closing/resetting the visualizer.
   */
  _pauseAllPageAnimations() {
    // Save current scroll positions before scrubbing
    const docEl = document.scrollingElement || document.documentElement;
    this._savedWindowScroll = {
      scrollTop: window.scrollY ?? docEl?.scrollTop ?? 0,
      scrollLeft: window.scrollX ?? docEl?.scrollLeft ?? 0,
    };

    this._savedElementScrolls.clear();
    for (const [el, track] of this.store.elementTracks.entries()) {
      if (track.scrollSamples.length > 0 && el.isConnected) {
        this._savedElementScrolls.set(el, {
          scrollTop: el.scrollTop,
          scrollLeft: el.scrollLeft,
        });
      }
    }

    if (typeof document.getAnimations !== 'function') return;

    const activeAnims = document.getAnimations({ subtree: true });
    for (const anim of activeAnims) {
      if (this._scrubAnimationSet.has(anim)) continue;
      const target = anim.effect?.target;
      if (!target || this.isOwnNode(target)) continue;

      const alreadySaved = this._pausedPageAnimations.some((entry) => entry.animation === anim);
      if (!alreadySaved) {
        this._pausedPageAnimations.push({
          animation: anim,
          playState: anim.playState,
          currentTime: anim.currentTime,
        });
      }

      try {
        anim.pause();
      } catch {
        // Ignore if animation cannot be paused
      }
    }
  }

  /**
   * Restores and unpauses all page animations and cancels any synthetic scrub animations.
   */
  restorePageState() {
    this._isScrubbing = true;
    try {
      // 1. Cancel and dispose all synthetic scrub animations
      for (const scrubAnim of this._scrubAnimationSet) {
        try {
          scrubAnim.cancel();
        } catch {
          // Ignore
        }
      }
      this._scrubAnimationSet.clear();
      this._recordScrubAnimMap.clear();

      // 2. Restore scroll positions to where they were when visualizer opened
      if (this._savedWindowScroll) {
        window.scrollTo({
          top: this._savedWindowScroll.scrollTop,
          left: this._savedWindowScroll.scrollLeft,
          behavior: 'instant',
        });
        this._savedWindowScroll = null;
      }

      for (const [el, pos] of this._savedElementScrolls.entries()) {
        if (el.isConnected) {
          el.scrollTop = pos.scrollTop;
          el.scrollLeft = pos.scrollLeft;
        }
      }
      this._savedElementScrolls.clear();

      // 3. Unpause / restore original page animations
      for (const item of this._pausedPageAnimations) {
        const { animation, playState, currentTime } = item;
        try {
          if (currentTime !== null && currentTime !== undefined) {
            animation.currentTime = currentTime;
          }
          if (playState === 'running') {
            animation.play();
          }
        } catch {
          // Ignore errors on detached animations
        }
      }
      this._pausedPageAnimations = [];
    } finally {
      this._isScrubbing = false;
    }
  }

  /**
   * Scrubs the page's scroll positions and animations/transitions to relative timestamp `t` (in ms)
   * without triggering new recording events.
   *
   * @param {number} targetTimeMs
   */
  scrubToTime(targetTimeMs) {
    const duration = Math.max(1, this.store.duration || 1);
    const t = Math.max(0, Math.min(duration, Number(targetTimeMs) || 0));
    this.currentScrubTime = t;

    // Update UI controls & playhead
    const ratio = t / duration;
    this._timelineViewport.style.setProperty('--playhead-ratio', String(ratio));
    this._scrubberSlider.value = String(Math.round(t));
    this._timeReadout.textContent = `${Math.round(t)} ms / ${Math.round(duration)} ms`;

    this._isScrubbing = true;
    try {
      // 1. Ensure any newly-started page animations are paused so we have full control
      if (typeof document.getAnimations === 'function') {
        for (const anim of document.getAnimations({ subtree: true })) {
          if (this._scrubAnimationSet.has(anim)) continue;
          if (this.isOwnNode(anim.effect?.target)) continue;
          if (anim.playState === 'running') {
            this._pausedPageAnimations.push({
              animation: anim,
              playState: 'running',
              currentTime: anim.currentTime,
            });
            try {
              anim.pause();
            } catch {
              // Ignore
            }
          }
        }
      }

      // 2. Scrub root window scroll position (when root scroller row's checkbox is checked)
      if (this.store.globalRow.scrollEnabled !== false) {
        const globalScroll = this.store.getGlobalScrollAt(t);
        if (globalScroll) {
          window.scrollTo({
            top: globalScroll.scrollTop,
            left: globalScroll.scrollLeft,
            behavior: 'instant',
          });
        }
      }

      // 3. Scrub scrollable element containers and element animations/transitions
      for (const [el, track] of this.store.elementTracks.entries()) {
        if (!el || !el.isConnected) continue;

        // 3a. Scroll position for scrollable container (when this scroller row's checkbox is checked)
        if (track.scrollSamples.length > 0 && track.scrollEnabled !== false) {
          const elScroll = this.store.getElementScrollAt(el, t);
          if (elScroll) {
            el.scrollTop = elScroll.scrollTop;
            el.scrollLeft = elScroll.scrollLeft;
          }
        }

        // 3b. Animations and transitions on this element
        for (const record of track.animations) {
          this._scrubAnimationRecord(el, record, t);
        }
      }
    } finally {
      this._isScrubbing = false;
    }
  }

  _scrubAnimationRecord(el, record, t) {
    const state = interpolateAnimationState(record, t);
    const origAnim = record.animation;

    // Check if the original animation is still active in document.getAnimations()
    let isOrigAlive = false;
    if (origAnim && origAnim.playState !== 'finished' && origAnim.playState !== 'idle') {
      isOrigAlive = true;
    }

    // Handle Scroll-Driven Animations (ScrollTimeline / ViewTimeline)
    if (record.isScrollDriven) {
      const pct = Math.max(0, Math.min(100, state.progress * 100));
      if (origAnim) {
        try {
          origAnim.pause();
          if (typeof CSS !== 'undefined' && typeof CSS.percent === 'function') {
            origAnim.currentTime = CSS.percent(pct);
          } else {
            origAnim.currentTime = state.currentTime;
          }
        } catch {
          // Fallback to synthetic scrub animation below
        }
      }

      // Also apply synthetic scrub animation if keyframes were captured so visual state is guaranteed
      if (record.keyframes && record.keyframes.length > 0) {
        const scrubAnim = this._getOrCreateScrubAnimation(el, record, 1000);
        if (scrubAnim) {
          scrubAnim.currentTime = Math.max(0, Math.min(1000, state.progress * 1000));
        }
      }
      return;
    }

    // Handle Time-Driven Animations & Transitions
    const duration = Math.max(
      1,
      extractNumericValue(record.timing?.duration, 0) ||
        Math.max(1, (record.endTime ?? 100) - (record.startTime ?? 0))
    );

    if (isOrigAlive && origAnim && !record.completed) {
      try {
        origAnim.pause();
        if (state.phase === 'before' || state.phase === 'delay') {
          origAnim.currentTime = 0;
        } else {
          origAnim.currentTime = Math.max(0, state.currentTime);
        }
        return;
      } catch {
        // Fall through to synthetic scrub animation
      }
    }

    // Completed or detached transition / one-shot animation: use synthetic scrub Animation from snapshotted keyframes
    if (!record.keyframes || record.keyframes.length === 0) return;

    if (record.category === 'transition') {
      const scrubAnim = this._getOrCreateScrubAnimation(el, record, duration);
      if (!scrubAnim) return;

      if (state.phase === 'before' || state.phase === 'delay') {
        // Hold pre-transition state (keyframe offset 0)
        scrubAnim.currentTime = 0;
      } else if (state.phase === 'active') {
        scrubAnim.currentTime = Math.max(0, Math.min(duration, state.currentTime));
      } else {
        // Hold post-transition state (keyframe offset 1)
        scrubAnim.currentTime = duration;
      }
      return;
    }

    // CSS Animation or WAAPI Animation
    const fill = record.timing?.fill || 'none';
    const fillsBackwards = fill === 'backwards' || fill === 'both';
    const fillsForwards = fill === 'forwards' || fill === 'both';

    if (state.phase === 'before' || state.phase === 'delay') {
      if (fillsBackwards) {
        const scrubAnim = this._getOrCreateScrubAnimation(el, record, duration);
        if (scrubAnim) scrubAnim.currentTime = 0;
      } else {
        this._cancelScrubAnimationForRecord(record);
      }
    } else if (state.phase === 'active') {
      const scrubAnim = this._getOrCreateScrubAnimation(el, record, duration);
      if (scrubAnim) {
        scrubAnim.currentTime = Math.max(0, state.currentTime);
      }
    } else {
      // 'after' or 'cancelled'
      if (fillsForwards && state.phase === 'after') {
        const scrubAnim = this._getOrCreateScrubAnimation(el, record, duration);
        if (scrubAnim) {
          scrubAnim.currentTime = Math.max(0, state.currentTime);
        }
      } else {
        this._cancelScrubAnimationForRecord(record);
      }
    }
  }

  _getOrCreateScrubAnimation(el, record, fallbackDuration) {
    if (!el || !el.isConnected) return null;

    let scrubAnim = this._recordScrubAnimMap.get(record);
    if (scrubAnim && scrubAnim.playState !== 'idle') {
      return scrubAnim;
    }

    try {
      const duration = Math.max(
        1,
        record.isScrollDriven
          ? 1000
          : extractNumericValue(record.timing?.duration, fallbackDuration) || fallbackDuration || 1
      );
      const iterations = record.isScrollDriven
        ? 1
        : record.timing?.iterations === Infinity
          ? 1000
          : Math.max(1, extractNumericValue(record.timing?.iterations, 1) || 1);

      const effect = new KeyframeEffect(el, record.keyframes, {
        duration,
        iterations,
        iterationStart: extractNumericValue(record.timing?.iterationStart, 0) || 0,
        direction: record.timing?.direction || 'normal',
        easing: record.timing?.easing || 'linear',
        fill: 'both',
      });

      scrubAnim = new Animation(effect, document.timeline);
      this._scrubAnimationSet.add(scrubAnim);
      scrubAnim.pause();
      this._recordScrubAnimMap.set(record, scrubAnim);
      return scrubAnim;
    } catch {
      return null;
    }
  }

  _cancelScrubAnimationForRecord(record) {
    const scrubAnim = this._recordScrubAnimMap.get(record);
    if (scrubAnim) {
      try {
        scrubAnim.cancel();
      } catch {
        // Ignore
      }
      this._scrubAnimationSet.delete(scrubAnim);
      this._recordScrubAnimMap.delete(record);
    }
  }

  /**
   * Sets the timeline replay speed multiplier (0.25 for 25%, 0.5 for 50%, 1 for 100%).
   *
   * @param {number} rate
   * @param {{ persist?: boolean }} [options]
   */
  setPlaybackRate(rate, { persist = true } = {}) {
    let num = Number(rate);
    if (num > 1) num = num / 100;
    const valid = num === 0.25 || num === 0.5 ? num : 1;
    this.playbackRate = valid;
    if (persist) {
      this._saveSetting(STORAGE_KEY_PLAYBACK_RATE, valid);
    }

    const buttons = [
      [this._speedBtn25, 0.25],
      [this._speedBtn50, 0.5],
      [this._speedBtn100, 1],
    ];
    for (const [btn, speed] of buttons) {
      if (!btn) continue;
      const active = speed === valid;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  _toggleTimelineReplay() {
    if (this._playbackRafId) {
      this._stopTimelineReplay();
      return;
    }

    const duration = Math.max(1, this.store.duration || 1);
    let currentPlayTime = this.currentScrubTime >= duration - 10 ? 0 : this.currentScrubTime;
    let lastFrameWall = performance.now();

    this._playScrubBtn.textContent = '⏸ Pause';

    const step = () => {
      const now = performance.now();
      const dt = Math.max(0, now - lastFrameWall);
      lastFrameWall = now;
      currentPlayTime += dt * (this.playbackRate || 1);
      if (currentPlayTime >= duration) {
        this.scrubToTime(duration);
        this._stopTimelineReplay();
        return;
      }
      this.scrubToTime(currentPlayTime);
      this._playbackRafId = requestAnimationFrame(step);
    };

    this._playbackRafId = requestAnimationFrame(step);
  }

  _stopTimelineReplay() {
    if (this._playbackRafId) {
      cancelAnimationFrame(this._playbackRafId);
      this._playbackRafId = null;
    }
    if (this._playScrubBtn) {
      this._playScrubBtn.textContent = '▶ Replay';
    }
  }

  _renderRuler() {
    this._rulerTrack.replaceChildren();
    const duration = Math.max(100, this.store.duration || 1000);
    const tickCount = Math.min(80, Math.max(10, Math.round(10 * (this.zoomLevel || 1))));
    for (let i = 0; i <= tickCount; i++) {
      const pct = (i / tickCount) * 100;
      const ms = Math.round((i / tickCount) * duration);
      const tick = h('div', {
        className: 'ruler-tick',
        style: { left: `${pct}%` },
        textContent: `${ms}ms`,
      });
      this._rulerTrack.appendChild(tick);
    }
  }

  _renderTimelineRows() {
    this._pinnedRowContainer.replaceChildren();
    this._elementRowsContainer.replaceChildren();

    const duration = Math.max(1, this.store.duration || 1);

    // 1. Render Pinned Global Row (`window / document`)
    const globalRowEl = this._createGlobalRowElement(duration);
    this._pinnedRowContainer.appendChild(globalRowEl);

    // 2. Render Tracked Element Rows
    const tracks = this.store.getTracks();
    if (tracks.length === 0) {
      this._elementRowsContainer.appendChild(
        h('div', {
          className: 'empty-state',
          textContent: 'No element animations, transitions, or element events recorded yet.',
        })
      );
      return;
    }

    for (const track of tracks) {
      // Refresh removed state before rendering
      if (track.element && !track.element.isConnected && !track.removed) {
        track.removed = true;
        if (track.removedAt === null) {
          track.removedAt = duration;
        }
      }
      const rowEl = this._createElementRow(track, duration);
      this._elementRowsContainer.appendChild(rowEl);
    }
  }

  _createScrollerCheckboxBadge(targetObj, labelText, scrollerId) {
    const isChecked = targetObj.scrollEnabled !== false;
    const checkbox = h('input', {
      type: 'checkbox',
      className: 'scroller-checkbox',
      'data-testid': 'scroller-checkbox',
      'data-scroller': scrollerId,
      checked: isChecked,
      onPointerDown: (e) => e.stopPropagation(),
      onClick: (e) => e.stopPropagation(),
      onChange: (e) => {
        targetObj.scrollEnabled = Boolean(e.target.checked);
        badgeLabel.classList.toggle('is-unchecked', !targetObj.scrollEnabled);
        if (targetObj.scrollEnabled && this.isVisualizing) {
          this.scrubToTime(this.currentScrubTime);
        }
      },
    });
    checkbox.checked = isChecked;

    const badgeLabel = h(
      'label',
      {
        className: `badge badge-scroller scroller-checkbox-label${isChecked ? '' : ' is-unchecked'}`,
        'data-testid': 'scroller-toggle-label',
        'data-scroller': scrollerId,
        title: 'Toggle scrolling this scroller when scrubbing the timeline',
        onPointerDown: (e) => e.stopPropagation(),
      },
      checkbox,
      h('span', { textContent: labelText })
    );

    return badgeLabel;
  }

  _createGlobalRowElement(duration) {
    const globalData = this.store.globalRow;

    const header = h(
      'div',
      { className: 'row-header' },
      h(
        'div',
        { className: 'row-title-line' },
        h('span', {
          className: 'row-selector',
          'data-testid': 'pinned-row-label',
          textContent: globalData.label,
        })
      ),
      h(
        'div',
        { className: 'row-meta-line' },
        h('span', { className: 'badge badge-pinned', textContent: '📌 Pinned Root' }),
        globalData.scrollSamples.length > 0
          ? this._createScrollerCheckboxBadge(globalData, '↕ Root Scroller', 'root')
          : null
      )
    );

    const trackCanvas = h('div', {
      className: 'row-track',
      'data-testid': 'pinned-row-track',
    });
    this._setupTrackScrubbing(trackCanvas);

    // Render root scroll activity spans & curve
    this._renderScrollActivityIntoTrack(
      trackCanvas,
      globalData.scrollSpans,
      globalData.scrollSamples,
      duration,
      false
    );

    // Render global discrete events (keyboard, root scroll, global click)
    for (const evt of globalData.events) {
      const marker = this._createEventMarker(evt, duration, false);
      trackCanvas.appendChild(marker);
    }

    return h(
      'div',
      {
        className: 'timeline-row is-pinned',
        'data-testid': 'pinned-global-row',
      },
      header,
      trackCanvas
    );
  }

  _createElementRow(track, duration) {
    const isRemoved = Boolean(track.removed || (track.element && !track.element.isConnected));
    const laneCount = Math.max(1, track.laneCount || 1);
    const rowHeight = Math.max(46, laneCount * 34 + 14);

    const removedWarning = isRemoved
      ? h('span', {
          className: 'badge badge-removed',
          'data-testid': 'removed-warning',
          title:
            track.removedAt !== null
              ? `Element was disconnected from the DOM at ${Math.round(track.removedAt)}ms`
              : 'Element was disconnected from the DOM',
          textContent:
            track.removedAt !== null
              ? `⚠️ Removed (${Math.round(track.removedAt)}ms)`
              : '⚠️ Removed',
        })
      : null;

    const scrollerBadge =
      track.scrollSamples.length > 0
        ? this._createScrollerCheckboxBadge(track, '↕ Scroller', track.label)
        : null;

    const header = h(
      'div',
      { className: 'row-header' },
      h(
        'div',
        { className: 'row-title-line' },
        h('span', {
          className: 'row-selector',
          'data-testid': 'row-label',
          title: track.label,
          textContent: track.label,
        })
      ),
      h('div', { className: 'row-meta-line' }, removedWarning, scrollerBadge)
    );

    const trackCanvas = h('div', {
      className: 'row-track',
      style: { minHeight: `${rowHeight}px` },
    });
    this._setupTrackScrubbing(trackCanvas);

    // 1. Scroll spans & scroll position curve if this element is a scroller
    if (track.scrollSamples.length > 0) {
      this._renderScrollActivityIntoTrack(
        trackCanvas,
        track.scrollSpans,
        track.scrollSamples,
        duration,
        isRemoved
      );
    }

    // 2. Recorded animation & transition duration boxes
    for (const anim of track.animations) {
      const box = this._createAnimationBox(anim, duration, isRemoved);
      trackCanvas.appendChild(box);
    }

    // 3. Discrete event vertical lines/markers
    for (const evt of track.events) {
      const marker = this._createEventMarker(evt, duration, isRemoved);
      trackCanvas.appendChild(marker);
    }

    const rowEl = h(
      'div',
      {
        className: `timeline-row${isRemoved ? ' is-removed' : ''}`,
        'data-testid': 'element-row',
        'data-selector': track.label,
        'data-removed': isRemoved ? 'true' : 'false',
        onMouseEnter: () => this._highlightPageElement(track.element, track.label),
        onMouseLeave: () => this._hideHighlightOverlay(),
      },
      header,
      trackCanvas
    );

    return rowEl;
  }

  _createAnimationBox(anim, totalDuration, isRemoved) {
    const runTime = Math.max(0, anim.runTime ?? anim.startTime ?? 0);
    const startTime = Math.max(runTime, anim.startTime ?? runTime);
    const endTime = Math.max(startTime + 4, anim.endTime ?? totalDuration);

    const leftPct = Math.max(0, Math.min(100, (runTime / totalDuration) * 100));
    const widthPct = Math.max(0.8, Math.min(100 - leftPct, ((endTime - runTime) / totalDuration) * 100));
    const boxDuration = Math.max(1, endTime - runTime);

    const topPx = 7 + (anim.lane || 0) * 32;

    const driverType = anim.timelineType || 'time';
    const driverText =
      driverType === 'view'
        ? '👁 ViewTimeline'
        : driverType === 'scroll'
          ? '📜 ScrollTimeline'
          : '⏱ Time';

    const classes = [
      'timeline-box',
      `category-${anim.category || 'css-animation'}`,
      `driver-${driverType}`,
    ];
    if (isRemoved) {
      classes.push('is-outline');
    }

    const children = [];

    // 1. Delay segment between runTime (e.g. transitionrun) and startTime (e.g. transitionstart)
    const delayDuration = Math.max(0, startTime - runTime);
    if (delayDuration > 1) {
      const delayWidthPct = Math.max(2, Math.min(95, (delayDuration / boxDuration) * 100));
      children.push(
        h('div', {
          className: 'box-delay-segment',
          'data-testid': 'box-delay-segment',
          style: { width: `${delayWidthPct}%` },
          title: `Delay: ${Math.round(delayDuration)}ms`,
        })
      );
    }

    // 2. Color-coded vertical lines for run / start / iteration / end / cancel
    // 2a. Run line at left edge (if there was a run event or delay)
    children.push(
      h('div', {
        className: 'box-line line-run',
        'data-line-type': 'run',
        title: `Run: ${Math.round(runTime)}ms`,
      })
    );

    // 2b. Start line (at startTime relative to box)
    const startOffsetPct = Math.max(0, Math.min(98, ((startTime - runTime) / boxDuration) * 100));
    children.push(
      h('div', {
        className: 'box-line line-start',
        'data-line-type': 'start',
        style: { left: `${startOffsetPct}%` },
        title: `Start: ${Math.round(startTime)}ms`,
      })
    );

    // 2c. Iteration lines
    if (Array.isArray(anim.iterations)) {
      for (const iterTime of anim.iterations) {
        if (iterTime >= runTime && iterTime <= endTime) {
          const iterPct = Math.max(1, Math.min(99, ((iterTime - runTime) / boxDuration) * 100));
          children.push(
            h('div', {
              className: 'box-line line-iteration',
              'data-line-type': 'iteration',
              style: { left: `${iterPct}%` },
              title: `Iteration at ${Math.round(iterTime)}ms`,
            })
          );
        }
      }
    }

    // 2d. End or Cancel line at right edge
    if (anim.cancelTime !== null && anim.cancelTime !== undefined) {
      children.push(
        h('div', {
          className: 'box-line line-cancel',
          'data-line-type': 'cancel',
          title: `Cancelled at ${Math.round(anim.cancelTime)}ms`,
        })
      );
    } else if (anim.finishTime !== null && anim.finishTime !== undefined) {
      children.push(
        h('div', {
          className: 'box-line line-end',
          'data-line-type': 'end',
          title: `Ended at ${Math.round(anim.finishTime)}ms`,
        })
      );
    }

    // 3. Progress / Activity Curve Sparkline over the recorded time axis
    const sparklineSvg = this._createProgressSparkline(anim, runTime, endTime, isRemoved);
    if (sparklineSvg) {
      children.push(sparklineSvg);
    }

    // 4. Label & Timeline Driver Indicator Badge
    const badge = h('span', {
      className: 'driver-badge',
      'data-testid': 'driver-badge',
      'data-driver': driverType,
      textContent: driverText,
    });

    const titleText = `${anim.name} (${Math.round(endTime - startTime)}ms)`;
    const contentPaddingLeft =
      delayDuration > 1 && startOffsetPct < 60 ? `calc(${startOffsetPct.toFixed(1)}% + 7px)` : '7px';
    children.push(
      h(
        'div',
        {
          className: 'box-content',
          style: { paddingLeft: contentPaddingLeft },
        },
        badge,
        h('span', { className: 'box-title', textContent: titleText })
      )
    );

    return h(
      'div',
      {
        className: classes.join(' '),
        'data-testid': 'timeline-box',
        'data-category': anim.category,
        'data-name': anim.name,
        'data-driver': driverType,
        'data-outline': isRemoved ? 'true' : 'false',
        style: {
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          top: `${topPx}px`,
        },
        title: `${anim.category}: ${anim.name} | ${driverText} | ${Math.round(runTime)}ms → ${Math.round(endTime)}ms`,
      },
      ...children
    );
  }

  _createProgressSparkline(anim, runTime, endTime, isRemoved) {
    const boxDur = Math.max(1, endTime - runTime);
    const steps = 28;
    const points = [];

    for (let i = 0; i <= steps; i++) {
      const sampleTime = runTime + (i / steps) * boxDur;
      const state = interpolateAnimationState(anim, sampleTime);
      const x = (i / steps) * 100;
      const y = 26 - Math.max(0, Math.min(1, state.progress || 0)) * 22;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    const polylinePoints = points.join(' ');
    const areaPoints = `0,28 ${polylinePoints} 100,28`;

    const strokeColor =
      anim.timelineType === 'scroll' || anim.timelineType === 'view'
        ? '#fde047'
        : 'rgba(255, 255, 255, 0.75)';
    const fillColor = isRemoved
      ? 'none'
      : anim.timelineType === 'scroll' || anim.timelineType === 'view'
        ? 'rgba(250, 204, 21, 0.22)'
        : 'rgba(255, 255, 255, 0.14)';

    return svg(
      'svg',
      {
        class: 'progress-sparkline',
        viewBox: '0 0 100 28',
        preserveAspectRatio: 'none',
      },
      svg('polygon', {
        points: areaPoints,
        fill: fillColor,
      }),
      svg('polyline', {
        points: polylinePoints,
        fill: 'none',
        stroke: strokeColor,
        'stroke-width': '1.5',
      })
    );
  }

  _renderScrollActivityIntoTrack(trackCanvas, scrollSpans, scrollSamples, totalDuration, isRemoved) {
    // 1. Scroll span boxes
    if (Array.isArray(scrollSpans)) {
      for (const span of scrollSpans) {
        const leftPct = Math.max(0, Math.min(100, (span.startTime / totalDuration) * 100));
        const widthPct = Math.max(
          0.6,
          Math.min(100 - leftPct, ((span.endTime - span.startTime) / totalDuration) * 100)
        );
        trackCanvas.appendChild(
          h('div', {
            className: `scroll-span-box${isRemoved ? ' is-outline' : ''}`,
            'data-testid': 'scroll-span-box',
            style: {
              left: `${leftPct}%`,
              width: `${widthPct}%`,
            },
          })
        );
      }
    }

    // 2. Scroll position curve over time
    if (Array.isArray(scrollSamples) && scrollSamples.length >= 2) {
      let maxVal = 1;
      for (const s of scrollSamples) {
        maxVal = Math.max(maxVal, s.scrollTop || 0, s.scrollLeft || 0, s.maxScrollTop || 0);
      }

      const pts = scrollSamples.map((s) => {
        const x = Math.max(0, Math.min(100, (s.t / totalDuration) * 100));
        const primaryOffset = Math.max(s.scrollTop || 0, s.scrollLeft || 0);
        const norm = Math.max(0, Math.min(1, primaryOffset / maxVal));
        const y = 38 - norm * 30;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });

      trackCanvas.appendChild(
        svg(
          'svg',
          {
            class: 'scroll-curve-svg',
            viewBox: '0 0 100 44',
            preserveAspectRatio: 'none',
          },
          svg('polyline', {
            points: pts.join(' '),
            fill: 'none',
            stroke: '#2dd4bf',
            'stroke-width': '1.5',
            'stroke-dasharray': isRemoved ? '3,2' : 'none',
          })
        )
      );
    }
  }

  _createEventMarker(evt, totalDuration, isRemoved) {
    const leftPct = Math.max(0, Math.min(99.7, (evt.timestamp / totalDuration) * 100));
    const classes = [
      'event-marker',
      `type-${evt.type}`,
    ];
    if (isRemoved) {
      classes.push('is-outline');
    }

    let badgeText = null;
    if (evt.type === 'keydown' && evt.key) {
      badgeText = `⌨ ${evt.key}`;
    } else if (evt.type === 'click') {
      badgeText = '🖱 click';
    } else if (evt.type === 'removed') {
      badgeText = '⚠️ removed';
    }

    return h(
      'div',
      {
        className: classes.join(' '),
        'data-testid': 'event-marker',
        'data-event-type': evt.type,
        'data-outline': isRemoved ? 'true' : 'false',
        style: { left: `${leftPct}%` },
        title: `${evt.detail || evt.type} @ ${Math.round(evt.timestamp)}ms`,
      },
      h('span', { className: 'event-marker-dot' }),
      badgeText ? h('span', { className: 'event-marker-label', textContent: badgeText }) : null
    );
  }

  _highlightPageElement(element, label) {
    if (!element || !element.isConnected) {
      this._hideHighlightOverlay();
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this._hideHighlightOverlay();
      return;
    }

    this._highlightOverlay.hidden = false;
    this._highlightOverlay.style.top = `${Math.round(rect.top)}px`;
    this._highlightOverlay.style.left = `${Math.round(rect.left)}px`;
    this._highlightOverlay.style.width = `${Math.round(rect.width)}px`;
    this._highlightOverlay.style.height = `${Math.round(rect.height)}px`;
    this._highlightBadge.textContent = `${label} (${Math.round(rect.width)}×${Math.round(rect.height)})`;
  }

  _hideHighlightOverlay() {
    if (this._highlightOverlay) {
      this._highlightOverlay.hidden = true;
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('interactions-timeline')) {
  customElements.define('interactions-timeline', InteractionsTimeline);
}

/**
 * Ensures an `<interactions-timeline>` instance is mounted in the document.
 *
 * @returns {InteractionsTimeline|null}
 */
export function ensureInteractionsTimelineMounted() {
  if (typeof document === 'undefined') return null;
  if (window.__INTERACTIONS_TIMELINE_NO_AUTO_INJECT__) return null;

  let existing = document.querySelector('interactions-timeline');
  if (!existing && document.body) {
    existing = document.createElement('interactions-timeline');
    document.body.appendChild(existing);
  }
  return existing;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ensureInteractionsTimelineMounted(), { once: true });
  } else {
    ensureInteractionsTimelineMounted();
  }
}

export default InteractionsTimeline;

