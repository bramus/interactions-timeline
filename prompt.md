In this project, create a timeline-recorder and visualizer of a page.

The recorder injects a button to start and stop the recording, positioned in the top right. When a recording is done, a timeline with all the recorded data gets visualized in a collapsible/resizable bottom sheet that overlays the page’s content.

Encapsulate the recorder and visualizer UI (e.g. in a Web Component with Shadow DOM) and explicitly ignore the recorder's own DOM subtree so its own clicks, scrolls, and UI transitions/animations are neither recorded nor paused.

Things to record are:

- Animation events (`animationstart`, `animationiteration`, `animationend`, `animationcancel`)
- CSS transition events (`transitionrun`, `transitionstart`, `transitioncancel`, `transitionend`)
- Active and JS-driven animations via `document.getAnimations()` (to also capture animations already running when recording starts, infinite animations, Web Animations API `element.animate()` calls, and Scroll-Driven Animations)
- User interactions (clicks, scrolls, keyboard events)
- Timestamps (relative to the recording start)
- Scroll positions (`scrollTop`, `scrollLeft`) of scrollers (both `window`/root and scrollable elements)
- Elements involved (keeping a reference as well as a readable label like `tag#id.class`, and tracking if/when an element is disconnected from the DOM)

When the data has been recorded and the timeline needs to be shown:

- Create a pinned row for global `window`/`document` events (root scroll, global keyboard events) and rows for each tracked element (labeled with its selector; hovering a row highlights the element on the page if it is still in the DOM).
- Inside each row, draw boxes for recorded durations (animations and transitions) and vertical lines/markers to indicate when discrete events happened (e.g. `animationiteration`, clicks, key presses).
- On the boxes for animations and transitions, add color-coded lines to indicate run/start/iteration/end/cancel (including delays between `transitionrun` and `transitionstart`), and make the length of the box equal to the duration on the timeline.
- Add an indicator showing whether an animation was scroll-driven (`ScrollTimeline` / `ViewTimeline`) or time-driven, and visualize its progress/activity over the recorded time axis.
- **Removed elements:** If a tracked element was removed from the DOM (`!element.isConnected`), grey out that element’s row, display a warning indicator that the element was removed, and render the recorded boxes/events in that row as outlines.

Now comes the main thing: when the visualization gets presented, pause all animations and transitions on the page (ideally the page’s `DocumentTimeline` would be frozen, but since that is not directly possible, manage the animations individually).
- Because browsers remove finished CSS transitions and one-shot animations from `document.getAnimations()`, the recorder must capture `Animation` references—or snapshot their keyframes (`effect.getKeyframes()`) and timing (`effect.getComputedTiming()`)—during recording so completed animations and transitions can be re-created or seeked when scrubbing backward.
- Scrubbing the timeline playhead takes over control by adjusting both the scroll positions of scrollers and the current animation/transition frame (`currentTime`, or percentage progress for scroll-driven animations) based on the recorded data, without triggering new recording events. This gives you the ability to "scrub" through the page's history.
- Closing or resetting the visualizer restores and unpauses the page back to its normal interactive state.

The project must include a page that acts as its own demo: it has elements with CSS animations (delays, iterations, infinite), CSS transitions, WAAPI animations, scroll-driven animations, scrollable containers, and elements that animate and get removed from the DOM, and also includes the recorder. The project is also tested.

Base yourself on projects like `/Users/bramus/repos/projects/rich-input` and `/Users/bramus/repos/projects/calc-input` for the folder structure and stuff. Part of structure is also detailed in https://www.bram.us/2026/09/20/npm-publish-subfolder/