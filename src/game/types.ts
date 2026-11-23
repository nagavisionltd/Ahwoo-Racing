import * as THREE from 'three';

export type GameStep =
  | 'home'
  | 'driver'
  | 'level'
  | 'preview'
  | 'countdown'
  | 'race'
  | 'paused'
  | 'results';

export interface ShipProfile {
  id: number;
  kanji: string;
  name: string;
  subtitle: string;
  color: number;
  secondaryColor: number;
  hex: string;
  cls: string;
  spd: number;
  acc: number;
  hnd: number;
  bst: number;
  pilotName: string;
}

export type FeatureType = 'jump' | 'descent' | 'hill' | 'loop' | 'corkscrew' | 'tunnel';

export interface FeatureSpec {
  type: FeatureType;
  at: number;
  w: number;
  h?: number;
  gap?: number;
  radius?: number;
  narrow?: number;
  blend?: number;
  turns?: number;
  height?: number;
  underwater?: boolean;
}

export interface JumpSpec extends FeatureSpec {
  type: 'jump';
  h: number;
  gap: number;
  lip: number;
  land: number;
  landLen: number;
  deck: number;
  end: number;
  apex: number;
}

export interface LevelLook {
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ambient: number;
  ambientI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  sun: number;
  sunI: number;
  rim: number;
  rimI: number;
  exposure: number;
  bloom: number;
  bloomRadius: number;
  bloomThreshold: number;
}

export interface RoadPalette {
  base: string;
  edge: string;
  edge2: string;
  lane: string;
  centre: string;
}

export interface LevelTheme {
  accent: number;
  secondary: number;
  wall: number;
}

export interface TrackFrame {
  p: THREE.Vector3;
  h: number;
  pos: THREE.Vector3;
  t: THREE.Vector3;
  s: THREE.Vector3;
  up: THREE.Vector3;
  width: number;
}

export interface TrackObstacle {
  pos: THREE.Vector3;
  u: number;
  off: number;
  r: number;
  cool: number;
}

export interface ElevationModel {
  value: (u: number) => number;
  isGap: (u: number) => boolean;
  arc: (u: number) => number;
  jumps: JumpSpec[];
}

export interface TrackAudit {
  minRadius: number;
  selfIntersections: number;
  sampled: number;
  closed: boolean;
  steps: number;
}

export interface TrackData {
  def: LevelDef;
  curve: THREE.CatmullRomCurve3;
  len: number;
  steps: number;
  frames: { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; up: THREE.Vector3 }[];
  elev: ElevationModel;
  hw: number;
  audit: TrackAudit;
  clearance: number;
  fr: (u: number) => TrackFrame;
  widthAt: (u: number) => number;
  inSpecial: (u: number) => boolean;
  loops: (FeatureSpec & { anchor: { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; up: THREE.Vector3 }; drift: number; radius: number })[];
  rolls: FeatureSpec[];
  pads: number[];
  obstacles: TrackObstacle[];
  anim: ((dt: number, now: number) => void)[];
}

export type WeatherKind = 'rain' | 'mist' | 'solar';

export interface WeatherPhaseDef {
  id: string;
  label: string;
  cn: string;
  kind: WeatherKind;
  intensity: number; // 0..1
  wind: [number, number, number];
  streakSpeed: number;
  streakLength: number;
  streakOpacity: number;
  moteOpacity: number;
  streakColors: [number, number, number];
  moteColor: number;
  fogNearMul: number;
  fogFarMul: number;
  fogTint: number;
  fogTintMix: number;
  keyMul: number;
  keyTint: number;
  keyTintMix: number;
  rimMul: number;
  rimTint: number;
  rimTintMix: number;
  hemiMul: number;
  bloomAdd: number;
  solarFlareStrength: number;
  lightningRate: number;
}

export type WeatherHazardKind = 'debris' | 'fog' | 'surge';

