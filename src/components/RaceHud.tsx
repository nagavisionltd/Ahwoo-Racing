import React from 'react';
import { AlertTriangle, Pause, Radio, Volume2, VolumeX } from 'lucide-react';
import { LEVELS } from '../game/tracks';
import type { HudSnapshot } from '../game/types';
import type { RadioStatus } from './RadioHub';
import { WeatherIcon } from './WeatherIcons';

interface RaceHudProps {
  levelIdx: number;
  hud: HudSnapshot;
  radioStatus: RadioStatus;
  onToggleMute: () => void;
  onToggleRadio: () => void;
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
  radioStatus,
  onToggleMute,
  onToggleRadio,
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

  const showDriftCard = hud.drift.active || Boolean(hud.drift.lastBonusLabel);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 md:p-4">
      {/* Top Perimeter: Whisper-thin Position/Standings (Left) & Timer/Weather/Controls (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Slim Position Header & Micro-Standings */}
        <div className="flex flex-col items-start gap-1.5 max-w-[220px]">
          <div className="bg-[#050712]/62 border border-white/12 px-3 py-1.5 flex items-baseline gap-3">
            <span className="text-xl md:text-2xl font-black italic text-[#f5c451] tabular-nums leading-none">
              P{hud.rank}
              <span className="text-[10px] font-bold text-white/55 not-italic ml-0.5">
                /{hud.totalRacers}
              </span>
            </span>
            <div className="text-[10px] font-bold tracking-[0.16em] text-white/85 tabular-nums">
              {hud.isSprint ? `SPRINT ${hud.progressPct}%` : `LAP ${hud.lap}/${hud.totalLaps}`}
            </div>
          </div>

          {hud.isSprint && (
            <div className="h-1 w-full bg-black/60 border border-[#36f5d8]/40 overflow-hidden">
              <div
                className="h-full transition-[width] duration-75 bg-[#36f5d8]"
                style={{ width: `${hud.progressPct}%` }}
              />
            </div>
          )}

