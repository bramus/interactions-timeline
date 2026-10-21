/**
 * <timeline-visualizer> Interactive Demo & Documentation App
 */

export class TimelineVisualizerDemoApp {
  constructor() {
    this.visualizer = document.querySelector('timeline-visualizer');
    this.delayedIterBox = document.getElementById('delayed-iter-box');
    this.transitionCard = document.getElementById('transition-card');
    this.waapiActor = document.getElementById('waapi-actor');
    this.scrollStage = document.getElementById('scroll-stage');
    this.scrollReadout = document.getElementById('scroll-stage-readout');
    this.ephemeralList = document.getElementById('ephemeral-list');
    this.clickCountEl = document.getElementById('click-count');
    this.autoDemoStatus = document.getElementById('auto-demo-status');

    this._chipCounter = 2;
    this._clickCount = 0;

    this._initLabControls();
    this._setupScrollspy();
    this._setupMicroLighterCopyButtons();
  }

  _initLabControls() {
    // 1. CSS Animations
    const triggerCssBtn = document.getElementById('trigger-css-anim-btn');
    const cancelCssBtn = document.getElementById('cancel-css-anim-btn');

    if (triggerCssBtn && this.delayedIterBox) {
      triggerCssBtn.addEventListener('click', () => {
        this.runCssAnimationDemo();
      });
    }

    if (cancelCssBtn && this.delayedIterBox) {
      cancelCssBtn.addEventListener('click', () => {
        this.delayedIterBox.classList.remove('is-animating');
      });
    }

    // 2. CSS Transitions
    const triggerTransBtn = document.getElementById('trigger-transition-btn');
    const cancelTransBtn = document.getElementById('cancel-transition-btn');

    if (triggerTransBtn && this.transitionCard) {
      triggerTransBtn.addEventListener('click', () => {
        this.runCssTransitionDemo();
      });
    }

    if (cancelTransBtn && this.transitionCard) {
      cancelTransBtn.addEventListener('click', () => {
        this.transitionCard.classList.toggle('is-moved');
        setTimeout(() => {
          this.transitionCard.classList.toggle('is-moved');
        }, 170);
      });
    }

    // 3. WAAPI Animation
    const triggerWaapiBtn = document.getElementById('trigger-waapi-btn');
    if (triggerWaapiBtn && this.waapiActor) {
      triggerWaapiBtn.addEventListener('click', () => {
        this.runWaapiDemo();
      });
    }

    // 4. Scroll-Driven & Scroller Container
    const triggerScrollBtn = document.getElementById('trigger-scroll-btn');
    if (this.scrollStage) {
      this.scrollStage.addEventListener('scroll', () => {
        if (this.scrollReadout) {
          this.scrollReadout.textContent = `scrollTop: ${Math.round(this.scrollStage.scrollTop)}px`;
        }
      });
    }
    if (triggerScrollBtn && this.scrollStage) {
      triggerScrollBtn.addEventListener('click', () => {
        this.runScrollSweepDemo();
      });
    }

    // 5. Ephemeral / Removed DOM Elements
    const triggerRemoveBtn = document.getElementById('trigger-remove-btn');
    const spawnEphemeralBtn = document.getElementById('spawn-ephemeral-btn');

    if (spawnEphemeralBtn) {
      spawnEphemeralBtn.addEventListener('click', () => {
        this.spawnEphemeralChip();
      });
    }

    if (triggerRemoveBtn) {
      triggerRemoveBtn.addEventListener('click', () => {
        this.runAnimateAndRemoveDemo();
      });
    }

    // 6. User Interactions
    const interactionBtn = document.getElementById('interaction-btn');
    if (interactionBtn) {
      interactionBtn.addEventListener('click', () => {
        this._clickCount += 1;
        if (this.clickCountEl) {
          this.clickCountEl.textContent = String(this._clickCount);
        }
      });
    }

    // 7. Auto-Record Full Showcase Button
    const autoDemoBtn = document.getElementById('run-auto-demo-btn');
    if (autoDemoBtn) {
      autoDemoBtn.addEventListener('click', () => {
        this.runAutoShowcase();
      });
    }
  }

  runCssAnimationDemo() {
    if (!this.delayedIterBox) return;
    this.delayedIterBox.classList.remove('is-animating');
    // Force style recalc so re-adding class restarts the CSS animation cleanly
    void this.delayedIterBox.offsetWidth;
    this.delayedIterBox.classList.add('is-animating');
  }

  runCssTransitionDemo() {
    if (!this.transitionCard) return;
    this.transitionCard.classList.toggle('is-moved');
  }

  runWaapiDemo() {
    if (!this.waapiActor || typeof this.waapiActor.animate !== 'function') return null;
    return this.waapiActor.animate(
      [
        { transform: 'translateX(0px) scale(1)', backgroundColor: '#f59e0b' },
        { transform: 'translateX(150px) scale(1.08)', backgroundColor: '#ec4899' },
      ],
      {
        id: 'waapi-slide',
        duration: 280,
        iterations: 2,
        direction: 'alternate',
        easing: 'ease-in-out',
        fill: 'forwards',
      }
    );
  }

