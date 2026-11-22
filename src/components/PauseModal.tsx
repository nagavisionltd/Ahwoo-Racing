import React from 'react';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onGarage: () => void;
  onCircuits: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onGarage,
  onCircuits
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-[#050712]/80">
      <div className="lux-panel p-7 max-w-md w-full text-center">
        <div className="text-[10px] tracking-[0.3em] text-[#f5c451] font-bold mb-1">
          TELEMETRY PAUSED // 暂停
        </div>
        <h2 className="text-3xl font-black tracking-[0.12em] text-white mb-6">
          RACE PAUSED
        </h2>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="cta-btn py-3 text-sm font-black tracking-[0.2em] cursor-pointer"
          >
            RESUME RACE [ESC]
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="nav-chip py-2.5 text-xs font-bold tracking-[0.18em] text-white cursor-pointer"
          >
            RESTART CIRCUIT
          </button>
          <button
            type="button"
            onClick={onCircuits}
            className="nav-chip py-2.5 text-xs font-bold tracking-[0.18em] text-[#cfe0ff] cursor-pointer"
          >
            CHANGE CIRCUIT
          </button>
          <button
            type="button"
            onClick={onGarage}
            className="nav-chip py-2.5 text-xs font-bold tracking-[0.18em] text-[#cfe0ff] cursor-pointer"
          >
            HOVER GARAGE
          </button>
        </div>
      </div>
    </div>
  );
};
