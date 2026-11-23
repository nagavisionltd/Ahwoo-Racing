import React from 'react';
import { Camera, Trophy } from 'lucide-react';
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
  onNextGpRound: () => void;
  onChangeCircuit: () => void;
  onGarage: () => void;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  levelIdx,
  shipId,
  hud,
  onCutCamera,
  onRaceAgain,
  onNextGpRound,
  onChangeCircuit,
  onGarage
}) => {
  const lvl = LEVELS[levelIdx] || LEVELS[0];
  const ship = SHIP_PROFILES[shipId] || SHIP_PROFILES[0];
  const won = hud.rank === 1;
  const gp = hud.grandPrix;
  const isGp = gp.active;
  const gpLeader = gp.standings[0];
  const gpPlayerWon = gp.completed && gpLeader?.isPlayer;

  return (
    <div className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 md:p-6 bg-gradient-to-t from-[#050712]/90 via-transparent to-[#050712]/40">
      {/* Top Perimeter: Finish Title + Victory Lap Status + Live Replay Angle Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="bg-[#050712]/76 border border-[#f5c451]/55 px-4 py-2.5">
          <div className="font-kanji text-[10px] tracking-[0.28em] text-[#f5c451] font-bold">
            {isGp
              ? gp.completed
                ? gpPlayerWon
                  ? '大奖赛总冠军 · GRAND PRIX CHAMPION'
                  : '大奖赛收官 · GRAND PRIX COMPLETE'
                : `大奖赛第 ${gp.roundIdx + 1}/${gp.totalRounds} 轮 · GRAND PRIX ROUND ${gp.roundIdx + 1}`
              : `挑战达成 · ${won ? 'CIRCUIT VICTORY' : 'CIRCUIT COMPLETE'}`}
          </div>
          <h1
            className="text-3xl md:text-4xl font-black italic tracking-[0.06em] text-white leading-tight"
            style={{
              textShadow: '0 0 18px rgba(0, 240, 255, 0.55), 3px 3px 0 #f5c451'
            }}
          >
            FINISH · P{hud.rank}
          </h1>
          <div className="text-[10px] tracking-[0.18em] text-[#b9c8e8] flex flex-wrap items-center gap-2">
            <span>
              {lvl.name} · {ship.name}
            </span>
            {hud.ghost.isNewBestTime && (
              <span className="bg-[#36f5d8] text-[#050712] px-1.5 py-0.5 text-[8px] font-black tracking-[0.16em]">
                NEW BEST TIME
              </span>
            )}
            {hud.ghost.isNewBestTakedowns && (
              <span className="bg-[#ff2e93] text-white px-1.5 py-0.5 text-[8px] font-black tracking-[0.16em]">
                NEW KO RECORD
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
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

          {hud.victoryLapActive && (
            <div className="bg-[#050712]/80 border border-[#f5c451] px-3 py-1 text-[9px] font-black tracking-[0.22em] text-[#f5c451]">
              VICTORY LAP · SLOW-MO ROLL
            </div>
          )}
        </div>
      </div>

      {/* Center viewport stays completely unobstructed for the post-race cinematic Victory Lap Barrel Roll */}

      {/* Bottom Dock: Optional Grand Prix Standings + Stats Strip + Action Controls */}
      <div className="max-w-6xl w-full mx-auto flex flex-col gap-2.5 pointer-events-auto pb-1">
        {isGp && gp.standings.length > 0 && (
          <div className="bg-[#050712]/84 border border-[#f5c451]/45 px-3 py-2">
            <div className="flex items-center justify-between text-[9px] font-black tracking-[0.18em] text-[#f5c451] mb-1.5">
              <span className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                <span>
                  CHAMPIONSHIP STANDINGS · ROUND {gp.roundIdx + 1}/{gp.totalRounds}
                </span>
              </span>
              <span className="text-[#9be8ff]">
                {gp.completed ? 'FINAL CLASSIFICATION' : `NEXT: ${LEVELS[gp.roundIdx + 1]?.name ?? 'FINALE'}`}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 tabular-nums">
              {gp.standings.map((entry, idx) => (
                <div
                  key={`${entry.id}-${entry.racerId}`}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 border text-[10px] ${
                    entry.isPlayer
                      ? 'bg-[#f5c451]/15 border-[#f5c451]/70 text-white font-black'
                      : 'bg-black/40 border-white/10 text-[#cbd8f6]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[#f5c451] font-black">{idx + 1}.</span>
                    <span className="w-1.5 h-3 shrink-0" style={{ backgroundColor: entry.colorHex }} />
                    <span className="font-mono text-[#9be8ff] shrink-0">{entry.racerId}</span>
                    <span className="truncate text-[9px]">{entry.teamName}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-black text-white">{entry.points}</span>
                    <span className="text-[8px] text-[#00f0ff] ml-1">(+{entry.lastRoundPoints})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
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
                {hud.ghost.bestTimeSec !== null ? 'CIRCUIT BEST' : lvl.isSprint ? 'MODE' : 'BEST LAP'}
              </div>
              <div className="text-base md:text-lg font-black text-[#00f0ff]">
                {hud.ghost.bestTimeSec !== null
                  ? formatRaceTime(hud.ghost.bestTimeSec)
                  : lvl.isSprint
                    ? 'SPRINT'
                    : hud.bestLapSec !== null
                      ? formatRaceTime(hud.bestLapSec)
                      : '--:--'}
              </div>
            </div>
            <div className="bg-[#050712]/78 border border-white/15 px-3 py-2 text-center">
              <div className="text-[8px] tracking-[0.18em] text-[#8ea2ca]">DRIFT / KO</div>
              <div className="text-base md:text-lg font-black text-[#ff4d94]">
                {hud.drift.totalScore.toLocaleString()}
                <span className="text-xs text-[#f5c451] ml-1.5">/{hud.takedowns}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 shrink-0 pr-24 md:pr-28">
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
            {isGp ? (
              <button
                type="button"
                onClick={onNextGpRound}
                className="cta-btn px-6 py-2.5 text-xs font-black tracking-[0.2em] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {gp.completed ? 'NEW GRAND PRIX ▶' : `NEXT ROUND (${gp.roundIdx + 2}/${gp.totalRounds}) ▶`}
              </button>
            ) : (
              <button
                type="button"
                onClick={onRaceAgain}
                className="cta-btn px-6 py-2.5 text-xs font-black tracking-[0.2em] whitespace-nowrap shrink-0 cursor-pointer"
              >
                RACE AGAIN ▶
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
