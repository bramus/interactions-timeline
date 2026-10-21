# `<timeline-visualizer>`

A zero-dependency Web Component (`<timeline-visualizer>`) with Shadow DOM encapsulation that records and visualizes a page's timeline:

- **CSS Animations** (`animationstart`, `animationiteration`, `animationend`, `animationcancel`, including delays, iterations, and `infinite` animations)
- **CSS Transitions** (`transitionrun`, `transitionstart`, `transitioncancel`, `transitionend`, including delays between `transitionrun` and `transitionstart`)
- **Web Animations API (`element.animate()`) & Active Animations** via `document.getAnimations()`
- **Scroll-Driven Animations** (`ScrollTimeline` and `ViewTimeline`) with progress visualization over the recorded time axis
- **User Interactions & Scroller Positions** (`click`, `scroll`, `keydown`, `keyup`, and `scrollTop`/`scrollLeft` on both `window`/root and scrollable elements)
- **Disconnected DOM Elements** (`!element.isConnected`), rendered as greyed-out rows with a warning badge and outline duration boxes/markers
- **Full Time-Scrubbing**: Pauses all page animations and transitions when the bottom-sheet visualizer opens, and lets you scrub the playhead backward and forward through the page's visual history (re-creating completed CSS transitions and one-shot animations from snapshotted keyframes and timing). Closing or resetting the visualizer restores and unpauses the page back to its normal interactive state.

👉 **Live Demo & Documentation:** [https://timeline-visualizer.netlify.app](https://timeline-visualizer.netlify.app)

---

## Features

- **Shadow DOM Encapsulation & Subtree Exclusion**: The top-right recorder button and collapsible/resizable bottom sheet live inside `<timeline-visualizer>`'s Shadow DOM. All clicks, scrolls, and UI animations inside the recorder itself are explicitly ignored during recording and pausing.
- **Pinned Global Row & Element Rows**: Features a pinned `window / document` row for root scroll and global keyboard events alongside rows for each tracked element (`tag#id.class`). Hovering an element row highlights the element on the page if still connected.
- **Color-Coded Lifecycle Markers**: Duration boxes match the recorded duration on the timeline and display color-coded lines for `run` (cyan), `start` (green), `iteration` (amber), `end` (blue), and `cancel` (red), plus an inline SVG progress sparkline and a `Time` / `ScrollTimeline` / `ViewTimeline` badge.
- **Removed Element Detection**: Uses a `MutationObserver` to track if/when a recorded element is removed from the DOM (`!element.isConnected`), greying out its row, displaying a `⚠️ Removed` warning indicator, and rendering its recorded boxes and events as outlines.
- **Interactive Playhead Scrubber**: Drag the playhead or slider to seek both scroller offsets (`scrollTop`, `scrollLeft`) and animation/transition frames (`currentTime` or percentage progress for scroll-driven animations) without triggering new recording events.

---

## Quick Start

### 1. Installation

```bash
npm install timeline-visualizer
```

### 2. Usage

```html
<script type="module" src="timeline-visualizer"></script>

<!-- Optional: explicitly place in DOM (auto-mounted if omitted) -->
<timeline-visualizer></timeline-visualizer>
```

---

## JavaScript API

| Method / Property | Description |
|---|---|
| `startRecording()` | Starts recording page animations, transitions, scrolls, interactions, and DOM removals. |
| `stopRecording()` | Stops recording, pauses all page animations/transitions, and opens the bottom-sheet timeline visualizer. Returns the `TimelineStore`. |
| `scrubToTime(ms)` | Seeks all recorded scrollers and animations/transitions (including re-created completed transitions/animations) to `ms` relative to recording start. |
| `toggleCollapse()` | Collapses or expands the bottom-sheet visualizer. |
| `setSheetHeight(px)` | Resizes the bottom-sheet height in pixels. |
| `closeVisualizer()` | Closes the bottom sheet and restores/unpauses all page animations back to normal. |
| `reset()` | Clears recorded data, closes the bottom sheet, and restores the page to its normal interactive state. |

---

## Development & Testing

```bash
# Start local demo server
npm start

# Run unit and end-to-end Puppeteer tests
npm test

# Build ./dist for publishing
npm run build
```

---

## License

MIT © [Bramus Van Damme](https://www.bram.us/)
