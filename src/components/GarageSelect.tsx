import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
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
  onPreviewShip: (id: number | null) => void;
  onChangeCustomization: (patch: Partial<VehicleCustomization>) => void;
  onAttachTurntable: (canvas: HTMLCanvasElement | null) => void;
  onBack: () => void;
  onNext: () => void;
}

const ShipSilhouetteThumb: React.FC<{ id: number; hex: string; active: boolean; previewed: boolean }> = ({
  id,
  hex,
  active,
  previewed
}) => {
  return (
    <div
      className="relative h-14 w-full bg-[#040711] border border-white/10 flex items-center justify-center overflow-hidden mb-2"
      style={{
        background: `radial-gradient(circle at 50% 62%, ${hex}24 0%, #040711 72%)`
      }}
    >
      <svg viewBox="0 0 140 60" className="w-28 h-12 overflow-visible" aria-hidden="true">
        {/* Turntable ellipse under-glow */}
        <ellipse
          cx="70"
          cy="47"
          rx="44"
          ry="6"
          fill="none"
          stroke={hex}
          strokeOpacity={previewed || active ? 0.85 : 0.3}
          strokeWidth="1.4"
        />
        {id === 0 && (
          <g>
            {/* Sovereign GT Coupe */}
            <path d="M22 36 L44 20 L86 18 L118 32 L112 40 L26 40 Z" fill="#182238" stroke={hex} strokeWidth="1.6" />
            <path d="M52 21 L78 21 L92 31 L46 31 Z" fill={hex} fillOpacity="0.32" />
            <rect x="20" y="31" width="12" height="5" fill={hex} />
            <circle cx="42" cy="39" r="5" fill="#0b101d" stroke={hex} strokeWidth="1.4" />
            <circle cx="96" cy="39" r="5" fill="#0b101d" stroke={hex} strokeWidth="1.4" />
          </g>
        )}
        {id === 1 && (
          <g>
            {/* Valkyrie Aero-S Twin Hull Catamaran */}
            <path d="M18 34 L50 18 L116 26 L122 36 L22 39 Z" fill="#dbe6f7" stroke={hex} strokeWidth="1.6" />
            <path d="M30 24 L62 15 L88 22 L54 27 Z" fill={hex} fillOpacity="0.4" />
            <rect x="16" y="29" width="14" height="5" fill={hex} />
            <circle cx="44" cy="38" r="5" fill="#0b101d" stroke={hex} strokeWidth="1.4" />
            <circle cx="98" cy="38" r="5" fill="#0b101d" stroke={hex} strokeWidth="1.4" />
          </g>
        )}
        {id === 2 && (
          <g>
            {/* Noctis Phantom IX Stealth Delta */}
            <path d="M14 38 L48 16 L124 34 L106 41 L20 41 Z" fill="#131726" stroke={hex} strokeWidth="1.6" />
            <path d="M54 21 L82 25 L94 33 L48 32 Z" fill={hex} fillOpacity="0.36" />
            <polygon points="18,38 34,24 36,38" fill={hex} fillOpacity="0.7" />
            <circle cx="46" cy="39" r="5" fill="#0b101d" stroke={hex} strokeWidth="1.4" />
            <circle cx="95" cy="39" r="5" fill="#0b101d" stroke={hex} strokeWidth="1.4" />
          </g>
        )}
        {id === 3 && (
          <g>
            {/* Aurora Apex V Quad-Foil Roadster */}
            <path d="M22 35 L46 21 L92 19 L120 31 L114 39 L28 39 Z" fill="#9fb6da" stroke={hex} strokeWidth="1.6" />
            <path d="M52 22 L80 22 L90 30 L48 30 Z" fill={hex} fillOpacity="0.42" />
            <path d="M30 20 L68 17 L64 23 L26 25 Z" fill={hex} />
            <circle cx="44" cy="38" r="5" fill="#0b101d" stroke={hex} strokeWidth="1.4" />
            <circle cx="98" cy="38" r="5" fill="#0b101d" stroke={hex} strokeWidth="1.4" />
          </g>
        )}
        {id === 4 && (
          <g>
            {/* Chao Space Racer: biolume pod, antenna ball, red hover fins */}
            <ellipse cx="70" cy="47" rx="40" ry="5" fill="none" stroke={hex} strokeOpacity={previewed || active ? 0.85 : 0.3} strokeWidth="1.4" />
            <circle cx="70" cy="29" r="16" fill="#2f6fd4" stroke={hex} strokeWidth="1.6" />
            <path d="M70 13 L70 8" stroke={hex} strokeWidth="1.6" />
            <circle cx="70" cy="6" r="3.6" fill="#f5c451" />
            <path d="M46 38 L32 47 L54 47 Z" fill="#ff5a4d" />
            <path d="M94 38 L108 47 L86 47 Z" fill="#ff5a4d" />
            <circle cx="64" cy="26" r="2.2" fill="#050712" />
            <circle cx="76" cy="26" r="2.2" fill="#050712" />
          </g>
        )}
        {id === 5 && (
          <g>
            {/* Verdant Orbit Runner: leaf hull, twin foliage fins */}
            <path d="M22 38 Q52 18 94 22 L120 33 L100 41 L30 41 Z" fill="#233a1d" stroke={hex} strokeWidth="1.6" />
            <path d="M40 32 Q64 20 92 26 L84 34 L44 36 Z" fill={hex} fillOpacity="0.45" />
            <path d="M34 30 Q22 20 14 26 Q22 33 34 34 Z" fill={hex} fillOpacity="0.7" />
            <path d="M100 26 Q116 18 124 24 Q114 32 104 32 Z" fill={hex} fillOpacity="0.7" />
            <circle cx="52" cy="40" r="4.6" fill="#0b101d" stroke={hex} strokeWidth="1.3" />
            <circle cx="96" cy="40" r="4.6" fill="#0b101d" stroke={hex} strokeWidth="1.3" />
          </g>
        )}
        {id === 6 && (
          <g>
            {/* Seraph Chao Racer: white pod, gold halo, swept wings */}
            <ellipse cx="70" cy="15" rx="12" ry="3.4" fill="none" stroke="#f5c451" strokeWidth="2" />
            <path d="M44 36 Q54 20 70 19 Q86 20 96 36 L86 44 L54 44 Z" fill="#eef2fb" stroke={hex} strokeWidth="1.6" />
            <path d="M52 34 Q70 24 88 34 L82 39 L58 39 Z" fill={hex} fillOpacity="0.4" />
            <path d="M46 34 L24 26 L30 40 Z" fill="#ffffff" fillOpacity="0.72" stroke={hex} strokeWidth="1.1" />
            <path d="M94 34 L116 26 L110 40 Z" fill="#ffffff" fillOpacity="0.72" stroke={hex} strokeWidth="1.1" />
            <circle cx="70" cy="38" r="4.2" fill="#0b101d" stroke={hex} strokeWidth="1.3" />
          </g>
        )}
        {id === 7 && (
          <g>
            {/* Midnight Aero Majesty: long chrome arrow, violet blades */}
            <path d="M14 36 L58 20 L112 24 L126 33 L110 40 L24 40 Z" fill="#1a2038" stroke={hex} strokeWidth="1.6" />
            <path d="M62 25 L98 27 L110 33 L66 34 Z" fill={hex} fillOpacity="0.45" />
            <path d="M120 26 L136 30 L124 34 Z" fill={hex} fillOpacity="0.85" />
            <circle cx="42" cy="39" r="4.6" fill="#0b101d" stroke={hex} strokeWidth="1.3" />
            <circle cx="98" cy="39" r="4.6" fill="#0b101d" stroke={hex} strokeWidth="1.3" />
          </g>
        )}
      </svg>

      {previewed && (
        <span
          className="absolute top-1 left-1.5 px-1.5 py-0.5 text-[7px] font-black tracking-[0.16em] text-black flex items-center gap-1"
          style={{ backgroundColor: hex }}
        >
          <RotateCw className="w-2.5 h-2.5" />
          360°
        </span>
      )}
      {active && !previewed && (
        <span className="absolute top-1 left-1.5 px-1.5 py-0.5 text-[7px] font-black tracking-[0.16em] bg-[#f5c451] text-black">
          LOCKED
        </span>
      )}
    </div>
  );
};

