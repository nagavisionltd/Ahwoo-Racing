import React from 'react';
import { LEVELS } from '../game/tracks';
import type { HudSnapshot } from '../game/types';
import { WeatherIcon } from './WeatherIcons';

interface ReconOverlayProps {
  levelIdx: number;
  hud: HudSnapshot;
  onLaunch: () => void;
  onBack: () => void;
}

export const ReconOverlay: React.FC<ReconOverlayProps> = ({
  levelIdx,
  hud,
  onLaunch,
  onBack
}) => {
  const def = LEVELS[levelIdx] || LEVELS[0];
  const s = hud.trackStats;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      <div className="flex justify-end">
        <div className="text-[10px] tracking-[0.24em] text-[#cbd8f6] bg-[#050712]/70 px-3 py-1.5 border border-white/15">
          AERIAL WIDE-ANGLE RECON · STUDY THE ROUTE
        </div>
      </div>

      <div className="lux-panel p-5 max-w-sm w-full pointer-events-auto">
        <div className="text-[9px] tracking-[0.26em] text-[#00f0ff] font-bold mb-1">
          CIRCUIT RECON // 空中侦察
        </div>
        <h2 className="text-2xl font-black tracking-[0.06em] text-white leading-none">
          {def.name}
        </h2>
        <div className="font-kanji text-xs tracking-[0.14em] text-[#f5c451] mt-1 mb-4">
          {def.cn} · {def.sub}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] tracking-[0.12em] mb-4 tabular-nums">
          <div className="flex justify-between border-b border-white/10 pb-1">
            <span className="text-[#8ea2ca]">LENGTH</span>
            <b className="text-white">{s.lengthKm} KM</b>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-1">
            <span className="text-[#8ea2ca]">WIDTH</span>
            <b className="text-white">{s.widthM} M</b>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-1">
            <span className="text-[#8ea2ca]">MIN RADIUS</span>
            <b className="text-white">{s.minRadiusM} M</b>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-1">
            <span className="text-[#8ea2ca]">JUMPS</span>
            <b className="text-white">{s.jumps}</b>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-1">
            <span className="text-[#8ea2ca]">LOOPS / ROLL</span>
            <b className="text-white">
              {s.loops} + {s.rolls}
            </b>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-1">
            <span className="text-[#8ea2ca]">LAPS</span>
            <b className="text-white">{hud.totalLaps}</b>
          </div>
          <div className="col-span-2 flex items-center justify-between border-b border-white/10 pb-1">
            <span className="text-[#8ea2ca]">ATMOSPHERE</span>
            <span className="inline-flex items-center gap-1.5">
              <WeatherIcon
                phaseId={hud.weather.phaseId}
                kind={hud.weather.kind}
                className="w-4 h-4 shrink-0"
              />
              <b className="text-[#f5c451]">{hud.weather.label}</b>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="nav-chip px-3.5 py-2.5 text-[10px] font-bold tracking-[0.16em] text-[#cfe0ff] cursor-pointer"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onLaunch}
            className="cta-btn flex-1 py-2.5 text-xs font-black tracking-[0.2em] cursor-pointer text-center"
          >
            LAUNCH RACE ▶
          </button>
        </div>

        <div className="text-center text-[9px] tracking-[0.22em] text-[#9eb2da] mt-2.5 tabular-nums">
          AUTO LAUNCH IN {hud.reconSecondsLeft}s
        </div>
      </div>
    </div>
  );
};
