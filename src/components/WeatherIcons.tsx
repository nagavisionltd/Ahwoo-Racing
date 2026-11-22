import React from 'react';
import type { WeatherKind } from '../game/types';

export interface WeatherIconProps {
  className?: string;
  phaseId?: string;
  kind?: WeatherKind;
}

export const NeonRainIcon: React.FC<{ className?: string; electric?: boolean }> = ({
  className = 'w-5 h-5',
  electric = false
}) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Neon Rain"
    role="img"
  >
    {/* Angular cyber cloud frame */}
    <path
      d="M7 17.5H23.5C25.9 17.5 27.5 15.8 27.5 13.6C27.5 11.6 26.1 10.1 24.2 9.8C23.5 6.8 20.8 4.8 17.6 4.8C14.7 4.8 12.2 6.5 11.2 9.1C10.7 8.9 10.1 8.8 9.5 8.8C6.9 8.8 4.8 10.9 4.8 13.5C4.8 15.8 6.1 17.5 7 17.5Z"
      fill="rgba(0, 240, 255, 0.14)"
      stroke="#00f0ff"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
    {/* Gold horizon accent bar on cloud base */}
    <path d="M9.5 17.5H22" stroke="#f5c451" strokeWidth="1.35" strokeLinecap="round" />

    {/* Animated diagonal neon rain streaks */}
    <g className="weather-rain-drop-1">
      <line x1="10.5" y1="20" x2="8.5" y2="25.5" stroke="#00f0ff" strokeWidth="1.8" strokeLinecap="round" />
    </g>
    <g className="weather-rain-drop-2">
      <line x1="16.5" y1="20.5" x2="14.5" y2="26.5" stroke="#ff2e93" strokeWidth="1.8" strokeLinecap="round" />
    </g>
    <g className="weather-rain-drop-3">
      <line x1="22.5" y1="19.8" x2="20.5" y2="25.2" stroke="#00f0ff" strokeWidth="1.8" strokeLinecap="round" />
    </g>

    {/* Subtle lightning arc inside storm */}
    <path
      d="M17.2 11L14.6 15.5H17.4L15.4 19.5"
      stroke={electric ? '#ffd978' : '#9be8ff'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="weather-bolt-arc"
    />
  </svg>
);

export const SolarFlareIcon: React.FC<{ className?: string }> = ({
  className = 'w-5 h-5'
}) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Solar Flare"
    role="img"
  >
    {/* Expanding CME corona ring */}
    <circle
      cx="16"
      cy="16"
      r="11"
      stroke="#ff6b3d"
      strokeWidth="1.4"
      strokeDasharray="6 4"
      className="weather-solar-ring"
    />

    {/* Rotating geometric solar rays */}
    <g className="weather-solar-rays">
      <line x1="16" y1="2.5" x2="16" y2="6.2" stroke="#ffd978" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="16" y1="25.8" x2="16" y2="29.5" stroke="#ffd978" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="2.5" y1="16" x2="6.2" y2="16" stroke="#f5c451" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="25.8" y1="16" x2="29.5" y2="16" stroke="#f5c451" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="6.4" y1="6.4" x2="9.1" y2="9.1" stroke="#ff6b3d" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="22.9" y1="22.9" x2="25.6" y2="25.6" stroke="#ff6b3d" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="25.6" y1="6.4" x2="22.9" y2="9.1" stroke="#ff6b3d" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="9.1" y1="22.9" x2="6.4" y2="25.6" stroke="#ff6b3d" strokeWidth="1.6" strokeLinecap="round" />
    </g>

    {/* Flare plasma core */}
    <circle
      cx="16"
      cy="16"
      r="5.6"
      fill="rgba(245, 196, 81, 0.28)"
      stroke="#f5c451"
      strokeWidth="1.8"
    />
    <circle cx="16" cy="16" r="2.4" fill="#fff4c4" />
  </svg>
);

export const IonStormIcon: React.FC<{ className?: string; mistPalette?: boolean }> = ({
  className = 'w-5 h-5',
  mistPalette = false
}) => {
  const ringPrimary = mistPalette ? '#59f0d8' : '#9d7bff';
  const ringSecondary = mistPalette ? '#ff8ad4' : '#31e8ff';
  const coreCol = mistPalette ? '#d8fff6' : '#e5d8ff';

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Ion Storm"
      role="img"
    >
      {/* Counter-rotating magnetosphere ion orbits */}
      <g className="weather-ion-cw">
        <ellipse
          cx="16"
          cy="16"
          rx="12.2"
          ry="5.4"
          transform="rotate(32 16 16)"
          stroke={ringPrimary}
          strokeWidth="1.65"
          strokeDasharray="16 5"
        />
      </g>
      <g className="weather-ion-ccw">
        <ellipse
          cx="16"
          cy="16"
          rx="12.2"
          ry="5.4"
          transform="rotate(-32 16 16)"
          stroke={ringSecondary}
          strokeWidth="1.65"
          strokeDasharray="14 6"
        />
      </g>

      {/* Charged diamond plasma core + electric arc */}
      <path
        d="M16 10.6L20.4 16L16 21.4L11.6 16Z"
        fill="rgba(157, 123, 255, 0.22)"
        stroke={coreCol}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16.9 12.6L14.7 16H17.1L15.1 19.4"
        stroke="#f5c451"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="weather-bolt-arc"
      />
    </svg>
  );
};

export const WeatherIcon: React.FC<WeatherIconProps> = ({
  className = 'w-5 h-5',
  phaseId,
  kind
}) => {
  if (phaseId === 'ion_storm' || phaseId === 'tidal_squall' || phaseId === 'coastal_breeze') {
    return <IonStormIcon className={className} mistPalette={kind === 'mist'} />;
  }
  if (phaseId === 'solar_flare' || phaseId === 'cosmic_drift' || phaseId === 'aurora_dusk' || kind === 'solar') {
    return <SolarFlareIcon className={className} />;
  }
  if (kind === 'mist') {
    return <IonStormIcon className={className} mistPalette />;
  }
  return <NeonRainIcon className={className} electric={phaseId === 'electric_squall' || phaseId === 'neon_downpour'} />;
};
