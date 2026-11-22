import React from 'react';
import { LEVELS } from '../game/tracks';
import type { HudSnapshot } from '../game/types';
import { SHIP_PROFILES } from '../game/vehicles';
import { formatRaceTime } from './RaceHud';

interface ResultsModalProps {
  levelIdx: number;
  shipId: number;
  hud: HudSnapshot;
  onRaceAgain: () => void;
  onChangeCircuit: () => void;
  onGarage: () => void;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  levelIdx,
  shipId,
  hud,
  onRaceAgain,
  onChangeCircuit,
  onGarage
}) => {
  const lvl = LEVELS[levelIdx] || LEVELS[0];
  const ship = SHIP_PROFILES[shipId] || SHIP_PROFILES[0];
  const won = hud.rank === 1;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-[#050712]/86">
      <div className="lux-panel p-8 max-w-xl w-full text-center">
        <div className="font-kanji text-xs tracking-[0.34em] text-[#f5c451] font-bold mb-2">
          挑战达成 // {won ? 'GRAND PRIX CHAMPION' : 'CIRCUIT COMPLETE'}
        </div>

        <h1
          className="text-4xl md:text-6xl font-black italic tracking-[0.06em] text-white mb-2"
          style={{
            textShadow: '0 0 22px rgba(0, 240, 255, 0.7), 4px 4px 0 #f5c451'
          }}
        >
          FINISH · P{hud.rank}
        </h1>

        <p className="text-xs tracking-[0.18em] text-[#b9c8e8] mb-6">
          {lvl.name} · {ship.name}
        </p>

        <div className="grid grid-cols-3 gap-3 mb-7 tabular-nums">
          <div className="bg-black/45 border border-white/10 p-3">
            <div className="text-[9px] tracking-[0.2em] text-[#8ea2ca]">FINAL RANK</div>
            <div className="text-2xl font-black text-[#f5c451] mt-1">
              P{hud.rank} / {hud.totalRacers}
            </div>
          </div>
          <div className="bg-black/45 border border-white/10 p-3">
            <div className="text-[9px] tracking-[0.2em] text-[#8ea2ca]">TOTAL TIME</div>
            <div className="text-2xl font-black text-white mt-1">
              {formatRaceTime(hud.timeSec)}
            </div>
          </div>
          <div className="bg-black/45 border border-white/10 p-3">
            <div className="text-[9px] tracking-[0.2em] text-[#8ea2ca]">BEST LAP</div>
            <div className="text-2xl font-black text-[#00f0ff] mt-1">
              {hud.bestLapSec !== null ? formatRaceTime(hud.bestLapSec) : '--:--'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onGarage}
            className="nav-chip px-5 py-3 text-xs font-bold tracking-[0.18em] text-[#cfe0ff] cursor-pointer"
          >
            HOVER GARAGE
          </button>
          <button
            type="button"
            onClick={onChangeCircuit}
            className="nav-chip px-5 py-3 text-xs font-bold tracking-[0.18em] text-[#cfe0ff] cursor-pointer"
          >
            CHANGE CIRCUIT
          </button>
          <button
            type="button"
            onClick={onRaceAgain}
            className="cta-btn px-8 py-3 text-xs font-black tracking-[0.2em] cursor-pointer"
          >
            RACE AGAIN ▶
          </button>
        </div>
      </div>
    </div>
  );
};
