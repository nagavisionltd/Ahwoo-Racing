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
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      <div className="flex justify-end">
        <div className="text-[9px] tracking-[0.22em] text-[#cbd8f6] bg-[#050712]/55 px-3 py-1 border border-white/12">
          AERIAL RECON · {def.name}
        </div>
      </div>

      <div className="bg-[#050712]/72 border border-[#f5c451]/45 p-4 max-w-[292px] w-full pointer-events-auto">
        <div className="text-[9px] tracking-[0.22em] text-[#00f0ff] font-bold mb-0.5">
          CIRCUIT RECON · 空中侦察
        </div>
        <h2 className="text-xl font-black tracking-[0.06em] text-white leading-none">
          {def.name}
        </h2>
        <div className="font-kanji text-[11px] tracking-[0.14em] text-[#f5c451] mt-1 mb-3">
          {def.cn} · {def.sub}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px] tracking-[0.12em] mb-3 tabular-nums">
          <div className="flex justify-between border-b border-white/10 pb-0.5">
            <span className="text-[#8ea2ca]">LEN</span>
            <b className="text-white">{s.lengthKm} KM</b>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-0.5">
            <span className="text-[#8ea2ca]">WIDTH</span>
            <b className="text-white">{s.widthM} M</b>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-0.5">
            <span className="text-[#8ea2ca]">JUMPS</span>
            <b className="text-white">{s.jumps}</b>
          </div>
          <div className="flex justify-between border-b border-white/10 pb-0.5">
            <span className="text-[#8ea2ca]">{def.isSprint ? 'MODE' : 'LAPS'}</span>
            <b className="text-white">{def.isSprint ? 'SPRINT' : hud.totalLaps}</b>
          </div>
          <div className="col-span-2 flex items-center justify-between border-b border-white/10 pb-0.5">
            <span className="text-[#8ea2ca]">WEATHER</span>
            <span className="inline-flex items-center gap-1.5">
              <WeatherIcon
                phaseId={hud.weather.phaseId}
                kind={hud.weather.kind}
                className="w-3.5 h-3.5 shrink-0"
              />
              <b className="text-[#f5c451]">{hud.weather.label}</b>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="nav-chip px-3 py-2 text-[10px] font-bold tracking-[0.16em] text-[#cfe0ff] cursor-pointer"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onLaunch}
            className="cta-btn flex-1 py-2 text-xs font-black tracking-[0.18em] cursor-pointer text-center"
          >
            LAUNCH ▶ ({hud.reconSecondsLeft}s)
          </button>
        </div>
      </div>
    </div>
  );
};
