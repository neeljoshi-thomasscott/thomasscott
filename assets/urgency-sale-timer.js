/**
 * Countdown timer for a sale/promotion. Reads its target end time (and what to do
 * once it's reached) from attributes set by the `urgency-timer` snippet, which reads
 * them from the shared theme settings.
 * Plain custom element with no external dependencies, so it can be dropped into
 * any template/section group safely.
 */
class UrgencySaleTimer extends HTMLElement {
  /** @type {number|undefined} */
  #intervalId;

  /** Whether the timer is hidden because the sale hasn't started yet. */
  #waitingForStart = false;

  connectedCallback() {
    if (this.endTime === null) return;

    // The snippet's inline script may already have hidden it before this script loaded.
    this.#waitingForStart = this.hasAttribute('waiting-for-start');

    this.#tick();
    this.#intervalId = window.setInterval(() => this.#tick(), 1000);
  }

  disconnectedCallback() {
    window.clearInterval(this.#intervalId);
  }

  /** @returns {number|null} Start time in ms since epoch, or null if it shows straight away. */
  get startTime() {
    const value = this.getAttribute('start-datetime');
    if (!value) return null;

    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }

  /** @returns {number|null} End time in ms since epoch, or null if not configured/invalid. */
  get endTime() {
    const value = this.getAttribute('end-datetime');
    if (!value) return null;

    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }

  /** @param {number} value */
  set endTime(value) {
    this.setAttribute('end-datetime', new Date(value).toISOString());
  }

  /** @returns {number|null} Restart cycle length in ms, or null if restart isn't configured. */
  get restartMs() {
    const value = Number(this.getAttribute('restart-ms'));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  /** @returns {'hide'|'message'|'restart'} */
  get onExpire() {
    const value = this.getAttribute('on-expire');
    return value === 'message' || value === 'restart' ? value : 'hide';
  }

  #tick() {
    const end = this.endTime;
    if (end === null) return;

    const now = Date.now();

    const start = this.startTime;
    if (start !== null && now < start) {
      this.#waitingForStart = true;
      this.#hideTarget().hidden = true;
      return;
    }
    if (this.#waitingForStart) {
      this.#waitingForStart = false;
      this.removeAttribute('waiting-for-start');
      this.#hideTarget().hidden = false;
    }

    const restartMs = this.restartMs;

    // Recurring: count down in restart-length cycles (from the start time, or backwards
    // from the sale end) and treat the end date as the end of the whole sale.
    if (this.onExpire === 'restart' && restartMs) {
      if (now >= end) {
        this.#hideSection();
        return;
      }

      const anchor = start ?? end;
      const cycleEnd = now - (((now - anchor) % restartMs) + restartMs) % restartMs + restartMs;
      this.#render(Math.min(cycleEnd, end) - now);
      return;
    }

    if (now >= end) {
      if (this.onExpire === 'message') {
        this.#showExpiredMessage();
        return;
      } else {
        this.#hideSection();
        return;
      }
    }

    this.#render(end - now);
  }

  /** @param {number} remainingMs */
  #render(remainingMs) {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));

    // No days unit: hours keep counting past 24 so the display stays H:M:S.
    this.#setText('hours', Math.floor(totalSeconds / 3600));
    this.#setText('minutes', Math.floor((totalSeconds % 3600) / 60));
    this.#setText('seconds', totalSeconds % 60);
  }

  /**
   * @param {string} part
   * @param {number} value
   */
  #setText(part, value) {
    const el = this.querySelector(`[data-urgency-timer-${part}]`);
    if (el) el.textContent = String(value).padStart(2, '0');
  }

  #showExpiredMessage() {
    window.clearInterval(this.#intervalId);

    const display = this.querySelector('[data-urgency-timer-display]');
    const message = this.querySelector('[data-urgency-timer-message]');

    if (display instanceof HTMLElement) display.hidden = true;
    if (message instanceof HTMLElement) message.hidden = false;
  }

  #hideSection() {
    window.clearInterval(this.#intervalId);
    this.#hideTarget().hidden = true;
  }

  /** @returns {HTMLElement} The element to hide: the `hide-closest` ancestor, or the timer itself. */
  #hideTarget() {
    const selector = this.getAttribute('hide-closest');
    const target = selector ? this.closest(selector) : null;
    return target instanceof HTMLElement ? target : this;
  }
}

if (!customElements.get('urgency-sale-timer-component')) {
  customElements.define('urgency-sale-timer-component', UrgencySaleTimer);
}
