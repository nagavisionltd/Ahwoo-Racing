/* Minimal Race Start Voice Cue:
   - Speaks a crisp "Race start!" cue via Web Speech Synthesis at grid launch.
   - Mid-race continuous commentary is disabled to keep audio & HUD uncluttered. */

import type { SoundEngine } from './audio';
import type { AnnouncerEventKind, AnnouncerSnapshot } from './types';

export interface AnnouncerContext {
  circuit?: string;
  targetTeam?: string;
  racerId?: string;
  rank?: number;
  pts?: number;
  tier?: number;
  weatherLabel?: string;
  driftTotal?: number;
}

export class RaceAnnouncer {
  private audio: SoundEngine;
  private enabled = true;
  private speaking = false;
  private cachedVoice: SpeechSynthesisVoice | null = null;
  private onSnapshotChange?: () => void;

  constructor(audio: SoundEngine, onSnapshotChange?: () => void) {
    this.audio = audio;
    this.onSnapshotChange = onSnapshotChange;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.pickVoice();
      window.speechSynthesis.addEventListener('voiceschanged', this.onVoicesChanged);
    }
  }

  private onVoicesChanged = (): void => {
    this.pickVoice();
  };

  private pickVoice(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;

    const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    const pool = english.length > 0 ? english : voices;
    const preferred =
      pool.find((v) => /google us english|google uk english male|daniel|aaron|alex|natural|enhanced/i.test(v.name)) ||
      pool.find((v) => v.default) ||
      pool[0];

    this.cachedVoice = preferred || null;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) this.stop();
    this.onSnapshotChange?.();
  }

  public toggleEnabled(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore cancel errors
      }
    }
    this.speaking = false;
  }

  public resetRaceCooldowns(): void {
    this.stop();
  }

  public update(_dt: number): void {
    // No ongoing mid-race commentary timers needed
  }

  public trigger(kind: AnnouncerEventKind, _ctx: AnnouncerContext = {}): void {
    if (!this.enabled || kind !== 'race_start') return;
    this.speakStartCue('Race start!');
  }

  private speakStartCue(text: string): void {
    if (this.audio.isMuted()) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      const synth = window.speechSynthesis;
      synth.cancel();

      const utt = new SpeechSynthesisUtterance(text);
      if (this.cachedVoice) utt.voice = this.cachedVoice;
      utt.rate = 1.08;
      utt.pitch = 1.02;
      utt.volume = 0.9;
      this.speaking = true;

      utt.onend = () => {
        this.speaking = false;
      };
      utt.onerror = () => {
        this.speaking = false;
      };

      synth.speak(utt);
    } catch {
      this.speaking = false;
    }
  }

  public getSnapshot(): AnnouncerSnapshot {
    return {
      enabled: this.enabled,
      speaking: this.speaking,
      caption: '',
      tag: 'RACE START',
      urgency: 'hype'
    };
  }

  public dispose(): void {
    this.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.removeEventListener('voiceschanged', this.onVoicesChanged);
    }
  }
}
