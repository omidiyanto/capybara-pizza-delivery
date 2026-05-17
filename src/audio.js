// Lightweight procedural audio using WebAudio.
// We synthesize a low rumbling engine sound that pitches with RPM, short event
// blips, and a cute looping background melody for the capybara vibe.
// No external audio assets.

export class Audio {
  constructor() {
    this.ctx = null;
    this._engine = null;
    this._enabled = false;
    this._music = null;
  }

  /** Must be called from a user gesture. */
  enable() {
    if (this._enabled) {
      // Always try to resume in case context was suspended.
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this._enabled = true;
      // Some browsers (Chrome on autoplay-restrictive setups) start suspended even after user gesture.
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this._buildEngine();
      this._startMusic();
    } catch (e) {
      console.warn('Audio init failed:', e);
    }
  }

  _buildEngine() {
    const ctx = this.ctx;

    // Two oscillators for a chunkier engine timbre.
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 60;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 90;

    const gain = ctx.createGain();
    gain.gain.value = 0.0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 1.5;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    this._engine = { osc1, osc2, gain, filter };
  }

  /** rpm: 0..1 ; load: -1..1 */
  setEngine(rpm, speed) {
    if (!this._enabled || !this._engine) return;
    const { osc1, osc2, gain, filter } = this._engine;
    const now = this.ctx.currentTime;
    const baseFreq = 50 + rpm * 220;
    osc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
    osc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.05);
    filter.frequency.setTargetAtTime(400 + rpm * 1200, now, 0.05);
    // Engine kept quiet so background music dominates the mix.
    const vol = 0.012 + Math.min(0.025, Math.abs(speed) * 0.0025) + rpm * 0.018;
    gain.gain.setTargetAtTime(vol, now, 0.1);
  }

  /** Short positive blip. */
  pickup() { this._blip([880, 1320], 0.18, 'sine'); }
  /** Two-tone success. */
  delivery() {
    this._blip([660], 0.10, 'triangle');
    setTimeout(() => this._blip([990, 1320], 0.20, 'triangle'), 120);
  }
  /** Negative thud. */
  fail() { this._blip([220, 110], 0.30, 'sawtooth'); }

  _blip(freqs, dur, type = 'sine') {
    if (!this._enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.20, now + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    out.connect(ctx.destination);

    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, now + i * (dur / freqs.length / 2));
      o.connect(out);
      o.start(now + i * (dur / freqs.length / 2));
      o.stop(now + dur + 0.05);
    });
  }

  // ---------------------------------------------------------- background music
  _startMusic() {
    if (this._music) return;
    const ctx = this.ctx;

    // Master bus with fade-in to avoid clicks. Music is intentionally
    // louder than the engine so it carries the vibe of the game.
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 1.0);

    // Soft lowpass so it stays cute and not harsh.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.6;
    filter.connect(master);

    this._music = { master, filter, scheduled: 0, stopped: false, targetVol: 0.85 };

    // C major pentatonic — bouncy, cute, can't sound wrong.
    // Notes: C5, D5, E5, G5, A5, C6
    const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
    // Bassline (one note per bar, in Hz, low octave)
    const bass = [130.81, 196.00, 174.61, 220.00]; // C3, G3, F3, A3 — I-V-IV-vi vibe

    const bpm = 110;
    const beatDur = 60 / bpm;     // seconds per beat
    const stepDur = beatDur / 2;  // 8th notes
    const barDur = beatDur * 4;

    const start = ctx.currentTime + 0.2;
    let bar = 0;

    const scheduleBar = (barStart) => {
      // Pick a cute melody pattern for this bar
      const patterns = [
        [0, 2, 4, 2, 3, 4, 2, 0],
        [0, 1, 2, 4, 3, 2, 1, 0],
        [4, 3, 2, 4, 5, 4, 2, 1],
        [2, 4, 3, 2, 0, 1, 2, 4],
        [0, 2, 4, 5, 4, 2, 0, 2],
      ];
      const pat = patterns[bar % patterns.length];
      for (let s = 0; s < pat.length; s++) {
        const noteIdx = pat[s];
        // Skip occasionally for breath
        if (Math.random() < 0.08) continue;
        const f = scale[noteIdx];
        const t = barStart + s * stepDur;
        this._musicNote(f, t, stepDur * 0.85, 'triangle', 0.14, filter);
        // Sparkle harmony: every 2nd step add an octave-up ping at very low volume
        if (s % 2 === 0 && Math.random() < 0.4) {
          this._musicNote(f * 2, t, stepDur * 0.4, 'sine', 0.05, filter);
        }
      }
      // Bass: one note for the bar, plus a pickup on beat 3
      const bassFreq = bass[bar % bass.length];
      this._musicNote(bassFreq, barStart, beatDur * 2.2, 'sine', 0.18, filter);
      this._musicNote(bassFreq, barStart + beatDur * 2, beatDur * 1.8, 'sine', 0.14, filter);

      // Cute "bloop" percussion on beat 1 and 3
      this._musicBloop(barStart, filter, 0.16);
      this._musicBloop(barStart + beatDur * 2, filter, 0.12);
    };

    // Schedule loop ahead of time, refilling every second.
    const tick = () => {
      if (!this._music || this._music.stopped) return;
      const now = ctx.currentTime;
      const lookahead = 2.0; // schedule 2s ahead
      while (start + bar * barDur < now + lookahead) {
        scheduleBar(start + bar * barDur);
        bar++;
      }
      setTimeout(tick, 500);
    };
    tick();
  }

  _musicNote(freq, t, dur, type, vol, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _musicBloop(t, dest, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** Mute/unmute background music. */
  setMusicVolume(v) {
    if (this._music && this._music.master) {
      this._music.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
      this._music.targetVol = v;
    }
  }

  /** Toggle music on/off. Returns the new state (true=on). */
  toggleMusic() {
    if (!this._music) return false;
    const target = this._music.targetVol > 0.01 ? 0 : 0.85;
    this.setMusicVolume(target);
    return target > 0;
  }
}
