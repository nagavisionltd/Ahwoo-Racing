import React from 'react';
import type { MinimapSnapshot } from '../game/types';

interface MinimapProps {
  minimap: MinimapSnapshot;
  className?: string;
}

export const Minimap: React.FC<MinimapProps> = ({ minimap, className = '' }) => {
  const { pathD, player, opponents, closestAhead, closestBehind, circuitName, startFinish } = minimap;

  return (
    <div
      className={`relative select-none pointer-events-none flex flex-col justify-between overflow-hidden bg-[#050716]/82 border border-[#00f0ff]/32 shadow-[0_0_18px_rgba(0,240,255,0.08)] ${className}`}
      style={{
        clipPath:
          'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))'
      }}
    >
      {/* Holographic Scanline Texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0, 240, 255, 0.08) 0px, rgba(0, 240, 255, 0.08) 1px, transparent 1px, transparent 3px)'
        }}
      />

      {/* Cyber Corner Notches */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#00f0ff]" />
      <div className="absolute top-0 right-2 w-2 h-2 border-t-2 border-r-2 border-[#00f0ff]" />
      <div className="absolute bottom-2 left-0 w-2 h-2 border-b-2 border-l-2 border-[#00f0ff]" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#00f0ff]" />

      {/* Top Header: Holographic System Readout */}
      <div className="relative z-10 flex items-center justify-between px-2.5 pt-1.5 pb-1 border-b border-[#00f0ff]/15 bg-black/40 text-[8px] font-black tracking-[0.16em]">
        <div className="flex items-center gap-1.5 text-[#00f0ff]">
          <span className="w-1.5 h-1.5 bg-[#00f0ff] animate-pulse" />
          <span className="truncate max-w-[100px]">{circuitName || 'CIRCUIT'}</span>
        </div>
        <div className="text-white/60 tabular-nums">
          RADAR · P<span className="text-[#f5c451]">{player.rank}</span>
        </div>
      </div>

      {/* Center 2D Holographic Radar Viewport */}
      <div className="relative z-10 flex-1 w-full h-[106px] sm:h-[118px] p-1 flex items-center justify-center">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full overflow-visible"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <radialGradient id="holoRadarGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.08" />
              <stop offset="70%" stopColor="#00f0ff" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
            </radialGradient>
            <filter id="holoGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Holographic Radar Backdrop Grids */}
          <rect x="2" y="2" width="96" height="96" fill="url(#holoRadarGlow)" />
          {/* Concentric Range Rings */}
          <circle cx="50" cy="50" r="22" fill="none" stroke="#00f0ff" strokeWidth="0.5" strokeOpacity="0.12" strokeDasharray="1.5 2.5" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="#00f0ff" strokeWidth="0.5" strokeOpacity="0.12" strokeDasharray="1.5 2.5" />
          {/* Coordinate Crosshairs */}
          <line x1="50" y1="6" x2="50" y2="94" stroke="#00f0ff" strokeWidth="0.5" strokeOpacity="0.12" />
          <line x1="6" y1="50" x2="94" y2="50" stroke="#00f0ff" strokeWidth="0.5" strokeOpacity="0.12" />

          {/* Track Spline Mesh: Outer Glow Beam */}
          {pathD && (
            <>
              <path
                d={pathD}
                fill="none"
                stroke="#00f0ff"
                strokeWidth="4.5"
                strokeOpacity="0.18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Inner High-Fidelity Track Beam */}
              <path
                d={pathD}
                fill="none"
                stroke="#00f0ff"
                strokeWidth="1.8"
                strokeOpacity="0.88"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#holoGlow)"
              />
            </>
          )}

          {/* Start / Finish Line Anchor */}
          {startFinish && (
            <g transform={`translate(${startFinish.x}, ${startFinish.y})`}>
              <line x1="-3" y1="0" x2="3" y2="0" stroke="#ffd978" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="0" cy="0" r="1.4" fill="#ffd978" />
            </g>
          )}

          {/* Opponent Blips */}
          {opponents.map((opp) => {
            const isAhead = opp.isAhead;
            const markerColor = opp.colorHex || '#9be8ff';
            return (
              <g
                key={`opp-${opp.id}-${opp.racerId}`}
                transform={`translate(${opp.x}, ${opp.y})`}
              >
                {/* Direction Pointer Arrow */}
                <g transform={`rotate(${opp.angleDeg})`}>
                  <polygon
                    points="0,-4 2.2,2.5 -2.2,2.5"
                    fill={markerColor}
                    opacity={isAhead ? 0.95 : 0.72}
                  />
                </g>
                {/* Core Blip */}
                <circle
                  cx="0"
                  cy="0"
                  r={isAhead ? 2.6 : 2.2}
                  fill={markerColor}
                  stroke="#ffffff"
                  strokeWidth="0.6"
                />
              </g>
            );
          })}

          {/* Player Blip */}
          {player && (
            <g transform={`translate(${player.x}, ${player.y})`}>
              {/* Radar Ping Pulse Ring */}
              <circle
                cx="0"
                cy="0"
                r="5.5"
                fill="none"
                stroke="#f5c451"
                strokeWidth="0.8"
                strokeOpacity="0.55"
                strokeDasharray="2 1.5"
              />
              {/* Player Direction Heading Arrow */}
              <g transform={`rotate(${player.angleDeg})`}>
                <polygon
                  points="0,-5.5 3,3.5 -3,3.5"
                  fill="#f5c451"
                  stroke="#ffffff"
                  strokeWidth="0.75"
                />
              </g>
              {/* Center Bright Core */}
              <circle
                cx="0"
                cy="0"
                r="2.8"
                fill="#ffffff"
                stroke="#f5c451"
                strokeWidth="1.2"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Bottom Telemetry: Ahead / Behind Opponent Gap Readouts */}
      <div className="relative z-10 px-2 py-1 bg-black/60 border-t border-[#00f0ff]/15 flex items-center justify-between text-[8px] font-black tracking-[0.14em] tabular-nums">
        {/* Ahead Gap */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[#00f0ff] font-bold">▲</span>
          {closestAhead ? (
            <span className="text-white/85 truncate">
              +{closestAhead.distM}m
              <span className="text-white/45 ml-0.5 font-mono">{closestAhead.racerId}</span>
            </span>
          ) : (
            <span className="text-[#f5c451] font-bold">LEADER</span>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-2.5 bg-white/20" />

        {/* Behind Gap */}
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[#f5c451] font-bold">▼</span>
          {closestBehind ? (
            <span className="text-white/85 truncate">
              -{Math.abs(closestBehind.distM)}m
              <span className="text-white/45 ml-0.5 font-mono">{closestBehind.racerId}</span>
            </span>
          ) : (
            <span className="text-white/45">TRAIL</span>
          )}
        </div>
      </div>
    </div>
  );
};
