// Synthesized sound, WebAudio only, no audio files. Every method is a
// no-op until a user gesture creates the context (and in Node, where
// there is no window at all, everything is a no-op).

export class SoundBank {
  constructor() {
    this.ctx = null;
  }

  ensure() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  tone(freq, dur, type = 'sine', gain = 0.08, when = 0, slideTo = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  play(name) {
    if (typeof window === 'undefined') return;
    switch (name) {
      case 'pickup':
        this.tone(660, 0.09, 'sine', 0.09);
        this.tone(990, 0.12, 'sine', 0.09, 0.08);
        break;
      case 'coin':
        this.tone(1250, 0.06, 'square', 0.05);
        break;
      case 'smoke':
        this.tone(320, 0.3, 'sawtooth', 0.05, 0, 90);
        break;
      case 'panel':
        this.tone(520, 0.07, 'square', 0.06);
        this.tone(780, 0.07, 'square', 0.06, 0.07);
        break;
      case 'locked':
        this.tone(140, 0.15, 'square', 0.07);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.09, i * 0.11));
        break;
      case 'busted':
        this.tone(220, 0.5, 'sawtooth', 0.09, 0, 55);
        break;
      case 'dash':
        this.tone(300, 0.14, 'sine', 0.05, 0, 720);
        break;
      default:
        break;
    }
  }
}
