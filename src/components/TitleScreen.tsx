import React from 'react';

interface TitleScreenProps {
  onStart: () => void;
  onGrandPrix: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, onGrandPrix, muted, onToggleMute }) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-8 bg-gradient-to-r from-[#050712]/72 via-[#050712]/24 to-transparent">
      {/* Top minimal bar: brand kicker + audio toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] tracking-[0.28em] text-[#f5c451]">
          <span className="inline-block w-2 h-2 bg-[#f5c451] rotate-45" />
          <span>天际回廊 · AHWOO LUXURY GRAND PRIX</span>
        </div>
        <button
          type="button"
          onClick={onToggleMute}
          className="nav-chip px-3.5 py-1.5 text-[10px] font-bold tracking-[0.2em] text-[#d8e6ff] whitespace-nowrap shrink-0 cursor-pointer"
        >
          {muted ? 'AUDIO OFF [M]' : 'AUDIO ON [M]'}
        </button>
      </div>

      {/* Main hero split: bespoke SVG lockup over calm negative space + framed teaser loop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto max-w-7xl w-full mx-auto">
        <div className="lg:col-span-7 flex flex-col items-start text-left">
          <div className="text-[11px] tracking-[0.34em] text-[#00f0ff] font-bold mb-3">
            FUTURISTIC HOVER HYPERCARS · SIX CIRCUITS
          </div>

          {/* Bespoke inline SVG Title Lockup */}
          <svg
            viewBox="0 0 720 200"
            className="w-full max-w-[580px] h-auto overflow-visible mb-4"
            role="img"
            aria-label="AHWOO RACING"
          >
            <defs>
              <linearGradient id="ahwooGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fff6d6" />
                <stop offset="45%" stopColor="#f5c451" />
                <stop offset="100%" stopColor="#b87c19" />
              </linearGradient>
              <linearGradient id="ahwooCyan" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00f0ff" />
                <stop offset="100%" stopColor="#f5c451" />
              </linearGradient>
            </defs>
            {/* Wing crest emblem */}
            <path
              d="M12 24 L94 24 L76 42 L26 42 Z M12 48 L64 48 L52 60 L12 60 Z"
              fill="url(#ahwooGold)"
            />
            <text
              x="12"
              y="128"
              fill="#ffffff"
              fontFamily="Orbitron, sans-serif"
              fontWeight="900"
              fontSize="88"
              letterSpacing="6"
            >
              AHWOO
            </text>
            <text
              x="16"
              y="184"
              fill="url(#ahwooGold)"
              fontFamily="Orbitron, sans-serif"
              fontWeight="900"
              fontSize="50"
              letterSpacing="16"
            >
              RACING
            </text>
            <rect x="14" y="144" width="490" height="3" fill="url(#ahwooCyan)" />
          </svg>

          <p className="text-xs md:text-sm tracking-[0.14em] text-[#cbd8f6] max-w-xl leading-relaxed mb-7">
            PILOT BESPOKE OBSIDIAN &amp; CHAMPAGNE-GOLD REPULSOR HYPERCARS ACROSS NEON SKYWAYS,
            EMERALD TIDELINES, AND DEEP-SPACE WORMHOLES.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onStart}
              className="cta-btn px-8 py-3.5 cursor-pointer flex flex-col items-start whitespace-nowrap shrink-0"
            >
              <span className="text-base md:text-lg font-black tracking-[0.2em] text-white">
                ENTER SHOWROOM
              </span>
              <span className="font-kanji text-[10px] tracking-[0.32em] text-[#f5c451]">
                进入车库 · SELECT VEHICLE
              </span>
            </button>

            <button
              type="button"
              onClick={onGrandPrix}
              className="nav-chip px-6 py-3.5 border border-[#f5c451]/70 bg-[#0b1328]/80 hover:border-[#f5c451] cursor-pointer flex flex-col items-start whitespace-nowrap shrink-0"
            >
              <span className="text-sm md:text-base font-black tracking-[0.18em] text-[#f5c451]">
                GRAND PRIX CUP
              </span>
              <span className="text-[10px] tracking-[0.22em] text-[#00f0ff]">
                6-ROUND CHAMPIONSHIP
              </span>
            </button>

            <div className="flex items-center gap-3 lux-panel px-4 py-2.5">
              <img
                src="/assets/aistudio/Cyber_Gold_Rider_Concept_a1494b22.png"
                alt="Cyber-Gold Rider"
                className="w-11 h-11 object-cover border border-[#f5c451]/60"
              />
              <div className="text-left">
                <div className="text-[10px] font-bold tracking-[0.18em] text-[#f5c451]">
                  FEATURED PILOT
                </div>
                <div className="text-[11px] font-bold tracking-[0.1em] text-white">
                  KAIRO // SOVEREIGN GT
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right framed luxury showcase reel from uploaded video */}
        <div className="hidden lg:flex lg:col-span-5 flex-col gap-3">
          <div className="lux-panel p-2 relative overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5 text-[9px] tracking-[0.24em] text-[#f5c451]">
              <span>AHWOO // HYPER-COASTAL REEL</span>
              <span className="text-[#00f0ff]">LIVE TELEMETRY</span>
            </div>
            <div className="relative aspect-video w-full overflow-hidden bg-[#050712]">
              <video
                src="/assets/aistudio/Character_piloting_hover_vehicle__826b15f4_1080p_83e522a0.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 px-1 text-[9px] tracking-[0.16em] text-[#b9c8e8]">
              <div className="border-t border-white/10 pt-1.5">
                <div className="text-[#f5c451] font-bold">04</div>
                <div>LUXURY HOVER CARS</div>
              </div>
              <div className="border-t border-white/10 pt-1.5">
                <div className="text-[#00f0ff] font-bold">06</div>
                <div>3D CIRCUITS</div>
              </div>
              <div className="border-t border-white/10 pt-1.5">
                <div className="text-[#f5c451] font-bold">960+</div>
                <div>KM/H OVERDRIVE</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-[9px] tracking-[0.2em] text-[#9fb2d9] pr-28">
        <span>WASD DRIVE · SHIFT DRIFT · SPACE OVERDRIVE · Q/E NUDGE · F SPIN · R RADIO</span>
        <span className="hidden sm:inline text-[#f5c451]">PRESS ENTER TO START</span>
      </div>
    </div>
  );
};
