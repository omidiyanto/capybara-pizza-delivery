// Keyboard + touch input controller.
// Touch input is fed through the same throttle/steer/handbrake/boost interface
// so the game loop doesn't care whether the player is on desktop or mobile.

export class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this._listeners = [];

    // Touch state (set by mobile UI)
    this.touchSteer = 0;       // -1..1
    this.touchThrottle = 0;    // 0 or 1
    this.touchReverse = 0;     // 0 or 1
    this.touchBoost = false;
    this.touchHandbrake = false;

    const onDown = (e) => {
      const k = e.code;
      if (!this.keys.has(k)) this.justPressed.add(k);
      this.keys.add(k);

      // Avoid scrolling on arrow / space keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) {
        e.preventDefault();
      }
    };
    const onUp = (e) => {
      this.keys.delete(e.code);
    };
    const onBlur = () => this.keys.clear();

    window.addEventListener('keydown', onDown, { passive: false });
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);

    this._listeners.push(['keydown', onDown], ['keyup', onUp], ['blur', onBlur]);

    // Auto-mount touch UI on touch-capable devices
    this._setupTouch();
  }

  _setupTouch() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const tc = document.getElementById('touch-controls');
    if (!isTouch || !tc) return;
    tc.classList.remove('hidden');

    // Joystick
    const joy = document.getElementById('touch-joystick');
    const knob = document.getElementById('joy-knob');
    if (joy && knob) {
      const maxR = 50;
      let active = false;
      let cx = 0, cy = 0;

      const reset = () => {
        active = false;
        knob.style.transform = 'translate(0,0)';
        this.touchSteer = 0;
      };
      const setFromTouch = (x, y) => {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.min(maxR, Math.hypot(dx, dy));
        const ang = Math.atan2(dy, dx);
        const kx = Math.cos(ang) * dist;
        const ky = Math.sin(ang) * dist;
        knob.style.transform = `translate(${kx}px, ${ky}px)`;
        // Steering = horizontal component normalized
        this.touchSteer = Math.max(-1, Math.min(1, kx / maxR));
      };
      const onStart = (e) => {
        e.preventDefault();
        const t = e.touches ? e.touches[0] : e;
        const r = joy.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
        active = true;
        setFromTouch(t.clientX, t.clientY);
      };
      const onMove = (e) => {
        if (!active) return;
        e.preventDefault();
        const t = e.touches ? e.touches[0] : e;
        setFromTouch(t.clientX, t.clientY);
      };
      const onEnd = (e) => {
        if (!active) return;
        e.preventDefault();
        reset();
      };
      joy.addEventListener('touchstart', onStart, { passive: false });
      joy.addEventListener('touchmove', onMove, { passive: false });
      joy.addEventListener('touchend', onEnd, { passive: false });
      joy.addEventListener('touchcancel', onEnd, { passive: false });
    }

    // Pressable buttons (hold-to-press)
    const bind = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => { e.preventDefault(); el.classList.add('active'); onDown(); };
      const up = (e) => { e.preventDefault(); el.classList.remove('active'); onUp(); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      // Mouse fallback (desktop testing)
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', up);
    };
    bind('btn-throttle', () => { this.touchThrottle = 1; }, () => { this.touchThrottle = 0; });
    bind('btn-brake', () => { this.touchReverse = 1; }, () => { this.touchReverse = 0; });
    bind('btn-boost', () => { this.touchBoost = true; }, () => { this.touchBoost = false; });
    bind('btn-handbrake', () => { this.touchHandbrake = true; }, () => { this.touchHandbrake = false; });

    // Tap-only buttons (map / camera) — dispatch synthetic key events
    const tap = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      const fire = (e) => {
        e.preventDefault();
        // Add to justPressed so any check this frame sees it
        this.justPressed.add(code);
        // Also dispatch a real keydown to drive the existing keyboard handler
        window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      };
      el.addEventListener('touchstart', fire, { passive: false });
      el.addEventListener('click', fire);
    };
    tap('btn-map', 'KeyM');
    tap('btn-cam', 'KeyC');
  }

  /** Returns true if any of the given key codes are pressed. */
  any(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Was the key newly pressed this frame? Must call clearJustPressed at end of frame. */
  pressed(code) {
    return this.justPressed.has(code);
  }

  clearJustPressed() {
    this.justPressed.clear();
  }

  /** Throttle: 1.0 forward, -1.0 reverse, 0 idle. */
  throttle() {
    let v = 0;
    if (this.any('KeyW', 'ArrowUp')) v += 1;
    if (this.any('KeyS', 'ArrowDown')) v -= 1;
    v += this.touchThrottle - this.touchReverse;
    return Math.max(-1, Math.min(1, v));
  }

  /** Steering: -1 left, +1 right, 0 straight. */
  steer() {
    let v = 0;
    if (this.any('KeyA', 'ArrowLeft')) v -= 1;
    if (this.any('KeyD', 'ArrowRight')) v += 1;
    if (v === 0) v = this.touchSteer;
    return Math.max(-1, Math.min(1, v));
  }

  handbrake() { return this.any('Space') || this.touchHandbrake; }
  boost() { return this.any('ShiftLeft', 'ShiftRight') || this.touchBoost; }

  destroy() {
    for (const [type, fn] of this._listeners) window.removeEventListener(type, fn);
  }
}
