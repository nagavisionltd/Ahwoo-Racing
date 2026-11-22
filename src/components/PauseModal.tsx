import React from 'react';
import { Camera, Radio } from 'lucide-react';

interface PauseModalProps {
  replayShot: string;
  onCutCamera: () => void;
  onToggleRadio: () => void;
  onResume: () => void;
  onRestart: () => void;
  onGarage: () => void;
  onCircuits: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  replayShot,
  onCutCamera,
  onToggleRadio,
  onResume,
  onRestart,
  onGarage,
  onCircuits
}) => {
  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex flex-col justify-between p-4 md:p-6 bg-gradient-to-t from-[#050712]/88 via-transparent to-[#050712]/40">
      {/* Top Perimeter: Minimal Pause & Live Replay Camera Indicator */}
      <div className="flex items-start justify-between gap-4">
        <div className="bg-[#050712]/72 border border-[#f5c451]/50 px-3.5 py-2 pointer-events-auto">
          <div className="text-[9px] tracking-[0.24em] text-[#f5c451] font-bold">
            TELEMETRY PAUSED · 暂停
          </div>
          <div className="text-lg md:text-xl font-black tracking-[0.14em] text-white leading-tight">
            CINEMATIC PAUSE
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onCutCamera}
            title="Switch Replay Camera Angle (C)"
            className="nav-chip px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-[#00f0ff] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 shrink-0" />
            <span>{replayShot}</span>
            <span className="text-white/60">[C]</span>
          </button>
          <button
            type="button"
            onClick={onToggleRadio}
            title="Spotify Radio Hub (R)"
            className="nav-chip px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-[#1ed760] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span>RADIO [R]</span>
          </button>
        </div>
      </div>

      {/* Center 80% viewport stays 100% clear to showcase the sweeping & close-up replay cuts */}

      {/* Bottom Dock: Slim horizontal action bar */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 pointer-events-auto pb-1">
        <button
          type="button"
          onClick={onResume}
          className="cta-btn px-7 py-2.5 text-xs font-black tracking-[0.2em] whitespace-nowrap shrink-0 cursor-pointer"
        >
          RESUME RACE [ESC]
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="nav-chip px-4 py-2.5 text-[11px] font-bold tracking-[0.16em] text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          RESTART
        </button>
        <button
          type="button"
          onClick={onCircuits}
          className="nav-chip px-4 py-2.5 text-[11px] font-bold tracking-[0.16em] text-[#cfe0ff] whitespace-nowrap shrink-0 cursor-pointer"
        >
          CIRCUITS
        </button>
        <button
          type="button"
          onClick={onGarage}
          className="nav-chip px-4 py-2.5 text-[11px] font-bold tracking-[0.16em] text-[#cfe0ff] whitespace-nowrap shrink-0 cursor-pointer"
        >
          GARAGE
        </button>
      </div>
    </div>
  );
};
