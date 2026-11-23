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
  /** Cooked GLB in /assets/models to use instead of the procedural hull. */
  model?: string;
  /** Baked livery: custom paint, neon and rim options do not apply. */
  fixedLivery?: boolean;
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
  active?: boolean;
  dynamic?: boolean;
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

export type DestructiblePropKind = 'shield_pylon' | 'boost_pylon';

export interface DestructibleProp {
  id: number;
  kind: DestructiblePropKind;
  u: number;
  off: number;
  pos: THREE.Vector3;
  radius: number;
  intact: boolean;
  respawnTimer: number;
  onRail?: boolean;
  onShatter?: () => void;
  onReset?: () => void;
}

export interface ShortcutRail {
  id: number;
  uStart: number;
  uEnd: number;
  side: -1 | 1;
  off: number;
  height: number;
  width: number;
  boostU: number;
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
  destructibles?: DestructibleProp[];
  shortcutRails?: ShortcutRail[];
  anim: ((dt: number, now: number) => void)[];
  setLapPhase?: (phase: 1 | 2 | 3) => void;
  setPlayerProgress?: (u: number) => void;
  noBarrierZones?: { at: number; to: number }[];
  hasBarrierAt?: (u: number) => boolean;
  spiralBlockGates?: SpiralBlockGate[];
  randomizeSpiralBlocks?: () => void;
  spiralZones?: {
    name: string;
    cn: string;
    startU: number;
    endU: number;
    center: THREE.Vector3;
    topY: number;
    bottomY: number;
    startR: number;
    endR: number;
    clockwise: boolean;
  }[];
}

export interface SpiralBlockGate {
  u: number;
  spiralIdx: number;
  spiralName: string;
  innerSign: -1 | 1;
  blockedRing: 'INNER' | 'OUTER';
  blockedSide: -1 | 1;
  safeRing: 'INNER' | 'OUTER';
  switchDir: 'LEFT' | 'RIGHT';
  halfSpan: number;
  cool: number;
  warned: boolean;
}

export interface SpiralBlockWarning {
  active: boolean;
  blockedRing: 'INNER' | 'OUTER';
  safeRing: 'INNER' | 'OUTER';
  switchDir: 'LEFT' | 'RIGHT';
  distanceM: number;
  spiralName: string;
  urgency: number;
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
  id: 'neon' | 'beach' | 'space' | 'space_beach' | 'vortex' | 'gauntlet';
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
  noBarrierZones?: { at: number; to: number }[];
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

export type RivalArchetype = 'enforcer' | 'slipstream' | 'tactician';

export interface StandingEntry {
  id: number;
  racerId: string;
  teamName: string;
  shipName: string;
  colorHex: string;
  isPlayer: boolean;
  archetype?: RivalArchetype;
  rank: number;
  lap: number;
  progress: number;
}

export interface MinimapRacerMarker {
  id: number;
  racerId: string;
  colorHex: string;
  isPlayer: boolean;
  rank: number;
  x: number;
  y: number;
  angleDeg: number;
  distM: number;
  isAhead: boolean;
  isBehind: boolean;
}

export interface MinimapSnapshot {
  circuitId: string;
  circuitName: string;
  pathD: string;
  isSprint: boolean;
  startFinish: { x: number; y: number };
  player: MinimapRacerMarker;
  opponents: MinimapRacerMarker[];
  closestAhead: { racerId: string; colorHex: string; distM: number; rank: number } | null;
  closestBehind: { racerId: string; colorHex: string; distM: number; rank: number } | null;
}

export type RaceMode = 'single' | 'grand_prix';

export interface GrandPrixStanding {
  id: number;
  racerId: string;
  teamName: string;
  shipName: string;
  colorHex: string;
  isPlayer: boolean;
  points: number;
  lastRoundPoints: number;
  lastRoundRank: number;
}

export interface GrandPrixState {
  active: boolean;
  roundIdx: number; // 0-indexed (0..totalRounds-1)
  totalRounds: number;
  completed: boolean;
  roundScoresRecorded: boolean;
  standings: GrandPrixStanding[];
}

export interface GhostSample {
  t: number;
  u: number;
  x: number;
  airY: number;
  yawOff: number;
}

export interface CircuitRecord {
  circuitId: string;
  bestTimeSec: number | null;
  bestLapSec: number | null;
  bestTakedowns: number;
  bestDriftScore: number;
  wins: number;
  gpTrophies: number;
  bestShipId: number;
  ghostSamples: GhostSample[];
  updatedAt: number;
}

export interface RecordsSummary {
  circuits: Record<string, CircuitRecord>;
  gpChampionships: number;
  totalWins: number;
  totalTakedowns: number;
}

export interface DraftingSnapshot {
  active: boolean;
  intensity: number; // 0..1
  targetId: string;
  distM: number;
  slingshotReady: boolean;
}

export interface GhostHudSnapshot {
  active: boolean;
  bestTimeSec: number | null;
  deltaSec: number | null; // negative = ahead of ghost, positive = behind
  isNewBestTime: boolean;
  isNewBestTakedowns: boolean;
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
  onRiskRail: boolean;
  noBarriersActive: boolean;
  muted: boolean;
  countdownText: string;
  splitText: string;
  splitActive: boolean;
  reconSecondsLeft: number;
  victoryLapActive: boolean;
  archPhase: number;
  grandPrix: GrandPrixState;
  weather: WeatherSnapshot;
  hazardAlert: HazardAlert;
  hazardProximity: HazardProximityAlert;
  spiralWarning: SpiralBlockWarning;
  wrongWay: boolean;
  wrecked: boolean;
  wreckTimer: number;
  takedowns: number;
  nudgeCooldown: number;
  spinCooldown: number;
  spinActive: boolean;
  combatTag: string;
  drafting: DraftingSnapshot;
  ghost: GhostHudSnapshot;
  drift: DriftSnapshot;
  minimap: MinimapSnapshot;
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