          {hud.standings.length > 0 && (
            <div className="bg-[#050712]/55 border border-white/10 px-2 py-1.5 w-full hidden sm:flex flex-col gap-0.5">
              {hud.standings.map((entry) => (
                <div
                  key={`${entry.id}-${entry.racerId}`}
                  className={`flex items-center justify-between gap-2 px-1 py-0.5 text-[9px] ${
                    entry.isPlayer ? 'bg-[#f5c451]/15 text-white font-bold' : 'text-white/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-1 h-2.5 shrink-0"
                      style={{ backgroundColor: entry.colorHex }}
                    />
                    <span className="font-black tabular-nums w-3.5 shrink-0 text-[#f5c451]">
                      {entry.rank}
                    </span>
                    <span className="font-mono text-[#9be8ff] shrink-0">{entry.racerId}</span>
                    <span className="truncate tracking-[0.06em]">{entry.teamName}</span>
                  </div>
                  <span className="tabular-nums text-[8px] text-white/50 shrink-0">
                    {hud.isSprint ? `${Math.round(entry.progress * 100)}%` : `L${entry.lap}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top-Right: Slim Timer, Weather Micro-Status & Interactive Controls */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="bg-[#050712]/62 border border-white/12 px-3 py-1.5 flex items-center gap-3">
            <div className="text-right">
              <div className="text-base md:text-lg font-black tracking-[0.08em] text-white tabular-nums leading-none">
                {formatRaceTime(hud.timeSec)}
              </div>
              <div className="text-[8px] tracking-[0.18em] text-[#00f0ff] mt-0.5">
                {def.name}
              </div>
            </div>
            <div className="h-6 w-px bg-white/15" />
            <div className="flex items-center gap-1.5 text-[9px] tracking-[0.14em]">
              <WeatherIcon
                phaseId={hud.weather.phaseId}
                kind={hud.weather.kind}
                className="w-4 h-4 shrink-0"
              />
              <div className="text-right leading-tight hidden md:block">
                <div className="text-white/90 font-bold">{hud.weather.label}</div>
                <div className="tabular-nums text-[8px]" style={{ color: weatherColor }}>
                  {Math.round(hud.weather.intensity * 100)}%
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={onCycleWeather}
              title="Cycle Weather Phase (V)"
              className="bg-[#050712]/68 hover:bg-[#0b1328]/90 border border-white/15 hover:border-[#00f0ff] px-2 py-1 text-[#d8e6ff] flex items-center gap-1 text-[9px] font-bold tracking-[0.14em] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <WeatherIcon
                phaseId={hud.weather.phaseId}
                kind={hud.weather.kind}
                className="w-3.5 h-3.5 shrink-0"
              />
              <span>[V]</span>
            </button>
            <button
              type="button"
              onClick={onToggleRadio}
              title="Spotify Radio Hub (R)"
              className={`bg-[#050712]/68 hover:bg-[#0b1328]/90 border border-white/15 hover:border-[#1ed760] px-2 py-1 flex items-center gap-1 text-[9px] font-bold tracking-[0.14em] whitespace-nowrap shrink-0 cursor-pointer ${
                radioStatus.playing && radioStatus.source === 'spotify'
                  ? 'text-[#1ed760] border-[#1ed760]/60'
                  : 'text-[#d8e6ff]'
              }`}
            >
              <Radio className="w-3 h-3 shrink-0" />
              <span>[R]</span>
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              title="Toggle Audio (M)"
              className="bg-[#050712]/68 hover:bg-[#0b1328]/90 border border-white/15 hover:border-[#f5c451] px-2 py-1 text-[#d8e6ff] flex items-center gap-1 text-[9px] font-bold tracking-[0.14em] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {hud.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              <span>[M]</span>
            </button>
            <button
              type="button"
              onClick={onPause}
              title="Pause (Esc)"
              className="bg-[#050712]/68 hover:bg-[#0b1328]/90 border border-white/15 hover:border-[#f5c451] px-2 py-1 text-[#d8e6ff] flex items-center gap-1 text-[9px] font-bold tracking-[0.14em] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Pause className="w-3 h-3" />
              <span>[ESC]</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transient Sector / Mega Jump Micro-Banner — sleek top-center slot */}
      {hud.splitActive && (
        <div className="fixed left-1/2 top-4 -translate-x-1/2 -skew-x-12 bg-[#050712]/80 border border-[#f5c451]/80 px-4 py-1 text-[11px] font-black tracking-[0.22em] text-white">
          {hud.splitText}
        </div>
      )}

      {/* Active Weather Hazard Warning — compact micro-alert */}
      {hud.hazardAlert.active && (
        <div
          className={`fixed left-1/2 top-12 -translate-x-1/2 -skew-x-12 px-3.5 py-1 flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] border ${
            hud.hazardAlert.kind === 'fog'
              ? 'bg-[#1a0c2e]/86 border-[#9d7bff] text-[#e5d8ff]'
              : hud.hazardAlert.kind === 'surge'
                ? 'bg-[#091f2e]/86 border-[#00f0ff] text-[#c8f7ff]'
                : 'bg-[#2a0b16]/86 border-[#ff4d6d] text-[#ffd6de]'
          }`}
        >
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{hud.hazardAlert.label}</span>
        </div>
      )}

      {/* Bottom Perimeter: Contextual Drift (Left) · Announcer Subtitles (Center) · Speed/Core (Right) */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left: Contextual Drift Meter (only shown when actively drifting or showing surge bonus) */}
        <div className="min-w-[200px] hidden sm:block">
          {showDriftCard &&
            (hud.drift.active ? (
              <div className="bg-[#050712]/72 border border-[#00f0ff]/65 px-3 py-2 w-[236px]">
                <div className="flex items-center justify-between gap-2 text-[9px] tracking-[0.16em]">
                  <span
                    className={`font-black ${
                      hud.drift.tier === 3
                        ? 'text-[#ff3b94]'
                        : hud.drift.tier === 2
                          ? 'text-[#f5c451]'
                          : 'text-[#00f0ff]'
                    }`}
                  >
                    DRIFT · {hud.drift.tier === 3 ? 'MAX' : hud.drift.tier === 2 ? 'GOLD' : hud.drift.tier === 1 ? 'READY' : 'CHARGE'}
                  </span>
                  <span className="text-xs font-black italic text-[#f5c451] tabular-nums">
                    +{hud.drift.liveScore}
                  </span>
                </div>
                <div className="relative h-1.5 w-full bg-black/70 border border-white/15 mt-1.5 overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-75"
                    style={{
                      width: `${Math.round(hud.drift.charge * 100)}%`,
                      background:
                        hud.drift.tier === 3
                          ? 'linear-gradient(90deg, #00f0ff, #f5c451 55%, #ff3b94)'
                          : 'linear-gradient(90deg, #00f0ff, #f5c451)'
                    }}
                  />
                  <div className="absolute top-0 bottom-0 left-[28%] w-px bg-white/35" />
                  <div className="absolute top-0 bottom-0 left-[62%] w-px bg-white/35" />
                </div>
              </div>
            ) : (
              <div className="bg-[#050712]/72 border border-[#f5c451]/60 px-3 py-1 text-[10px] font-black tracking-[0.16em] text-[#f5c451] inline-block tabular-nums">
                {hud.drift.lastBonusLabel}
              </div>
            ))}
        </div>

        {/* Bottom-Center: Minimal control hint */}
        <div className="flex-1 flex flex-col items-center gap-1 max-w-md mx-auto">
          <div className="hidden md:block text-[8px] tracking-[0.18em] text-white/40 text-center">
            WASD DRIVE · SHIFT DRIFT · SPACE OVERDRIVE · V WEATHER · R RADIO · M AUDIO
          </div>
        </div>

        {/* Bottom-Right: Forza/GT-Style Peripheral Velocity & Energy Cluster */}
        <div className="bg-[#050712]/65 border border-white/14 px-3.5 py-2 min-w-[184px] md:min-w-[206px] text-right">
          <div className="flex items-baseline justify-end gap-1.5">
            <span
              className={`text-3xl md:text-4xl font-black italic leading-none tabular-nums ${
                hud.isBoosting ? 'text-[#f5c451]' : 'text-white'
              }`}
            >
              {hud.speedKmh}
            </span>
            <span className="text-[10px] font-bold tracking-[0.14em] text-[#00f0ff]">KM/H</span>
          </div>

          <div className="flex gap-0.5 h-1 w-full my-1.5">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className={`tach-pip ${idx < litCount ? 'lit' : ''} ${
                  idx < litCount && idx >= 9 ? 'hot' : ''
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between text-[8px] tracking-[0.16em] text-[#9be8ff] mb-1">
            <span>{hud.isBoosting ? 'OVERDRIVE' : hud.isAirborne ? 'AIRBORNE' : 'CORE'}</span>
            <span className="tabular-nums text-white font-bold">{Math.round(hud.energy * 100)}%</span>
          </div>
          <div className="h-1.5 w-full bg-black/70 border border-[#00f0ff]/45 -skew-x-12 overflow-hidden">
            <div
              className="h-full transition-[width] duration-75"
              style={{
                width: `${Math.round(hud.energy * 100)}%`,
                background: 'linear-gradient(90deg, #ff2e93, #00f0ff 60%, #f5c451)'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
