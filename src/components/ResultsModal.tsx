import React from 'react';
import { Camera } from 'lucide-react';
import { LEVELS } from '../game/tracks';
import type { HudSnapshot } from '../game/types';
import { SHIP_PROFILES } from '../game/vehicles';
import { formatRaceTime } from './RaceHud';

interface ResultsModalProps {
  levelIdx: number;
  shipId: number;
  hud: HudSnapshot;
  onCutCamera: () => void;
  onRaceAgain: () => void;
  onChangeCircuit: () => void;
  onGarage: () => void;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  levelIdx,
  shipId,
  hud,
  onCutCamera,
  onRaceAgain,
  onChangeCircuit,
  onGarage
}) => {
  const lvl = LEVELS[levelIdx] || LEVELS[0];
  const ship = SHIP_PROFILES[shipId] || SHIP_PROFILES[0];
  const won = hud.rank === 1;

  return (
    <div className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 md:p-6 bg-gradient-to-t from-[#050712]/90 via-transparent to-[#050712]/40">
      {/* Top Perimeter: Finish Title + Live Replay Angle Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="bg-[#050712]/72 border border-[#f5c451]/55 px-4 py-2.5">
          <div className="font-kanji text-[10px] tracking-[0.28em] text-[#f5c451] font-bold">
            挑战达成 · {won ? 'GRAND PRIX CHAMPION' : 'CIRCUIT COMPLETE'}
          </div>
          <h1
            className="text-3xl md:text-4xl font-black italic tracking-[0.06em] text-white leading-tight"
            style={{
              textShadow: '0 0 18px rgba(0, 240, 255, 0.55), 3px 3px 0 #f5c451'
            }}
          >
            FINISH · P{hud.rank}
          </h1>
          <div className="text-[10px] tracking-[0.18em] text-[#b9c8e8]">
            {lvl.name} · {ship.name}
          </div>
        </div>

        <button
          type="button"
          onClick={onCutCamera}
          title="Switch Replay Camera Angle (C)"
          className="pointer-events-auto nav-chip px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-[#00f0ff] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5 shrink-0" />
          <span>REPLAY · {hud.replayShot}</span>
          <span className="text-white/60">[C]</span>
        </button>
      </div>

      {/* Center viewport stays completely unobstructed for the post-race cinematic replay */}

      {/* Bottom Dock: Compact Stats Strip + Action Controls */}
      <div className="max-w-5xl w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-3 pointer-events-auto pb-1">
        <div className="grid grid-cols-4 gap-2 w-full md:w-auto tabular-nums">
          <div className="bg-[#050712]/78 border border-white/15 px-3 py-2 text-center">
            <div className="text-[8px] tracking-[0.18em] text-[#8ea2ca]">RANK</div>
            <div className="text-base md:text-lg font-black text-[#f5c451]">
              P{hud.rank}/{hud.totalRacers}
            </div>
          </div>
          <div className="bg-[#050712]/78 border border-white/15 px-3 py-2 text-center">
            <div className="text-[8px] tracking-[0.18em] text-[#8ea2ca]">TIME</div>
            <div className="text-base md:text-lg font-black text-white">
              {formatRaceTime(hud.timeSec)}
            </div>
          </div>
          <div className="bg-[#050712]/78 border border-white/15 px-3 py-2 text-center">
            <div className="text-[8px] tracking-[0.18em] text-[#8ea2ca]">
              {lvl.isSprint ? 'MODE' : 'BEST LAP'}
            </div>
            <div className="text-base md:text-lg font-black text-[#00f0ff]">
              {lvl.isSprint ? 'SPRINT' : hud.bestLapSec !== null ? formatRaceTime(hud.bestLapSec) : '--:--'}
            </div>
          </div>
          <div className="bg-[#050712]/78 border border-white/15 px-3 py-2 text-center">
            <div className="text-[8px] tracking-[0.18em] text-[#8ea2ca]">DRIFT</div>
            <div className="text-base md:text-lg font-black text-[#ff4d94]">
              {hud.drift.totalScore.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onGarage}
            className="nav-chip px-4 py-2.5 text-[11px] font-bold tracking-[0.16em] text-[#cfe0ff] whitespace-nowrap shrink-0 cursor-pointer"
          >
            GARAGE
          </button>
          <button
            type="button"
            onClick={onChangeCircuit}
            className="nav-chip px-4 py-2.5 text-[11px] font-bold tracking-[0.16em] text-[#cfe0ff] whitespace-nowrap shrink-0 cursor-pointer"
          >
            CIRCUITS
          </button>
          <button
            type="button"
            onClick={onRaceAgain}
            className="cta-btn px-6 py-2.5 text-xs font-black tracking-[0.2em] whitespace-nowrap shrink-0 cursor-pointer"
          >
            RACE AGAIN ▶
          </button>
        </div>
      </div>
    </div>
  );
};
