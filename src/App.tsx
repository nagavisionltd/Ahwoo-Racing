import { useCallback, useEffect, useRef, useState } from 'react';
import { CircuitSelect } from './components/CircuitSelect';
import { CountdownOverlay } from './components/CountdownOverlay';
import { GarageSelect } from './components/GarageSelect';
import { PauseModal } from './components/PauseModal';
import { RaceHud } from './components/RaceHud';
import { ReconOverlay } from './components/ReconOverlay';
import { ResultsModal } from './components/ResultsModal';
import { TitleScreen } from './components/TitleScreen';
import { AhwooEngine } from './game/engine';
import type { GameStep, HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  speedKmh: 0,
  speedNorm: 0,
  energy: 1,
  lap: 1,
  totalLaps: 3,
  rank: 1,
  totalRacers: 4,
  standings: [],
  timeSec: 0,
  bestLapSec: null,
  isBoosting: false,
  isAirborne: false,
  muted: false,
  countdownText: '3',
  splitText: '',
  splitActive: false,
  reconSecondsLeft: 6,
  weather: {
    phaseId: 'neon_downpour',
    label: 'NEON DOWNPOUR',
    cn: '霓虹暴雨',
    kind: 'rain',
    intensity: 0.94,
    lightningFlash: 0,
    solarPulse: 0,
    hazardTag: 'HAZARD: FLOATING DEBRIS'
  },
  hazardAlert: {
    active: false,
    label: '',
    kind: 'debris'
  },
  trackStats: {
    lengthKm: '11.8',
    widthM: 280,
    minRadiusM: 280,
    jumps: 3,
    loops: 2,
    rolls: 1,
    obstacles: 18
  }
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AhwooEngine | null>(null);

  const [step, setStep] = useState<GameStep>('home');
  const [selectedShipId, setSelectedShipId] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [previewLevelIdx, setPreviewLevelIdx] = useState(0);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new AhwooEngine(mount, {
      onStepChange: (nextStep) => setStep(nextStep),
      onHudUpdate: (snapshot) => setHud(snapshot),
      onShipChange: (id) => setSelectedShipId(id),
      onLevelChange: (sel, prev) => {
        setSelectedLevel(sel);
        setPreviewLevelIdx(prev);
      }
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleAttachTurntable = useCallback((canvas: HTMLCanvasElement | null) => {
    engineRef.current?.attachTurntable(canvas);
  }, []);

  const handleToggleMute = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.audio.unlock();
    const muted = eng.audio.toggleMute();
    setHud((prev) => ({ ...prev, muted }));
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#050712]">
      {/* Isolated WebGL canvas mount — React state updates never re-create or tear down the canvas */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {step === 'home' && (
        <TitleScreen
          onStart={() => {
            engineRef.current?.audio.playUiClick();
            engineRef.current?.setStep('driver');
          }}
          muted={hud.muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {step === 'driver' && (
        <GarageSelect
          selectedShipId={selectedShipId}
          onSelectShip={(id) => engineRef.current?.selectShip(id)}
          onAttachTurntable={handleAttachTurntable}
          onBack={() => {
            engineRef.current?.audio.playUiClick();
            engineRef.current?.setStep('home');
          }}
          onNext={() => {
            engineRef.current?.audio.playUiClick();
            engineRef.current?.setStep('level');
          }}
        />
      )}

      {step === 'level' && (
        <CircuitSelect
          selectedLevel={selectedLevel}
          previewLevelIdx={previewLevelIdx}
          onPreviewLevel={(idx) => engineRef.current?.previewLevel(idx)}
          onSelectLevel={(idx) => engineRef.current?.selectLevelOnly(idx)}
          onCommitLevel={(idx) => engineRef.current?.commitLevel(idx)}
          onBack={() => {
            engineRef.current?.audio.playUiClick();
            engineRef.current?.setStep('driver');
          }}
        />
      )}

      {step === 'preview' && (
        <ReconOverlay
          levelIdx={previewLevelIdx}
          hud={hud}
          onLaunch={() => engineRef.current?.startCountdown()}
          onBack={() => {
            engineRef.current?.audio.playUiClick();
            engineRef.current?.setStep('level');
          }}
        />
      )}

      {(step === 'race' || step === 'countdown' || step === 'paused') && (
        <RaceHud
          levelIdx={previewLevelIdx}
          hud={hud}
          onToggleMute={handleToggleMute}
          onCycleWeather={() => engineRef.current?.cycleWeather()}
          onPause={() => engineRef.current?.pauseRace()}
        />
      )}

      {step === 'countdown' && <CountdownOverlay text={hud.countdownText} />}

      {step === 'paused' && (
        <PauseModal
          onResume={() => engineRef.current?.resumeRace()}
          onRestart={() => engineRef.current?.restartRace()}
          onCircuits={() => engineRef.current?.setStep('level')}
          onGarage={() => engineRef.current?.setStep('driver')}
        />
      )}

      {step === 'results' && (
        <ResultsModal
          levelIdx={previewLevelIdx}
          shipId={selectedShipId}
          hud={hud}
          onRaceAgain={() => engineRef.current?.startCountdown()}
          onChangeCircuit={() => engineRef.current?.setStep('level')}
          onGarage={() => engineRef.current?.setStep('driver')}
        />
      )}
    </div>
  );
}
