import React from 'react';
import { AlertTriangle, Pause, Volume2, VolumeX } from 'lucide-react';
import { LEVELS } from '../game/tracks';
import type { HudSnapshot } from '../game/types';
import { WeatherIcon } from './WeatherIcons';

interface RaceHudProps {
  levelIdx: number;
  hud: HudSnapshot;
  onToggleMute: () => void;
  onCycleWeather: () => void;
  onPause: () => void;
}

export function formatRaceTime(t: number): string {
  const mins = Math.floor(t / 60);
  const secs = (t % 60).toFixed(2).padStart(5, '0');
  return `${mins}:${secs}`;
}

export const RaceHud: React.FC<RaceHudProps> = ({
  levelIdx,
  hud,
  onToggleMute,
  onCycleWeather,
  onPause
}) => {
  const def = LEVELS[levelIdx] || LEVELS[0];
  const litCount = Math.round(hud.speedNorm * 12);
  const weatherColor =
    hud.weather.kind === 'solar'
      ? '#ffb347'
      : hud.weather.kind === 'mist'
        ? '#59f0d8'
        : '#00f0ff';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-5">
      {/* Top perimeter clusters */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-left: Velocity, Energy Core & Live Standings */}
        <div className="flex flex-col items-start gap-2">
          <div className="lux-panel-cyan px-4 py-3 min-w-[210px] md:min-w-[244px]">
            <div className="text-[10px] tracking-[0.18em] text-[#9be8ff] flex items-center gap-2">
              <span className="font-kanji text-[#f5c451] font-bold">速度</span>
              <span>VELOCITY</span>
            </div>

            <div className="flex items-baseline gap-1.5 my-0.5">
              <span
                className={`text-4xl md:text-5xl font-black italic leading-none tabular-nums ${
                  hud.isBoosting ? 'text-[#f5c451]' : 'text-white'
                }`}
              >
                {hud.speedKmh}
              </span>
              <span className="text-xs font-bold tracking-[0.14em] text-[#00f0ff]">KM/H</span>
            </div>

            {/* 12-pip Tachometer */}
            <div className="flex gap-1 h-1.5 w-full my-2">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`tach-pip ${idx < litCount ? 'lit' : ''} ${
                    idx < litCount && idx >= 9 ? 'hot' : ''
                  }`}
                />
              ))}
            </div>

            {/* Energy Core */}
            <div className="text-[9px] tracking-[0.18em] text-[#9be8ff] mb-1 flex items-center justify-between">
              <span>
                <span className="font-kanji text-[#f5c451] mr-1">能量</span>ENERGY CORE
              </span>
              <span className="tabular-nums text-white font-bold">
                {Math.round(hud.energy * 100)}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-black/70 border border-[#00f0ff]/60 -skew-x-12 overflow-hidden">
              <div
                className="h-full transition-[width] duration-75"
                style={{
                  width: `${Math.round(hud.energy * 100)}%`,
                  background: 'linear-gradient(90deg, #ff2e93, #00f0ff 60%, #f5c451)'
                }}
              />
            </div>

            {/* Static boost/airborne indicator */}
            <div
              className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.16em] -skew-x-12 border ${
                hud.isBoosting
                  ? 'bg-[#f5c451]/25 border-[#f5c451] text-[#ffd978]'
                  : hud.isAirborne
                    ? 'bg-[#00f0ff]/25 border-[#00f0ff] text-white'
                    : 'bg-[#00f0ff]/10 border-[#00f0ff]/40 text-[#00f0ff]'
              }`}
            >
              <span>{hud.isBoosting ? 'OVERDRIVE ACTIVE' : hud.isAirborne ? 'AIRBORNE' : 'BOOST READY'}</span>
            </div>
          </div>

          {/* Compact Standings List */}
          {hud.standings.length > 0 && (
            <div className="lux-panel px-3 py-2 min-w-[210px] md:min-w-[244px]">
              <div className="flex items-center justify-between text-[9px] tracking-[0.18em] text-[#9be8ff] mb-1.5 pb-1 border-b border-white/10">
                <span className="flex items-center gap-1.5">
                  <span className="font-kanji text-[#f5c451] font-bold">排名</span>
                  <span>STANDINGS</span>
                </span>
                <span className="text-white/60 tabular-nums">
                  {hud.standings.length} RACERS
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {hud.standings.map((entry) => (
                  <div
                    key={`${entry.id}-${entry.racerId}`}
                    className={`flex items-center justify-between gap-2 px-1.5 py-0.5 border-l-2 ${
                      entry.isPlayer
                        ? 'bg-[#f5c451]/15 border-r border-r-[#f5c451]/40'
                        : 'bg-black/30'
                    }`}
                    style={{ borderLeftColor: entry.colorHex }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[10px] font-black tabular-nums w-4 shrink-0 ${
                          entry.rank === 1
                            ? 'text-[#f5c451]'
                            : entry.isPlayer
                              ? 'text-[#00f0ff]'
                              : 'text-white/75'
                        }`}
                      >
                        P{entry.rank}
                      </span>
                      <span className="text-[9px] font-mono font-bold tracking-[0.08em] text-[#9be8ff] tabular-nums shrink-0">
                        {entry.racerId}
                      </span>
                      <span
                        className={`text-[9px] tracking-[0.1em] truncate ${
                          entry.isPlayer ? 'text-white font-bold' : 'text-[#d8e6ff]/85'
                        }`}
                      >
                        {entry.teamName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {entry.isPlayer && (
                        <span className="text-[8px] font-black tracking-[0.14em] px-1 bg-[#f5c451] text-[#050712]">
                          YOU
                        </span>
                      )}
                      <span className="text-[9px] font-bold tabular-nums text-white/55">
                        L{entry.lap}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top-right: Lap, Rank, Timer, Controls */}
        <div className="flex flex-col items-end gap-2">
          <div className="lux-panel px-4 py-3 text-right min-w-[180px] md:min-w-[210px]">
            <div className="flex items-center justify-end gap-2 text-[10px] tracking-[0.18em] text-[#b9c8e8]">
              <span className="font-kanji text-[#f5c451] font-bold">圈数</span>
              <span>LAP</span>
            </div>
            <div className="text-2xl font-black tracking-[0.08em] text-white tabular-nums">
              {hud.lap} / {hud.totalLaps}
            </div>

            <div className="flex items-center justify-end gap-3 mt-1">
              <span className="text-sm font-black tracking-[0.14em] text-[#f5c451] tabular-nums">
                P{hud.rank} / {hud.totalRacers}
              </span>
              <span className="text-sm font-bold tracking-[0.08em] text-white tabular-nums">
                {formatRaceTime(hud.timeSec)}
              </span>
            </div>

            <div className="text-[9px] tracking-[0.2em] text-[#00f0ff] mt-1.5">
              {def.name} · {def.cn}
            </div>

            <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-end gap-2 text-[9px] tracking-[0.16em]">
              <WeatherIcon
                phaseId={hud.weather.phaseId}
                kind={hud.weather.kind}
                className="w-6 h-6 shrink-0"
              />
              <span className="text-white font-bold">{hud.weather.label}</span>
              <span className="tabular-nums font-bold" style={{ color: weatherColor }}>
                {Math.round(hud.weather.intensity * 100)}%
              </span>
            </div>
            <div className="text-[8px] tracking-[0.18em] text-[#b9c8e8] mt-0.5">
              {hud.weather.hazardTag}
            </div>
          </div>

          {/* Interactive Weather, Mute & Pause buttons */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={onCycleWeather}
              title="Cycle Weather Phase (V)"
              className="nav-chip px-2.5 py-1.5 text-[#d8e6ff] flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] cursor-pointer"
            >
              <WeatherIcon
                phaseId={hud.weather.phaseId}
                kind={hud.weather.kind}
                className="w-4 h-4 shrink-0"
              />
              <span>[V]</span>
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              title="Toggle Audio (M)"
              className="nav-chip px-2.5 py-1.5 text-[#d8e6ff] flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] cursor-pointer"
            >
              {hud.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>[M]</span>
            </button>
            <button
              type="button"
              onClick={onPause}
              title="Pause (Esc)"
              className="nav-chip px-2.5 py-1.5 text-[#d8e6ff] flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>[ESC]</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transient Sector / Mega Jump Banner */}
      {hud.splitActive && (
        <div className="fixed left-1/2 top-[16%] -translate-x-1/2 -skew-x-12 bg-[#070b18]/92 border border-[#f5c451] px-6 py-1.5 text-xs md:text-sm font-black tracking-[0.24em] text-white shadow-[0_0_24px_rgba(245,196,81,0.4)]">
          {hud.splitText}
        </div>
      )}

      {/* Active Weather Hazard Warning */}
      {hud.hazardAlert.active && (
        <div
          className={`fixed left-1/2 top-[23%] -translate-x-1/2 -skew-x-12 px-5 py-1.5 flex items-center gap-2 text-[11px] md:text-xs font-black tracking-[0.2em] border ${
            hud.hazardAlert.kind === 'fog'
              ? 'bg-[#1a0c2e]/92 border-[#9d7bff] text-[#e5d8ff]'
              : hud.hazardAlert.kind === 'surge'
                ? 'bg-[#091f2e]/92 border-[#00f0ff] text-[#c8f7ff]'
                : 'bg-[#2a0b16]/92 border-[#ff4d6d] text-[#ffd6de]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{hud.hazardAlert.label}</span>
        </div>
      )}

      {/* Subtle bottom control bar */}
      <div className="flex justify-center">
        <div className="text-[9px] tracking-[0.22em] text-white/55 bg-[#050712]/55 px-3 py-1">
          W / ↑ THROTTLE · A D / ◀ ▶ STEER · SPACE OVERDRIVE · V WEATHER · M AUDIO
        </div>
      </div>
    </div>
  );
};
