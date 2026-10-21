import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../../src');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://127.0.0.1');
        let pathname = decodeURIComponent(reqUrl.pathname);
        if (pathname === '/') pathname = '/index.html';

        const resolvedRoot = path.resolve(rootDir);
        const filePath = path.resolve(resolvedRoot, '.' + pathname);
        // Prevent directory traversal outside rootDir
        if (!filePath.startsWith(resolvedRoot + path.sep) && filePath !== resolvedRoot) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('<timeline-visualizer> End-to-End Browser Tests (Puppeteer + WebDriver BiDi)', () => {
  let serverInfo;
  let browser;
  let page;

  before(async () => {
    serverInfo = await startStaticServer(SRC_DIR);
    browser = await puppeteer.launch({
      protocol: 'webDriverBiDi',
      headless: true,
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(serverInfo.url, { waitUntil: 'networkidle0' });
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
    if (serverInfo?.server) {
      await new Promise((resolve) => serverInfo.server.close(resolve));
    }
  });

  it('mounts <timeline-visualizer> with Shadow DOM and positions the record button in the top right', async () => {
    const info = await page.evaluate(() => {
      const el = document.querySelector('timeline-visualizer');
      if (!el || !el.shadowRoot) return null;

      const floatingBar = el.shadowRoot.querySelector('.recorder-floating-bar');
      const recBtn = el.shadowRoot.querySelector('[data-testid="record-btn"]');
      const sheet = el.shadowRoot.querySelector('[data-testid="bottom-sheet"]');
      const barRect = floatingBar.getBoundingClientRect();
      const barStyle = window.getComputedStyle(floatingBar);
      const recBtnStyle = window.getComputedStyle(recBtn);

      return {
        hasShadowRoot: Boolean(el.shadowRoot),
        hasRecBtn: Boolean(recBtn),
        recBtnText: recBtn.textContent.trim(),
        recBtnFontFamily: recBtnStyle.fontFamily,
        position: barStyle.position,
        top: barRect.top,
        rightDistance: window.innerWidth - barRect.right,
        sheetHiddenInitially: sheet.hidden,
      };
    });

    assert.ok(info, '<timeline-visualizer> should exist with an open shadowRoot');
    assert.equal(info.hasShadowRoot, true);
    assert.equal(info.hasRecBtn, true);
    assert.equal(info.recBtnText, 'Start Recording');
    assert.ok(
      info.recBtnFontFamily.includes('system-ui') && !info.recBtnFontFamily.toLowerCase().includes('times'),
      `Expected system-ui sans-serif font on record button, got: ${info.recBtnFontFamily}`
    );
    assert.equal(info.position, 'fixed');
    assert.ok(info.top <= 30, `Expected top-right button near top, got top=${info.top}`);
    assert.ok(info.rightDistance <= 30, `Expected top-right button near right, got rightDistance=${info.rightDistance}`);
    assert.equal(info.sheetHiddenInitially, true);
  });

  it('records animations, transitions (with delay), WAAPI, scroll-driven animations, scrolls, interactions, and removed DOM elements while ignoring its own subtree', async () => {
    const recordingSummary = await page.evaluate(async () => {
      const visualizer = document.querySelector('timeline-visualizer');
      const recBtn = visualizer.shadowRoot.querySelector('[data-testid="record-btn"]');

      // Reset scroll and transition state before test
      const scrollStage = document.getElementById('scroll-stage');
      scrollStage.scrollTop = 0;
      window.scrollTo(0, 0);
      const transCard = document.getElementById('transition-card');
      transCard.classList.remove('is-moved');

      // Click top-right Record button to start recording
      recBtn.click();

      // Dispatch a synthetic click inside the recorder's own Shadow DOM to verify it is ignored
      const floatingBar = visualizer.shadowRoot.querySelector('.recorder-floating-bar');
      floatingBar.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

      await new Promise((r) => setTimeout(r, 40));

      // 1. Trigger delayed multi-iteration CSS animation
      document.getElementById('trigger-css-anim-btn').click();

      // 2. Trigger CSS transition (120ms delay + 360ms duration)
      document.getElementById('trigger-transition-btn').click();

      // 3. Trigger WAAPI element.animate()
      document.getElementById('trigger-waapi-btn').click();

      // 4. Trigger user interaction click & keyboard event
      document.getElementById('interaction-btn').click();
      const kbInput = document.getElementById('keyboard-target');
      kbInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', bubbles: true }));

      // 5. Trigger ephemeral element animation + DOM removal (!element.isConnected)
      document.getElementById('trigger-remove-btn').click();

      // 6. Scroll both the scrollable container (#scroll-stage) and root window
      await new Promise((r) => setTimeout(r, 80));
      scrollStage.scrollTop = 120;
      scrollStage.dispatchEvent(new Event('scroll'));
      window.scrollTo(0, 90);
      window.dispatchEvent(new Event('scroll'));

      await new Promise((r) => setTimeout(r, 120));
      scrollStage.scrollTop = 260;
      scrollStage.dispatchEvent(new Event('scroll'));

      // Wait for transition (120ms delay + 360ms = 480ms), CSS animation iterations, and DOM removal (240ms) to finish
      await new Promise((r) => setTimeout(r, 700));

      // Click top-right Record button to stop recording
      recBtn.click();

      const sheet = visualizer.shadowRoot.querySelector('[data-testid="bottom-sheet"]');
      const pinnedRow = visualizer.shadowRoot.querySelector('[data-testid="pinned-global-row"]');
      const elementRows = Array.from(
        visualizer.shadowRoot.querySelectorAll('[data-testid="element-row"]')
      );
      const rowSelectors = elementRows.map((r) => r.getAttribute('data-selector'));

      // Verify no element inside <timeline-visualizer> was recorded
      const hasOwnSubtreeRow = rowSelectors.some((s) => s.includes('timeline-visualizer') || s.includes('rec-btn'));

      // Check boxes and lifecycle lines
      const boxes = Array.from(
        visualizer.shadowRoot.querySelectorAll('[data-testid="timeline-box"]')
      );
      const drivers = boxes.map((b) => b.getAttribute('data-driver'));
      const categories = boxes.map((b) => b.getAttribute('data-category'));
      const delaySegments = visualizer.shadowRoot.querySelectorAll('[data-testid="box-delay-segment"]').length;
      const runLines = visualizer.shadowRoot.querySelectorAll('[data-line-type="run"]').length;
      const startLines = visualizer.shadowRoot.querySelectorAll('[data-line-type="start"]').length;
      const iterLines = visualizer.shadowRoot.querySelectorAll('[data-line-type="iteration"]').length;
      const endLines = visualizer.shadowRoot.querySelectorAll('[data-line-type="end"]').length;

      // Check removed element row
      const removedRow = visualizer.shadowRoot.querySelector('[data-testid="element-row"][data-removed="true"]');
      const removedWarning = removedRow?.querySelector('[data-testid="removed-warning"]');
      const removedOutlineBox = removedRow?.querySelector('[data-testid="timeline-box"][data-outline="true"]');

      return {
        sheetVisible: !sheet.hidden,
        hasPinnedGlobalRow: Boolean(pinnedRow),
        globalEventsCount: visualizer.store.globalRow.events.length,
        globalScrollSamplesCount: visualizer.store.globalRow.scrollSamples.length,
        rowSelectors,
        hasOwnSubtreeRow,
        categories,
        drivers,
        delaySegments,
        runLines,
        startLines,
        iterLines,
        endLines,
        hasRemovedRow: Boolean(removedRow),
        removedWarningText: removedWarning?.textContent.trim() || '',
        hasRemovedOutlineBox: Boolean(removedOutlineBox),
      };
    });

    assert.equal(recordingSummary.sheetVisible, true, 'Bottom sheet should open after recording stops');
    assert.equal(recordingSummary.hasPinnedGlobalRow, true, 'Pinned global window/document row should exist');
    assert.ok(recordingSummary.globalEventsCount >= 2, 'Global row should record keyboard and root scroll events');
    assert.ok(recordingSummary.globalScrollSamplesCount >= 2, 'Global row should record root scroll samples');
    assert.equal(recordingSummary.hasOwnSubtreeRow, false, 'Recorder own DOM subtree must be ignored');

    // Verify all categories and timeline drivers were captured
    assert.ok(recordingSummary.categories.includes('css-animation'), 'Should record CSS animations');
    assert.ok(recordingSummary.categories.includes('transition'), 'Should record CSS transitions');
    assert.ok(recordingSummary.categories.includes('waapi'), 'Should record WAAPI element.animate()');
    assert.ok(recordingSummary.drivers.includes('time'), 'Should detect time-driven animations');
    assert.ok(
      recordingSummary.drivers.includes('scroll') || recordingSummary.drivers.includes('view'),
      'Should detect ScrollTimeline / ViewTimeline scroll-driven animations'
    );

    // Verify color-coded lines & delay segments on boxes
    assert.ok(recordingSummary.delaySegments >= 1, 'Should render delay segment between run and start');
    assert.ok(recordingSummary.runLines >= 1, 'Should render run lines on boxes');
    assert.ok(recordingSummary.startLines >= 1, 'Should render start lines on boxes');
    assert.ok(recordingSummary.iterLines >= 1, 'Should render iteration lines on multi-iteration animations');
    assert.ok(recordingSummary.endLines >= 1, 'Should render end lines on completed animations/transitions');

    // Verify removed element row styling, warning badge, and outline boxes
    assert.equal(recordingSummary.hasRemovedRow, true, 'Disconnected DOM element should have a greyed-out removed row');
    assert.ok(
      recordingSummary.removedWarningText.includes('Removed'),
      `Expected warning indicator on removed row, got: ${recordingSummary.removedWarningText}`
    );
    assert.equal(
      recordingSummary.hasRemovedOutlineBox,
      true,
      'Boxes inside a removed element row should be rendered as outlines'
    );
  });

  it('highlights the corresponding page element when hovering a connected element row', async () => {
    const hoverResult = await page.evaluate(() => {
      const visualizer = document.querySelector('timeline-visualizer');
      const connectedRow = visualizer.shadowRoot.querySelector(
        '[data-testid="element-row"][data-removed="false"]'
      );
      const overlay = visualizer.shadowRoot.querySelector('[data-testid="element-highlight-overlay"]');

      connectedRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const visibleOnHover = !overlay.hidden;
      const badgeText = overlay.textContent;

      connectedRow.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      const hiddenOnLeave = overlay.hidden;

      return { visibleOnHover, badgeText, hiddenOnLeave };
    });

    assert.equal(hoverResult.visibleOnHover, true, 'Hovering a connected element row should show highlight overlay');
    assert.ok(hoverResult.badgeText.length > 0, 'Highlight overlay should display element selector and dimensions');
    assert.equal(hoverResult.hiddenOnLeave, true, 'Leaving the row should hide highlight overlay');
  });

  it('supports collapsing, expanding, and resizing the bottom sheet', async () => {
    const sheetState = await page.evaluate(() => {
      const visualizer = document.querySelector('timeline-visualizer');
      const sheet = visualizer.shadowRoot.querySelector('[data-testid="bottom-sheet"]');
      const collapseBtn = visualizer.shadowRoot.querySelector('[data-testid="collapse-btn"]');

      visualizer.setSheetHeight(320);
      const resizedHeight = sheet.getBoundingClientRect().height;

      collapseBtn.click();
      const collapsedClass = sheet.classList.contains('is-collapsed');
      const collapsedHeight = sheet.getBoundingClientRect().height;

      collapseBtn.click();
      const expandedAgain = !sheet.classList.contains('is-collapsed');

      return { resizedHeight, collapsedClass, collapsedHeight, expandedAgain };
    });

    assert.equal(Math.round(sheetState.resizedHeight), 320);
    assert.equal(sheetState.collapsedClass, true);
    assert.ok(sheetState.collapsedHeight <= 50);
    assert.equal(sheetState.expandedAgain, true);
  });

  it('pauses page animations when presented and scrubs both scroll positions and completed/active animations across history', async () => {
    const scrubResult = await page.evaluate(() => {
      const visualizer = document.querySelector('timeline-visualizer');
      const infiniteSpinner = document.getElementById('infinite-spinner');
      const transitionCard = document.getElementById('transition-card');
      const scrollStage = document.getElementById('scroll-stage');

      // 1. Check that infinite spinner animation is paused while visualizer is open
      const spinnerAnims = infiniteSpinner.getAnimations();
      const spinnerPaused = spinnerAnims.every((a) => a.playState === 'paused');

      // Find the recorded transform transition on #transition-card
      const transTrack = visualizer.store.getOrCreateElementTrack(transitionCard);
      const transformRecord = transTrack.animations.find(
        (a) => a.category === 'transition' && a.name.includes('transform')
      );

      // 2. Scrub to t = 0 (start of recording, before transition & before scroll)
      visualizer.scrubToTime(0);
      const scrollAtZero = scrollStage.scrollTop;
      const winScrollAtZero = window.scrollY;
      const transformAtZero = window.getComputedStyle(transitionCard).transform;

      // 3. Scrub to midpoint of the active transition
      const midTransTime = (transformRecord.startTime + transformRecord.endTime) / 2;
      visualizer.scrubToTime(midTransTime);
      const transformAtMid = window.getComputedStyle(transitionCard).transform;

      // 4. Scrub to end of recording (t = duration, after transition and after scroll)
      visualizer.scrubToTime(visualizer.store.duration);
      const scrollAtEnd = scrollStage.scrollTop;
      const winScrollAtEnd = window.scrollY;
      const transformAtEnd = window.getComputedStyle(transitionCard).transform;

      return {
        spinnerPaused,
        scrollAtZero,
        winScrollAtZero,
        scrollAtEnd,
        winScrollAtEnd,
        transformAtZero,
        transformAtMid,
        transformAtEnd,
        isRecordingDuringScrub: visualizer.isRecording,
      };
    });

    assert.equal(scrubResult.spinnerPaused, true, 'Active page animations must be paused when visualizer is open');
    assert.equal(scrubResult.isRecordingDuringScrub, false, 'Scrubbing must not trigger recording');

    // Verify scroll positions scrub between 0 and recorded end offsets
    assert.equal(Math.round(scrubResult.scrollAtZero), 0, 'Container scrollTop at t=0 should be 0');
    assert.ok(scrubResult.scrollAtEnd >= 200, `Container scrollTop at end should be restored (>=200), got ${scrubResult.scrollAtEnd}`);
    assert.equal(Math.round(scrubResult.winScrollAtZero), 0, 'Window scrollY at t=0 should be 0');
    assert.ok(scrubResult.winScrollAtEnd >= 50, `Window scrollY at end should be restored (>=50), got ${scrubResult.winScrollAtEnd}`);

    // Verify completed CSS transition is re-created and seeked across start, midpoint, and end!
    assert.notEqual(
      scrubResult.transformAtZero,
      scrubResult.transformAtMid,
      `Transform at t=0 (${scrubResult.transformAtZero}) should differ from mid-transition (${scrubResult.transformAtMid})`
    );
    assert.notEqual(
      scrubResult.transformAtMid,
      scrubResult.transformAtEnd,
      `Transform at mid-transition (${scrubResult.transformAtMid}) should differ from post-transition (${scrubResult.transformAtEnd})`
    );
  });

  it('restores and unpauses the page back to its normal interactive state when closed or reset', async () => {
    const restoreResult = await page.evaluate(() => {
      const visualizer = document.querySelector('timeline-visualizer');
      const infiniteSpinner = document.getElementById('infinite-spinner');
      const closeBtn = visualizer.shadowRoot.querySelector('[data-testid="close-btn"]');

      closeBtn.click();

      const sheetHidden = visualizer.shadowRoot.querySelector('[data-testid="bottom-sheet"]').hidden;
      const spinnerAnims = infiniteSpinner.getAnimations();
      const spinnerRunningAgain = spinnerAnims.some((a) => a.playState === 'running');
      const scrubAnimsRemaining = visualizer._scrubAnimationSet.size;

      // Also test reset()
      visualizer.reset();
      const tracksAfterReset = visualizer.store.getTracks().length;

      return {
        sheetHidden,
        spinnerRunningAgain,
        scrubAnimsRemaining,
        tracksAfterReset,
      };
    });

    assert.equal(restoreResult.sheetHidden, true, 'Closing visualizer should hide bottom sheet');
    assert.equal(restoreResult.spinnerRunningAgain, true, 'Closing visualizer should unpause infinite page animations');
    assert.equal(restoreResult.scrubAnimsRemaining, 0, 'Synthetic scrub animations should be cleaned up on close');
    assert.equal(restoreResult.tracksAfterReset, 0, 'reset() should clear recorded tracks');
  });

  it('invokes scrollIntoView and scrollTo during the auto-record showcase so root page scroll is recorded', async () => {
    const autoDemoResult = await page.evaluate(async () => {
      await window.demoApp.runAutoShowcase();
      const visualizer = document.querySelector('timeline-visualizer');
      const globalScrollSamples = visualizer.store.globalRow.scrollSamples;
      const globalScrollSpans = visualizer.store.globalRow.scrollSpans;
      const maxScrollRecorded = Math.max(...globalScrollSamples.map((s) => s.scrollTop));

      return {
        isVisualizing: visualizer.isVisualizing,
        sampleCount: globalScrollSamples.length,
        spanCount: globalScrollSpans.length,
        maxScrollRecorded,
      };
    });

    assert.equal(autoDemoResult.isVisualizing, true);
    assert.ok(autoDemoResult.sampleCount >= 2, 'Should record multiple root scroll samples during auto-showcase');
    assert.ok(autoDemoResult.spanCount >= 1, 'Should record root scroll spans during auto-showcase');
    assert.ok(autoDemoResult.maxScrollRecorded > 0, `Expected root scrollTop > 0 from scrollIntoView/scrollTo, got ${autoDemoResult.maxScrollRecorded}`);
  });

  it('injects a checkbox in row entries that are a scroller (checked by default) to toggle scrolling on/off per scroller', async () => {
    const checkboxResult = await page.evaluate(() => {
      const visualizer = document.querySelector('timeline-visualizer');
      const scrollStage = document.getElementById('scroll-stage');

      const pinnedRow = visualizer.shadowRoot.querySelector('[data-testid="pinned-global-row"]');
      const rootCheckbox = pinnedRow?.querySelector('[data-testid="scroller-checkbox"]');

      const stageRow = visualizer.shadowRoot.querySelector(
        '[data-testid="element-row"][data-selector*="scroll-stage"]'
      );
      const stageCheckbox = stageRow?.querySelector('[data-testid="scroller-checkbox"]');

      const nonScrollerRow = visualizer.shadowRoot.querySelector(
        '[data-testid="element-row"][data-selector*="transition-card"]'
      );
      const nonScrollerCheckbox = nonScrollerRow?.querySelector('[data-testid="scroller-checkbox"]');

      const rootCheckedByDefault = Boolean(rootCheckbox && rootCheckbox.checked);
      const stageCheckedByDefault = Boolean(stageCheckbox && stageCheckbox.checked);
      const hasCheckboxOnNonScroller = Boolean(nonScrollerCheckbox);

      // Find peak scroll sample for root scroller
      const rootSamples = visualizer.store.globalRow.scrollSamples;
      let peakRootSample = rootSamples[0];
      for (const s of rootSamples) {
        if (s.scrollTop > peakRootSample.scrollTop) {
          peakRootSample = s;
        }
      }

      // Find peak scroll sample for #scroll-stage
      const stageTrack = visualizer.store.getOrCreateElementTrack(scrollStage);
      let peakStageSample = stageTrack.scrollSamples[0] || { t: 0, scrollTop: 0 };
      for (const s of stageTrack.scrollSamples) {
        if (s.scrollTop > peakStageSample.scrollTop) {
          peakStageSample = s;
        }
      }

      // 1. Scrub to t=0 with both checkboxes checked -> both scrollers at 0
      visualizer.scrubToTime(0);
      const rootAtZero = window.scrollY;
      const stageAtZero = scrollStage.scrollTop;

      // 2. Uncheck root scroller checkbox only, keep #scroll-stage checked
      rootCheckbox.checked = false;
      rootCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

      visualizer.scrubToTime(peakRootSample.t);
      const rootWhenRootUnchecked = window.scrollY;
      visualizer.scrubToTime(peakStageSample.t);
      const stageWhenRootUnchecked = scrollStage.scrollTop;

      // 3. Reset #scroll-stage to t=0, then uncheck #scroll-stage checkbox and re-check root scroller
      visualizer.scrubToTime(0);
      stageCheckbox.checked = false;
      stageCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      rootCheckbox.checked = true;
      rootCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

      visualizer.scrubToTime(peakStageSample.t);
      const stageWhenStageUnchecked = scrollStage.scrollTop;
      visualizer.scrubToTime(peakRootSample.t);
      const rootWhenRootCheckedAgain = window.scrollY;

      // 4. Re-check #scroll-stage checkbox -> should immediately sync #scroll-stage at peakStageSample.t
      visualizer.scrubToTime(peakStageSample.t);
      stageCheckbox.checked = true;
      stageCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      const stageWhenStageCheckedAgain = scrollStage.scrollTop;

      return {
        rootCheckedByDefault,
        stageCheckedByDefault,
        hasCheckboxOnNonScroller,
        rootAtZero,
        stageAtZero,
        rootWhenRootUnchecked,
        stageWhenRootUnchecked,
        stageWhenStageUnchecked,
        rootWhenRootCheckedAgain,
        stageWhenStageCheckedAgain,
      };
    });

    assert.equal(checkboxResult.rootCheckedByDefault, true, 'Root scroller row checkbox should be checked by default');
    assert.equal(checkboxResult.stageCheckedByDefault, true, 'Element scroller row checkbox should be checked by default');
    assert.equal(checkboxResult.hasCheckboxOnNonScroller, false, 'Non-scroller element rows should not have a scroller checkbox');

    assert.equal(Math.round(checkboxResult.rootAtZero), 0);
    assert.equal(Math.round(checkboxResult.stageAtZero), 0);

    assert.equal(
      Math.round(checkboxResult.rootWhenRootUnchecked),
      0,
      'Unchecking root scroller row checkbox should prevent root scroller from scrolling during scrub'
    );
    assert.ok(
      checkboxResult.stageWhenRootUnchecked > 0,
      'Element scroller (#scroll-stage) should still scroll when only root scroller is unchecked'
    );

    assert.equal(
      Math.round(checkboxResult.stageWhenStageUnchecked),
      0,
      'Unchecking #scroll-stage row checkbox should prevent #scroll-stage from scrolling during scrub'
    );
    assert.ok(
      checkboxResult.rootWhenRootCheckedAgain > 0,
      'Re-checking root scroller row checkbox should allow root scroller to scroll again'
    );
    assert.ok(
      checkboxResult.stageWhenStageCheckedAgain > 0,
      'Re-checking #scroll-stage row checkbox should sync and scroll #scroll-stage again'
    );
  });

  it('supports switching docking position via the icon-only chooser: left, bottom, right, and popout', async () => {
    const dockResult = await page.evaluate(() => {
      const visualizer = document.querySelector('timeline-visualizer');
      const sheet = visualizer._bottomSheet;
      const btnLeft = visualizer._dockBtnLeft;
      const btnBottom = visualizer._dockBtnBottom;
      const btnRight = visualizer._dockBtnRight;
      const btnPopout = visualizer._dockBtnPopout;
      const allBtns = [btnLeft, btnBottom, btnRight, btnPopout];

      const buttonsAreIconOnlyWithTooltips = allBtns.every(
        (btn) =>
          Boolean(btn) &&
          btn.textContent.trim() === '' &&
          Boolean(btn.querySelector('svg')) &&
          Boolean(btn.getAttribute('data-tooltip')) &&
          Boolean(btn.getAttribute('title'))
      );

      const defaultDock = visualizer.dockPosition;
      const defaultHasBottomClass = sheet.classList.contains('dock-bottom');
      const collapseVisibleInBottom = !visualizer._collapseBtn.hidden;

      // Collapse while docked to bottom, then switch to 'left' -> should auto-expand and hide collapse button
      visualizer.toggleCollapse(true);
      const collapsedInBottom = visualizer.isCollapsed;

      // 1. Switch to 'left' dock
      btnLeft.click();
      visualizer.setSheetWidth(500);
      const leftDock = visualizer.dockPosition;
      const leftRect = sheet.getBoundingClientRect();
      const leftHasClass = sheet.classList.contains('dock-left');
      const collapseHiddenInLeft = visualizer._collapseBtn.hidden;
      const uncollapsedOnSwitchToLeft = !visualizer.isCollapsed;
      visualizer.toggleCollapse(true);
      const collapseBlockedInLeft = !visualizer.isCollapsed;

      // 2. Switch to 'right' dock
      btnRight.click();
      visualizer.setSheetWidth(540);
      const rightDock = visualizer.dockPosition;
      const rightRect = sheet.getBoundingClientRect();
      const rightHasClass = sheet.classList.contains('dock-right');
      const collapseHiddenInRight = visualizer._collapseBtn.hidden;
      visualizer.toggleCollapse(true);
      const collapseBlockedInRight = !visualizer.isCollapsed;

      // 3. Switch to 'popout' dock -> opens popup window and moves visualizer panel into popup document
      btnPopout.click();
      const popoutDock = visualizer.dockPosition;
      const popupWin = visualizer._popupWindow;
      const hasPopupWindow = Boolean(popupWin && !popupWin.closed && popupWin.document);
      const sheetInPopup = hasPopupWindow ? popupWin.document.body.contains(sheet) : false;
      const collapseHiddenInPopout = visualizer._collapseBtn.hidden;

      // Scrub using the slider inside the popup window to t = 0 and verify main page updates
      const popSlider = popupWin.document.querySelector('[data-testid="scrubber-slider"]');
      popSlider.value = '0';
      popSlider.dispatchEvent(new Event('input', { bubbles: true }));
      const mainWindowScrollAtZeroFromPopup = window.scrollY;

      // 4. Switch back to 'bottom' dock from inside the popup window
      btnBottom.click();
      const returnedDock = visualizer.dockPosition;
      const sheetBackInShadow = visualizer.shadowRoot.contains(sheet);
      const popupClosedAfterReturn = !visualizer._popupWindow || visualizer._popupWindow.closed;
      const collapseVisibleAgainInBottom = !visualizer._collapseBtn.hidden;

      return {
        buttonsAreIconOnlyWithTooltips,
        tooltips: allBtns.map((btn) => btn.getAttribute('data-tooltip')),
        defaultDock,
        defaultHasBottomClass,
        collapseVisibleInBottom,
        collapsedInBottom,
        leftDock,
        leftHasClass,
        leftX: Math.round(leftRect.left),
        leftWidth: Math.round(leftRect.width),
        leftHeight: Math.round(leftRect.height),
        collapseHiddenInLeft,
        uncollapsedOnSwitchToLeft,
        collapseBlockedInLeft,
        rightDock,
        rightHasClass,
        rightWidth: Math.round(rightRect.width),
        rightHeight: Math.round(rightRect.height),
        collapseHiddenInRight,
        collapseBlockedInRight,
        viewportHeight: window.innerHeight,
        popoutDock,
        hasPopupWindow,
        sheetInPopup,
        collapseHiddenInPopout,
        mainWindowScrollAtZeroFromPopup,
        returnedDock,
        sheetBackInShadow,
        popupClosedAfterReturn,
        collapseVisibleAgainInBottom,
      };
    });

    assert.equal(
      dockResult.buttonsAreIconOnlyWithTooltips,
      true,
      'All 4 docking buttons should be icon-only with SVG icons and hover tooltips'
    );
    assert.deepEqual(dockResult.tooltips, [
      'Dock to left',
      'Dock to bottom',
      'Dock to right',
      'Pop out into window',
    ]);

    assert.equal(dockResult.defaultDock, 'bottom');
    assert.equal(dockResult.defaultHasBottomClass, true);
    assert.equal(dockResult.collapseVisibleInBottom, true);
    assert.equal(dockResult.collapsedInBottom, true);

    assert.equal(dockResult.leftDock, 'left');
    assert.equal(dockResult.leftHasClass, true);
    assert.equal(dockResult.leftX, 0);
    assert.equal(dockResult.leftWidth, 500);
    assert.equal(dockResult.leftHeight, dockResult.viewportHeight);
    assert.equal(dockResult.collapseHiddenInLeft, true, 'Collapse button should be hidden when docked to left');
    assert.equal(dockResult.uncollapsedOnSwitchToLeft, true, 'Switching from bottom to left should uncollapse panel');
    assert.equal(dockResult.collapseBlockedInLeft, true, 'Collapsing should not be allowed when docked to left');

    assert.equal(dockResult.rightDock, 'right');
    assert.equal(dockResult.rightHasClass, true);
    assert.equal(dockResult.rightWidth, 540);
    assert.equal(dockResult.rightHeight, dockResult.viewportHeight);
    assert.equal(dockResult.collapseHiddenInRight, true, 'Collapse button should be hidden when docked to right');
    assert.equal(dockResult.collapseBlockedInRight, true, 'Collapsing should not be allowed when docked to right');

    assert.equal(dockResult.popoutDock, 'popout');
    assert.equal(dockResult.hasPopupWindow, true, 'Popout mode should create a popup window');
    assert.equal(dockResult.sheetInPopup, true, 'Visualizer panel should be mounted inside the popup document body');
    assert.equal(dockResult.collapseHiddenInPopout, true, 'Collapse button should be hidden in popout mode');
    assert.equal(
      Math.round(dockResult.mainWindowScrollAtZeroFromPopup),
      0,
      'Scrubbing inside the popout window should scrub the main page'
    );

    assert.equal(dockResult.returnedDock, 'bottom');
    assert.equal(dockResult.sheetBackInShadow, true, 'Docking back to bottom should return panel to main Shadow DOM');
    assert.equal(dockResult.popupClosedAfterReturn, true, 'Popup window should be closed after docking back');
    assert.equal(dockResult.collapseVisibleAgainInBottom, true, 'Collapse button should be visible again when docked back to bottom');
  });

  it('provides a playback speed multi-button chooser (25%, 50%, 100%, default 100%) in the left of the top toolbar', async () => {
    const speedResult = await page.evaluate(() => {
      const visualizer = document.querySelector('timeline-visualizer');
      const toolbarLeft = visualizer.shadowRoot.querySelector('.toolbar-left');
      const chooser = visualizer._speedChooser;
      const btn25 = visualizer._speedBtn25;
      const btn50 = visualizer._speedBtn50;
      const btn100 = visualizer._speedBtn100;

      const inToolbarLeft = Boolean(toolbarLeft && chooser && toolbarLeft.contains(chooser));
      const labels = [btn25?.textContent, btn50?.textContent, btn100?.textContent];
      const defaultRate = visualizer.playbackRate;
      const default100Active = Boolean(btn100?.classList.contains('is-active'));

      btn25.click();
      const rateAfter25 = visualizer.playbackRate;
      const activeAfter25 = [
        btn25.classList.contains('is-active'),
        btn50.classList.contains('is-active'),
        btn100.classList.contains('is-active'),
      ];

      btn50.click();
      const rateAfter50 = visualizer.playbackRate;
      const activeAfter50 = [
        btn25.classList.contains('is-active'),
        btn50.classList.contains('is-active'),
        btn100.classList.contains('is-active'),
      ];

      btn100.click();
      const rateAfter100 = visualizer.playbackRate;
      const activeAfter100 = [
        btn25.classList.contains('is-active'),
        btn50.classList.contains('is-active'),
        btn100.classList.contains('is-active'),
      ];

      return {
        inToolbarLeft,
        labels,
        defaultRate,
        default100Active,
        rateAfter25,
        activeAfter25,
        rateAfter50,
        activeAfter50,
        rateAfter100,
        activeAfter100,
      };
    });

    assert.equal(speedResult.inToolbarLeft, true, 'Speed chooser should be inside .toolbar-left');
    assert.deepEqual(speedResult.labels, ['25%', '50%', '100%']);
    assert.equal(speedResult.defaultRate, 1);
    assert.equal(speedResult.default100Active, true);

    assert.equal(speedResult.rateAfter25, 0.25);
    assert.deepEqual(speedResult.activeAfter25, [true, false, false]);

    assert.equal(speedResult.rateAfter50, 0.5);
    assert.deepEqual(speedResult.activeAfter50, [false, true, false]);

    assert.equal(speedResult.rateAfter100, 1);
    assert.deepEqual(speedResult.activeAfter100, [false, false, true]);
  });

  it('supports mouse zooming (CMD/CTRL + wheel on horizontal axis only) and panning (vertical wheel, horizontal wheel, SHIFT + vertical wheel)', async () => {
    const zoomPanResult = await page.evaluate(() => {
      const visualizer = document.querySelector('timeline-visualizer');
      const viewport = visualizer._timelineViewport;
      const rulerTrack = visualizer._rulerTrack;
      const firstRow = visualizer.shadowRoot.querySelector('.timeline-row');

      // Make sheet short enough that rows overflow vertically so vertical scroll can be tested
      visualizer.setSheetHeight(210);
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
      visualizer.setZoomLevel(1);

      const initialZoom = visualizer.zoomLevel;
      const initialTrackWidth = rulerTrack.getBoundingClientRect().width;
      const initialRowHeight = firstRow.getBoundingClientRect().height;

      // 1. Regular vertical scroll (Scroll up/down -> scrollTop changes, scrollLeft stays 0)
      viewport.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 60, deltaX: 0, bubbles: true, cancelable: true })
      );
      const scrollTopAfterVerticalWheel = viewport.scrollTop;
      const scrollLeftAfterVerticalWheel = viewport.scrollLeft;

      // 2. CMD / CTRL + Scroll up -> zoom in horizontally ONLY (row height and scrollTop stay unchanged)
      viewport.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -180,
          ctrlKey: true,
          clientX: 600,
          bubbles: true,
          cancelable: true,
        })
      );
      const zoomAfterCtrlWheelUp = visualizer.zoomLevel;
      const zoomedTrackWidth = rulerTrack.getBoundingClientRect().width;
      const rowHeightAfterZoom = firstRow.getBoundingClientRect().height;
      const scrollTopAfterZoom = viewport.scrollTop;

      // Also test metaKey (CMD on macOS) zooming in further
      viewport.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -120,
          metaKey: true,
          clientX: 600,
          bubbles: true,
          cancelable: true,
        })
      );
      const zoomAfterMetaWheelUp = visualizer.zoomLevel;

      // 3. SHIFT + Scroll up/down -> horizontal scroll (scrollLeft changes, scrollTop stays unchanged)
      viewport.scrollLeft = 10;
      const scrollLeftBeforeShift = viewport.scrollLeft;
      viewport.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 80,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
      const scrollLeftAfterShiftWheel = viewport.scrollLeft;
      const scrollTopAfterShiftWheel = viewport.scrollTop;

      // 4. Regular horizontal scroll (Scroll left/right -> scrollLeft changes)
      viewport.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: 50,
          deltaY: 0,
          bubbles: true,
          cancelable: true,
        })
      );
      const scrollLeftAfterHorizontalWheel = viewport.scrollLeft;

      // 5. CMD / CTRL + Scroll down -> zoom back out
      viewport.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 200,
          ctrlKey: true,
          clientX: 600,
          bubbles: true,
          cancelable: true,
        })
      );
      const zoomAfterCtrlWheelDown = visualizer.zoomLevel;

      // Reset back to default height and zoom
      visualizer.setZoomLevel(1);
      visualizer.setSheetHeight(400);

      return {
        initialZoom,
        initialTrackWidth: Math.round(initialTrackWidth),
        initialRowHeight: Math.round(initialRowHeight),
        scrollTopAfterVerticalWheel: Math.round(scrollTopAfterVerticalWheel),
        scrollLeftAfterVerticalWheel: Math.round(scrollLeftAfterVerticalWheel),
        zoomAfterCtrlWheelUp,
        zoomedTrackWidth: Math.round(zoomedTrackWidth),
        rowHeightAfterZoom: Math.round(rowHeightAfterZoom),
        scrollTopAfterZoom: Math.round(scrollTopAfterZoom),
        zoomAfterMetaWheelUp,
        scrollLeftBeforeShift: Math.round(scrollLeftBeforeShift),
        scrollLeftAfterShiftWheel: Math.round(scrollLeftAfterShiftWheel),
        scrollTopAfterShiftWheel: Math.round(scrollTopAfterShiftWheel),
        scrollLeftAfterHorizontalWheel: Math.round(scrollLeftAfterHorizontalWheel),
        zoomAfterCtrlWheelDown,
      };
    });

    assert.equal(zoomPanResult.initialZoom, 1);
    assert.ok(
      zoomPanResult.scrollTopAfterVerticalWheel > 0,
      'Vertical wheel should scroll timeline vertically (scrollTop > 0)'
    );
    assert.equal(
      zoomPanResult.scrollLeftAfterVerticalWheel,
      0,
      'Vertical wheel without modifiers should not scroll horizontally'
    );

    assert.ok(
      zoomPanResult.zoomAfterCtrlWheelUp > 1,
      'CTRL + wheel up should increase horizontal zoomLevel'
    );
    assert.ok(
      zoomPanResult.zoomedTrackWidth > zoomPanResult.initialTrackWidth,
      'Horizontal track width should increase when zoomed in'
    );
    assert.equal(
      zoomPanResult.rowHeightAfterZoom,
      zoomPanResult.initialRowHeight,
      'Vertical row height should NOT change when zooming horizontally'
    );
    assert.equal(
      zoomPanResult.scrollTopAfterZoom,
      zoomPanResult.scrollTopAfterVerticalWheel,
      'Vertical scrollTop should NOT change during horizontal zoom'
    );
    assert.ok(
      zoomPanResult.zoomAfterMetaWheelUp > zoomPanResult.zoomAfterCtrlWheelUp,
      'CMD (metaKey) + wheel up should also increase horizontal zoomLevel'
    );

    assert.ok(
      zoomPanResult.scrollLeftAfterShiftWheel > zoomPanResult.scrollLeftBeforeShift,
      'SHIFT + vertical wheel should scroll horizontally (increase scrollLeft)'
    );
    assert.equal(
      zoomPanResult.scrollTopAfterShiftWheel,
      zoomPanResult.scrollTopAfterZoom,
      'SHIFT + vertical wheel should not change vertical scrollTop'
    );

    assert.ok(
      zoomPanResult.scrollLeftAfterHorizontalWheel > zoomPanResult.scrollLeftAfterShiftWheel,
      'Horizontal wheel (deltaX) should scroll horizontally'
    );

    assert.ok(
      zoomPanResult.zoomAfterCtrlWheelDown < zoomPanResult.zoomAfterMetaWheelUp,
      'CTRL + wheel down should zoom back out'
    );
  });
});


