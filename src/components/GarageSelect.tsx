import React, { useEffect, useRef, useState } from 'react';
import type { VehicleCustomization } from '../game/types';
import {
  getDefaultCustomization,
  getNeonPreset,
  getPaintPreset,
  getRimStylePreset,
  NEON_PRESETS,
  PAINT_PRESETS,
  RIM_STYLE_PRESETS,
  SHIP_PROFILES
} from '../game/vehicles';

interface GarageSelectProps {
  selectedShipId: number;
  customization: VehicleCustomization;
  onSelectShip: (id: number) => void;
  onChangeCustomization: (patch: Partial<VehicleCustomization>) => void;
  onAttachTurntable: (canvas: HTMLCanvasElement | null) => void;
  onBack: () => void;
  onNext: () => void;
}

export const GarageSelect: React.FC<GarageSelectProps> = ({
  selectedShipId,
  customization,
  onSelectShip,
  onChangeCustomization,
  onAttachTurntable,
  onBack,
  onNext
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showConceptSheet, setShowConceptSheet] = useState(false);

  useEffect(() => {
    onAttachTurntable(canvasRef.current);
    return () => onAttachTurntable(null);
  }, [onAttachTurntable]);

  const prof = SHIP_PROFILES[selectedShipId] || SHIP_PROFILES[0];
  const activePaint = getPaintPreset(customization.paintId);
  const activeNeon = getNeonPreset(customization.neonId);
  const activeRim = getRimStylePreset(customization.rimId);

  const stats: [string, number][] = [
    ['TOP SPEED', prof.spd],
    ['ACCEL', prof.acc],
    ['HANDLING', prof.hnd],
    ['OVERDRIVE', prof.bst]
  ];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-4 md:p-7 bg-[#050712]/82 overflow-y-auto">
      {/* Header */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 border border-[#f5c451] text-[#f5c451] text-[11px] font-black tracking-[0.2em]">
            01
          </span>
          <div>
            <div className="text-sm md:text-base font-black tracking-[0.2em] text-white">
              HOVER LUXURY SHOWROOM
            </div>
            <div className="font-kanji text-[10px] tracking-[0.18em] text-[#f5c451]">
              选择奢华悬浮超跑 · DRAG TURNTABLE TO INSPECT 360°
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowConceptSheet((v) => !v)}
          className="nav-chip px-3.5 py-1.5 text-[10px] font-bold tracking-[0.18em] text-[#f5c451] cursor-pointer"
        >
          {showConceptSheet ? 'VIEW 3D TURNTABLE' : 'CONCEPT BLUEPRINT'}
        </button>
      </div>

      {/* Main Split */}
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 my-auto py-3 items-stretch">
        {/* Left: Interactive 360 Turntable Stage */}
        <div className="lg:col-span-6 lux-panel p-4 flex flex-col justify-between relative min-h-[340px]">
          <div className="flex items-center justify-between text-[10px] tracking-[0.22em]">
            <span className="text-[#f5c451] font-bold">
              {showConceptSheet ? 'TURNTABLE DESIGN SHEET' : '360° LIVE CHASSIS TURNTABLE'}
            </span>
            <span className="text-[#9eb2da]">{prof.pilotName}</span>
          </div>

          <div className="relative flex-1 flex items-center justify-center my-2 min-h-[220px]">
            <canvas
              ref={canvasRef}
              className={`w-full h-[250px] md:h-[290px] cursor-grab active:cursor-grabbing ${
                showConceptSheet ? 'hidden' : 'block'
              }`}
            />
            {showConceptSheet && (
              <div className="grid grid-cols-2 gap-2 w-full">
                <img
                  src="/assets/aistudio/Futuristic_vehicle_turntable_vie__84c125c5_2K_3c72f496.jpg"
                  alt="Ahwoo Luxury Hover Coupe Turntable Front & Rear"
                  className="w-full h-44 md:h-52 object-cover border border-[#f5c451]/40"
                />
                <img
                  src="/assets/aistudio/Futuristic_vehicle_turntable_vie__a65913aa_2K_c43f67a8.jpg"
                  alt="Ahwoo Luxury Hover Coupe Turntable Angles"
                  className="w-full h-44 md:h-52 object-cover border border-[#f5c451]/40"
                />
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-3 relative">
            <div className="font-kanji absolute right-1 top-2 text-3xl font-black text-white/10">
              {prof.kanji}
            </div>
            <div className="text-lg md:text-2xl font-black tracking-[0.06em] text-white">
              {prof.name}
            </div>
            <div className="text-[10px] tracking-[0.18em] mb-3" style={{ color: activeNeon.hex }}>
              {activePaint.name} · {activeNeon.name} · {activeRim.name}
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2">
              {stats.map(([label, val]) => (
                <div key={label} className="flex items-center gap-2 text-[9px] tracking-[0.14em]">
                  <span className="w-20 text-[#9cb0d8]">{label}</span>
                  <div className="flex-1 h-1.5 bg-white/10 overflow-hidden">
                    <div
                      className="h-full transition-all duration-200"
                      style={{
                        width: `${Math.min(100, Math.round(val * 76))}%`,
                        backgroundColor: activeNeon.hex
                      }}
                    />
                  </div>
                  <span className="tabular-nums text-white font-bold w-7 text-right">
                    {Math.round(val * 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Vehicle Selector Cards + Bespoke Customization Workshop */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {SHIP_PROFILES.map((item) => {
              const active = item.id === selectedShipId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectShip(item.id)}
                  className={`text-left p-3 cursor-pointer transition-all duration-150 border ${
                    active
                      ? 'bg-[#121a34]/95 border-[#f5c451] shadow-[0_0_24px_rgba(245,196,81,0.28)]'
                      : 'bg-[#080d1d]/88 border-white/15 hover:border-white/40'
                  }`}
                  style={{
                    borderColor: active ? item.hex : undefined
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-kanji text-sm font-black text-white">
                      {item.kanji}
                    </span>
                    <span
                      className="text-[9px] font-bold tracking-[0.16em] px-2 py-0.5 tabular-nums"
                      style={{
                        backgroundColor: `${item.hex}24`,
                        color: item.hex
                      }}
                    >
                      CLASS {item.id + 1}
                    </span>
                  </div>
                  <div className="text-xs font-black tracking-[0.08em] text-white mb-0.5">
                    {item.name}
                  </div>
                  <div className="text-[9px] tracking-[0.12em] text-[#9eb2da] mb-2">
                    {item.subtitle}
                  </div>
                  <div className="space-y-1 text-[9px] tracking-[0.1em]">
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-[#8ea2ca]">SPD</span>
                      <div className="flex-1 h-1 bg-white/10">
                        <div
                          className="h-full"
                          style={{ width: `${Math.min(100, item.spd * 76)}%`, background: item.hex }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-[#8ea2ca]">HND</span>
                      <div className="flex-1 h-1 bg-white/10">
                        <div
                          className="h-full"
                          style={{ width: `${Math.min(100, item.hnd * 76)}%`, background: item.hex }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-[#8ea2ca]">BST</span>
                      <div className="flex-1 h-1 bg-white/10">
                        <div
                          className="h-full"
                          style={{ width: `${Math.min(100, item.bst * 76)}%`, background: item.hex }}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bespoke Paint, Neon Trim & Hover Rim Customizer */}
          <div className="lux-panel p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="text-[10px] font-black tracking-[0.2em] text-[#f5c451]">
                BESPOKE CUSTOMIZATION
              </span>
              <button
                type="button"
                onClick={() => onChangeCustomization(getDefaultCustomization(selectedShipId))}
                className="text-[9px] font-bold tracking-[0.16em] text-[#9eb2da] hover:text-white cursor-pointer"
              >
                RESET STOCK
              </button>
            </div>

            {/* Paint Finish Swatches */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-[110px]">
                <div className="text-[9px] font-bold tracking-[0.16em] text-[#9eb2da]">PAINT FINISH</div>
                <div className="text-[10px] font-black tracking-[0.1em] text-white truncate">
                  {activePaint.name}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {PAINT_PRESETS.map((p) => {
                  const selected = p.id === customization.paintId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-label={`Paint job ${p.name}`}
                      aria-pressed={selected}
                      onClick={() => onChangeCustomization({ paintId: p.id })}
                      className={`w-7 h-7 cursor-pointer transition-transform border ${
                        selected
                          ? 'scale-110 border-white shadow-[0_0_12px_rgba(255,255,255,0.65)]'
                          : 'border-white/30 hover:border-white/75'
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${p.hex} 0%, #090c14 130%)`
                      }}
                      title={p.name}
                    />
                  );
                })}
              </div>
            </div>

            {/* Neon Trim Colors */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-[110px]">
                <div className="text-[9px] font-bold tracking-[0.16em] text-[#9eb2da]">NEON TRIM</div>
                <div className="text-[10px] font-black tracking-[0.1em]" style={{ color: activeNeon.hex }}>
                  {activeNeon.name}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {NEON_PRESETS.map((n) => {
                  const selected = n.id === customization.neonId;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      aria-label={`Neon trim ${n.name}`}
                      aria-pressed={selected}
                      onClick={() => onChangeCustomization({ neonId: n.id })}
                      className={`w-7 h-7 cursor-pointer transition-transform border ${
                        selected
                          ? 'scale-110 border-white'
                          : 'border-white/25 hover:border-white/75'
                      }`}
                      style={{
                        backgroundColor: n.hex,
                        boxShadow: selected ? `0 0 14px ${n.hex}` : undefined
                      }}
                      title={n.name}
                    />
                  );
                })}
              </div>
            </div>

            {/* Hover Rim Hardware Styles */}
            <div>
              <div className="flex items-center justify-between text-[9px] tracking-[0.16em] mb-1.5">
                <span className="font-bold text-[#9eb2da]">HOVER RIM STYLE</span>
                <span className="text-[#00f0ff] font-bold">{activeRim.tag}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {RIM_STYLE_PRESETS.map((r) => {
                  const selected = r.id === customization.rimId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChangeCustomization({ rimId: r.id })}
                      className={`px-2 py-1.5 text-[9px] font-black tracking-[0.1em] border cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#00f0ff]/18 border-[#00f0ff] text-white'
                          : 'bg-black/40 border-white/15 text-[#9eb2da] hover:border-white/45 hover:text-white'
                      }`}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cyber-Gold Rider Portrait Card */}
          <div className="lux-panel-cyan p-2.5 flex items-center gap-3.5">
            <img
              src="/assets/aistudio/Cyber_Gold_Rider_Concept_a1494b22.png"
              alt="Ahwoo Cyber-Gold Rider"
              className="w-14 h-14 object-cover border border-[#f5c451]/60 shrink-0"
            />
            <div className="text-left">
              <div className="text-[9px] font-bold tracking-[0.2em] text-[#00f0ff]">
                PILOT SUIT &amp; TELEMETRY LINK
              </div>
              <div className="text-xs font-black tracking-[0.08em] text-white mt-0.5">
                {prof.pilotName}
              </div>
              <div className="text-[9px] text-[#9fb2d9] mt-0.5">
                Use ◀ ▶ or A / D keys to switch luxury hover chassis
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Nav */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between pt-2 pr-32">
        <button
          type="button"
          onClick={onBack}
          className="nav-chip px-5 py-2.5 text-[11px] font-bold tracking-[0.18em] text-[#cfe0ff] cursor-pointer"
        >
          ◀ TITLE
        </button>
        <button
          type="button"
          onClick={onNext}
          className="cta-btn px-8 py-3 text-xs font-black tracking-[0.2em] cursor-pointer"
        >
          SELECT CIRCUIT ▶
        </button>
      </div>
    </div>
  );
};
