/* Procedural Web Audio synthesizer for Ahwoo Racing:
   - Speed-reactive dual-turbine hover hum + overdrive boost layer
   - Weight-scaled SFX for countdown, boost pads, mega-jump launch/land, sparks, lap chimes
   - Subtle driving synthwave bass/arpeggio groove with clean mute toggle */

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private weatherGain: GainNode | null = null;
  private weatherFilter: BiquadFilterNode | null = null;
  private weatherNoise: AudioBufferSourceNode | null = null;
  private drainOsc: OscillatorNode | null = null;
  private drainGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private muted = false;
  private started = false;
  private musicTimer: number | null = null;
  private stepIdx = 0;
  private activeLevel = 0;

  public isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.42;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.masterGain);

      this.setupEngine();
      this.setupWeatherAmbience();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.started) {
      this.started = true;
      this.startGroove();
    }
  }

  private setupEngine(): void {
    if (!this.ctx || !this.masterGain) return;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 220;
    this.engineFilter.Q.value = 3.2;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.engineOscA = this.ctx.createOscillator();
    this.engineOscA.type = 'sawtooth';
    this.engineOscA.frequency.value = 55;

    this.engineOscB = this.ctx.createOscillator();
    this.engineOscB.type = 'triangle';
    this.engineOscB.frequency.value = 110.5;

    this.engineOscA.connect(this.engineFilter);
    this.engineOscB.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOscA.start();
    this.engineOscB.start();
  }

  private setupWeatherAmbience(): void {
    if (!this.ctx || !this.masterGain) return;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.18) * 0.45;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();

    this.weatherNoise = src;
    this.weatherFilter = filter;
    this.weatherGain = gain;

    const dOsc = this.ctx.createOscillator();
    dOsc.type = 'sawtooth';
    dOsc.frequency.value = 78;
    const dFilter = this.ctx.createBiquadFilter();
    dFilter.type = 'lowpass';
    dFilter.frequency.value = 260;
    const dGain = this.ctx.createGain();
    dGain.gain.value = 0;
    dOsc.connect(dFilter);
    dFilter.connect(dGain);
    dGain.connect(this.masterGain);
    dOsc.start();
    this.drainOsc = dOsc;
    this.drainGain = dGain;
  }

  public setLevel(levelIdx: number): void {
    this.activeLevel = levelIdx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public updateEngine(speedFrac: number, boosting: boolean, active: boolean): void {
    if (!this.ctx || !this.engineGain || !this.engineOscA || !this.engineOscB || !this.engineFilter) return;
    const t = this.ctx.currentTime;
    if (!active || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.08);
      return;
    }
    const baseFreq = 48 + speedFrac * 115 + (boosting ? 48 : 0);
    this.engineOscA.frequency.setTargetAtTime(baseFreq, t, 0.05);
    this.engineOscB.frequency.setTargetAtTime(baseFreq * 2.01, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(180 + speedFrac * 920 + (boosting ? 650 : 0), t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.06 + speedFrac * 0.1 + (boosting ? 0.07 : 0), t, 0.06);
  }

  public updateWeatherAmbience(kind: 'rain' | 'mist' | 'solar', intensity: number, active: boolean): void {
    if (!this.ctx || !this.weatherGain || !this.weatherFilter) return;
    const t = this.ctx.currentTime;
    if (!active || this.muted) {
      this.weatherGain.gain.setTargetAtTime(0, t, 0.12);
      return;
    }
    const freq =
      kind === 'rain'
        ? 1500 + intensity * 1400
        : kind === 'mist'
          ? 520 + intensity * 420
          : 340 + intensity * 620;
    const q = kind === 'solar' ? 2.4 : kind === 'mist' ? 0.9 : 0.65;
    const vol =
      kind === 'rain'
        ? 0.025 + intensity * 0.085
        : kind === 'mist'
          ? 0.015 + intensity * 0.05
          : 0.015 + intensity * 0.055;

    this.weatherFilter.frequency.setTargetAtTime(freq, t, 0.18);
    this.weatherFilter.Q.setTargetAtTime(q, t, 0.18);
    this.weatherGain.gain.setTargetAtTime(vol, t, 0.18);
  }

  public playThunder(strength = 1): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    this.tone(92, 28, 0.72, 'sawtooth', Math.min(0.18, 0.11 * strength));
    this.tone(54, 24, 0.85, 'sine', Math.min(0.22, 0.14 * strength));
  }

  public playSolarSurge(strength = 1): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    this.tone(220, 440, 0.48, 'sine', Math.min(0.14, 0.09 * strength));
    this.tone(330, 660, 0.55, 'triangle', Math.min(0.1, 0.06 * strength));
  }

  public updateHazardDrain(active: boolean): void {
    if (!this.ctx || !this.drainGain || !this.drainOsc) return;
    const t = this.ctx.currentTime;
    if (!active || this.muted) {
      this.drainGain.gain.setTargetAtTime(0, t, 0.08);
      return;
    }
    this.drainOsc.frequency.setTargetAtTime(76 + Math.sin(t * 14) * 12, t, 0.04);
    this.drainGain.gain.setTargetAtTime(0.085, t, 0.06);
  }

  public playUiClick(): void {
    this.unlock();
    this.tone(680, 980, 0.07, 'sine', 0.14);
  }

  public playCountdown(go: boolean): void {
    this.unlock();
    if (go) {
      this.tone(880, 1320, 0.28, 'triangle', 0.24);
      this.tone(440, 880, 0.28, 'sawtooth', 0.1);
    } else {
      this.tone(440, 440, 0.12, 'triangle', 0.18);
    }
  }

  public playBoost(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.tone(180, 620, 0.32, 'sawtooth', 0.16);
    this.tone(90, 210, 0.36, 'sine', 0.2);
  }

  public playJump(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.tone(240, 740, 0.26, 'triangle', 0.18);
  }

  public playLand(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.tone(140, 42, 0.22, 'sine', 0.25);
  }

  public playCrash(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.tone(190, 45, 0.18, 'sawtooth', 0.22);
    this.tone(90, 32, 0.24, 'square', 0.12);
  }

  public playLap(finish: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const notes = finish ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
    notes.forEach((f, idx) => {
      setTimeout(() => this.tone(f, f * 1.02, 0.22, 'triangle', 0.18), idx * 90);
    });
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private startGroove(): void {
    if (this.musicTimer !== null) return;
    const scales = [
      [55, 55, 65.41, 73.42, 55, 55, 82.41, 73.42], // Neon Sprawl (A minor cyber)
      [65.41, 65.41, 77.78, 87.31, 65.41, 77.78, 98, 87.31], // Vesper Shore (C minor synth)
      [49, 49, 58.27, 65.41, 49, 65.41, 73.42, 58.27] // Event Horizon (G minor deep space)
    ];

    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.muted || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const scale = scales[this.activeLevel % scales.length];
      const bassFreq = scale[this.stepIdx % scale.length];

      // Driving cyber bass pulse
      const bOsc = this.ctx.createOscillator();
      const bFilt = this.ctx.createBiquadFilter();
      const bGain = this.ctx.createGain();
      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(bassFreq, now);
      bFilt.type = 'lowpass';
      bFilt.frequency.setValueAtTime(420, now);
      bFilt.frequency.exponentialRampToValueAtTime(140, now + 0.16);
      bGain.gain.setValueAtTime(0.28, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      bOsc.connect(bFilt);
      bFilt.connect(bGain);
      bGain.connect(this.musicGain);
      bOsc.start(now);
      bOsc.stop(now + 0.18);

      // Soft kick on quarter beats
      if (this.stepIdx % 2 === 0) {
        const kOsc = this.ctx.createOscillator();
        const kGain = this.ctx.createGain();
        kOsc.type = 'sine';
        kOsc.frequency.setValueAtTime(115, now);
        kOsc.frequency.exponentialRampToValueAtTime(36, now + 0.12);
        kGain.gain.setValueAtTime(0.32, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        kOsc.connect(kGain);
        kGain.connect(this.musicGain);
        kOsc.start(now);
        kOsc.stop(now + 0.14);
      }

      // Luxury arpeggio sparkle every other step
      if (this.stepIdx % 2 === 1) {
        const arpMult = [4, 6, 8, 6][Math.floor(this.stepIdx / 2) % 4];
        const aOsc = this.ctx.createOscillator();
        const aGain = this.ctx.createGain();
        aOsc.type = 'triangle';
        aOsc.frequency.setValueAtTime(bassFreq * arpMult, now);
        aGain.gain.setValueAtTime(0.09, now);
        aGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        aOsc.connect(aGain);
        aGain.connect(this.musicGain);
        aOsc.start(now);
        aOsc.stop(now + 0.15);
      }

      this.stepIdx = (this.stepIdx + 1) % 16;
    }, 175);
  }

  public dispose(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    try {
      this.engineOscA?.stop();
      this.engineOscB?.stop();
      this.weatherNoise?.stop();
      this.drainOsc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore cleanup errors
    }
    this.ctx = null;
  }
}