  runScrollSweepDemo(durationMs = 420) {
    if (!this.scrollStage) return Promise.resolve();
    const maxScroll = Math.max(120, this.scrollStage.scrollHeight - this.scrollStage.clientHeight);
    const startTop = this.scrollStage.scrollTop;
    const targetTop = startTop > maxScroll * 0.5 ? 0 : maxScroll;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const step = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        this.scrollStage.scrollTop = startTop + (targetTop - startTop) * progress;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  spawnEphemeralChip() {
    if (!this.ephemeralList) return null;
    this._chipCounter += 1;
    const chip = document.createElement('div');
    chip.id = `ephemeral-chip-${this._chipCounter}`;
    chip.className = 'ephemeral-chip';
    const span = document.createElement('span');
    span.textContent = `Ephemeral Chip #${this._chipCounter}`;
    chip.appendChild(span);
    this.ephemeralList.appendChild(chip);
    return chip;
  }

  runAnimateAndRemoveDemo() {
    if (!this.ephemeralList) return Promise.resolve(null);
    let chip = this.ephemeralList.querySelector('.ephemeral-chip:not(.is-exiting)');
    if (!chip) {
      chip = this.spawnEphemeralChip();
    }
    if (!chip) return Promise.resolve(null);

    chip.classList.add('is-exiting');
    return new Promise((resolve) => {
      setTimeout(() => {
        chip.remove();
        resolve(chip);
      }, 240);
    });
  }

  async runAutoShowcase() {
    const visualizer = this.visualizer || document.querySelector('timeline-visualizer');
    if (!visualizer) return;

    if (this.autoDemoStatus) {
      this.autoDemoStatus.textContent = 'Recording showcase sequence…';
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (this.scrollStage) {
      this.scrollStage.scrollTop = 0;
    }
    visualizer.startRecording();

    // t ~ 40ms: Trigger CSS animation (140ms delay + 3x 240ms iterations) & CSS transition (120ms delay + 360ms duration)
    await new Promise((r) => setTimeout(r, 40));
    this.runCssAnimationDemo();
    this.runCssTransitionDemo();

    // t ~ 100ms: Scroll page down using scrollIntoView so root window scroll is recorded
    await new Promise((r) => setTimeout(r, 60));
    const scrollDrivenSection = document.getElementById('lab-scroll-driven');
    if (scrollDrivenSection) {
      scrollDrivenSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: 320, behavior: 'smooth' });
    }

    // t ~ 160ms: Trigger WAAPI animation & animate-then-remove ephemeral chip
    await new Promise((r) => setTimeout(r, 60));
    this.runWaapiDemo();
    this.runAnimateAndRemoveDemo();

    // t ~ 260ms: Scroll inner container to drive ScrollTimeline and ViewTimeline
    await new Promise((r) => setTimeout(r, 100));
    await this.runScrollSweepDemo(360);

    // Dispatch a keyboard event on the input
    const keyTarget = document.getElementById('keyboard-target');
    if (keyTarget) {
      keyTarget.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
      );
    }

    // Scroll page back to top via window.scrollTo so both scrollIntoView and scrollTo are captured
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Wait for smooth scroll and animations to finish
    await new Promise((r) => setTimeout(r, 450));

    visualizer.stopRecording();

    if (this.autoDemoStatus) {
      this.autoDemoStatus.textContent = 'Recording complete! Scrub the timeline below.';
    }
  }

  _createCopyIconSvg(isCopied = false) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'block';
    svg.style.margin = 'auto';

    if (isCopied) {
      svg.style.color = '#16a34a';
      const polyline = document.createElementNS(svgNs, 'polyline');
      polyline.setAttribute('points', '20 6 9 17 4 12');
      svg.appendChild(polyline);
    } else {
      const rect = document.createElementNS(svgNs, 'rect');
      rect.setAttribute('x', '9');
      rect.setAttribute('y', '9');
      rect.setAttribute('width', '13');
      rect.setAttribute('height', '13');
      rect.setAttribute('rx', '2');
      rect.setAttribute('ry', '2');
      const path = document.createElementNS(svgNs, 'path');
      path.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
      svg.append(rect, path);
    }

    return svg;
  }

  _setupMicroLighterCopyButtons() {
    if (typeof customElements === 'undefined') return;

    const enhanceAll = () => {
      document.querySelectorAll('micro-lighter').forEach((lighter) => {
        const button = lighter.shadowRoot?.querySelector('button[part="copy-button"]');
        if (!button || button.dataset.iconEnhanced === 'true') return;
        button.dataset.iconEnhanced = 'true';

        let currentLabel = 'Copy code';
        const renderIcon = (label) => {
          currentLabel = String(label || 'Copy');
          const isCopied = currentLabel.toLowerCase().includes('copied');
          button.setAttribute('aria-label', isCopied ? 'Copied' : 'Copy code');
          button.setAttribute('title', isCopied ? 'Copied' : 'Copy code');
          button.replaceChildren(this._createCopyIconSvg(isCopied));
        };

        Object.defineProperty(button, 'textContent', {
          configurable: true,
          get() {
            return currentLabel;
          },
          set(value) {
            renderIcon(value);
          },
        });

        renderIcon('Copy');
      });
    };

    if (customElements.get('micro-lighter')) {
      enhanceAll();
    } else {
      customElements.whenDefined('micro-lighter').then(enhanceAll);
    }
  }

  _setupScrollspy() {
    const navLinks = document.querySelectorAll('.sidenav-list a');
    const sections = Array.from(navLinks)
      .map((link) => {
        const id = link.getAttribute('href').replace('#', '');
        return document.getElementById(id);
      })
      .filter(Boolean);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach((link) => {
              if (link.getAttribute('href') === `#${id}`) {
                link.classList.add('is-active');
              } else {
                link.classList.remove('is-active');
              }
            });
          }
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );

    sections.forEach((sec) => observer.observe(sec));
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.demoApp = new TimelineVisualizerDemoApp();
    });
  } else {
    window.demoApp = new TimelineVisualizerDemoApp();
  }
}
