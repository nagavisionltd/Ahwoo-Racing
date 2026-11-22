import React from 'react';
import { LEVELS } from '../game/tracks';
import { IonStormIcon, NeonRainIcon, SolarFlareIcon } from './WeatherIcons';

interface CircuitSelectProps {
  selectedLevel: number;
  previewLevelIdx: number;
  onPreviewLevel: (idx: number) => void;
  onSelectLevel: (idx: number) => void;
  onCommitLevel: (idx: number) => void;
  onBack: () => void;
}

export const CircuitSelect: React.FC<CircuitSelectProps> = ({
  selectedLevel,
  previewLevelIdx,
  onPreviewLevel,
  onSelectLevel,
  onCommitLevel,
  onBack
}) => {
  const activeDef = LEVELS[previewLevelIdx] || LEVELS[0];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-4 md:p-5 pointer-events-none bg-gradient-to-t from-[#050712]/80 via-transparent to-[#050712]/35">
      {/* Top Bar */}
      <div className="max-w-7xl w-full mx-auto flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2.5">
          <span className="px-2 py-0.5 border border-[#00f0ff] text-[#00f0ff] text-[10px] font-black tracking-[0.2em]">
            02
          </span>
          <div>
            <div className="text-xs md:text-sm font-black tracking-[0.2em] text-white">
              SELECT CIRCUIT
            </div>
            <div className="font-kanji text-[9px] tracking-[0.16em] text-[#f5c451]">
              选择赛道 · HOVER TO LIVE SCOUT
            </div>
          </div>
        </div>
        <div className="bg-[#050712]/65 border border-[#00f0ff]/40 px-3 py-1 text-[9px] tracking-[0.16em] text-[#9fdfff]">
          SCOUT · <b className="text-white">{activeDef.name}</b>
        </div>
      </div>

      {/* Bottom Dock leaving center 3D aerial view unobstructed */}
      <div className="max-w-7xl w-full mx-auto flex flex-col gap-2.5 pointer-events-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {LEVELS.map((lvl, idx) => {
            const isSelected = idx === selectedLevel;
            const isPreviewing = idx === previewLevelIdx;
            const accentHex = '#' + lvl.theme.accent.toString(16).padStart(6, '0');
            return (
              <button
                key={lvl.id}
                type="button"
                onMouseEnter={() => onPreviewLevel(idx)}
                onFocus={() => onPreviewLevel(idx)}
                onClick={() => {
                  if (isSelected && isPreviewing) {
                    onCommitLevel(idx);
                  } else {
                    onSelectLevel(idx);
                  }
                }}
                className={`text-left p-3 cursor-pointer transition-all duration-150 border ${
                  isSelected
                    ? 'bg-[#0b132a]/85 border-[#f5c451] shadow-[0_0_20px_rgba(245,196,81,0.24)]'
                    : isPreviewing
                      ? 'bg-[#081024]/82 border-[#00f0ff]'
                      : 'bg-[#060a18]/78 border-white/15 hover:border-white/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xl font-black italic text-white">{lvl.num}</span>
                  <span
                    className="text-[8px] font-black tracking-[0.18em] px-1.5 py-0.5 text-[#050712]"
                    style={{ backgroundColor: accentHex }}
                  >
                    {lvl.badge}
                  </span>
                </div>
                <div className="text-xs font-black tracking-[0.08em] text-white">
                  {lvl.name}
                </div>
                <div className="font-kanji text-[9px] tracking-[0.12em] text-[#f5c451] mb-1.5">
                  {lvl.cn}
                </div>
                <p className="text-[9px] leading-snug text-[#b7c6e4] mb-2 line-clamp-2">
                  {lvl.desc}
                </p>
                <div className="flex flex-wrap gap-1 text-[8px] tracking-[0.12em] text-[#9eeeff]">
                  <span className="border border-white/15 px-1.5 py-0.5">
                    {lvl.isSprint ? 'SPRINT' : '3 LAPS'}
                  </span>
                  <span className="border border-white/15 px-1.5 py-0.5">
                    {Math.round(lvl.hw * 2)}M
                  </span>
                  <span className="border border-[#f5c451]/45 text-[#f5c451] px-1.5 py-0.5 inline-flex items-center gap-1">
                    {lvl.id === 'neon' ? (
                      <NeonRainIcon className="w-3 h-3 shrink-0" electric />
                    ) : lvl.id === 'beach' || lvl.id === 'space_beach' ? (
                      <IonStormIcon className="w-3 h-3 shrink-0" mistPalette />
                    ) : (
                      <SolarFlareIcon className="w-3 h-3 shrink-0" />
                    )}
                    <span>{lvl.weatherBadge}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-0.5 pr-28">
          <button
            type="button"
            onClick={onBack}
            className="nav-chip px-4 py-2 text-[10px] font-bold tracking-[0.16em] text-[#cfe0ff] cursor-pointer"
          >
            ◀ GARAGE
          </button>
          <button
            type="button"
            onClick={() => onCommitLevel(selectedLevel)}
            className="cta-btn px-7 py-2.5 text-xs font-black tracking-[0.2em] cursor-pointer"
          >
            AERIAL RECON ▶
          </button>
        </div>
      </div>
    </div>
  );
};
