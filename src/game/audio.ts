/* Procedural Web Audio synthesizer for Ahwoo Racing:
   - Sleek multi-layer luxury hover-turbine sound: deep sine magnetic sub-core,
     soft harmonic fifths, lowpass-filtered turbine hum, and speed-reactive air-jet whoosh
   - Weight-scaled SFX for countdown, boost pads, mega-jump launch/land, sparks, lap chimes
   - Driving synthwave bass/arpeggio groove with clean mute toggle */

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Luxury Hover-Turbine Engine nodes
  private engineGain: GainNode | null = null;
  private engineOscSub: OscillatorNode | null = null;
  private engineOscFifth: OscillatorNode | null = null;
  private engineOscTurbine: OscillatorNode | null = null;
  private engineSubGain: GainNode | null = null;
  private engineFifthGain: GainNode | null = null;
  private engineTurbineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  // Turbine Air-Jet / Plasma Intake Whoosh
  private airNoise: AudioBufferSourceNode | null = null;
  private airFilter: BiquadFilterNode | null = null;
  private airGain: GainNode | null = null;

  private weatherGain: GainNode | null = null;
  private weatherFilter: BiquadFilterNode | null = null;
  private weatherNoise: AudioBufferSourceNode | null = null;
  private drainOsc: OscillatorNode | null = null;
  private drainGain: GainNode | null = null;

  // Magnetic Power-Slide Drift sound layer
  private driftNoise: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftOsc: OscillatorNode | null = null;
  private driftGain: GainNode | null = null;

  private musicGain: GainNode | null = null;
  private muted = false;
  private radioOverride = false;
  private started = false;
  private musicTimer: number | null = null;
  private stepIdx = 0;
  private activeLevel = 0;
  private musicMode: 'menu' | 'race' = 'menu';

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

  private createPinkNoiseBuffer(seconds = 2): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
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
      data[i] = (b0 + b1 + b2 + white * 0.16) * 0.44;
    }
    return buf;
  }

  private setupEngine(): void {
    if (!this.ctx || !this.masterGain) return;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 180;
    this.engineFilter.Q.value = 0.72; // Smooth non-nasal rolloff

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    // Layer 1: Warm deep magnetic sub-hum (sine)
    this.engineOscSub = this.ctx.createOscillator();
    this.engineOscSub.type = 'sine';
    this.engineOscSub.frequency.value = 42;
    this.engineSubGain = this.ctx.createGain();
    this.engineSubGain.gain.value = 0.65;

    // Layer 2: Sleek harmonic fifth shimmer (sine)
    this.engineOscFifth = this.ctx.createOscillator();
    this.engineOscFifth.type = 'sine';
    this.engineOscFifth.frequency.value = 63;
    this.engineFifthGain = this.ctx.createGain();
    this.engineFifthGain.gain.value = 0.24;

    // Layer 3: Velvety turbine core (soft triangle, heavily lowpassed)
    this.engineOscTurbine = this.ctx.createOscillator();
    this.engineOscTurbine.type = 'triangle';
    this.engineOscTurbine.frequency.value = 84;
    this.engineTurbineGain = this.ctx.createGain();
    this.engineTurbineGain.gain.value = 0.22;

    this.engineOscSub.connect(this.engineSubGain);
    this.engineOscFifth.connect(this.engineFifthGain);
    this.engineOscTurbine.connect(this.engineTurbineGain);

    this.engineSubGain.connect(this.engineFilter);
    this.engineFifthGain.connect(this.engineFilter);
    this.engineTurbineGain.connect(this.engineFilter);

    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOscSub.start();
    this.engineOscFifth.start();
    this.engineOscTurbine.start();

    // Layer 4: Smooth air-intake & ion exhaust whoosh (filtered pink noise)
    const noiseBuf = this.createPinkNoiseBuffer(2);
    if (noiseBuf) {
      this.airNoise = this.ctx.createBufferSource();
      this.airNoise.buffer = noiseBuf;
      this.airNoise.loop = true;

      this.airFilter = this.ctx.createBiquadFilter();
      this.airFilter.type = 'bandpass';
      this.airFilter.frequency.value = 280;
      this.airFilter.Q.value = 1.1;

      this.airGain = this.ctx.createGain();
      this.airGain.gain.value = 0.0;

      this.airNoise.connect(this.airFilter);
      this.airFilter.connect(this.airGain);
      this.airGain.connect(this.masterGain);
      this.airNoise.start();
    }
  }

  private setupWeatherAmbience(): void {
    if (!this.ctx || !this.masterGain) return;
    const buf = this.createPinkNoiseBuffer(2);
    if (!buf) return;

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
    dOsc.type = 'triangle';
    dOsc.frequency.value = 78;
    const dFilter = this.ctx.createBiquadFilter();
    dFilter.type = 'lowpass';
    dFilter.frequency.value = 240;
    const dGain = this.ctx.createGain();
    dGain.gain.value = 0;
    dOsc.connect(dFilter);
    dFilter.connect(dGain);
    dGain.connect(this.masterGain);
    dOsc.start();
    this.drainOsc = dOsc;
    this.drainGain = dGain;

    // Drift magnetic slide layer
    const driftBuf = this.createPinkNoiseBuffer(2);
    if (driftBuf) {
      const dSrc = this.ctx.createBufferSource();
      dSrc.buffer = driftBuf;
      dSrc.loop = true;

      const dFilt = this.ctx.createBiquadFilter();
      dFilt.type = 'bandpass';
      dFilt.frequency.value = 900;
      dFilt.Q.value = 2.6;

      const drGain = this.ctx.createGain();
      drGain.gain.value = 0;

      const drOsc = this.ctx.createOscillator();
      drOsc.type = 'sine';
      drOsc.frequency.value = 185;
      const drOscGain = this.ctx.createGain();
      drOscGain.gain.value = 0.22;

      dSrc.connect(dFilt);
      dFilt.connect(drGain);
      drOsc.connect(drOscGain);
      drOscGain.connect(drGain);
      drGain.connect(this.masterGain);

      dSrc.start();
      drOsc.start();
      this.driftNoise = dSrc;
      this.driftFilter = dFilt;
      this.driftOsc = drOsc;
      this.driftGain = drGain;
    }
  }

  public setLevel(levelIdx: number): void {
    this.activeLevel = levelIdx;
  }

  public setMusicMode(mode: 'menu' | 'race'): void {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    this.stepIdx = 0;
  }

  public getMusicMode(): 'menu' | 'race' {
    return this.musicMode;
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

  public setRadioOverride(active: boolean): void {
    this.radioOverride = active;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(active ? 0 : 0.22, this.ctx.currentTime, 0.14);
    }
  }

  public isRadioOverride(): boolean {
    return this.radioOverride;
  }

  public updateEngine(speedFrac: number, boosting: boolean, active: boolean): void {
    if (
      !this.ctx ||
      !this.engineGain ||
      !this.engineOscSub ||
      !this.engineOscFifth ||
      !this.engineOscTurbine ||
      !this.engineFilter
    ) {
      return;
    }
    const t = this.ctx.currentTime;
    if (!active || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.09);
      this.airGain?.gain.setTargetAtTime(0, t, 0.09);
      return;
    }

    const s = Math.max(0, Math.min(1.5, speedFrac));
    const subFreq = 38 + s * 46 + (boosting ? 18 : 0);
    this.engineOscSub.frequency.setTargetAtTime(subFreq, t, 0.08);
    this.engineOscFifth.frequency.setTargetAtTime(subFreq * 1.498, t, 0.08);
    this.engineOscTurbine.frequency.setTargetAtTime(subFreq * 2.005, t, 0.08);

    // Gentle low-pass opens smoothly as turbine spools up
    this.engineFilter.frequency.setTargetAtTime(145 + s * 310 + (boosting ? 260 : 0), t, 0.09);
    this.engineGain.gain.setTargetAtTime(0.055 + s * 0.068 + (boosting ? 0.055 : 0), t, 0.08);

    if (this.engineFifthGain) {
      this.engineFifthGain.gain.setTargetAtTime(0.16 + s * 0.14 + (boosting ? 0.12 : 0), t, 0.1);
    }

    // Turbine air-intake & jet exhaust whoosh
    if (this.airFilter && this.airGain) {
      const airFreq = 240 + s * 680 + (boosting ? 560 : 0);
      this.airFilter.frequency.setTargetAtTime(airFreq, t, 0.1);
      this.airFilter.Q.setTargetAtTime(boosting ? 0.85 : 1.25, t, 0.1);
      this.airGain.gain.setTargetAtTime(0.014 + s * 0.055 + (boosting ? 0.085 : 0), t, 0.09);
    }
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
    this.tone(86, 28, 0.72, 'triangle', Math.min(0.16, 0.1 * strength));
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
    this.drainGain.gain.setTargetAtTime(0.08, t, 0.06);
  }

  public updateDriftSound(active: boolean, slipIntensity: number, tier: number): void {
    if (!this.ctx || !this.driftGain || !this.driftFilter || !this.driftOsc) return;
    const t = this.ctx.currentTime;
    if (!active || this.muted) {
      this.driftGain.gain.setTargetAtTime(0, t, 0.07);
      return;
    }
    const slip = Math.max(0, Math.min(1.4, slipIntensity));
    this.driftFilter.frequency.setTargetAtTime(720 + slip * 780 + tier * 260, t, 0.06);
    this.driftOsc.frequency.setTargetAtTime(160 + slip * 80 + tier * 62, t, 0.06);
    this.driftGain.gain.setTargetAtTime(0.055 + slip * 0.05 + tier * 0.014, t, 0.05);
  }

  public playAnnouncerCue(urgency: 'info' | 'hype' | 'alert'): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    if (urgency === 'alert') {
      this.tone(640, 480, 0.09, 'triangle', 0.075);
    } else if (urgency === 'hype') {
      this.tone(780, 1180, 0.08, 'sine', 0.07);
    } else {
      this.tone(720, 920, 0.07, 'sine', 0.06);
    }
  }

  public playLaneAlert(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    this.tone(860, 620, 0.09, 'sawtooth', 0.11);
    window.setTimeout(() => this.tone(1040, 760, 0.1, 'triangle', 0.1), 95);
  }

  public playNudge(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    this.tone(320, 140, 0.14, 'sawtooth', 0.16);
    this.tone(680, 290, 0.1, 'triangle', 0.12);
  }

  public playSpinAttack(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    this.tone(240, 920, 0.24, 'sawtooth', 0.16);
    this.tone(520, 180, 0.32, 'triangle', 0.14);
    window.setTimeout(() => this.tone(740, 320, 0.18, 'sine', 0.12), 110);
  }

  public playDeflect(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    this.tone(680, 1760, 0.14, 'triangle', 0.2);
    this.tone(1120, 2240, 0.18, 'sine', 0.16);
    window.setTimeout(() => this.tone(880, 1520, 0.16, 'sine', 0.13), 55);
  }

  public playExplosion(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    this.tone(140, 28, 0.55, 'sawtooth', 0.28);
    this.tone(95, 24, 0.62, 'triangle', 0.24);
    window.setTimeout(() => this.tone(68, 22, 0.45, 'sine', 0.2), 70);
  }

  public playTakedown(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    this.tone(440, 880, 0.16, 'triangle', 0.16);
    window.setTimeout(() => this.tone(660, 1320, 0.22, 'sine', 0.18), 80);
  }

  public playUiClick(): void {
    this.unlock();
    this.tone(680, 980, 0.07, 'sine', 0.14);
  }

  public playCountdown(go: boolean): void {
    this.unlock();
    if (go) {
      this.tone(587.33, 880, 0.3, 'triangle', 0.22);
      this.tone(293.66, 587.33, 0.32, 'sine', 0.18);
    } else {
      this.tone(440, 440, 0.12, 'sine', 0.18);
    }
  }

  public playBoost(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.tone(160, 520, 0.34, 'triangle', 0.15);
    this.tone(80, 220, 0.38, 'sine', 0.22);
  }

  public playJump(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.tone(240, 740, 0.26, 'sine', 0.18);
  }

  public playLand(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.tone(130, 40, 0.22, 'sine', 0.24);
  }

  public playCrash(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    this.tone(175, 42, 0.18, 'triangle', 0.22);
    this.tone(85, 30, 0.24, 'sine', 0.18);
  }

  public playLap(finish: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const notes = finish ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
    notes.forEach((f, idx) => {
      setTimeout(() => this.tone(f, f * 1.015, 0.24, 'sine', 0.18), idx * 90);
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
      [49, 49, 58.27, 65.41, 49, 65.41, 73.42, 58.27], // Event Horizon (G minor deep space)
      [73.42, 73.42, 87.31, 98, 110, 98, 87.31, 65.41] // Space Beach (D minor cosmic ocean)
    ];

    // Dark UK Drill/Trap groove for car & level select menu ("CRO - No Hand Outs" vibe)
    const menuSubNotes = [36.71, 0, 36.71, 41.2, 0, 36.71, 43.65, 36.71, 32.7, 0, 32.7, 36.71, 0, 41.2, 49, 41.2];
    const menuBellNotes = [293.66, 0, 349.23, 0, 440, 0, 329.63, 0, 261.63, 0, 329.63, 0, 392, 0, 349.23, 0];

    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.muted || this.radioOverride || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;

      if (this.musicMode === 'menu') {
        const s = this.stepIdx % 16;
        const subFreq = menuSubNotes[s];
        if (subFreq > 0) {
          const bOsc = this.ctx.createOscillator();
          const bGain = this.ctx.createGain();
          bOsc.type = 'sine';
          bOsc.frequency.setValueAtTime(subFreq * 1.15, now);
          bOsc.frequency.exponentialRampToValueAtTime(subFreq, now + 0.08);
          bGain.gain.setValueAtTime(0.3, now);
          bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
          bOsc.connect(bGain);
          bGain.connect(this.musicGain);
          bOsc.start(now);
          bOsc.stop(now + 0.25);
        }

        // Syncopated drill kick / snare cadence
        if (s === 0 || s === 6 || s === 10) {
          const kOsc = this.ctx.createOscillator();
          const kGain = this.ctx.createGain();
          kOsc.type = 'sine';
          kOsc.frequency.setValueAtTime(125, now);
          kOsc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
          kGain.gain.setValueAtTime(0.32, now);
          kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          kOsc.connect(kGain);
          kGain.connect(this.musicGain);
          kOsc.start(now);
          kOsc.stop(now + 0.13);
        }

        // Dark plucked bell motif
        const bell = menuBellNotes[s];
        if (bell > 0) {
          const mOsc = this.ctx.createOscillator();
          const mGain = this.ctx.createGain();
          mOsc.type = 'triangle';
          mOsc.frequency.setValueAtTime(bell, now);
          mGain.gain.setValueAtTime(0.09, now);
          mGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          mOsc.connect(mGain);
          mGain.connect(this.musicGain);
          mOsc.start(now);
          mOsc.stop(now + 0.21);
        }

        this.stepIdx = (this.stepIdx + 1) % 16;
        return;
      }

      const scale = scales[this.activeLevel % scales.length];
      const bassFreq = scale[this.stepIdx % scale.length];

      // Warm sub-synth bass pulse
      const bOsc = this.ctx.createOscillator();
      const bFilt = this.ctx.createBiquadFilter();
      const bGain = this.ctx.createGain();
      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(bassFreq, now);
      bFilt.type = 'lowpass';
      bFilt.frequency.setValueAtTime(360, now);
      bFilt.frequency.exponentialRampToValueAtTime(130, now + 0.16);
      bGain.gain.setValueAtTime(0.24, now);
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
        aGain.gain.setValueAtTime(0.08, now);
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
      this.engineOscSub?.stop();
      this.engineOscFifth?.stop();
      this.engineOscTurbine?.stop();
      this.airNoise?.stop();
      this.weatherNoise?.stop();
      this.drainOsc?.stop();
      this.driftNoise?.stop();
      this.driftOsc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore cleanup errors
    }
    this.ctx = null;
  }
}