export const GarageSelect: React.FC<GarageSelectProps> = ({
  selectedShipId,
  customization,
  onSelectShip,
  onPreviewShip,
  onChangeCustomization,
  onAttachTurntable,
  onBack,
  onNext
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredShipId, setHoveredShipId] = useState<number | null>(null);

  useEffect(() => {
    onAttachTurntable(canvasRef.current);
    return () => onAttachTurntable(null);
  }, [onAttachTurntable]);

  const activeStageId = hoveredShipId ?? selectedShipId;
  const prof = SHIP_PROFILES[activeStageId] || SHIP_PROFILES[0];
  const selectedProf = SHIP_PROFILES[selectedShipId] || SHIP_PROFILES[0];
  // Baked-livery chassis keep their factory paint; the workshop goes read-only.
  const locked = !!selectedProf.fixedLivery;
  const isHoverPreview = hoveredShipId !== null && hoveredShipId !== selectedShipId;
  const activePaint = getPaintPreset(customization.paintId);
  const activeNeon = getNeonPreset(customization.neonId);
  const activeRim = getRimStylePreset(customization.rimId);

  const stats: [string, number][] = [
    ['TOP SPEED', prof.spd],
    ['ACCEL', prof.acc],
    ['HANDLING', prof.hnd],
    ['OVERDRIVE', prof.bst]
  ];

  const stepCarousel = (dir: number) => {
    const next = (selectedShipId + dir + SHIP_PROFILES.length) % SHIP_PROFILES.length;
    onSelectShip(next);
  };

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
              选择奢华悬浮超跑 · HOVER OR DRAG FOR 360° CHASSIS PREVIEW
            </div>
          </div>
        </div>

      </div>

      {/* Main Split */}
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 my-auto py-3 items-stretch">
        {/* Left: Interactive 360 Turntable Stage */}
        <div className="lg:col-span-6 lux-panel p-4 flex flex-col justify-between relative min-h-[340px]">
          <div className="flex items-center justify-between text-[10px] tracking-[0.22em]">
            <span
              className="font-bold flex items-center gap-1.5"
              style={{ color: isHoverPreview ? prof.hex : '#f5c451' }}
            >
              <RotateCw className="w-3.5 h-3.5" />
              {isHoverPreview ? '360° HOVER PREVIEW // CLICK TO LOCK' : '360° LIVE CHASSIS TURNTABLE'}
            </span>
            <span className="text-[#9eb2da]">{prof.pilotName}</span>
          </div>

          <div className="relative flex-1 flex items-center justify-center my-2 min-h-[220px]">
            <canvas
              ref={canvasRef}
              className="w-full h-[250px] md:h-[290px] cursor-grab active:cursor-grabbing"
            />
          </div>

          <div className="border-t border-white/10 pt-3 relative">
            <div className="font-kanji absolute right-1 top-2 text-3xl font-black text-white/10">
              {prof.kanji}
            </div>
            <div className="text-lg md:text-2xl font-black tracking-[0.06em] text-white">
              {prof.name}
            </div>
            <div className="text-[10px] tracking-[0.18em] mb-3" style={{ color: isHoverPreview ? prof.hex : activeNeon.hex }}>
              {isHoverPreview
                ? `${prof.cls.toUpperCase()} · ${prof.subtitle}`
                : locked
                  ? 'FACTORY LIVERY · BAKED TEXTURES'
                  : `${activePaint.name} · ${activeNeon.name} · ${activeRim.name}`}
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
                        backgroundColor: isHoverPreview ? prof.hex : activeNeon.hex
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

        {/* Right: Interactive Thumbnail Grid Carousel + Bespoke Customization Workshop */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-3">
          {/* Carousel Header */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black tracking-[0.2em] text-[#9eb2da]">
              CHASSIS &amp; PILOT ROSTER · 0{selectedShipId + 1} / 0{SHIP_PROFILES.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous vehicle"
                onClick={() => stepCarousel(-1)}
                className="w-7 h-7 flex items-center justify-center bg-[#080d1d] border border-white/20 hover:border-[#f5c451] text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Next vehicle"
                onClick={() => stepCarousel(1)}
                className="w-7 h-7 flex items-center justify-center bg-[#080d1d] border border-white/20 hover:border-[#f5c451] text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            onMouseLeave={() => {
              setHoveredShipId(null);
              onPreviewShip(null);
            }}
          >
            {SHIP_PROFILES.map((item) => {
              const active = item.id === selectedShipId;
              const previewed = item.id === hoveredShipId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => {
                    setHoveredShipId(item.id);
                    onPreviewShip(item.id);
                  }}
                  onFocus={() => {
                    setHoveredShipId(item.id);
                    onPreviewShip(item.id);
                  }}
                  onBlur={() => {
                    setHoveredShipId(null);
                    onPreviewShip(null);
                  }}
                  onClick={() => onSelectShip(item.id)}
                  className={`text-left p-2.5 cursor-pointer transition-all duration-150 border ${
                    active
                      ? 'bg-[#121a34]/95 border-[#f5c451] shadow-[0_0_24px_rgba(245,196,81,0.28)]'
                      : previewed
                        ? 'bg-[#0e152c]/95 border-white/60'
                        : 'bg-[#080d1d]/88 border-white/15 hover:border-white/45'
                  }`}
                  style={{
                    borderColor: active || previewed ? item.hex : undefined
                  }}
                >
                  <ShipSilhouetteThumb
                    id={item.id}
                    hex={item.hex}
                    active={active}
                    previewed={previewed}
                  />

                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-kanji text-xs font-black text-white">
                      {item.kanji} · {item.pilotName.split(' ')[0]}
                    </span>
                    <span
                      className="text-[8px] font-bold tracking-[0.14em] px-1.5 py-0.5 tabular-nums"
                      style={{
                        backgroundColor: `${item.hex}24`,
                        color: item.hex
                      }}
                    >
                      CLASS {item.id + 1}
                    </span>
                  </div>
                  <div className="text-[11px] font-black tracking-[0.06em] text-white mb-0.5 truncate">
                    {item.name}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[8px] tracking-[0.1em] mt-1.5">
                    <div>
                      <span className="text-[#8ea2ca] block">SPD {Math.round(item.spd * 100)}</span>
                      <div className="h-1 bg-white/10 mt-0.5">
                        <div className="h-full" style={{ width: `${Math.min(100, item.spd * 76)}%`, background: item.hex }} />
                      </div>
                    </div>
                    <div>
                      <span className="text-[#8ea2ca] block">HND {Math.round(item.hnd * 100)}</span>
                      <div className="h-1 bg-white/10 mt-0.5">
                        <div className="h-full" style={{ width: `${Math.min(100, item.hnd * 76)}%`, background: item.hex }} />
                      </div>
                    </div>
                    <div>
                      <span className="text-[#8ea2ca] block">BST {Math.round(item.bst * 100)}</span>
                      <div className="h-1 bg-white/10 mt-0.5">
                        <div className="h-full" style={{ width: `${Math.min(100, item.bst * 76)}%`, background: item.hex }} />
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

            {locked && (
              <div className="text-[9px] font-bold tracking-[0.14em] text-[#ffd08a] border border-[#f5c451]/45 bg-[#f5c451]/10 px-2 py-1.5">
                FACTORY LIVERY · THIS CHASSIS SHIPS WITH BAKED TEXTURES, SO PAINT, NEON AND RIM
                OPTIONS ARE DISABLED
              </div>
            )}

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
                      disabled={locked}
                      onClick={() => onChangeCustomization({ paintId: p.id })}
                      className={`w-7 h-7 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed transition-transform border ${
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
                      disabled={locked}
                      onClick={() => onChangeCustomization({ neonId: n.id })}
                      className={`w-7 h-7 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed transition-transform border ${
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
                      disabled={locked}
                      onClick={() => onChangeCustomization({ rimId: r.id })}
                      className={`px-2 py-1.5 text-[9px] font-black tracking-[0.1em] border cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed transition-colors ${
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

          <div className="text-[9px] text-[#9fb2d9]">
            Hover cards for live 360° preview · Drag platter to orbit · Enter to confirm
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