export interface WeatherSnapshot {
  phaseId: string;
  label: string;
  cn: string;
  kind: WeatherKind;
  intensity: number;
  lightningFlash: number;
  solarPulse: number;
  hazardTag: string;
}

export interface HazardAlert {
  active: boolean;
  label: string;
  kind: WeatherHazardKind;
}

export interface HazardProximityAlert {
  active: boolean;
  intensity: number; // 0..1
  kind: WeatherHazardKind;
  side: number; // -1 left .. 0 center .. +1 right
  distanceM: number;
}

export interface LevelDef {
  id: 'neon' | 'beach' | 'space' | 'space_beach';
  num: string;
  name: string;
  cn: string;
  sub: string;
  tagline: string;
  badge: string;
  weatherBadge: string;
  weatherTitle: string;
  desc: string;
  trackTrackTitle: string;
  isSprint?: boolean;
  points: THREE.Vector3[];
  hw: number;
  obstacles: number;
  scale: number;
  features: FeatureSpec[];
  look: LevelLook;
  road: RoadPalette;
  theme: LevelTheme;
}

export type PaintJobId = 'obsidian' | 'pearl' | 'cobalt' | 'crimson' | 'jade' | 'bronze';
export type NeonTrimId = 'champagne' | 'cyan' | 'magenta' | 'biolume' | 'violet' | 'glacier';
export type RimStyleId = 'turbine' | 'aero' | 'split' | 'orbit';

export interface VehicleCustomization {
  paintId: PaintJobId;
  neonId: NeonTrimId;
  rimId: RimStyleId;
}

export interface PaintPreset {
  id: PaintJobId;
  name: string;
  color: number;
  hex: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  hardwareColor: number;
}

export interface NeonPreset {
  id: NeonTrimId;
  name: string;
  color: number;
  secondaryColor: number;
  hex: string;
}

export interface RimStylePreset {
  id: RimStyleId;
  name: string;
  tag: string;
}

export interface DriftSnapshot {
  active: boolean;
  dir: number;
  tier: 0 | 1 | 2 | 3;
  charge: number;
  liveScore: number;
  totalScore: number;
  lastBonusLabel: string;
}

export type AnnouncerEventKind =
  | 'race_start'
  | 'overtake'
  | 'lead_taken'
  | 'overtaken'
  | 'long_drift'
  | 'drift_boost'
  | 'hazard_debris'
  | 'hazard_fog'
  | 'hazard_surge'
  | 'obstacle_crash'
  | 'mega_jump'
  | 'weather_shift'
  | 'final_lap'
  | 'finish_win'
  | 'finish_other';

export interface AnnouncerSnapshot {
  enabled: boolean;
  speaking: boolean;
  caption: string;
  tag: string;
  urgency: 'info' | 'hype' | 'alert';
}

export interface StandingEntry {
  id: number;
  racerId: string;
  teamName: string;
  shipName: string;
  colorHex: string;
  isPlayer: boolean;
  rank: number;
  lap: number;
  progress: number;
}

export interface HudSnapshot {
  speedKmh: number;
  speedNorm: number;
  energy: number;
  lap: number;
  totalLaps: number;
  isSprint: boolean;
  progressPct: number;
  rank: number;
  totalRacers: number;
  standings: StandingEntry[];
  timeSec: number;
  bestLapSec: number | null;
  isBoosting: boolean;
  isAirborne: boolean;
  muted: boolean;
  countdownText: string;
  splitText: string;
  splitActive: boolean;
  reconSecondsLeft: number;
  weather: WeatherSnapshot;
  hazardAlert: HazardAlert;
  hazardProximity: HazardProximityAlert;
  drift: DriftSnapshot;
  announcer: AnnouncerSnapshot;
  replayShot: string;
  trackStats: {
    lengthKm: string;
    widthM: number;
    minRadiusM: number;
    jumps: number;
    loops: number;
    rolls: number;
    obstacles: number;
  };
}
