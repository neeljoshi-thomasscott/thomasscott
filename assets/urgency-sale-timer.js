/**
 * Countdown timer for a sale/promotion. Reads its target end time (and what to do
 * once it's reached) from attributes set by the section's Liquid/schema settings.
 * Plain custom element with no external dependencies, so it can be dropped into
 * any template/section group safely.
 */
class UrgencySaleTimer extends HTMLElement {
  /** @type {number|undefined} */
  #intervalId;

  connectedCallback() {
    if (this.endTime === null) return;

    this.#tick();
    this.#intervalId = window.setInterval(() => this.#tick(), 1000);
  }

  disconnectedCallback() {
    window.clearInterval(this.#intervalId);
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
    let end = this.endTime;
    if (end === null) return;

    const now = Date.now();

    if (now >= end) {
      const restartMs = this.restartMs;

      if (this.onExpire === 'restart' && restartMs) {
        while (end <= now) end += restartMs;
        this.endTime = end;
      } else if (this.onExpire === 'message') {
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

    this.#setText('days', Math.floor(totalSeconds / 86400));
    this.#setText('hours', Math.floor((totalSeconds % 86400) / 3600));
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

    const section = this.closest('.shopify-section');
    if (section instanceof HTMLElement) {
      section.hidden = true;
    } else {
      this.hidden = true;
    }
  }
}

if (!customElements.get('urgency-sale-timer-component')) {
  customElements.define('urgency-sale-timer-component', UrgencySaleTimer);
}
