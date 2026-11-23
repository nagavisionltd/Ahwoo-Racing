import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RaceAnnouncer } from './announcer';
import { SoundEngine } from './audio';
import { getCircuitRecord, saveRaceRecord, type SaveRaceOutcomeResult } from './records';
import { generateRivalIdentities, getPlayerIdentity, pickRivalIds } from './rivals';
import { canvasTexture, radialTexture, setTextureMaxAnisotropy } from './textures';
import { LEVELS } from './tracks';
import type {
  GameStep,
  GhostSample,
  GrandPrixStanding,
  GrandPrixState,
  HazardAlert,
  HazardProximityAlert,
  HudSnapshot,
  MinimapRacerMarker,
  MinimapSnapshot,
  RaceMode,
  RivalArchetype,
  SpiralBlockWarning,
  StandingEntry,
  VehicleCustomization
} from './types';
import {
  buildLuxuryHoverCar,
  frameChassis,
  getDefaultCustomization,
  getNeonPreset,
  SHIP_PROFILES,
  type BuiltVehicle
} from './vehicles';
import { onRacerModelReady, preloadRacerModel } from './racerModels';
import { WeatherSystem } from './weather';
import { WeatherHazardManager, type HazardInteractionResult } from './weatherHazards';
import { buildWorld, disposeGroup, type BuiltWorld } from './worlds';

const TOTAL_LAPS = 3;
const MAXV = 260;

const CyberShader = {
  name: 'CyberShader',
  uniforms: {
    tDiffuse: { value: null },
    uAberration: { value: 0.0 },
    uBlur: { value: 0.0 },
    uVignette: { value: 0.24 },
    uBlueShift: { value: 0.0 },
    uSolarFlare: { value: 0.0 },
    uLightning: { value: 0.0 },
    uTime: { value: 0.0 },
    // Dynamic Weather-Driven Color Grading Uniforms
    uGradeTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uGradeShadows: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    uGradeContrast: { value: 1.0 },
    uGradeSaturation: { value: 1.0 },
    uGradeExposure: { value: 1.0 },
    uAtmosphericHaze: { value: 0.0 },
    uHazeColor: { value: new THREE.Vector3(0.05, 0.1, 0.2) },
    uSpinWarp: { value: 0.0 },
    uSpinTime: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uAberration;
    uniform float uBlur;
    uniform float uVignette;
    uniform float uBlueShift;
    uniform float uSolarFlare;
    uniform float uLightning;
    uniform float uTime;
    uniform vec3 uGradeTint;
    uniform vec3 uGradeShadows;
    uniform float uGradeContrast;
    uniform float uGradeSaturation;
    uniform float uGradeExposure;
    uniform float uAtmosphericHaze;
    uniform vec3 uHazeColor;
    uniform float uSpinWarp;
    uniform float uSpinTime;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5);
      vec2 toCenter = uv - center;
      float dist = length(toCenter);

      // Vortex Spin Attack Distortion Pass
      if (uSpinWarp > 0.001) {
        float outerMask = smoothstep(0.04, 0.86, dist);
        float vortexFalloff = 1.0 - smoothstep(0.18, 0.95, dist);
        float swirlAngle = uSpinWarp * (0.44 * vortexFalloff + 0.14 * outerMask);
        float c = cos(swirlAngle);
        float s = sin(swirlAngle);
        vec2 rotated = vec2(toCenter.x * c - toCenter.y * s, toCenter.x * s + toCenter.y * c);
        float ripple = sin(dist * 34.0 - uSpinTime * 24.0) * 0.015 * uSpinWarp * outerMask;
        vec2 radialDir = dist > 0.0001 ? toCenter / dist : vec2(0.0);
        uv = clamp(center + rotated + radialDir * ripple, 0.001, 0.999);
        toCenter = uv - center;
        dist = length(toCenter);
      }

      vec2 rOffset = toCenter * uAberration;
      vec2 bOffset = toCenter * (-uAberration * 0.85);

      float r = texture2D(tDiffuse, uv + rOffset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + bOffset).b;
      vec3 col = vec3(r, g, b);

      if (uSpinWarp > 0.001) {
        vec2 tangentDir = vec2(-toCenter.y, toCenter.x);
        float spinChroma = uSpinWarp * 0.022 * smoothstep(0.08, 0.82, dist);
        float rSpin = texture2D(tDiffuse, clamp(uv + tangentDir * spinChroma, 0.001, 0.999)).r;
        float bSpin = texture2D(tDiffuse, clamp(uv - tangentDir * spinChroma, 0.001, 0.999)).b;
        col.r = mix(col.r, rSpin, 0.72 * uSpinWarp);
        col.b = mix(col.b, bSpin, 0.72 * uSpinWarp);

        float shockRadius = 0.12 + fract(uSpinTime * 1.65) * 0.72;
        float shockRing = exp(-abs(dist - shockRadius) * 20.0) * uSpinWarp;
        float rimArc = smoothstep(0.32, 0.88, dist) * uSpinWarp * 0.22;
        col += vec3(0.14, 0.9, 1.0) * shockRing * 0.42 + vec3(0.62, 0.22, 1.0) * rimArc;
      }

      if (uBlur > 0.001) {
        vec3 acc = col;
        for (int i = 1; i <= 6; i++) {
          float t = float(i) / 6.0;
          vec2 off = toCenter * uBlur * t * 0.045;
          acc += texture2D(tDiffuse, uv + off).rgb;
          acc += texture2D(tDiffuse, uv - off).rgb;
        }
        col = acc / 13.0;
      }

      // --- Dynamic Weather-Driven Color Grading ---
      // 1. Exposure grading
      col *= uGradeExposure;

      // 2. Atmospheric depth haze
      if (uAtmosphericHaze > 0.001) {
        float haze = smoothstep(0.08, 0.95, dist) * uAtmosphericHaze;
        col = mix(col, uHazeColor, haze);
      }

      // 3. Contrast adjustment around 0.5 mid-grey
      col = (col - 0.5) * uGradeContrast + 0.5;

      // 4. Saturation adjustment
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uGradeSaturation);

      // 5. Shadow lift & color tinting
      col = col * uGradeTint + uGradeShadows * (1.0 - clamp(col, 0.0, 1.0));

      // 6. Overdrive boost blue shift
      if (uBlueShift > 0.001) {
        vec3 tinted = vec3(col.r * 0.78, col.g * 1.06, col.b * 1.28);
        col = mix(col, tinted, clamp(uBlueShift, 0.0, 1.0));
      }

      // 7. Lightning flash illumination boost
      if (uLightning > 0.001) {
        col += vec3(0.32, 0.78, 1.0) * (uLightning * 0.28);
      }

      // 8. Solar flare corona & streaks
      if (uSolarFlare > 0.001) {
        float flareDist = length(uv - vec2(0.76, 0.78));
        float corona = exp(-flareDist * 3.4) * uSolarFlare;
        float streak = exp(-abs(uv.y - 0.78) * 26.0) * exp(-abs(uv.x - 0.76) * 2.4) * uSolarFlare;
        col += vec3(1.0, 0.68, 0.28) * (corona * 0.24 + streak * 0.18);
      }

      // 9. Vignette
      float vig = smoothstep(1.25, 0.4, dist);
      col *= mix(1.0, vig, uVignette);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `
};

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

interface RivalState extends BuiltVehicle {
  id: number;
  racerId: string;
  teamName: string;
  archetype: RivalArchetype;
  u: number;
  lap: number;
  off: number;
  baseSpeed: number;
  prevProgress: number;
  vx: number;
  yawOff: number;
  yawVel: number;
  hp: number;
  wreckTimer: number;
  fallTimer: number;
  fallSide: number;
  hitInvuln: number;
  nudgeCool: number;
  disorientTimer: number;
}

interface ProjectileSlot {
  group: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
  active: boolean;
  reflected: boolean;
  u: number;
  speed: number;
  off: number;
  vx: number;
  ttl: number;
  targetRivalIdx: number;
}

interface ShardSlot {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
}

export interface EngineCallbacks {
  onStepChange: (step: GameStep) => void;
  onHudUpdate: (hud: HudSnapshot) => void;
  onShipChange: (shipId: number) => void;
  onLevelChange: (levelIdx: number, previewIdx: number) => void;
  onCustomizationChange: (custom: VehicleCustomization) => void;
}

// Pre-allocated scratch objects for zero-GC main loop
const _camT = new THREE.Vector3(0, 0, 1);
const _camUp = new THREE.Vector3(0, 1, 0);
const _camS = new THREE.Vector3(1, 0, 0);
const _camLook = new THREE.Vector3();
const _camP = new THREE.Vector3();
const _camBasis = new THREE.Matrix4();
const _camDesiredQ = new THREE.Quaternion();
const _mat4 = new THREE.Matrix4();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _vecNegS = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _replayUpTarget = new THREE.Vector3(0, 1, 0);
const _impactNormal = new THREE.Vector3();
const _localContactDir = new THREE.Vector3(1, 0.25, 0);

type ReplayShotKind = 'wide_crane' | 'close_quarter' | 'wide_heli' | 'close_front' | 'wide_apex';

interface ReplayShotDef {
  kind: ReplayShotKind;
  label: string;
  duration: number;
  fov: number;
  stiffness: number;
}

const REPLAY_SHOTS: ReplayShotDef[] = [
  { kind: 'close_quarter', label: 'CLOSE-UP · THRUSTER', duration: 3.6, fov: 46, stiffness: 76 },
  { kind: 'wide_crane', label: 'WIDE · CRANE SWEEP', duration: 4.5, fov: 70, stiffness: 28 },
  { kind: 'close_front', label: 'CLOSE-UP · NOSE AERO', duration: 3.5, fov: 44, stiffness: 68 },
  { kind: 'wide_heli', label: 'WIDE · HELICOPTER', duration: 4.6, fov: 74, stiffness: 24 },
  { kind: 'wide_apex', label: 'WIDE · TRACKSIDE', duration: 4.2, fov: 58, stiffness: 36 }
];

const DRIFT_TIER_RGB: readonly [number, number, number][] = [
  [0.16, 0.62, 1.0], // Tier 0: Electric Blue initiation
  [0.0, 0.94, 1.0],  // Tier 1: Hyper Cyan ready
  [1.0, 0.18, 0.58], // Tier 2: Neon Magenta sustained
  [1.0, 0.84, 0.28]  // Tier 3: Radiant Gold max multiplier
];

const _hazardResult: HazardInteractionResult = {
  debrisHit: false,
  debrisHitPos: new THREE.Vector3(),
  debrisPushDir: 1,
  inFogZone: false,
  inSurgeZone: false,
  energyDrainRate: 0,
  speedDragRate: 0,
  lateralJolt: 0,
  alertLabel: '',
  alertKind: 'debris',
  proximityIntensity: 0,
  proximityKind: 'debris',
  proximitySide: 0,
  proximityDistM: 999
};

export class AhwooEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cam: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private cyberPass: ShaderPass | null = null;
  private envTexture!: THREE.Texture;

  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;

  private world: BuiltWorld | null = null;
  private weather: WeatherSystem | null = null;
  private weatherHazards: WeatherHazardManager | null = null;
  private activeLevel = 0;
  private selectedLevel = 0;
  private selectedShipId = 0;
  private customByShip: Record<number, VehicleCustomization> = {
    0: getDefaultCustomization(0),
    1: getDefaultCustomization(1),
    2: getDefaultCustomization(2),
    3: getDefaultCustomization(3)
  };
  private step: GameStep = 'home';

  private player: BuiltVehicle | null = null;
  private rivals: RivalState[] = [];

  // Particle systems
  private readonly TRAIL_MAX = 360;
  private trailPos = new Float32Array(360 * 3);
  private trailLife = new Float32Array(360);
  private trailGeo = new THREE.BufferGeometry();
  private trailMat: THREE.PointsMaterial;
  private trailIdx = 0;

  private readonly SPEEDLINE_COUNT = 140;
  private speedlineGeo = new THREE.BufferGeometry();
  private speedlinePos = new Float32Array(140 * 6);
  private speedlineMat: THREE.LineBasicMaterial;

  private readonly SPARK_COUNT = 140;
  private sparkPos = new Float32Array(140 * 3);
  private sparkVel = new Float32Array(140 * 3);
  private sparkLife = new Float32Array(140);
  private sparkGeo = new THREE.BufferGeometry();
  private sparkMat: THREE.PointsMaterial;

  // Tier-colored trailing neon drift particle system
  private readonly DRIFT_MAX = 320;
  private driftPos = new Float32Array(320 * 3);
  private driftVel = new Float32Array(320 * 3);
  private driftCol = new Float32Array(320 * 3);
  private driftBaseCol = new Float32Array(320 * 3);
  private driftLife = new Float32Array(320);
  private driftMaxLife = new Float32Array(320);
  private driftGeo = new THREE.BufferGeometry();
  private driftSpriteTex: THREE.CanvasTexture;
  private driftMat: THREE.PointsMaterial;
  private driftIdx = 0;

  // Simulation state
  private S = {
    u: 0,
    x: 0,
    vx: 0,
    v: 0,
    e: 1,
    lap: 1,
    t: 0,
    lapStartTime: 0,
    bestLapSec: null as number | null,
    run: false,
    boost: 0,
    prev: 0,
    done: false,
    sector: 0,
    lastSplit: 0,
    throttle: 0,
    steer: 0,
    hitSpin: 0,
    hitSpinVel: 0,
    air: false,
    airY: 0,
    onRiskRail: false,
    riskRailHeight: 0,
    gates: 0,
    driftActive: false,
    driftDir: 0,
    driftAngle: 0,
    driftCharge: 0,
    driftTier: 0 as 0 | 1 | 2 | 3,
    driftScoreAcc: 0,
    driftLiveScore: 0,
    driftDuration: 0,
    longDriftAnnounced: false,
    totalDriftScore: 0,
    driftBonusLabel: '',
    driftBonusTimer: 0,
    edgeFallTimer: 0,
    edgeFallSide: 0,
    edgeRecoverInvuln: 0,
    yawOff: 0,
    yawVel: 0,
    wrongWay: false,
    wreckTimer: 0,
    takedowns: 0,
    nudgeCooldown: 0,
    nudgeTimer: 0,
    nudgeDir: 0,
    spinCooldown: 0,
    spinTimer: 0,
    spinAngle: 0,
    combatTag: '',
    combatTagTimer: 0,
    draftIntensity: 0,
    draftTargetId: '',
    draftDistM: 999,
    draftSlingshotTimer: 0
  };

  private prevPlayerProgress = 0;
  private prevRank = 4;
  private firstFrame = true;
  private screenShake = 0;
  private aberrationPulse = 0;
  private camDip = 0;
  private camBack = 10.2;
  private camUpD = 2.6;
  private camBoost = 0;
  private camPullback = 0;
  private camRoll = 0;
  private camSpringPos = new THREE.Vector3();
  private camSpringVel = new THREE.Vector3();
  private camSpringInit = false;
  private replayShotIdx = 0;
  private replayShotElapsed = 0;
  private replaySide = 1;
  private replayWasActive = false;
  private replayCutRequested = false;
  private hitstopTimer = 0;
  private reconU = 0;
  private reconDir = 1;
  private reconSecondsLeft = 6;
  private reconInterval: number | null = null;
  private countdownText = '3';
  private countdownTimers: number[] = [];
  private splitText = '';
  private splitTimer: number | null = null;
  private hazardAlert: HazardAlert = { active: false, label: '', kind: 'debris' };
  private hazardProximity: HazardProximityAlert = {
    active: false,
    intensity: 0,
    kind: 'debris',
    side: 0,
    distanceM: 999
  };
  private debrisAlertTimer = 0;
  private spiralWarning: SpiralBlockWarning = {
    active: false,
    blockedRing: 'INNER',
    safeRing: 'OUTER',
    switchDir: 'RIGHT',
    distanceM: 0,
    spiralName: '',
    urgency: 0
  };
  private spinRingMesh: THREE.Mesh | null = null;
  private spinRingMat: THREE.MeshBasicMaterial | null = null;

  // Post-impact 3D localized hexagonal shield ripple dome
  private impactShieldMesh: THREE.Mesh | null = null;
  private impactShieldGeo: THREE.SphereGeometry | null = null;
  private impactShieldMat: THREE.ShaderMaterial | null = null;
  private impactShieldTimer = 0;
  private readonly IMPACT_SHIELD_DUR = 0.44;

  // Destructible pylon 3D shatter shard pool
  private readonly SHARD_POOL_SIZE = 32;
  private shards: ShardSlot[] = [];
  private shardGeo: THREE.TetrahedronGeometry | null = null;
  private shardMats: THREE.MeshBasicMaterial[] = [];
  private pylonHintCooldown = 0;

  // Ghost replay & best time split persistence
  private ghostVehicle: BuiltVehicle | null = null;
  private ghostMat: THREE.MeshBasicMaterial | null = null;
  private ghostSamplesSaved: GhostSample[] = [];
  private ghostBestTimeSec: number | null = null;
  private ghostRecording: GhostSample[] = [];
  private ghostSampleTimer = 0;
  private ghostDeltaSec: number | null = null;
  private lastRecordOutcome: SaveRaceOutcomeResult | null = null;

  private readonly PROJ_POOL_SIZE = 8;
  private projectiles: ProjectileSlot[] = [];
  private projCoreGeo: THREE.OctahedronGeometry | null = null;
  private projHaloGeo: THREE.TorusGeometry | null = null;
  private projSpawnTimer = 2.6;
  private projAlertTimer = 0;

  // Victory Lap cinematic barrel roll & slow-mo state
  private victoryActive = false;
  private victoryTimer = 0;
  private readonly VICTORY_LAP_DUR = 4.6;

  // Active Track Architecture lap/segment phase (1..3)
  private currentArchPhase: 1 | 2 | 3 = 1;

  // Grand Prix Championship state (4-round sequential tournament)
  private raceMode: RaceMode = 'single';
  private gpRoundIdx = 0;
  private gpCompleted = false;
  private gpRoundScoresRecorded = false;
  private gpPointsByRacer: Record<string, GrandPrixStanding> = {};

  // Dynamic Weather-Driven Color Grading & Bloom State
  private curGradeTint = new THREE.Vector3(1.0, 1.0, 1.0);
  private curGradeShadows = new THREE.Vector3(0.0, 0.0, 0.0);
  private curGradeContrast = 1.0;
  private curGradeSaturation = 1.0;
  private curGradeExposure = 1.0;
  private curHaze = 0.0;
  private curHazeColor = new THREE.Vector3(0.05, 0.1, 0.2);
  private curBloomStrength = 0.46;
  private curBloomRadius = 0.32;
  private curBloomThreshold = 1.0;

  // Real-time Holographic Track Minimap Geometry
  private minimapPathD = '';
  private minimapStartFinish = { x: 50, y: 50 };
  private minimapMidX = 0;
  private minimapMidZ = 0;
  private minimapMaxSpan = 1;

  private heldKeys: Record<string, boolean> = {};
  private frameId = 0;
  private lastTickMs = 0;
  private lastHudEmitMs = 0;
  private disposed = false;

  public readonly audio = new SoundEngine();
  private readonly announcer: RaceAnnouncer;

  // Turntable preview renderer
  private pvCanvas: HTMLCanvasElement | null = null;
  private pvRenderer: THREE.WebGLRenderer | null = null;
  private pvScene: THREE.Scene | null = null;
  private pvCam: THREE.PerspectiveCamera | null = null;
  private pvRoot: THREE.Group | null = null;
  private pvPlatform: THREE.Group | null = null;
  private pvRing: THREE.Mesh | null = null;
  private pvSpinners: THREE.Object3D[] = [];
  private pvDragYaw = -0.55;
  private pvIsDragging = false;
  private pvLastX = 0;
  private pvEnvTexture: THREE.Texture | null = null;
  private pvHoverShipId: number | null = null;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.announcer = new RaceAnnouncer(this.audio, () => {
      if (!this.disposed) this.emitHud(false);
    });
    this.loadSavedCustomizations();
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    setTextureMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090a18);
    this.scene.fog = new THREE.Fog(0x090a18, 330, 3900);

    // Image-based lighting is rebuilt per circuit in loadLevel().
    this.buildLevelEnvironment(LEVELS[0]);

    // Fixed-livery chassis stream in after the world is up; rebuild the ship
    // and turntable once the selected model actually lands.
    onRacerModelReady(() => {
      // A late arrival can be a hovered preview or the locked-in ship.
      this.updateTurntableModel();
      if (SHIP_PROFILES[this.selectedShipId]?.fixedLivery) this.rebuildPlayer();
      // Rival grids now field cooked hulls too; rebuild them in place while the
      // car is still in the garage, never mid-race.
      if (this.rivals.length > 0 && this.step !== 'race' && this.step !== 'results') {
        this.setupRivals(this.selectedShipId);
      }
    });
    for (const p of SHIP_PROFILES) {
      if (p.model) preloadRacerModel(p.model);
    }

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.cam = new THREE.PerspectiveCamera(64, w / h, 0.5, 14000);

    this.ambient = new THREE.AmbientLight(0x93a7d8, 0.65);
    this.hemi = new THREE.HemisphereLight(0xbfe6ff, 0x35214f, 1.25);
    this.keyLight = new THREE.DirectionalLight(0xffeed8, 1.85);
    this.keyLight.position.set(-1.2, 2.4, 1.0);
    this.rimLight = new THREE.DirectionalLight(0x6fd8ff, 0.85);
    this.rimLight.position.set(1.6, 1.4, -1.6);
    this.scene.add(this.ambient, this.hemi, this.keyLight, this.rimLight);

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.cam));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.62, 0.34, 0.95);
      this.composer.addPass(this.bloomPass);
      this.cyberPass = new ShaderPass(CyberShader);
      this.composer.addPass(this.cyberPass);
    }

    // FX setup
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailMat = new THREE.PointsMaterial({
      color: 0xf5c451,
      size: 4.0,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    this.scene.add(new THREE.Points(this.trailGeo, this.trailMat));

    for (let i = 0; i < this.SPEEDLINE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 55;
      const y = (Math.random() - 0.5) * 40;
      const z = -Math.random() * 85;
      this.speedlinePos[i * 6] = x;
      this.speedlinePos[i * 6 + 1] = y;
      this.speedlinePos[i * 6 + 2] = z;
      this.speedlinePos[i * 6 + 3] = x;
      this.speedlinePos[i * 6 + 4] = y;
      this.speedlinePos[i * 6 + 5] = z - 10;
    }
    this.speedlineGeo.setAttribute('position', new THREE.BufferAttribute(this.speedlinePos, 3));
    this.speedlineMat = new THREE.LineBasicMaterial({
      color: 0xd8f6ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.cam.add(new THREE.LineSegments(this.speedlineGeo, this.speedlineMat));
    this.scene.add(this.cam);

    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkMat = new THREE.PointsMaterial({
      color: 0xffd700,
      size: 3.6,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.scene.add(new THREE.Points(this.sparkGeo, this.sparkMat));

    for (let i = 0; i < this.DRIFT_MAX; i++) {
      this.driftPos[i * 3 + 1] = -9999;
      this.driftMaxLife[i] = 1;
    }
    this.driftGeo.setAttribute('position', new THREE.BufferAttribute(this.driftPos, 3));
    this.driftGeo.setAttribute('color', new THREE.BufferAttribute(this.driftCol, 3));
    this.driftSpriteTex = radialTexture('rgba(255, 255, 255, 1)');
    this.driftMat = new THREE.PointsMaterial({
      size: 5.2,
      map: this.driftSpriteTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    this.scene.add(new THREE.Points(this.driftGeo, this.driftMat));

    // Initial world & vehicles
    this.initShards();
    this.initProjectiles();
    this.loadLevel(0);
    this.rebuildPlayer();
    this.setupRivals(this.selectedShipId);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.cam);
    }

    this.bindEvents();
    this.callbacks.onCustomizationChange(this.getCustomization());
    this.emitHud(true);
    this.lastTickMs = performance.now();
    this.tick();
  }

  private loadSavedCustomizations(): void {
    try {
      const raw = window.localStorage.getItem('ahwoo_vehicle_custom_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, Partial<VehicleCustomization>>;
      for (const id of [0, 1, 2, 3]) {
        const saved = parsed[String(id)];
        if (saved) {
          const def = getDefaultCustomization(id);
          this.customByShip[id] = {
            paintId: saved.paintId || def.paintId,
            neonId: saved.neonId || def.neonId,
            rimId: saved.rimId || def.rimId
          };
        }
      }
    } catch {
      // ignore storage unavailability
    }
  }

  private saveCustomizations(): void {
    try {
      window.localStorage.setItem('ahwoo_vehicle_custom_v1', JSON.stringify(this.customByShip));
    } catch {
      // ignore storage unavailability
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('resize', this.onResize);
  }

  private onWindowBlur = (): void => {
    this.heldKeys = {};
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.heldKeys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat) return;

    if (e.code === 'KeyM') {
      const muted = this.audio.toggleMute();
      if (muted) this.announcer.stop();
      this.showSplit(muted ? 'AUDIO MUTED' : 'AUDIO ACTIVE');
      this.emitHud(true);
    }

    if (e.code === 'KeyV' && (this.step === 'race' || this.step === 'preview' || this.step === 'level')) {
      this.cycleWeather();
    }

    if (e.code === 'KeyC' && (this.step === 'paused' || this.step === 'results')) {
      this.cutReplayCamera();
    }

    if (e.code === 'Escape') {
      if (this.step === 'race') {
        this.pauseRace();
      } else if (this.step === 'paused') {
        this.resumeRace();
      }
      return;
    }

    if (this.step === 'home' && (e.code === 'Enter' || e.code === 'Space')) {
      this.audio.playUiClick();
      this.setStep('driver');
    } else if (this.step === 'driver') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cycleShip(-1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cycleShip(1);
      if (e.code === 'Enter') {
        this.audio.playUiClick();
        this.setStep('level');
      }
    } else if (this.step === 'level') {
      if (e.code === 'Digit1') this.commitLevel(0);
      if (e.code === 'Digit2') this.commitLevel(1);
      if (e.code === 'Digit3') this.commitLevel(2);
      if (e.code === 'Digit4') this.commitLevel(3);
      if (e.code === 'Digit5') this.commitLevel(4);
      if (e.code === 'Digit6') this.commitLevel(5);
    } else if (this.step === 'preview' && (e.code === 'Enter' || e.code === 'Space')) {
      this.startCountdown();
    } else if (this.step === 'race' && this.S.run) {
      if (e.code === 'KeyQ') this.triggerNudge(-1);
      if (e.code === 'KeyE') this.triggerNudge(1);
      if (e.code === 'KeyF') this.triggerSpinAttack();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys[e.code] = false;
  };

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.bloomPass?.resolution.set(w, h);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.resizeTurntable();
  };

  /**
   * Per-level reflection environment. A small equirect sky in the circuit's own
   * palette (sky, horizon glow, sun, rim bounce) is baked to PMREM, so chrome,
   * paint and the road surface reflect the level they are in rather than one
   * shared studio room.
   */
  private buildLevelEnvironment(def: (typeof LEVELS)[number]): void {
    const hexStr = (hex: number) => '#' + new THREE.Color(hex).getHexString();
    const skyTex = canvasTexture(512, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, hexStr(def.look.sky));
      grd.addColorStop(0.44, hexStr(def.look.hemiSky));
      grd.addColorStop(0.52, hexStr(def.look.fog));
      grd.addColorStop(1, '#04060b');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);

      g.globalCompositeOperation = 'lighter';

      const band = g.createLinearGradient(0, h * 0.34, 0, h * 0.66);
      band.addColorStop(0, 'rgba(0,0,0,0)');
      band.addColorStop(0.5, hexStr(def.theme.accent));
      band.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.45;
      g.fillStyle = band;
      g.fillRect(0, h * 0.3, w, h * 0.4);

      const sun = g.createRadialGradient(w * 0.3, h * 0.36, 4, w * 0.3, h * 0.36, w * 0.17);
      sun.addColorStop(0, hexStr(def.look.sun));
      sun.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.9;
      g.fillStyle = sun;
      g.fillRect(0, 0, w, h);

      const rim = g.createRadialGradient(w * 0.78, h * 0.44, 4, w * 0.78, h * 0.44, w * 0.14);
      rim.addColorStop(0, hexStr(def.look.rim));
      rim.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55;
      g.fillStyle = rim;
      g.fillRect(0, 0, w, h);

      g.globalAlpha = 0.3;
      g.fillStyle = hexStr(def.theme.secondary);
      g.fillRect(0, h * 0.56, w, 6);

      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    });
    skyTex.mapping = THREE.EquirectangularReflectionMapping;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromEquirectangular(skyTex);
    this.envTexture?.dispose();
    this.envTexture = rt.texture;
    this.scene.environment = this.envTexture;
    skyTex.dispose();
    pmrem.dispose();
  }

  private loadLevel(index: number): void {
    if (this.weatherHazards) {
      this.weatherHazards.dispose(this.scene);
      this.weatherHazards = null;
    }
    if (this.weather) {
      this.weather.dispose(this.scene);
      this.weather = null;
    }
    if (this.world) disposeGroup(this.world.group, this.scene);
    this.activeLevel = index;
    const def = LEVELS[index];
    this.buildLevelEnvironment(def);
    this.world = buildWorld(def, this.scene, {
      ambient: this.ambient,
      hemi: this.hemi,
      keyLight: this.keyLight,
      rimLight: this.rimLight
    });
    this.weather = new WeatherSystem(def, this.scene, {
      onPhaseChange: (phase) => {
        if (this.step === 'race' && this.S.run) {
          this.showSplit(`WEATHER // ${phase.label}`);
        }
        this.emitHud(true);
      },
      onLightning: (strength) => {
        if (this.step === 'race' || this.step === 'preview' || this.step === 'level' || this.step === 'countdown') {
          this.audio.playThunder(strength);
        }
      },
      onSolarSurge: (strength) => {
        if (this.step === 'race' || this.step === 'preview' || this.step === 'level' || this.step === 'countdown') {
          this.audio.playSolarSurge(strength);
          if (this.step === 'race' && this.S.run) {
            this.aberrationPulse = Math.max(this.aberrationPulse, 0.025);
          }
        }
      }
    });
    this.weatherHazards = new WeatherHazardManager(def, this.world.trk, this.scene);
    this.computeMinimapGeometry();
    if (this.bloomPass) {
      this.bloomPass.strength = def.look.bloom;
      this.bloomPass.radius = def.look.bloomRadius;
      this.bloomPass.threshold = def.look.bloomThreshold;
    }
    this.renderer.toneMappingExposure = def.look.exposure;
    this.trailMat.color.setHex(def.theme.secondary);
    this.speedlineMat.color.setHex(def.theme.accent);
    this.sparkMat.color.setHex(def.theme.secondary);
    this.rebuildGhostForLevel(def.id);
    this.audio.setLevel(index);
  }

  private rebuildGhostForLevel(circuitId: string): void {
    if (this.ghostVehicle) {
      this.scene.remove(this.ghostVehicle.g);
      this.ghostVehicle = null;
    }
    const rec = getCircuitRecord(circuitId);
    this.ghostBestTimeSec = rec.bestTimeSec;
    this.ghostSamplesSaved = rec.ghostSamples || [];
    this.ghostDeltaSec = null;

    if (this.ghostSamplesSaved.length >= 4) {
      if (!this.ghostMat) {
        this.ghostMat = new THREE.MeshBasicMaterial({
          color: 0x00f0ff,
          transparent: true,
          opacity: 0.32,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        });
      }
      const built = buildLuxuryHoverCar(rec.bestShipId || 0, 0x00f0ff, 1.0);
      built.g.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).material = this.ghostMat!;
        }
      });
      built.light.intensity = 0;
      built.g.visible = false;
      this.ghostVehicle = built;
      this.scene.add(built.g);
    }
  }

  public cycleWeather(): void {
    if (!this.weather) return;
    this.audio.playUiClick();
    const next = this.weather.cyclePhase(true);
    if (this.step === 'race' || this.step === 'preview' || this.step === 'level') {
      this.showSplit(`WEATHER // ${next.label}`);
    }
    this.emitHud(true);
  }

  public toggleVoiceover(): boolean {
    this.audio.playUiClick();
    const next = this.announcer.toggleEnabled();
    this.emitHud(true);
    return next;
  }

  public cutReplayCamera(): void {
    if (this.step !== 'paused' && this.step !== 'results') return;
    this.audio.playUiClick();
    this.replayCutRequested = true;
  }

  private rebuildPlayer(): void {
    if (this.player) this.scene.remove(this.player.g);
    const custom = this.getCustomization(this.selectedShipId);
    const neon = getNeonPreset(custom.neonId);
    this.player = buildLuxuryHoverCar(this.selectedShipId, neon.color, 1.05, custom);

    if (!this.spinRingMat) {
      this.spinRingMat = new THREE.MeshBasicMaterial({
        color: neon.color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      });
    } else {
      this.spinRingMat.color.setHex(neon.color);
      this.spinRingMat.opacity = 0;
    }
    this.spinRingMesh = new THREE.Mesh(new THREE.RingGeometry(2.8, 5.6, 36), this.spinRingMat);
    this.spinRingMesh.rotation.x = -Math.PI / 2;
    this.spinRingMesh.position.y = 0.25;
    this.spinRingMesh.visible = false;
    this.player.g.add(this.spinRingMesh);

    if (!this.impactShieldGeo) {
      this.impactShieldGeo = new THREE.SphereGeometry(3.35, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
    }
    if (!this.impactShieldMat) {
      this.impactShieldMat = new THREE.ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(0x00f0ff) }
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vLocalPos;
          varying vec3 vViewPos;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vLocalPos = position;
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            vViewPos = -mvPos.xyz;
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform float uProgress;
          uniform float uOpacity;
          uniform vec3 uColor;
          varying vec3 vNormal;
          varying vec3 vLocalPos;
          varying vec3 vViewPos;
          void main() {
            vec3 viewDir = normalize(vViewPos);
            float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 1.65);
            float radialDist = length(vLocalPos.xz) / 3.35;
            float wave = exp(-pow((radialDist - uProgress * 1.15) * 6.5, 2.0));
            float hex = 0.55 + 0.45 * sin(vLocalPos.x * 11.0) * cos(vLocalPos.z * 11.0 + vLocalPos.y * 7.0);
            float alpha = uOpacity * (fresnel * 0.85 + wave * 0.9) * hex * (1.0 - smoothstep(0.75, 1.05, radialDist));
            vec3 col = mix(uColor, vec3(1.0), wave * 0.55);
            gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      });
    }
    this.impactShieldMesh = new THREE.Mesh(this.impactShieldGeo, this.impactShieldMat);
    this.impactShieldMesh.visible = false;
    this.player.g.add(this.impactShieldMesh);

    this.scene.add(this.player.g);
  }

  private setupRivals(playerId: number): void {
    for (const r of this.rivals) this.scene.remove(r.g);
    this.rivals = [];
    const trk = this.world?.trk;
    const hw = trk ? trk.hw : 120;
    const ids = pickRivalIds(playerId, 3);
    const identities = generateRivalIdentities(ids.length);
    const archetypes: RivalArchetype[] = ['enforcer', 'slipstream', 'tactician'];
    ids.forEach((typeId, i) => {
      const prof = SHIP_PROFILES[typeId];
      const built = buildLuxuryHoverCar(typeId, prof.color, 0.96, undefined, i);
      this.scene.add(built.g);
      this.rivals.push({
        ...built,
        id: typeId,
        racerId: identities[i].racerId,
        teamName: identities[i].teamName,
        archetype: archetypes[i % archetypes.length],
        // u is a fraction of the lap and this circuit is ~18.8 km, so the grid
        // is placed in metres ahead of the player: fractional offsets put the
        // whole field hundreds of metres up the road, off camera.
        u: ((i + 1) * 9) / (trk?.len || 1000),
        lap: 1,
        off: [-0.06, 0, 0.06][i] * hw,
        baseSpeed: [0.83, 0.88, 0.94][i],
        prevProgress: ((i + 1) * 9) / (trk?.len || 1000),
        vx: 0,
        yawOff: 0,
        yawVel: 0,
        hp: 1.0,
        wreckTimer: 0,
        fallTimer: 0,
        fallSide: 1,
        hitInvuln: 0,
        nudgeCool: 1.5 + i * 0.7,
        disorientTimer: 0
      });
    });
  }

  // Public UI actions
  public getStep(): GameStep {
    return this.step;
  }

  public getSelectedShip(): number {
    return this.selectedShipId;
  }

  public getCustomization(shipId = this.selectedShipId): VehicleCustomization {
    return { ...(this.customByShip[shipId] || getDefaultCustomization(shipId)) };
  }

  public setCustomization(patch: Partial<VehicleCustomization>): void {
    const current = this.getCustomization(this.selectedShipId);
    this.customByShip[this.selectedShipId] = { ...current, ...patch };
    this.saveCustomizations();
    this.audio.playUiClick();
    this.rebuildPlayer();
    this.updateTurntableModel();
    this.callbacks.onCustomizationChange(this.getCustomization(this.selectedShipId));
  }

  public getSelectedLevel(): number {
    return this.selectedLevel;
  }

  public setStep(next: GameStep): void {
    this.step = next;
    if (this.reconInterval !== null) {
      clearInterval(this.reconInterval);
      this.reconInterval = null;
    }
    this.countdownTimers.forEach(clearTimeout);
    this.countdownTimers = [];

    this.audio.setMusicMode(next === 'driver' || next === 'level' ? 'menu' : 'race');

    if (next === 'level' && this.activeLevel !== this.selectedLevel) {
      this.previewLevel(this.selectedLevel);
    }
    if ((next === 'home' || next === 'driver') && this.activeLevel !== this.selectedLevel) {
      this.loadLevel(this.selectedLevel);
      this.setupRivals(this.selectedShipId);
    }
    if (next !== 'race' && next !== 'results') {
      this.announcer.stop();
    }
    if (next === 'driver') {
      this.pvHoverShipId = null;
      this.updateTurntableModel();
      this.resizeTurntable();
    } else {
      this.pvHoverShipId = null;
    }
    if (next === 'preview') {
      this.startRecon();
    }

    this.callbacks.onStepChange(next);
    this.emitHud(true);
  }

  public getRaceMode(): RaceMode {
    return this.raceMode;
  }

  public setRaceMode(mode: RaceMode): void {
    this.audio.playUiClick();
    this.raceMode = mode;
    if (mode === 'grand_prix') {
      this.initGrandPrixStandings();
    } else {
      this.gpRoundIdx = 0;
      this.gpCompleted = false;
      this.gpRoundScoresRecorded = false;
    }
    this.emitHud(true);
  }

  public enterGrandPrixFromHome(): void {
    this.audio.playUiClick();
    this.raceMode = 'grand_prix';
    this.initGrandPrixStandings();
    this.setStep('driver');
  }

  public startGrandPrixCup(): void {
    this.audio.playUiClick();
    this.raceMode = 'grand_prix';
    this.initGrandPrixStandings();
    this.selectedLevel = 0;
    if (this.activeLevel !== 0) {
      this.loadLevel(0);
    }
    this.syncGpRivalIdentities();
    this.resetRaceState();
    this.callbacks.onLevelChange(0, 0);
    this.setStep('preview');
  }

  public nextGrandPrixRound(): void {
    this.audio.playUiClick();
    if (this.raceMode !== 'grand_prix') {
      this.startCountdown();
      return;
    }
    if (this.gpCompleted || this.gpRoundIdx >= LEVELS.length - 1) {
      this.startGrandPrixCup();
      return;
    }
    this.gpRoundIdx += 1;
    this.gpRoundScoresRecorded = false;
    const nextIdx = this.gpRoundIdx;
    this.selectedLevel = nextIdx;
    if (this.activeLevel !== nextIdx) {
      this.loadLevel(nextIdx);
    }
    this.syncGpRivalIdentities();
    this.resetRaceState();
    this.callbacks.onLevelChange(nextIdx, nextIdx);
    this.setStep('preview');
  }

  private initGrandPrixStandings(): void {
    this.gpRoundIdx = 0;
    this.gpCompleted = false;
    this.gpRoundScoresRecorded = false;
    this.gpPointsByRacer = {};

    const pProf = SHIP_PROFILES[this.selectedShipId] || SHIP_PROFILES[0];
    const pIdent = getPlayerIdentity(this.selectedShipId);
    this.gpPointsByRacer['player'] = {
      id: pProf.id,
      racerId: pIdent.racerId,
      teamName: pIdent.teamName,
      shipName: pProf.name,
      colorHex: pProf.hex,
      isPlayer: true,
      points: 0,
      lastRoundPoints: 0,
      lastRoundRank: 1
    };

    const ids = pickRivalIds(this.selectedShipId, 3);
    const identities = generateRivalIdentities(ids.length);
    ids.forEach((typeId, i) => {
      const prof = SHIP_PROFILES[typeId] || SHIP_PROFILES[0];
      const ident = identities[i];
      this.gpPointsByRacer[`rival_${typeId}`] = {
        id: typeId,
        racerId: ident.racerId,
        teamName: ident.teamName,
        shipName: prof.name,
        colorHex: prof.hex,
        isPlayer: false,
        points: 0,
        lastRoundPoints: 0,
        lastRoundRank: i + 2
      };
    });
  }

  private syncGpRivalIdentities(): void {
    this.rivals.forEach((rv) => {
      const stored = this.gpPointsByRacer[`rival_${rv.id}`];
      if (stored) {
        rv.racerId = stored.racerId;
        rv.teamName = stored.teamName;
      }
    });
  }

  private recordGrandPrixFinish(): void {
    if (this.raceMode !== 'grand_prix' || this.gpRoundScoresRecorded) return;
    if (!this.gpPointsByRacer['player']) {
      this.initGrandPrixStandings();
    }

    const trk = this.world?.trk;
    const isSprint = !!trk?.def.isSprint;
    const uNorm = Math.max(0, Math.min(1, isSprint ? this.S.u : ((this.S.u % 1) + 1) % 1));
    const playerProgress = isSprint ? uNorm : this.S.lap - 1 + uNorm;

    const entries: { key: string; progress: number; isPlayer: boolean }[] = [
      { key: 'player', progress: playerProgress, isPlayer: true },
      ...this.rivals.map((rv) => ({
        key: `rival_${rv.id}`,
        progress: isSprint ? Math.max(0, Math.min(1, rv.u)) : rv.lap - 1 + rv.u,
        isPlayer: false
      }))
    ];
    entries.sort((a, b) => b.progress - a.progress);

    const ptsTable = [25, 18, 15, 12];
    entries.forEach((entry, idx) => {
      const pts = ptsTable[idx] ?? 8;
      const target = this.gpPointsByRacer[entry.key];
      if (target) {
        target.points += pts;
        target.lastRoundPoints = pts;
        target.lastRoundRank = idx + 1;
      }
    });

    this.gpRoundScoresRecorded = true;
    if (this.gpRoundIdx >= LEVELS.length - 1) {
      this.gpCompleted = true;
    }
  }

  private buildGrandPrixState(): GrandPrixState {
    const standings = Object.values(this.gpPointsByRacer)
      .map((s) => ({ ...s }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.lastRoundRank - b.lastRoundRank;
      });
    return {
      active: this.raceMode === 'grand_prix',
      roundIdx: this.gpRoundIdx,
      totalRounds: LEVELS.length,
      completed: this.gpCompleted,
      roundScoresRecorded: this.gpRoundScoresRecorded,
      standings
    };
  }

  public selectShip(id: number): void {
    if (!SHIP_PROFILES[id]) return;
    this.audio.playUiClick();
    this.selectedShipId = id;
    const model = SHIP_PROFILES[id].model;
    if (model) preloadRacerModel(model);
    this.rebuildPlayer();
    this.setupRivals(id);
    if (this.raceMode === 'grand_prix') {
      this.initGrandPrixStandings();
    }
    this.updateTurntableModel();
    this.callbacks.onShipChange(id);
    this.callbacks.onCustomizationChange(this.getCustomization(id));
    this.emitHud(true);
  }

  public previewShip(id: number | null): void {
    const next = id !== null && SHIP_PROFILES[id] ? id : null;
    if (next === this.pvHoverShipId) return;
    this.pvHoverShipId = next;
    this.updateTurntableModel();
  }

  public cycleShip(dir: number): void {
    const next = (this.selectedShipId + dir + SHIP_PROFILES.length) % SHIP_PROFILES.length;
    this.selectShip(next);
  }

  public previewLevel(index: number): void {
    if (!LEVELS[index]) return;
    if (index !== this.activeLevel) {
      this.loadLevel(index);
      this.setupRivals(this.selectedShipId);
      this.reconU = 0;
    }
    this.callbacks.onLevelChange(this.selectedLevel, this.activeLevel);
    this.emitHud(true);
  }

  public selectLevelOnly(index: number): void {
    if (!LEVELS[index]) return;
    this.audio.playUiClick();
    this.selectedLevel = index;
    if (index !== this.activeLevel) {
      this.previewLevel(index);
    } else {
      this.callbacks.onLevelChange(this.selectedLevel, this.activeLevel);
    }
  }

  public commitLevel(index: number): void {
    if (!LEVELS[index]) return;
    this.audio.playUiClick();
    this.selectedLevel = index;
    if (index !== this.activeLevel) {
      this.loadLevel(index);
      this.setupRivals(this.selectedShipId);
    }
    this.resetRaceState();
    this.callbacks.onLevelChange(this.selectedLevel, this.activeLevel);
    this.setStep('preview');
  }

  private startRecon(): void {
    this.reconU = 0;
    this.reconSecondsLeft = 6;
    this.emitHud(true);
    this.reconInterval = window.setInterval(() => {
      this.reconSecondsLeft -= 1;
      if (this.reconSecondsLeft <= 0) {
        if (this.reconInterval !== null) {
          clearInterval(this.reconInterval);
          this.reconInterval = null;
        }
        this.startCountdown();
      } else {
        this.emitHud(true);
      }
    }, 1000);
  }

  public startCountdown(): void {
    this.audio.unlock();
    if (this.raceMode === 'grand_prix' && Object.keys(this.gpPointsByRacer).length > 0) {
      this.syncGpRivalIdentities();
    } else {
      const identities = generateRivalIdentities(this.rivals.length);
      this.rivals.forEach((r, i) => {
        r.racerId = identities[i].racerId;
        r.teamName = identities[i].teamName;
      });
    }
    this.resetRaceState();
    this.setStep('countdown');
    const seq: [string, number, boolean][] = [
      ['3', 0, false],
      ['2', 780, false],
      ['1', 1560, false],
      ['GO!', 2340, true]
    ];
    for (const [txt, ms, isGo] of seq) {
      this.countdownTimers.push(
        window.setTimeout(() => {
          this.countdownText = txt;
          this.audio.playCountdown(isGo);
          this.emitHud(true);
        }, ms)
      );
    }
    this.countdownTimers.push(window.setTimeout(() => this.startRace(), 3150));
  }

  private startRace(): void {
    Object.assign(this.S, {
      run: true,
      t: 0,
      lapStartTime: 0,
      bestLapSec: null,
      lap: 1,
      sector: 0,
      lastSplit: 0,
      done: false,
      v: 0,
      boost: 0,
      throttle: 0,
      hitSpin: 0,
      hitSpinVel: 0,
      air: false,
      airY: 0,
      onRiskRail: false,
      riskRailHeight: 0,
      gates: 0,
      driftActive: false,
      driftDir: 0,
      driftAngle: 0,
      driftCharge: 0,
      driftTier: 0,
      driftScoreAcc: 0,
      driftLiveScore: 0,
      driftDuration: 0,
      longDriftAnnounced: false,
      totalDriftScore: 0,
      driftBonusLabel: '',
      driftBonusTimer: 0,
      edgeFallTimer: 0,
      edgeFallSide: 0,
      edgeRecoverInvuln: 0,
      yawOff: 0,
      yawVel: 0,
      wrongWay: false,
      wreckTimer: 0,
      takedowns: 0,
      nudgeCooldown: 0,
      nudgeTimer: 0,
      nudgeDir: 0,
      spinCooldown: 0,
      spinTimer: 0,
      spinAngle: 0,
      combatTag: '',
      combatTagTimer: 0,
      draftIntensity: 0,
      draftTargetId: '',
      draftDistM: 999,
      draftSlingshotTimer: 0
    });
    // u is lap-normalised and this circuit is ~18.8 km, so the grid gap has to
    // be expressed in metres; a fractional offset puts the field off camera.
    const gridLenM = this.world?.trk?.len || 1000;
    this.rivals.forEach((r, i) => {
      r.u = ((i + 1) * 9) / gridLenM;
      r.lap = 1;
      r.prevProgress = r.u;
      r.vx = 0;
      r.yawOff = 0;
      r.yawVel = 0;
      r.hp = 1.0;
      r.wreckTimer = 0;
      r.fallTimer = 0;
      r.hitInvuln = 0;
      r.nudgeCool = 1.6 + i * 0.7;
      r.disorientTimer = 0;
    });
    this.ghostRecording = [];
    this.ghostSampleTimer = 0;
    this.ghostDeltaSec = null;
    this.lastRecordOutcome = null;
    this.impactShieldTimer = 0;
    if (this.impactShieldMesh) this.impactShieldMesh.visible = false;
    this.resetProjectiles();
    this.prevPlayerProgress = 0;
    this.prevRank = 4;
    this.firstFrame = true;
    this.camSpringInit = false;
    this.camSpringVel.set(0, 0, 0);
    this.camRoll = 0;
    this.replayWasActive = false;
    this.announcer.resetRaceCooldowns();
    this.setStep('race');
    const def = LEVELS[this.activeLevel];
    const isSprint = !!this.world?.trk.def.isSprint;
    this.showSplit(isSprint ? 'SPRINT START // POINT-TO-POINT' : `LAP 1 / ${TOTAL_LAPS}`);
    this.announcer.trigger('race_start', { circuit: def.name });
  }

  public pauseRace(): void {
    if (this.step !== 'race') return;
    this.S.run = false;
    this.heldKeys = {};
    this.audio.updateEngine(0, false, false);
    this.audio.updateDriftSound(false, 0, 0);
    this.audio.updateWeatherAmbience('rain', 0, false);
    this.audio.updateHazardDrain(false);
    this.announcer.stop();
    this.replayWasActive = false;
    this.replayShotIdx = 0;
    this.replayShotElapsed = 0;
    this.setStep('paused');
  }

  public resumeRace(): void {
    if (this.step !== 'paused') return;
    this.S.run = true;
    this.firstFrame = true;
    this.camSpringInit = false;
    this.camSpringVel.set(0, 0, 0);
    this.camRoll = 0;
    this.replayWasActive = false;
    this.lastTickMs = performance.now();
    this.setStep('race');
  }

  public restartRace(): void {
    this.startCountdown();
  }

  private resetRaceState(): void {
    const trk = this.world?.trk;
    const hw = trk ? trk.hw : 120;
    Object.assign(this.S, {
      u: 0,
      x: 0,
      vx: 0,
      v: 0,
      e: 1,
      lap: 1,
      t: 0,
      lapStartTime: 0,
      bestLapSec: null,
      run: false,
      boost: 0,
      prev: 0,
      done: false,
      sector: 0,
      lastSplit: 0,
      throttle: 0,
      steer: 0,
      hitSpin: 0,
      hitSpinVel: 0,
      air: false,
      airY: 0,
      onRiskRail: false,
      riskRailHeight: 0,
      gates: 0,
      driftActive: false,
      driftDir: 0,
      driftAngle: 0,
      driftCharge: 0,
      driftTier: 0,
      driftScoreAcc: 0,
      driftLiveScore: 0,
      driftDuration: 0,
      longDriftAnnounced: false,
      totalDriftScore: 0,
      driftBonusLabel: '',
      driftBonusTimer: 0,
      edgeFallTimer: 0,
      edgeFallSide: 0,
      edgeRecoverInvuln: 0,
      yawOff: 0,
      yawVel: 0,
      wrongWay: false,
      wreckTimer: 0,
      takedowns: 0,
      nudgeCooldown: 0,
      nudgeTimer: 0,
      nudgeDir: 0,
      spinCooldown: 0,
      spinTimer: 0,
      spinAngle: 0,
      combatTag: '',
      combatTagTimer: 0,
      draftIntensity: 0,
      draftTargetId: '',
      draftDistM: 999,
      draftSlingshotTimer: 0
    });
    // u is lap-normalised and this circuit is ~18.8 km, so the grid gap has to
    // be expressed in metres; a fractional offset puts the field off camera.
    const gridLenM = this.world?.trk?.len || 1000;
    this.rivals.forEach((r, i) => {
      r.u = ((i + 1) * 9) / gridLenM;
      r.lap = 1;
      r.off = [-0.45, -0.1, 0.42][i] * hw;
      r.prevProgress = r.u;
      r.vx = 0;
      r.yawOff = 0;
      r.yawVel = 0;
      r.hp = 1.0;
      r.wreckTimer = 0;
      r.fallTimer = 0;
      r.hitInvuln = 0;
      r.nudgeCool = 1.6 + i * 0.7;
      r.disorientTimer = 0;
    });
    this.resetProjectiles();
    this.resetShards();
    this.ghostRecording = [];
    this.ghostSampleTimer = 0;
    this.ghostDeltaSec = null;
    this.lastRecordOutcome = null;
    this.impactShieldTimer = 0;
    if (this.impactShieldMesh) this.impactShieldMesh.visible = false;
    if (this.ghostVehicle) this.ghostVehicle.g.visible = false;
    this.prevPlayerProgress = 0;
    this.prevRank = 4;
    if (this.world) {
      this.world.trk.obstacles.forEach((o) => {
        o.cool = 0;
      });
      this.world.trk.destructibles?.forEach((d) => {
        d.intact = true;
        d.respawnTimer = 0;
        d.onReset?.();
      });
      this.world.trk.randomizeSpiralBlocks?.();
      this.rebuildGhostForLevel(this.world.trk.def.id);
    }
    this.weather?.resetCycle();
    this.weatherHazards?.resetCooldowns();
    this.announcer.resetRaceCooldowns();
    this.hazardAlert = { active: false, label: '', kind: 'debris' };
    this.hazardProximity = { active: false, intensity: 0, kind: 'debris', side: 0, distanceM: 999 };
    this.spiralWarning = {
      active: false,
      blockedRing: 'INNER',
      safeRing: 'OUTER',
      switchDir: 'RIGHT',
      distanceM: 0,
      spiralName: '',
      urgency: 0
    };
    this.debrisAlertTimer = 0;
    this.driftLife.fill(0);
    for (let i = 0; i < this.DRIFT_MAX; i++) {
      this.driftPos[i * 3 + 1] = -9999;
    }
    this.firstFrame = true;
    this.camSpringInit = false;
    this.camSpringVel.set(0, 0, 0);
    this.camRoll = 0;
    this.replayWasActive = false;
    this.victoryActive = false;
    this.victoryTimer = 0;
    this.currentArchPhase = 1;
    this.world?.trk.setLapPhase?.(1);
    this.gpRoundScoresRecorded = false;
  }

  private computeMinimapGeometry(): void {
    const trk = this.world?.trk;
    if (!trk) return;
    const N = 120;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const rawPts: { x: number; z: number }[] = [];
    const isSprint = !!trk.def.isSprint;

    for (let i = 0; i <= N; i++) {
      const u = isSprint ? i / N : (i / N) % 1;
      const p = trk.curve.getPointAt(u);
      rawPts.push({ x: p.x, z: p.z });
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const spanX = Math.max(10, maxX - minX);
    const spanZ = Math.max(10, maxZ - minZ);
    this.minimapMaxSpan = Math.max(spanX, spanZ);
    this.minimapMidX = (minX + maxX) / 2;
    this.minimapMidZ = (minZ + maxZ) / 2;

    let d = '';
    for (let i = 0; i < rawPts.length; i++) {
      const nx = 50 + ((rawPts[i].x - this.minimapMidX) / this.minimapMaxSpan) * 78;
      const ny = 50 + ((rawPts[i].z - this.minimapMidZ) / this.minimapMaxSpan) * 78;
      d += `${i === 0 ? 'M' : 'L'}${nx.toFixed(1)},${ny.toFixed(1)} `;
    }
    if (!isSprint) d += 'Z';
    this.minimapPathD = d;
    const s0 = 50 + ((rawPts[0].x - this.minimapMidX) / this.minimapMaxSpan) * 78;
    const s1 = 50 + ((rawPts[0].z - this.minimapMidZ) / this.minimapMaxSpan) * 78;
    this.minimapStartFinish = { x: s0, y: s1 };
  }

  private projectToMinimap(x: number, z: number): { x: number; y: number } {
    return {
      x: 50 + ((x - this.minimapMidX) / this.minimapMaxSpan) * 78,
      y: 50 + ((z - this.minimapMidZ) / this.minimapMaxSpan) * 78
    };
  }

  private showSplit(txt: string): void {
    this.splitText = txt;
    if (this.splitTimer !== null) clearTimeout(this.splitTimer);
    this.emitHud(true);
    this.splitTimer = window.setTimeout(() => {
      this.splitText = '';
      this.emitHud(true);
    }, 1550);
  }

  private spawnTrailParticle(pos: THREE.Vector3): void {
    const i = this.trailIdx;
    this.trailPos[i * 3] = pos.x;
    this.trailPos[i * 3 + 1] = pos.y;
    this.trailPos[i * 3 + 2] = pos.z;
    this.trailLife[i] = 1;
    this.trailIdx = (this.trailIdx + 1) % this.TRAIL_MAX;
  }

  private spawnDriftNeonParticle(
    origin: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    tier: 0 | 1 | 2 | 3,
    maxLife: number
  ): void {
    const i = this.driftIdx;
    const rgb = DRIFT_TIER_RGB[tier] || DRIFT_TIER_RGB[0];
    this.driftPos[i * 3] = origin.x;
    this.driftPos[i * 3 + 1] = origin.y;
    this.driftPos[i * 3 + 2] = origin.z;
    this.driftVel[i * 3] = vx;
    this.driftVel[i * 3 + 1] = vy;
    this.driftVel[i * 3 + 2] = vz;
    this.driftBaseCol[i * 3] = rgb[0];
    this.driftBaseCol[i * 3 + 1] = rgb[1];
    this.driftBaseCol[i * 3 + 2] = rgb[2];
    this.driftCol[i * 3] = rgb[0];
    this.driftCol[i * 3 + 1] = rgb[1];
    this.driftCol[i * 3 + 2] = rgb[2];
    this.driftLife[i] = maxLife;
    this.driftMaxLife[i] = maxLife;
    this.driftIdx = (this.driftIdx + 1) % this.DRIFT_MAX;
  }

  private spawnSparks(origin: THREE.Vector3, count = 26): void {
    for (let k = 0; k < count; k++) {
      const i = Math.floor(Math.random() * this.SPARK_COUNT);
      this.sparkPos[i * 3] = origin.x;
      this.sparkPos[i * 3 + 1] = origin.y;
      this.sparkPos[i * 3 + 2] = origin.z;
      this.sparkVel[i * 3] = (Math.random() - 0.5) * 60;
      this.sparkVel[i * 3 + 1] = Math.random() * 38 + 10;
      this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 60;
      this.sparkLife[i] = 1;
    }
  }

  private spawnDirectionalSparks(
    origin: THREE.Vector3,
    worldNormal: THREE.Vector3,
    count = 24,
    backTangent?: THREE.Vector3
  ): void {
    const nx = worldNormal.x;
    const ny = worldNormal.y;
    const nz = worldNormal.z;
    const bx = backTangent ? backTangent.x : 0;
    const by = backTangent ? backTangent.y : 0;
    const bz = backTangent ? backTangent.z : 0;
    for (let k = 0; k < count; k++) {
      const i = Math.floor(Math.random() * this.SPARK_COUNT);
      this.sparkPos[i * 3] = origin.x + (Math.random() - 0.5) * 1.4;
      this.sparkPos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 1.0;
      this.sparkPos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 1.4;
      const spray = 44 + Math.random() * 44;
      const backMix = backTangent ? 14 + Math.random() * 22 : 0;
      this.sparkVel[i * 3] = nx * spray - bx * backMix + (Math.random() - 0.5) * 26;
      this.sparkVel[i * 3 + 1] = ny * spray - by * backMix + Math.random() * 26 + 6;
      this.sparkVel[i * 3 + 2] = nz * spray - bz * backMix + (Math.random() - 0.5) * 26;
      this.sparkLife[i] = 0.85 + Math.random() * 0.25;
    }
  }

  private triggerImpactShield(
    localX: number,
    localZ: number,
    worldPos: THREE.Vector3,
    worldNormal: THREE.Vector3,
    colorHex = 0x00f0ff,
    backTangent?: THREE.Vector3
  ): void {
    if (this.impactShieldMesh && this.impactShieldMat) {
      _localContactDir.set(localX, 0.25, localZ);
      if (_localContactDir.lengthSq() < 0.001) _localContactDir.set(0, 1, 0);
      else _localContactDir.normalize();
      this.impactShieldMesh.quaternion.setFromUnitVectors(_worldUp, _localContactDir);
      this.impactShieldMesh.position.copy(_localContactDir).multiplyScalar(0.35);
      this.impactShieldMat.uniforms.uColor.value.setHex(colorHex);
      this.impactShieldMat.uniforms.uProgress.value = 0;
      this.impactShieldMat.uniforms.uOpacity.value = 0.95;
      this.impactShieldMesh.visible = true;
      this.impactShieldTimer = this.IMPACT_SHIELD_DUR;
    }
    this.spawnDirectionalSparks(worldPos, worldNormal, 24, backTangent);
  }

  private initShards(): void {
    this.shardGeo = new THREE.TetrahedronGeometry(0.72, 0);
    this.shardMats = [
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: 0xff2e93, toneMapped: false })
    ];
    for (let i = 0; i < this.SHARD_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this.shardGeo, this.shardMats[i % this.shardMats.length]);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shards.push({
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        life: 0
      });
    }
  }

  private resetShards(): void {
    for (let i = 0; i < this.shards.length; i++) {
      this.shards[i].life = 0;
      this.shards[i].mesh.visible = false;
    }
  }

  private spawnShatterShards(origin: THREE.Vector3, count = 20): void {
    let spawned = 0;
    for (let i = 0; i < this.shards.length && spawned < count; i++) {
      const sh = this.shards[i];
      if (sh.life > 0) continue;
      sh.life = 0.85 + Math.random() * 0.45;
      sh.pos.copy(origin).add(
        _vecA.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2)
      );
      sh.vel.set(
        (Math.random() - 0.5) * 76,
        14 + Math.random() * 38,
        (Math.random() - 0.5) * 76
      );
      sh.rotVel.set(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16
      );
      sh.mesh.position.copy(sh.pos);
      sh.mesh.scale.setScalar(0.95);
      sh.mesh.visible = true;
      spawned++;
    }
  }

  private initProjectiles(): void {
    this.projCoreGeo = new THREE.OctahedronGeometry(1.15, 0);
    this.projCoreGeo.scale(0.85, 0.85, 2.35);
    this.projHaloGeo = new THREE.TorusGeometry(1.65, 0.16, 8, 20);

    for (let i = 0; i < this.PROJ_POOL_SIZE; i++) {
      const group = new THREE.Group();
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xff3355,
        toneMapped: false
      });
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff8833,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      });
      const core = new THREE.Mesh(this.projCoreGeo, coreMat);
      const halo = new THREE.Mesh(this.projHaloGeo, haloMat);
      group.add(core, halo);
      group.visible = false;
      this.scene.add(group);

      this.projectiles.push({
        group,
        coreMat,
        haloMat,
        active: false,
        reflected: false,
        u: 0,
        speed: 0,
        off: 0,
        vx: 0,
        ttl: 0,
        targetRivalIdx: -1
      });
    }
  }

  private resetProjectiles(): void {
    this.projSpawnTimer = 2.6;
    this.projAlertTimer = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      p.active = false;
      p.reflected = false;
      p.ttl = 0;
      p.targetRivalIdx = -1;
      p.group.visible = false;
    }
  }

  private spawnIncomingProjectile(uPlayerNorm: number, trkLen: number, isSprint: boolean, trkHw: number): void {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return;

    // Pick an ahead rival if within 240m ahead, otherwise fire from an orbital drone ahead on track
    let originU = uPlayerNorm + 175 / trkLen;
    let originOff = this.S.x * 0.55 + (Math.random() - 0.5) * trkHw * 0.45;
    for (let ri = 0; ri < this.rivals.length; ri++) {
      const rv = this.rivals[ri];
      if (rv.wreckTimer > 0 || rv.fallTimer > 0 || rv.disorientTimer > 0) continue;
      let du = rv.u - uPlayerNorm;
      if (!isSprint) {
        if (du < 0) du += 1;
      }
      const distAhead = du * trkLen;
      if (distAhead > 75 && distAhead < 245) {
        originU = rv.u - 8 / trkLen;
        originOff = rv.off;
        break;
      }
    }

    if (isSprint) {
      if (originU >= 0.985) return;
      originU = Math.max(0.01, Math.min(0.985, originU));
    } else {
      originU = ((originU % 1) + 1) % 1;
    }

    slot.active = true;
    slot.reflected = false;
    slot.u = originU;
    // Slow-forward or slightly oncoming bolt so closing speed relative to player (~145m/s) gives ~1.2s reaction window
    slot.speed = Math.max(-28, this.S.v * 0.32 - 35);
    slot.off = Math.max(-trkHw * 0.72, Math.min(trkHw * 0.72, originOff));
    slot.vx = 0;
    slot.ttl = 3.6;
    slot.targetRivalIdx = -1;
    slot.coreMat.color.setHex(0xff2e63);
    slot.haloMat.color.setHex(0xff8c38);
    slot.group.scale.setScalar(1.0);
    slot.group.visible = true;
  }

  // Interactive 360 Turntable setup
  public attachTurntable(canvas: HTMLCanvasElement | null): void {
    if (!canvas) {
      this.detachTurntable();
      return;
    }
    if (this.pvCanvas === canvas && this.pvRenderer) {
      this.updateTurntableModel();
      this.resizeTurntable();
      return;
    }
    this.detachTurntable();
    this.pvCanvas = canvas;
    try {
      this.pvRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !this.isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch {
      return;
    }
    this.pvRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.pvRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.pvRenderer.toneMappingExposure = 1.08;
    this.pvRenderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.pvRenderer.setClearColor(0x000000, 0);

    this.pvScene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.pvRenderer);
    this.pvEnvTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.pvScene.environment = this.pvEnvTexture;
    pmrem.dispose();

    this.pvCam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.pvCam.position.set(0.2, 1.45, 5.2);
    this.pvCam.lookAt(0, -0.08, 0);

    this.pvScene.add(new THREE.AmbientLight(0x9fb4dd, 0.8));
    this.pvScene.add(new THREE.HemisphereLight(0xffe8c2, 0x1a223a, 1.4));
    const key = new THREE.DirectionalLight(0xfff0d4, 2.2);
    key.position.set(-3.5, 5, 5);
    const rim = new THREE.DirectionalLight(0x5ae8ff, 2.0);
    rim.position.set(4, 2.5, -4);
    this.pvScene.add(key, rim);

    this.pvRoot = new THREE.Group();
    this.pvScene.add(this.pvRoot);

    // Luxury circular turntable plinth matching reference turntable images
    this.pvPlatform = new THREE.Group();
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.32, 0.16, 48),
      new THREE.MeshPhysicalMaterial({ color: 0x0f1422, metalness: 0.88, roughness: 0.22, clearcoat: 0.8 })
    );
    plinth.position.y = -1.16;
    const goldRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.14, 0.045, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false })
    );
    goldRing.rotation.x = Math.PI / 2;
    goldRing.position.y = -1.07;
    this.pvRing = goldRing;
    this.pvPlatform.add(plinth, goldRing);
    this.pvScene.add(this.pvPlatform);

    canvas.addEventListener('pointerdown', this.onPvDown);
    window.addEventListener('pointermove', this.onPvMove);
    window.addEventListener('pointerup', this.onPvUp);

    this.updateTurntableModel();
    this.resizeTurntable();
  }

  private detachTurntable(): void {
    if (this.pvCanvas) {
      this.pvCanvas.removeEventListener('pointerdown', this.onPvDown);
    }
    window.removeEventListener('pointermove', this.onPvMove);
    window.removeEventListener('pointerup', this.onPvUp);
    this.pvEnvTexture?.dispose();
    this.pvEnvTexture = null;
    this.pvRenderer?.dispose();
    this.pvRenderer = null;
    this.pvCanvas = null;
    this.pvScene = null;
  }

  private onPvDown = (e: PointerEvent): void => {
    this.pvIsDragging = true;
    this.pvLastX = e.clientX;
  };

  private onPvMove = (e: PointerEvent): void => {
    if (!this.pvIsDragging) return;
    const dx = e.clientX - this.pvLastX;
    this.pvLastX = e.clientX;
    this.pvDragYaw += dx * 0.012;
  };

  private onPvUp = (): void => {
    this.pvIsDragging = false;
  };

  private resizeTurntable(): void {
    if (!this.pvRenderer || !this.pvCanvas || !this.pvCam) return;
    const w = this.pvCanvas.clientWidth || 420;
    const h = this.pvCanvas.clientHeight || 340;
    this.pvRenderer.setSize(w, h, false);
    this.pvCam.aspect = w / h;
    this.pvCam.updateProjectionMatrix();
  }

  public triggerNudge(dir: -1 | 1): void {
    const S = this.S;
    if (!S.run || S.wreckTimer > 0 || S.edgeFallTimer > 0 || S.nudgeCooldown > 0) return;
    const hasSlingshot = S.draftSlingshotTimer > 0;
    S.nudgeCooldown = hasSlingshot ? 0.65 : 0.85;
    S.nudgeTimer = hasSlingshot ? 0.30 : 0.24;
    S.nudgeDir = dir;
    S.vx += dir * (hasSlingshot ? 124 : 94);
    S.hitSpinVel -= dir * (hasSlingshot ? 6.8 : 4.8);
    if (hasSlingshot) {
      S.draftSlingshotTimer = 0;
      S.boost = Math.max(S.boost, 1.35);
      S.v = Math.max(S.v, MAXV * 1.24);
      this.aberrationPulse = Math.max(this.aberrationPulse, 0.024);
      this.audio.playBoost();
    }
    this.audio.playNudge();
    this.screenShake = Math.max(this.screenShake, hasSlingshot ? 0.36 : 0.24);
    if (this.player) {
      this.spawnSparks(this.player.g.position, hasSlingshot ? 24 : 14);
    }
    S.combatTag = hasSlingshot
      ? dir < 0
        ? 'SLINGSHOT NUDGE ◀'
        : 'SLINGSHOT NUDGE ▶'
      : dir < 0
        ? 'SIDE NUDGE ◀ LEFT'
        : 'SIDE NUDGE ▶ RIGHT';
    S.combatTagTimer = 1.05;
  }

  public triggerSpinAttack(): void {
    const S = this.S;
    if (!S.run || S.wreckTimer > 0 || S.edgeFallTimer > 0 || S.spinCooldown > 0) return;
    S.spinCooldown = 2.4;
    S.spinTimer = 0.56;
    S.spinAngle = 0;
    this.audio.playSpinAttack();
    this.screenShake = Math.max(this.screenShake, 0.44);
    this.aberrationPulse = Math.max(this.aberrationPulse, 0.022);
    if (this.player) {
      this.spawnSparks(this.player.g.position, 32);
    }
    S.combatTag = '360° VORTEX SPIN ATTACK';
    S.combatTagTimer = 1.05;
  }

  private triggerPlayerWreck(label: string): void {
    const S = this.S;
    if (S.wreckTimer > 0) return;
    S.wreckTimer = 1.85;
    S.driftActive = false;
    S.boost = 0;
    S.yawVel = (Math.random() < 0.5 ? -1 : 1) * 11.2;
    S.hitSpinVel = (Math.random() < 0.5 ? -1 : 1) * 9.5;
    this.screenShake = 1.05;
    this.aberrationPulse = 0.05;
    this.hitstopTimer = 0.06;
    this.audio.playExplosion();
    if (this.player) {
      this.spawnSparks(this.player.g.position, 64);
    }
    this.showSplit(label);
    S.combatTag = 'CHASSIS WRECKED';
    S.combatTagTimer = 1.8;
  }

  private awardTakedown(label: string): void {
    const S = this.S;
    S.takedowns += 1;
    S.e = Math.min(1, S.e + 0.34);
    S.boost = Math.max(S.boost, 1.5);
    S.combatTag = `${label} (+34% CORE)`;
    S.combatTagTimer = 1.8;
    this.audio.playTakedown();
    this.screenShake = Math.max(this.screenShake, 0.52);
    this.showSplit(`TAKEDOWN x${S.takedowns} // ${label}`);
  }

  private updateTurntableModel(): void {
    if (!this.pvRoot || !this.pvScene) return;
    while (this.pvRoot.children.length > 0) {
      this.pvRoot.remove(this.pvRoot.children[0]);
    }
    const targetId = this.pvHoverShipId ?? this.selectedShipId;
    const custom = this.getCustomization(targetId);
    const neon = getNeonPreset(custom.neonId);
    const built = buildLuxuryHoverCar(targetId, neon.color, 1.0, custom);
    frameChassis(built.g, 3.6);
    this.pvRoot.add(built.g);
    this.pvSpinners = built.rimSpinners;
    if (this.pvRing) {
      (this.pvRing.material as THREE.MeshBasicMaterial).color.setHex(neon.color);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTickMs) / 1000;
    this.lastTickMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.stepSimulation(dt, now);

    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.cam);
    } else {
      this.composer.render();
    }

    if (this.step === 'driver' && this.pvRenderer && this.pvScene && this.pvCam && this.pvRoot) {
      const spinRate = this.pvHoverShipId !== null ? 0.96 : 0.48;
      if (!this.pvIsDragging) this.pvDragYaw += dt * spinRate;
      this.pvRoot.rotation.y = this.pvDragYaw;
      this.pvRoot.position.y = Math.sin(now * 0.0025) * 0.05;
      for (let i = 0; i < this.pvSpinners.length; i++) {
        this.pvSpinners[i].rotation.x += dt * 5.2;
      }
      if (this.pvPlatform) this.pvPlatform.rotation.y -= dt * 0.2;
      this.pvRenderer.render(this.pvScene, this.pvCam);
    }

    if (now - this.lastHudEmitMs > 45) {
      this.emitHud(false);
      this.lastHudEmitMs = now;
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private stepSimulation(rawDt: number, now: number): void {
    const trk = this.world?.trk;
    const ship = this.player?.g;
    if (!trk || !ship || !this.player) return;

    const prof = SHIP_PROFILES[this.selectedShipId];
    const S = this.S;

    this.announcer.update(rawDt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
      return;
    }

    // Cinematic slow-motion curve during post-finish Victory Lap barrel roll
    let dt = rawDt;
    if (this.step === 'results' && this.victoryActive) {
      this.victoryTimer += rawDt;
      const tV = this.victoryTimer;
      let timeScale = 1.0;
      if (tV < 0.45) {
        timeScale = THREE.MathUtils.lerp(1.0, 0.28, tV / 0.45);
      } else if (tV < 2.95) {
        timeScale = 0.28;
      } else if (tV < this.VICTORY_LAP_DUR) {
        timeScale = THREE.MathUtils.lerp(0.28, 1.0, (tV - 2.95) / (this.VICTORY_LAP_DUR - 2.95));
      } else {
        this.victoryActive = false;
        this.emitHud(true);
      }
      dt = rawDt * timeScale;
    }

    if (S.run) {
      const thr = !!(this.heldKeys.KeyW || this.heldKeys.KeyZ || this.heldKeys.ArrowUp);
      const brk = !!(this.heldKeys.KeyX || this.heldKeys.KeyS || this.heldKeys.ArrowDown);
      const left = !!(this.heldKeys.KeyA || this.heldKeys.ArrowLeft);
      const right = !!(this.heldKeys.KeyD || this.heldKeys.ArrowRight);
      const bst = !!((this.heldKeys.Space || this.heldKeys.KeyC) && S.e > 0.02 && !brk);
      const driftKey = !!(this.heldKeys.ShiftLeft || this.heldKeys.ShiftRight || this.heldKeys.KeyK);
      const steer = (right ? 1 : 0) - (left ? 1 : 0);

      if (S.driftBonusTimer > 0) {
        S.driftBonusTimer = Math.max(0, S.driftBonusTimer - dt);
        if (S.driftBonusTimer === 0) S.driftBonusLabel = '';
      }

      // Power-Slide Drift initiation, sustain & surge release
      const wasDrifting = S.driftActive;
      if (!S.driftActive && driftKey && !brk && !S.air && S.v > 65 && Math.abs(steer) > 0.12) {
        S.driftActive = true;
        S.driftDir = Math.sign(steer);
        S.driftCharge = 0.05;
        S.driftTier = 0;
        S.driftScoreAcc = 0;
        S.driftLiveScore = 0;
        S.driftDuration = 0;
        S.longDriftAnnounced = false;
      } else if (S.driftActive && (!driftKey || brk || S.air || S.v < 55)) {
        S.driftActive = false;
      }

      if (wasDrifting && !S.driftActive) {
        if (!brk && S.driftTier >= 1) {
          S.totalDriftScore += S.driftLiveScore;
          const surgeDur = [0, 1.0, 1.75, 2.6][S.driftTier];
          const tierNumeral = ['', 'I', 'II', 'III'][S.driftTier];
          S.boost = Math.max(S.boost, surgeDur);
          S.v = Math.max(S.v, MAXV * (1.14 + S.driftTier * 0.1));
          S.e = Math.min(1, S.e + S.driftTier * 0.12);
          S.driftBonusLabel = `TIER ${tierNumeral} SURGE +${S.driftLiveScore}`;
          S.driftBonusTimer = 1.65;
          this.audio.playBoost();
          this.aberrationPulse = Math.max(this.aberrationPulse, 0.018 + S.driftTier * 0.005);
          this.screenShake = Math.max(this.screenShake, 0.24);
          this.showSplit(`DRIFT BOOST · TIER ${tierNumeral}`);
          // Surge release burst of tier-colored neon particles
          const surgeFrame = trk.fr(Math.max(0, Math.min(1, trk.def.isSprint ? S.u : ((S.u % 1) + 1) % 1)));
          for (let bi = 0; bi < 32; bi++) {
            const sideSign = bi % 2 === 0 ? -1 : 1;
            _vecA
              .copy(ship.position)
              .addScaledVector(surgeFrame.s, sideSign * 1.5)
              .addScaledVector(surgeFrame.t, -2.5)
              .addScaledVector(surgeFrame.up, -0.3);
            const burstSpeed = 28 + Math.random() * 24;
            const spreadS = (Math.random() - 0.5) * 24 + sideSign * 8;
            const spreadUp = Math.random() * 14 + 2;
            this.spawnDriftNeonParticle(
              _vecA,
              surgeFrame.t.x * -burstSpeed + surgeFrame.s.x * spreadS + surgeFrame.up.x * spreadUp,
              surgeFrame.t.y * -burstSpeed + surgeFrame.s.y * spreadS + surgeFrame.up.y * spreadUp,
              surgeFrame.t.z * -burstSpeed + surgeFrame.s.z * spreadS + surgeFrame.up.z * spreadUp,
              S.driftTier,
              0.78
            );
          }
        } else if (S.driftLiveScore > 0) {
          S.totalDriftScore += S.driftLiveScore;
        }
        S.driftCharge = 0;
        S.driftTier = 0;
        S.driftScoreAcc = 0;
        S.driftLiveScore = 0;
        S.driftDuration = 0;
        S.longDriftAnnounced = false;
        S.driftDir = 0;
      }

      S.nudgeCooldown = Math.max(0, S.nudgeCooldown - dt);
      S.nudgeTimer = Math.max(0, S.nudgeTimer - dt);
      S.spinCooldown = Math.max(0, S.spinCooldown - dt);
      this.pylonHintCooldown = Math.max(0, this.pylonHintCooldown - dt);
      if (S.combatTagTimer > 0) {
        S.combatTagTimer = Math.max(0, S.combatTagTimer - dt);
        if (S.combatTagTimer === 0) S.combatTag = '';
      }
      if (S.spinTimer > 0) {
        S.spinTimer = Math.max(0, S.spinTimer - dt);
        const spinFrac = 1 - S.spinTimer / 0.56;
        const spinEase = spinFrac * spinFrac * (3 - 2 * spinFrac);
        S.spinAngle = spinEase * Math.PI * 4;
      } else {
        S.spinAngle = 0;
      }

      const isSprintCur = !!trk.def.isSprint;
      const clampUCur = (val: number) => (isSprintCur ? Math.max(0, Math.min(1, val)) : ((val % 1) + 1) % 1);
      const uPlayerTrack = clampUCur(S.u);
      const inSpiral = !!(trk.spiralZones && trk.spiralZones.some((z) => uPlayerTrack >= z.startU && uPlayerTrack <= z.endU));

      // Slipstream / Drafting vacuum detection behind closest ahead opponent (< 35m)
      let draftFound = false;
      let draftBestDist = 35;
      let draftBestId = '';
      let draftBestProx = 0;
      if (S.wreckTimer <= 0 && S.edgeFallTimer <= 0 && !S.air && S.v > 75) {
        for (let ri = 0; ri < this.rivals.length; ri++) {
          const rv = this.rivals[ri];
          if (rv.wreckTimer > 0 || rv.fallTimer > 0) continue;
          let duR = clampUCur(rv.u) - uPlayerTrack;
          if (!isSprintCur && duR < -0.5) duR += 1;
          const distM = duR * trk.len;
          const latDelta = Math.abs(rv.off - S.x);
          if (distM > 2 && distM < draftBestDist && latDelta < 11.8) {
            draftFound = true;
            draftBestDist = distM;
            draftBestId = rv.racerId;
            draftBestProx = (1 - distM / 35) * (1 - latDelta / 11.8);
          }
        }
      }
      if (draftFound) {
        S.draftIntensity += (Math.min(1, 0.35 + draftBestProx * 0.72) - S.draftIntensity) * (1 - Math.exp(-dt * 4.2));
        S.draftTargetId = draftBestId;
        S.draftDistM = Math.round(draftBestDist);
        S.e = Math.min(1, S.e + (0.055 + 0.075 * S.draftIntensity) * dt);
        if (S.draftIntensity >= 0.78) {
          S.draftSlingshotTimer = 1.35;
        }
      } else {
        S.draftIntensity = Math.max(0, S.draftIntensity - dt * 1.9);
        if (S.draftIntensity <= 0.04) S.draftTargetId = '';
        S.draftSlingshotTimer = Math.max(0, S.draftSlingshotTimer - dt);
      }

      if (S.wreckTimer > 0) {
        S.wreckTimer = Math.max(0, S.wreckTimer - dt);
        S.v *= Math.max(0.08, 1 - 2.6 * dt);
        S.vx *= Math.max(0.2, 1 - 2.2 * dt);
        S.yawOff += S.yawVel * dt;
        S.yawVel *= Math.exp(-dt * 1.8);
        S.hitSpinVel += (-S.hitSpin * 16 - S.hitSpinVel * 4.2) * dt;
        S.hitSpin += S.hitSpinVel * dt;
        if (Math.random() < 0.5) this.spawnSparks(ship.position, 4);
        if (S.wreckTimer === 0) {
          S.e = 0.82;
          S.v = 125;
          S.x = 0;
          S.vx = 0;
          S.yawOff = 0;
          S.yawVel = 0;
          S.hitSpin = 0;
          S.hitSpinVel = 0;
          S.wrongWay = false;
          S.edgeRecoverInvuln = 1.85;
          this.spawnSparks(ship.position, 28);
          this.showSplit('CHASSIS REDEPLOYED // 车体恢复');
        }
      } else {
        S.throttle += ((thr && !brk ? 1 : 0) - S.throttle) * Math.min(1, dt * (thr && !brk ? 0.85 : 2.6));

        const padBoost = S.boost > 0 && thr;
        const boostOn = !brk && (bst || padBoost);
        const accelerating = !brk && (thr || bst);
        const boostMul = boostOn ? 1.68 * prof.bst : 1;
        const draftMul = 1 + S.draftIntensity * 0.24;
        const railMul = S.onRiskRail ? 1.15 : 1;
        const top = accelerating
          ? MAXV * prof.spd * (boostOn ? 1 : 0.72 + 0.28 * S.throttle) * boostMul * draftMul * railMul
          : 0;
        const k = brk ? 2.6 : accelerating ? (boostOn ? 3.2 : 0.82 * prof.acc) : 1.9;

        S.v += (top - S.v) * (1 - Math.exp(-dt * k));
        if (brk) S.v = Math.max(0, S.v - 210 * dt);

        if (bst) S.e -= 0.2 * dt;
        else S.e = Math.min(1, S.e + (0.036 + (S.onRiskRail ? 0.045 : 0)) * dt);
        S.boost = Math.max(0, S.boost - dt);

        S.steer += (steer - S.steer) * (1 - Math.exp(-dt * 12));
        const speedFrac = Math.min(1, S.v / MAXV);
        const boostFrac = boostOn ? 1 : 0;
        const spiralGripBonus = inSpiral && S.driftActive ? 1.24 : 1.0;
        const grip = (0.98 - 0.14 * speedFrac) * prof.hnd * spiralGripBonus;

        if (S.driftActive) {
          // Smooth spiral-friendly drift carving: gentle base slide bias + strong responsive counter-steering
          const effSteer = S.driftDir * 0.28 + S.steer * 0.94;
          const desiredVx = effSteer * (126 + boostFrac * 36) * (0.52 + 0.48 * speedFrac);
          const latFollowRate = (7.2 + boostFrac * 2.4) * grip;
          S.vx += (desiredVx - S.vx) * (1 - Math.exp(-dt * latFollowRate));

          const targetDriftAngle = S.driftDir * (0.24 + Math.min(0.14, Math.abs(effSteer) * 0.12));
          S.driftAngle += (targetDriftAngle - S.driftAngle) * (1 - Math.exp(-dt * 9.0));

          const slipFactor = 0.58 + Math.min(1, Math.abs(S.vx) / 84) * 0.42;
          const spiralChargeMul = inSpiral ? 1.32 : 1.0;
          const chargeRate = (0.32 + 0.16 * speedFrac) * slipFactor * spiralChargeMul;
          S.driftCharge = Math.min(1, S.driftCharge + chargeRate * dt);
          S.driftTier = S.driftCharge >= 0.96 ? 3 : S.driftCharge >= 0.62 ? 2 : S.driftCharge >= 0.28 ? 1 : 0;
          S.driftScoreAcc += (145 + S.v * 0.95) * (1 + S.driftTier * 0.45) * dt;
          S.driftLiveScore = Math.floor(S.driftScoreAcc);
          S.driftDuration += dt;
        } else {
          const desiredVx = S.steer * (95 + boostFrac * 36) * (0.48 + 0.52 * speedFrac);
          const latFollowRate = (8.8 + boostFrac * 2.8) * grip;
          S.vx += (desiredVx - S.vx) * (1 - Math.exp(-dt * latFollowRate));
          S.driftAngle += (0 - S.driftAngle) * (1 - Math.exp(-dt * 11));
        }

        // Smoothed impact roll spring-damper & Crash Yaw Spinout Recovery Physics
        S.hitSpinVel += (-S.hitSpin * 28 - S.hitSpinVel * 6.5) * dt;
        S.hitSpin += S.hitSpinVel * dt;
        S.yawVel = THREE.MathUtils.clamp(S.yawVel, -11.5, 11.5);

        S.yawOff += S.yawVel * dt;
        S.yawVel *= Math.exp(-dt * 2.8);
        while (S.yawOff > Math.PI) S.yawOff -= Math.PI * 2;
        while (S.yawOff < -Math.PI) S.yawOff += Math.PI * 2;
        if (Math.abs(S.yawOff) > 0.008) {
          if (Math.abs(steer) > 0.12) {
            S.yawOff += steer * (Math.cos(S.yawOff) < 0.25 ? 4.4 : 2.1) * dt;
          }
          const alignRate = boostOn ? 2.5 : thr ? 1.2 : 0.5;
          if (Math.abs(S.yawOff) > Math.PI * 0.85 && Math.abs(S.yawVel) < 0.6 && Math.abs(steer) < 0.1) {
            S.yawOff -= Math.sign(S.yawOff || 1) * alignRate * 0.5 * dt;
          } else {
            S.yawOff -= Math.sin(S.yawOff) * alignRate * dt;
          }
          if (Math.abs(S.yawOff) < 0.04 && Math.abs(S.yawVel) < 0.4) {
            S.yawOff = 0;
          }
        }
        S.wrongWay = S.edgeFallTimer <= 0 && Math.cos(S.yawOff) < 0.18;

        S.x += (S.vx + S.v * Math.sin(S.yawOff) * 0.22) * dt;
      }

      const liveWidth = trk.hw * trk.widthAt(S.u);
      const driftDragMul = S.driftActive ? (inSpiral ? 0.0 : 0.035) : 0.12;
      S.v *= 1 - Math.min(0.32, Math.abs(S.vx) / liveWidth) * driftDragMul * dt;

      S.edgeRecoverInvuln = Math.max(0, S.edgeRecoverInvuln - dt);
      const isSprint = !!trk.def.isSprint;
      const clampU = (val: number) => (isSprint ? Math.max(0, Math.min(1, val)) : ((val % 1) + 1) % 1);
      const hasBarrier = trk.hasBarrierAt ? trk.hasBarrierAt(clampU(S.u)) : true;
      const fCurFrame = trk.fr(clampU(S.u));

      if (S.edgeFallTimer > 0) {
        S.edgeFallTimer = Math.max(0, S.edgeFallTimer - dt);
        S.driftActive = false;
        S.boost = 0;
        S.onRiskRail = false;
        S.v *= Math.max(0.2, 1 - 1.7 * dt);
        S.x += S.edgeFallSide * 24 * dt;
        if (S.edgeFallTimer === 0) {
          S.x = 0;
          S.vx = 0;
          S.yawOff = 0;
          S.yawVel = 0;
          S.hitSpin = 0;
          S.hitSpinVel = 0;
          S.wrongWay = false;
          S.v = Math.max(S.v, 115);
          S.edgeRecoverInvuln = 1.6;
          this.spawnSparks(ship.position, 24);
          this.showSplit('HOVER RECOVERY // 浮空复位');
        }
      } else if (S.wreckTimer <= 0) {
        if (hasBarrier) {
          const EDGE_BUFFER = 6.8;
          const limit = Math.max(8, trk.hw * trk.widthAt(S.u) - EDGE_BUFFER);
          if (Math.abs(S.x) > limit) {
            const sideSign = Math.sign(S.x) || 1;
            const impactLat = Math.abs(S.vx);
            _impactNormal.copy(fCurFrame.s).multiplyScalar(-sideSign);
            // Violent knock-off over barrier when slammed hard near rail
            if (S.edgeRecoverInvuln <= 0 && !S.air && !S.onRiskRail && impactLat > 98) {
              S.edgeFallTimer = 0.92;
              S.edgeFallSide = sideSign;
              S.e = Math.max(0, S.e - 0.16);
              S.driftActive = false;
              S.hitSpinVel += sideSign * 6.8;
              this.triggerImpactShield(sideSign, -0.1, ship.position, _impactNormal, 0xff2e63, fCurFrame.t);
              this.screenShake = Math.max(this.screenShake, 0.78);
              this.aberrationPulse = Math.max(this.aberrationPulse, 0.038);
              this.audio.playCrash();
              this.showSplit('BARRIER VAULT // 被撞出赛道');
            } else {
              S.x = sideSign * limit;
              S.vx *= -0.35;
              S.v *= 0.94;
              if (impactLat > 62 && S.v > 165) {
                S.yawVel += -sideSign * 6.4;
                S.hitSpinVel += -sideSign * 4.5;
                S.e = Math.max(0, S.e - 0.07);
                this.triggerImpactShield(sideSign, 0.1, ship.position, _impactNormal, 0xff8833, fCurFrame.t);
                this.screenShake = Math.max(this.screenShake, 0.55);
                this.audio.playCrash();
              } else {
                S.e -= 0.004;
                this.triggerImpactShield(sideSign, 0.15, ship.position, _impactNormal, 0x00f0ff, fCurFrame.t);
                this.screenShake = Math.max(this.screenShake, 0.22);
              }
            }
          }
        } else {
          const deckEdge = Math.max(10, trk.hw * trk.widthAt(S.u));
          if (!S.air && !S.onRiskRail && Math.abs(S.x) > deckEdge - 4.5 && Math.random() < 0.45) {
            this.spawnSparks(ship.position, 3);
          }
          if (!S.air && !S.onRiskRail && S.edgeRecoverInvuln <= 0 && Math.abs(S.x) > deckEdge + 1.4) {
            S.edgeFallTimer = 0.92;
            S.edgeFallSide = Math.sign(S.x) || 1;
            S.e = Math.max(0, S.e - 0.14);
            S.driftActive = false;
            S.hitSpinVel += S.edgeFallSide * 6.0;
            this.screenShake = Math.max(this.screenShake, 0.72);
            this.aberrationPulse = Math.max(this.aberrationPulse, 0.035);
            this.audio.playCrash();
            this.showSplit('OFF-EDGE DROP // 无护栏坠落');
          }
        }
      }

      S.prev = S.u;
      const probeDu = 0.0006;
      const probeF0 = trk.fr(clampU(S.u));
      const probeF1 = trk.fr(clampU(S.u + probeDu));
      const arcStretch = Math.min(3.5, Math.max(1.0, probeF0.pos.distanceTo(probeF1.pos) / (probeDu * trk.len)));
      const fwdFactor = S.wreckTimer > 0 ? 0.5 : Math.cos(S.yawOff);
      const stepU = (S.v * fwdFactor * dt) / (trk.len * arcStretch);
      const gateAt = [0.2, 0.4, 0.6, 0.8][S.gates];
      if (gateAt !== undefined && S.u < gateAt && S.u + stepU >= gateAt) S.gates++;
      S.u += stepU;
      if (isSprint && S.u < 0.001) S.u = 0.001;
      S.t += dt;

      let gapJump = null;
      for (const j of trk.elev.jumps) {
        if (S.prev < j.lip && S.u >= j.lip) {
          S.v = Math.max(S.v, MAXV * 1.32);
          S.boost = Math.max(S.boost, 3.0);
          this.screenShake = Math.max(this.screenShake, 0.4);
          this.aberrationPulse = 0.025;
          this.audio.playJump();
          this.showSplit('MEGA JUMP // 大跳躍');
        }
        if (S.u >= j.lip && S.u < j.land) gapJump = j;
      }
      const wasAir = S.air;
      S.air = !!gapJump;
      S.airY = gapJump ? trk.elev.arc(S.u) : 0;
      if (wasAir && !S.air) {
        this.camDip = -5.5;
        this.screenShake = Math.max(this.screenShake, 0.55);
        this.aberrationPulse = 0.03;
        this.audio.playLand();
        this.spawnSparks(ship.position, 36);
      }

      // Elevated Risk-Reward Shortcut Split-Route Rails
      const rails = trk.shortcutRails;
      let activeRailLift = 0;
      if (rails && rails.length > 0 && S.wreckTimer <= 0 && S.edgeFallTimer <= 0) {
        const uRailCur = clampU(S.u);
        let foundRail = null;
        for (let ri = 0; ri < rails.length; ri++) {
          const r = rails[ri];
          if (uRailCur >= r.uStart && uRailCur <= r.uEnd) {
            const onDeck = Math.abs(S.x - r.off) <= r.width * 0.62;
            const fk = (uRailCur - r.uStart) / Math.max(0.0001, r.uEnd - r.uStart);
            const rLift =
              fk < 0.18
                ? r.height * (0.5 - 0.5 * Math.cos((fk / 0.18) * Math.PI))
                : fk > 0.84
                  ? r.height * (0.5 + 0.5 * Math.cos(((fk - 0.84) / 0.16) * Math.PI))
                  : r.height;
            if (onDeck && (S.onRiskRail || fk < 0.22 || S.air)) {
              foundRail = { r, rLift };
            }
            break;
          }
        }
        if (foundRail) {
          if (!S.onRiskRail) {
            this.showSplit('RISK RAIL SHORTCUT // +15% SPD');
            this.audio.playBoost();
          }
          S.onRiskRail = true;
          activeRailLift = foundRail.rLift;
        } else {
          if (S.onRiskRail && S.riskRailHeight > 2.5) {
            this.camDip = -3.8;
            this.screenShake = Math.max(this.screenShake, 0.35);
            this.audio.playLand();
            _impactNormal.copy(fCurFrame.up);
            this.spawnDirectionalSparks(ship.position, _impactNormal, 18, fCurFrame.t);
            this.showSplit('RAIL DROP // 返回主道');
          }
          S.onRiskRail = false;
        }
      } else {
        S.onRiskRail = false;
      }
      S.riskRailHeight += (activeRailLift - S.riskRailHeight) * (1 - Math.exp(-dt * (S.onRiskRail ? 18 : 11)));

      // Breakable Shield & Boost Pylons (Shatter cleanly with 360° Spin Attack)
      const destructibles = trk.destructibles;
      if (destructibles && destructibles.length > 0 && S.wreckTimer <= 0) {
        for (let di = 0; di < destructibles.length; di++) {
          const prop = destructibles[di];
          if (!prop.intact) {
            prop.respawnTimer = Math.max(0, prop.respawnTimer - dt);
            if (prop.respawnTimer === 0) {
              prop.intact = true;
              prop.onReset?.();
            }
            continue;
          }
          if (Boolean(prop.onRail) !== S.onRiskRail) continue;
          if (ship.position.distanceToSquared(prop.pos) < (prop.radius + 3.6) ** 2) {
            if (S.spinTimer > 0) {
              prop.intact = false;
              prop.respawnTimer = 14.0;
              prop.onShatter?.();
              this.spawnShatterShards(prop.pos, 22);
              this.audio.playDeflect();
              this.screenShake = Math.max(this.screenShake, 0.42);
              this.aberrationPulse = Math.max(this.aberrationPulse, 0.028);
              if (prop.kind === 'shield_pylon') {
                S.e = Math.min(1, S.e + 0.30);
                S.edgeRecoverInvuln = Math.max(S.edgeRecoverInvuln, 2.5);
                S.combatTag = 'SHIELD PYLON SHATTERED (+30% CORE)';
                S.combatTagTimer = 1.4;
                this.showSplit('SHIELD PYLON // +30% CORE & ARMOR');
              } else {
                S.boost = Math.max(S.boost, 2.4);
                S.v = Math.max(S.v, MAXV * 1.42);
                S.e = Math.min(1, S.e + 0.14);
                this.audio.playBoost();
                S.combatTag = 'BOOST PYLON SHATTERED (OVERDRIVE)';
                S.combatTagTimer = 1.4;
                this.showSplit('BOOST PYLON // OVERDRIVE SURGE');
              }
            } else {
              const pushP = Math.sign(S.x - prop.off) || 1;
              S.vx += pushP * 38;
              S.v *= 0.92;
              _impactNormal.copy(fCurFrame.s).multiplyScalar(pushP);
              this.triggerImpactShield(
                -pushP,
                0.7,
                ship.position,
                _impactNormal,
                prop.kind === 'shield_pylon' ? 0x36f5d8 : 0xf5c451,
                fCurFrame.t
              );
              if (this.pylonHintCooldown <= 0) {
                this.pylonHintCooldown = 1.5;
                this.showSplit('SPIN [F] TO SHATTER PYLON');
              }
            }
          }
        }
      }

      // Descending Spiral Path-Blocked Lookahead Warning & Half-Lane Laser Collision
      const spiralGates = trk.spiralBlockGates;
      if (spiralGates && spiralGates.length > 0 && S.wreckTimer <= 0) {
        const uCur = clampU(S.u);
        let nextGate = null;
        let nextDist = Infinity;
        for (let gi = 0; gi < spiralGates.length; gi++) {
          const gate = spiralGates[gi];
          if (gate.cool > 0) gate.cool = Math.max(0, gate.cool - dt);
          const dMeters = (gate.u - uCur) * trk.len;
          if (dMeters >= 6 && dMeters <= 360 && dMeters < nextDist) {
            nextDist = dMeters;
            nextGate = gate;
          }
          if (gate.cool <= 0 && S.edgeRecoverInvuln <= 0 && Math.abs(uCur - gate.u) < 13 / trk.len && S.x * gate.blockedSide > -3.5) {
            gate.cool = 1.6;
            S.vx = -gate.blockedSide * 82;
            S.v *= 0.52;
            S.e = Math.max(0, S.e - 0.18);
            S.yawVel += gate.blockedSide * 7.6;
            S.hitSpinVel += -gate.blockedSide * 8.2;
            _impactNormal.copy(fCurFrame.t).multiplyScalar(-1).addScaledVector(fCurFrame.s, -gate.blockedSide * 0.5).normalize();
            this.triggerImpactShield(0, 1, ship.position, _impactNormal, 0xff2e63, fCurFrame.t);
            this.screenShake = 0.85;
            this.aberrationPulse = 0.04;
            this.hitstopTimer = 0.048;
            this.audio.playCrash();
            this.showSplit(`LASER GATE SLAM // SWITCH TO ${gate.safeRing}`);
          }
        }
        if (nextGate) {
          if (!nextGate.warned && nextDist < 340) {
            nextGate.warned = true;
            this.audio.playLaneAlert();
          }
          this.spiralWarning = {
            active: true,
            blockedRing: nextGate.blockedRing,
            safeRing: nextGate.safeRing,
            switchDir: nextGate.switchDir,
            distanceM: Math.round(nextDist),
            spiralName: nextGate.spiralName,
            urgency: Math.min(1, Math.max(0, 1 - nextDist / 360))
          };
        } else if (this.spiralWarning.active) {
          this.spiralWarning.active = false;
        }
      } else if (this.spiralWarning.active) {
        this.spiralWarning.active = false;
      }

      for (const ob of trk.obstacles) {
        if (ob.cool > 0) {
          ob.cool -= dt;
          continue;
        }
        if (ob.active === false || ob.r <= 0.1) continue;
        if (ship.position.distanceToSquared(ob.pos) < (ob.r + 2.4) ** 2) {
          const dir = Math.sign(S.x - ob.off) || 1;
          _impactNormal.copy(fCurFrame.s).multiplyScalar(dir).addScaledVector(fCurFrame.t, -0.5).normalize();
          if (S.spinTimer > 0) {
            ob.cool = 2.6;
            S.vx += dir * 22;
            this.triggerImpactShield(-dir, 0.85, ob.pos, _impactNormal, 0x00f0ff, fCurFrame.t);
            this.screenShake = Math.max(this.screenShake, 0.36);
            this.audio.playDeflect();
            this.showSplit('OBSTACLE DEFLECTED // 旋风弹开');
          } else {
            S.vx = dir * 64;
            S.v *= 0.58;
            S.e = Math.max(0, S.e - 0.16);
            S.yawVel += -dir * 7.2;
            S.hitSpinVel += -dir * 7.8;
            ob.cool = 2.2;
            this.triggerImpactShield(-dir, 0.9, ob.pos, _impactNormal, 0xff5a36, fCurFrame.t);
            this.screenShake = 0.78;
            this.aberrationPulse = 0.038;
            this.hitstopTimer = 0.044;
            this.audio.playCrash();
          }
        }
      }

      if (S.e <= 0 && S.wreckTimer <= 0 && S.edgeRecoverInvuln <= 0) {
        this.triggerPlayerWreck('HULL DESTROYED // WRECKED');
      }

      const boostLaneSpan = 190 / trk.len;
      for (const pu of trk.pads) {
        const puEnd = Math.min(0.999, pu + boostLaneSpan);
        if (S.prev < pu && S.u >= pu) {
          S.boost = Math.max(S.boost, 4.2);
          S.v = Math.max(S.v, MAXV * 1.35);
          S.e = Math.min(1, S.e + 0.45);
          this.audio.playBoost();
          this.showSplit('OVERDRIVE BOOST');
          this.aberrationPulse = 0.022;
          this.screenShake = 0.32;
        } else if (S.u > pu && S.u <= puEnd) {
          S.boost = Math.max(S.boost, 4.2);
          S.e = Math.min(1, S.e + 0.18 * dt);
        }
      }

      const sec = Math.floor(Math.max(0, Math.min(0.9999, trk.def.isSprint ? S.u : ((S.u % 1) + 1) % 1)) * 4);
      if (sec !== S.sector) {
        S.sector = sec;
        const split = S.t - S.lastSplit;
        S.lastSplit = S.t;
        if (S.t > 1) this.showSplit(`SECTOR ${sec + 1} · ${split.toFixed(2)}s`);
      }

      // Dynamic Active Track Architecture: shift arches & lane barriers per lap (or sprint thirds) + live helix position
      const uProgressNorm = trk.def.isSprint
        ? Math.max(0, Math.min(1, S.u))
        : ((S.u % 1) + 1) % 1;
      trk.setPlayerProgress?.(uProgressNorm);
      const targetArchPhase: 1 | 2 | 3 = trk.def.isSprint
        ? S.u < 0.33
          ? 1
          : S.u < 0.66
            ? 2
            : 3
        : (Math.min(TOTAL_LAPS, Math.max(1, S.lap)) as 1 | 2 | 3);
      if (targetArchPhase !== this.currentArchPhase) {
        this.currentArchPhase = targetArchPhase;
        trk.setLapPhase?.(targetArchPhase);
        if (trk.def.isSprint || targetArchPhase > 1) {
          this.showSplit(`ARCHITECTURE SHIFT // PHASE ${targetArchPhase}`);
        }
      }

      // Record Ghost Telemetry Sample every ~0.16s (monotonically indexed across laps/sprint)
      const raceProgressTotal = isSprint ? uProgressNorm : S.lap - 1 + uProgressNorm;
      this.ghostSampleTimer += dt;
      if (this.ghostSampleTimer >= 0.16 && !S.done) {
        this.ghostSampleTimer = 0;
        this.ghostRecording.push({
          t: S.t,
          u: raceProgressTotal,
          x: S.x,
          airY: S.airY + S.riskRailHeight,
          yawOff: S.yawOff
        });
      }

      const finalizeRaceRecord = () => {
        this.ghostRecording.push({
          t: S.t,
          u: isSprint ? 1.0 : TOTAL_LAPS,
          x: S.x,
          airY: S.airY + S.riskRailHeight,
          yawOff: S.yawOff
        });
        let playerRankFinish = 1;
        for (let ri = 0; ri < this.rivals.length; ri++) {
          const rv = this.rivals[ri];
          const rvProg = isSprint ? Math.max(0, Math.min(1, rv.u)) : rv.lap - 1 + rv.u;
          if (rvProg > raceProgressTotal) playerRankFinish++;
        }
        const gpWinnerIsPlayer =
          this.raceMode === 'grand_prix' &&
          this.gpCompleted &&
          this.buildGrandPrixState().standings[0]?.isPlayer === true;

        this.lastRecordOutcome = saveRaceRecord({
          circuitId: trk.def.id,
          timeSec: S.t,
          bestLapSec: S.bestLapSec,
          takedowns: S.takedowns,
          driftScore: S.totalDriftScore,
          rank: playerRankFinish,
          shipId: this.selectedShipId,
          isGrandPrixRound: this.raceMode === 'grand_prix',
          isGrandPrixWin: gpWinnerIsPlayer,
          ghostSamples: this.ghostRecording
        });
        if (this.lastRecordOutcome.isNewBestTime) {
          this.showSplit('NEW CIRCUIT RECORD // 新纪录!');
        }
      };

      if (trk.def.isSprint) {
        if (S.u >= 0.992) {
          S.u = 0.992;
          if (S.driftActive && S.driftLiveScore > 0) {
            S.totalDriftScore += S.driftLiveScore;
            S.driftActive = false;
            S.driftLiveScore = 0;
          }
          S.run = false;
          S.done = true;
          this.victoryActive = true;
          this.victoryTimer = 0;
          if (this.raceMode === 'grand_prix') {
            this.recordGrandPrixFinish();
          }
          finalizeRaceRecord();
          this.audio.playLap(true);
          this.audio.updateEngine(0, false, false);
          this.audio.updateDriftSound(false, 0, 0);
          if (!this.lastRecordOutcome?.isNewBestTime) {
            this.showSplit(
              this.raceMode === 'grand_prix' ? 'VICTORY LAP // GP ROUND FINISH' : 'VICTORY LAP // 胜利巡航'
            );
          }
          this.setStep('results');
        }
      } else if (S.u >= 1) {
        const complete = S.gates >= 4;
        S.u -= 1;
        S.gates = 0;
        S.sector = 0;
        S.lastSplit = 0;
        if (!complete) {
          this.showSplit('CHECKPOINT MISSED');
        } else {
          const lapDuration = S.t - S.lapStartTime;
          S.lapStartTime = S.t;
          if (S.bestLapSec === null || lapDuration < S.bestLapSec) {
            S.bestLapSec = lapDuration;
          }
          S.lap++;
          if (S.lap > TOTAL_LAPS) {
            if (S.driftActive && S.driftLiveScore > 0) {
              S.totalDriftScore += S.driftLiveScore;
              S.driftActive = false;
              S.driftLiveScore = 0;
            }
            S.run = false;
            S.done = true;
            this.victoryActive = true;
            this.victoryTimer = 0;
            if (this.raceMode === 'grand_prix') {
              this.recordGrandPrixFinish();
            }
            finalizeRaceRecord();
            this.audio.playLap(true);
            this.audio.updateEngine(0, false, false);
            this.audio.updateDriftSound(false, 0, 0);
            if (!this.lastRecordOutcome?.isNewBestTime) {
              this.showSplit(
                this.raceMode === 'grand_prix' ? 'VICTORY LAP // GP ROUND FINISH' : 'VICTORY LAP // 胜利巡航'
              );
            }
            this.setStep('results');
          } else {
            this.audio.playLap(false);
            this.showSplit(`LAP ${S.lap} / ${TOTAL_LAPS}`);
          }
        }
      }
      S.e = Math.max(0, Math.min(1, S.e));
    } else if (this.step === 'results') {
      // Post-race autonomous victory cruise so the cinematic replay camera has continuous high-speed action
      const isSprintCruise = !!trk.def.isSprint;
      const targetCruiseV = this.victoryActive ? MAXV * 1.18 : MAXV * 0.88;
      S.v += (targetCruiseV - S.v) * (1 - Math.exp(-dt * 2.2));
      const targetLaneX = this.victoryActive ? 0 : Math.sin(now * 0.00085) * trk.hw * 0.32;
      S.vx = (targetLaneX - S.x) * 2.2;
      S.x += S.vx * dt;
      S.steer += (S.vx / 95 - S.steer) * Math.min(1, dt * 4);
      S.driftAngle += (0 - S.driftAngle) * Math.min(1, dt * 6);
      S.hitSpin *= Math.max(0, 1 - dt * 4);

      const clampCruiseU = (val: number) => (isSprintCruise ? Math.max(0, Math.min(1, val)) : ((val % 1) + 1) % 1);
      const pf0 = trk.fr(clampCruiseU(S.u));
      const pf1 = trk.fr(clampCruiseU(S.u + 0.0006));
      const cruiseArcStretch = Math.min(3.5, Math.max(1.0, pf0.pos.distanceTo(pf1.pos) / (0.0006 * trk.len)));
      const stepU = (S.v * dt) / (trk.len * cruiseArcStretch);
      S.u += stepU;
      if (isSprintCruise && S.u >= 0.994) {
        S.u = 0.14;
        this.replayCutRequested = true;
      } else if (!isSprintCruise && S.u >= 1) {
        S.u -= 1;
      }
      const cu = clampCruiseU(S.u);
      S.air = trk.elev.isGap(cu);
      S.airY = S.air ? trk.elev.arc(cu) : 0;
    }

    // Update vehicle transform
    const isSprint = !!trk.def.isSprint;
    const clampU = (val: number) => (isSprint ? Math.max(0, Math.min(1, val)) : ((val % 1) + 1) % 1);
    const u = clampU(S.u);
    const F = trk.fr(u);
    const probeDu = 0.0006;
    const pf0 = trk.fr(u);
    const pf1 = trk.fr(clampU(u + probeDu));
    const liveArcStretch = Math.min(3.5, Math.max(1.0, pf0.pos.distanceTo(pf1.pos) / (probeDu * trk.len)));

    const victoryArcLift =
      this.step === 'results' && this.victoryActive
        ? Math.sin(Math.min(1, this.victoryTimer / this.VICTORY_LAP_DUR) * Math.PI) * 4.4
        : 0;
    const edgeDropY =
      S.edgeFallTimer > 0
        ? -Math.sin(((0.85 - S.edgeFallTimer) / 0.85) * Math.PI * 0.7) * 38
        : 0;
    const spinLift = S.spinTimer > 0 ? Math.sin(((0.56 - S.spinTimer) / 0.56) * Math.PI) * 0.65 : 0;
    const hoverBob = S.run || this.step === 'results' ? Math.sin(now * 0.008) * 0.1 : Math.sin(now * 0.003) * 0.2;
    ship.position
      .copy(F.pos)
      .addScaledVector(F.s, S.x)
      .addScaledVector(F.up, 2.15 + S.airY + S.riskRailHeight + hoverBob + victoryArcLift + edgeDropY + spinLift);

    _vecNegS.copy(F.s).negate();
    _mat4.makeBasis(_vecNegS, F.up, F.t);
    ship.quaternion.setFromRotationMatrix(_mat4);

    // True 3D lane trajectory chord tangent + pitch (including lateral lane twist on corkscrews)
    const duPitch = 0.0018 / liveArcStretch;
    const uBehind = clampU(u - duPitch);
    const uAhead = clampU(u + duPitch);
    const fB = trk.fr(uBehind);
    const fA = trk.fr(uAhead);
    _vecA.copy(fB.pos).addScaledVector(fB.s, S.x).addScaledVector(fB.up, trk.elev.arc(uBehind));
    _vecB.copy(fA.pos).addScaledVector(fA.s, S.x).addScaledVector(fA.up, trk.elev.arc(uAhead));
    _vecC.subVectors(_vecB, _vecA);
    const pitch = Math.max(-0.85, Math.min(0.85, Math.atan2(_vecC.dot(F.up), Math.max(0.5, _vecC.dot(F.t)))));
    ship.rotateX(-pitch);
    ship.rotateY(-S.vx * 0.0007 - S.driftAngle - S.yawOff + S.spinAngle);

    let victoryBarrelRoll = 0;
    if (this.step === 'results' && this.victoryActive) {
      const rollPhase = THREE.MathUtils.clamp((this.victoryTimer - 0.35) / 2.85, 0, 1);
      const smoothRoll = rollPhase * rollPhase * (3 - 2 * rollPhase);
      victoryBarrelRoll = smoothRoll * Math.PI * 2;
    }
    ship.rotateZ(S.steer * 0.038 + S.vx * 0.0016 + S.driftAngle * 0.18 + S.hitSpin + victoryBarrelRoll);

    if (this.spinRingMesh && this.spinRingMat) {
      if (S.spinTimer > 0) {
        const spFrac = 1 - S.spinTimer / 0.56;
        this.spinRingMesh.visible = true;
        this.spinRingMesh.scale.setScalar(0.9 + spFrac * 1.45);
        this.spinRingMesh.rotation.z = spFrac * Math.PI * 3;
        this.spinRingMat.opacity = Math.sin(spFrac * Math.PI) * 0.85;
      } else {
        this.spinRingMesh.visible = false;
        this.spinRingMat.opacity = 0;
      }
    }

    if (this.impactShieldMesh && this.impactShieldMat) {
      if (this.impactShieldTimer > 0) {
        this.impactShieldTimer = Math.max(0, this.impactShieldTimer - rawDt);
        const prog = 1 - this.impactShieldTimer / this.IMPACT_SHIELD_DUR;
        this.impactShieldMesh.visible = true;
        this.impactShieldMat.uniforms.uProgress.value = prog;
        this.impactShieldMat.uniforms.uOpacity.value = Math.sin(Math.min(1, prog) * Math.PI) * 0.92;
      } else if (this.impactShieldMesh.visible) {
        this.impactShieldMesh.visible = false;
      }
    }

    // Holographic Saved Ghost Ship Playback & Live Split Delta
    if (this.ghostVehicle && this.ghostSamplesSaved.length >= 4 && S.run && !S.done) {
      const samples = this.ghostSamplesSaved;
      let idx = 0;
      while (idx < samples.length - 2 && samples[idx + 1].t <= S.t) idx++;
      const s0 = samples[idx];
      const s1 = samples[idx + 1];
      const spanT = Math.max(0.001, s1.t - s0.t);
      const frac = Math.max(0, Math.min(1, (S.t - s0.t) / spanT));
      const gTotalU = THREE.MathUtils.lerp(s0.u, s1.u, frac);
      const gU = isSprint ? Math.max(0, Math.min(1, gTotalU)) : ((gTotalU % 1) + 1) % 1;
      const gX = THREE.MathUtils.lerp(s0.x, s1.x, frac);
      const gAirY = THREE.MathUtils.lerp(s0.airY, s1.airY, frac);
      const gYaw = THREE.MathUtils.lerp(s0.yawOff, s1.yawOff, frac);

      const gF = trk.fr(gU);
      this.ghostVehicle.g.visible = true;
      this.ghostVehicle.g.position.copy(gF.pos).addScaledVector(gF.s, gX).addScaledVector(gF.up, 2.15 + gAirY);
      _vecNegS.copy(gF.s).negate();
      _mat4.makeBasis(_vecNegS, gF.up, gF.t);
      this.ghostVehicle.g.quaternion.setFromRotationMatrix(_mat4);
      this.ghostVehicle.g.rotateY(-gYaw);

      // Find ghost timestamp at player's current race progress for live split delta
      const pProg = isSprint ? u : S.lap - 1 + u;
      let pIdx = 0;
      while (pIdx < samples.length - 2 && samples[pIdx + 1].u <= pProg) pIdx++;
      const ps0 = samples[pIdx];
      const ps1 = samples[pIdx + 1];
      const spanU = Math.max(0.00001, ps1.u - ps0.u);
      const uFrac = Math.max(0, Math.min(1, (pProg - ps0.u) / spanU));
      const ghostTimeAtPlayerU = THREE.MathUtils.lerp(ps0.t, ps1.t, uFrac);
      this.ghostDeltaSec = S.t - ghostTimeAtPlayerU;
    } else if (this.ghostVehicle && this.ghostVehicle.g.visible) {
      this.ghostVehicle.g.visible = false;
    }

    const replayMode = this.step === 'paused' || this.step === 'results';
    const racing = this.step === 'race' || this.step === 'countdown';
    const isBoosting =
      ((this.heldKeys.Space || this.heldKeys.KeyC) && S.e > 0.02 && S.run) ||
      S.boost > 0 ||
      (this.step === 'results' && (this.victoryActive || Math.sin(now * 0.0014) > 0.45));

    this.audio.updateEngine(Math.min(1.5, S.v / MAXV), isBoosting, this.step === 'race' && S.run);
    this.audio.updateDriftSound(
      this.step === 'race' && S.run && S.driftActive,
      Math.min(1.4, Math.abs(S.vx) / 85 + Math.abs(S.driftAngle)),
      S.driftTier
    );

    if (replayMode) {
      // Cinematic Replay Camera System: automatically cuts between sweeping wide shots and close-up action angles
      // utilizing the existing 2nd-order spring-damped camera physics & tunnel/floor bounds guard.
      let cutNow = !this.replayWasActive || this.replayCutRequested;
      if (!cutNow) {
        this.replayShotElapsed += dt;
        const activeDef = REPLAY_SHOTS[this.replayShotIdx];
        if (this.replayShotElapsed >= activeDef.duration) {
          this.replayShotIdx = (this.replayShotIdx + 1) % REPLAY_SHOTS.length;
          this.replayShotElapsed = 0;
          this.replaySide = -this.replaySide;
          cutNow = true;
        }
      } else {
        if (!this.replayWasActive) {
          this.replayShotIdx = 0;
          this.replayShotElapsed = 0;
          this.replaySide = 1;
        } else if (this.replayCutRequested) {
          this.replayShotIdx = (this.replayShotIdx + 1) % REPLAY_SHOTS.length;
          this.replayShotElapsed = 0;
          this.replaySide = -this.replaySide;
        }
        this.replayCutRequested = false;
      }
      this.replayWasActive = true;

      const shot = REPLAY_SHOTS[this.replayShotIdx];
      const p = Math.max(0, Math.min(1, this.replayShotElapsed / shot.duration));
      const side = this.replaySide;

      let offBack = 12;
      let offLat = 20;
      let offUp = 8;
      let lookAheadT = 4;
      let lookUp = 1.1;

      if (shot.kind === 'close_quarter') {
        offBack = THREE.MathUtils.lerp(7.2, 8.8, p);
        offLat = side * THREE.MathUtils.lerp(4.2, 5.8, p);
        offUp = THREE.MathUtils.lerp(1.55, 2.35, p);
        lookAheadT = 3.5;
        lookUp = 0.85;
      } else if (shot.kind === 'wide_crane') {
        offBack = THREE.MathUtils.lerp(-30, 22, p);
        offLat = side * THREE.MathUtils.lerp(24, 34, Math.sin(p * Math.PI));
        offUp = THREE.MathUtils.lerp(17, 11.5, p);
        lookAheadT = 6;
        lookUp = 1.4;
      } else if (shot.kind === 'close_front') {
        offBack = THREE.MathUtils.lerp(-10.5, -13.2, p);
        offLat = side * THREE.MathUtils.lerp(3.8, -2.4, p);
        offUp = THREE.MathUtils.lerp(2.05, 2.65, p);
        lookAheadT = -1.2;
        lookUp = 0.9;
      } else if (shot.kind === 'wide_heli') {
        offBack = THREE.MathUtils.lerp(24, -14, p);
        offLat = -side * THREE.MathUtils.lerp(38, 28, p);
        offUp = THREE.MathUtils.lerp(22, 28, Math.sin(p * Math.PI));
        lookAheadT = 9;
        lookUp = 1.6;
      } else {
        // wide_apex: low sweeping trackside pass
        offBack = THREE.MathUtils.lerp(-34, 18, p);
        offLat = side * THREE.MathUtils.lerp(13, 22, p);
        offUp = THREE.MathUtils.lerp(4.4, 8.6, p);
        lookAheadT = 2.0;
        lookUp = 1.1;
      }

      // Check tunnel envelope around player so wide shots gracefully pull inside underwater/glass tunnels
      const featureList = LEVELS[this.activeLevel].features;
      let tunnelCeiling = Infinity;
      for (let ti = 0; ti < featureList.length; ti++) {
        const ft = featureList[ti];
        if (ft.type === 'tunnel' && u >= ft.at - 0.012 && u <= ft.at + ft.w + 0.012) {
          tunnelCeiling = (ft.height ?? 34) - 5.2;
          break;
        }
      }
      if (tunnelCeiling < Infinity) {
        const maxTunnelLat = Math.max(6, trk.hw - 8.5);
        offLat = Math.max(-maxTunnelLat, Math.min(maxTunnelLat, offLat));
        offUp = Math.min(tunnelCeiling, offUp);
      }

      _vecC.normalize();
      _camT.copy(_vecC);
      // Wide shots align up cleanly with a horizon-friendly blend; close-ups bank tightly with road up
      const horizonBlend = shot.kind.startsWith('wide') ? 0.65 : 0.18;
      _replayUpTarget.copy(F.up).lerp(_worldUp, horizonBlend).normalize();
      _camUp.lerp(_replayUpTarget, cutNow ? 1 : 1 - Math.exp(-dt * 8)).normalize();
      _camUp.addScaledVector(_camT, -_camUp.dot(_camT)).normalize();
      _camS.crossVectors(_camT, _camUp).normalize();

      _camP
        .copy(ship.position)
        .addScaledVector(_camT, -offBack)
        .addScaledVector(F.s, offLat)
        .addScaledVector(F.up, offUp);

      _vecB.copy(ship.position).addScaledVector(_camT, lookAheadT).addScaledVector(F.up, lookUp);

      if (cutNow || !this.camSpringInit) {
        this.camSpringPos.copy(_camP);
        this.camSpringVel.set(0, 0, 0);
        this.camSpringInit = true;
        _camLook.copy(_vecB);
        this.cam.fov = shot.fov;
        if (cutNow) this.emitHud(true);
      } else {
        const stiffness = shot.stiffness;
        const damping = 2 * Math.sqrt(stiffness) * 0.94;
        _vecA.subVectors(_camP, this.camSpringPos);
        this.camSpringVel.x += (_vecA.x * stiffness - this.camSpringVel.x * damping) * dt;
        this.camSpringVel.y += (_vecA.y * stiffness - this.camSpringVel.y * damping) * dt;
        this.camSpringVel.z += (_vecA.z * stiffness - this.camSpringVel.z * damping) * dt;
        this.camSpringPos.addScaledVector(this.camSpringVel, dt);
        _vecA.subVectors(this.camSpringPos, _camP);
        const stretch = _vecA.length();
        if (stretch > 9.0) {
          this.camSpringPos.copy(_camP).addScaledVector(_vecA, 9.0 / stretch);
        }
      }
      _camP.copy(this.camSpringPos);

      // Keep camera above road deck and inside tunnels at camera's track station
      const duCamR = offBack / (trk.len * liveArcStretch);
      const uCamR = clampU(u - duCamR);
      const camFrameR = trk.fr(uCamR);
      _vecA.subVectors(_camP, camFrameR.pos);
      const camUpRel = _vecA.dot(camFrameR.up);
      const minFloorH = trk.elev.isGap(uCamR) ? -14 : 2.6;
      if (camUpRel < minFloorH) {
        _camP.addScaledVector(camFrameR.up, minFloorH - camUpRel);
      }
      if (tunnelCeiling < Infinity) {
        _vecA.subVectors(_camP, camFrameR.pos);
        const relLatR = _vecA.dot(camFrameR.s);
        const maxTLat = Math.max(5, camFrameR.width - 7.0);
        if (Math.abs(relLatR) > maxTLat) {
          _camP.addScaledVector(camFrameR.s, Math.sign(relLatR) * maxTLat - relLatR);
        }
        const relUpR = _vecA.dot(camFrameR.up);
        if (relUpR > tunnelCeiling) {
          _camP.addScaledVector(camFrameR.up, tunnelCeiling - relUpR);
        }
      }

      // 2-point sightline guard against track crests
      for (let si = 0; si < 2; si++) {
        const tMid = si === 0 ? 0.35 : 0.7;
        const uMid = clampU(u - duCamR * (1 - tMid));
        if (trk.elev.isGap(uMid)) continue;
        const fMid = trk.fr(uMid);
        _vecA.copy(_camP).lerp(ship.position, tMid);
        _vecB.subVectors(_vecA, fMid.pos);
        const losH = _vecB.dot(fMid.up);
        if (losH < 1.8) {
          _camP.addScaledVector(fMid.up, (1.8 - losH) / (1 - tMid));
        }
      }

      // Recompute _vecB cleanly since LOS guard touched _vecB as scratch
      _vecB.copy(ship.position).addScaledVector(_camT, lookAheadT).addScaledVector(F.up, lookUp);

      this.cam.position.copy(_camP);
      _camLook.lerp(_vecB, cutNow ? 1 : 1 - Math.exp(-dt * 12));
      this.cam.up.copy(_camUp);
      _camBasis.lookAt(this.cam.position, _camLook, _camUp);
      _camDesiredQ.setFromRotationMatrix(_camBasis);
      if (cutNow) {
        this.cam.quaternion.copy(_camDesiredQ);
      } else {
        this.cam.quaternion.slerp(_camDesiredQ, 1 - Math.exp(-dt * 14));
      }
      this.cam.fov += (shot.fov - this.cam.fov) * (1 - Math.exp(-dt * 6));
      this.cam.updateProjectionMatrix();
      this.camRoll *= Math.max(0, 1 - dt * 6);
      this.screenShake = 0;
    } else if (!racing) {
      this.replayWasActive = false;
      this.camRoll *= Math.max(0, 1 - dt * 6);
      const sweep = this.step === 'preview' ? 0.032 : this.step === 'level' ? 0.018 : 0.007;
      const aerialH = this.step === 'preview' ? 540 : this.step === 'level' ? 460 : 400;
      const aerialFov = this.step === 'preview' ? 78 : this.step === 'level' ? 74 : 68;
      if (isSprint) {
        this.reconU += dt * sweep * this.reconDir;
        if (this.reconU >= 0.94) {
          this.reconU = 0.94;
          this.reconDir = -1;
        } else if (this.reconU <= 0.04) {
          this.reconU = 0.04;
          this.reconDir = 1;
        }
      } else {
        this.reconU = (this.reconU + dt * sweep) % 1;
      }
      const rf = trk.fr(this.reconU);
      const ahead = trk.fr(clampU(this.reconU + 0.045 * (isSprint ? this.reconDir : 1)));
      this.cam.position
        .copy(rf.pos)
        .addScaledVector(rf.up, aerialH)
        .addScaledVector(rf.t, -230 * (isSprint ? this.reconDir : 1));
      this.cam.up.set(0, 1, 0);
      _vecA.copy(ahead.pos).addScaledVector(ahead.up, 40);
      this.cam.lookAt(_vecA);
      this.cam.fov += (aerialFov - this.cam.fov) * Math.min(1, dt * 4);
      this.cam.updateProjectionMatrix();
      this.screenShake = 0;
    } else {
      this.replayWasActive = false;
      const spd = Math.min(2.2, S.v / MAXV);
      const speed01 = Math.min(1, spd);
      this.camBoost += ((isBoosting ? 1 : 0) - this.camBoost) * (1 - Math.exp(-dt * 2.8));

      let corkK = 0;
      for (const R of trk.rolls) {
        if (u < R.at || u > R.at + R.w) continue;
        corkK = Math.max(corkK, Math.sin((Math.PI * (u - R.at)) / R.w));
      }
      const inLoop = trk.loops.some((L) => u >= L.at && u <= L.at + L.w);
      const inRoll = corkK > 0.01;
      const stuntRate = (inLoop ? 22 : 0) + (inRoll ? 24 : 0);

      // Pull back smoothly during boost and high-intensity loops/corkscrews/jumps for unobstructed sightlines
      const intensityPull =
        this.camBoost * 3.4 + (inLoop ? 2.8 : 0) + (inRoll ? corkK * 3.2 : 0) + (S.air ? 2.2 : 0);
      this.camPullback += (intensityPull - this.camPullback) * (1 - Math.exp(-dt * 4.2));
      const targetBack = 9.8 + spd * 1.9 + this.camPullback;
      const targetUp =
        2.95 +
        spd * 0.25 +
        this.camBoost * 0.3 +
        (inLoop ? 0.85 : 0) +
        (inRoll ? corkK * 1.2 : 0) +
        (S.air ? 0.5 : 0);
      this.camBack += (targetBack - this.camBack) * (1 - Math.exp(-dt * 4.8));
      this.camUpD += (targetUp - this.camUpD) * (1 - Math.exp(-dt * 4.8));

      // Lock camera forward and surface-up axes smoothly to slope & corkscrew frames
      _vecC.normalize();
      _camT.lerp(_vecC, 1 - Math.exp(-dt * (20 + speed01 * 10 + stuntRate))).normalize();
      _camUp.lerp(F.up, 1 - Math.exp(-dt * (18 + speed01 * 8 + stuntRate))).normalize();
      _camUp.addScaledVector(_camT, -_camUp.dot(_camT)).normalize();
      _camS.crossVectors(_camT, _camUp).normalize();

      // Compute ideal chase position behind hover car
      _camP
        .copy(ship.position)
        .addScaledVector(_camT, -this.camBack)
        .addScaledVector(_camUp, this.camUpD + (inRoll ? corkK * 1.4 : 0))
        .addScaledVector(_camS, -S.vx * 0.0085 - S.steer * 0.85);

      // 2nd-order Spring-Damped camera follow: velocity-based lag prevents harsh snapping and loop/corner clipping
      if (this.firstFrame || !this.camSpringInit) {
        this.camSpringPos.copy(_camP);
        this.camSpringVel.set(0, 0, 0);
        this.camSpringInit = true;
        this.camRoll = 0;
        _camLook.copy(ship.position).addScaledVector(_camT, 18);
        this.firstFrame = false;
      } else {
        const stiffness = 105 + spd * 35 + stuntRate * 2.8;
        const damping = 2 * Math.sqrt(stiffness) * 0.94;
        _vecA.subVectors(_camP, this.camSpringPos);
        this.camSpringVel.x += (_vecA.x * stiffness - this.camSpringVel.x * damping) * dt;
        this.camSpringVel.y += (_vecA.y * stiffness - this.camSpringVel.y * damping) * dt;
        this.camSpringVel.z += (_vecA.z * stiffness - this.camSpringVel.z * damping) * dt;
        this.camSpringPos.addScaledVector(this.camSpringVel, dt);
        _vecA.subVectors(this.camSpringPos, _camP);
        const stretch = _vecA.length();
        if (stretch > 5.5) {
          this.camSpringPos.copy(_camP).addScaledVector(_vecA, 5.5 / stretch);
        }
      }
      _camP.copy(this.camSpringPos);

      // Anti-wall & anti-floor bounds clamp at the camera's longitudinal track station
      const duCam = this.camBack / (trk.len * liveArcStretch);
      const uCam = clampU(u - duCam);
      const camFrame = trk.fr(uCam);
      _vecA.subVectors(_camP, camFrame.pos);
      const relT = _vecA.dot(camFrame.t);
      const maxLat = Math.max(5, camFrame.width - 6.8);
      const relS = Math.max(-maxLat, Math.min(maxLat, _vecA.dot(camFrame.s)));

      const minCamUp = trk.elev.isGap(uCam) ? -20 : 2.9;
      let maxCamUp = Infinity;
      const tunnelList = LEVELS[this.activeLevel].features;
      for (let ti = 0; ti < tunnelList.length; ti++) {
        const ft = tunnelList[ti];
        if (ft.type === 'tunnel' && uCam >= ft.at && uCam <= ft.at + ft.w) {
          maxCamUp = (ft.height ?? 34) - 4.5;
          break;
        }
      }
      const relUp = Math.min(maxCamUp, Math.max(minCamUp, _vecA.dot(camFrame.up)));

      _camP
        .copy(camFrame.pos)
        .addScaledVector(camFrame.t, relT)
        .addScaledVector(camFrame.s, relS)
        .addScaledVector(camFrame.up, relUp);

      // 2-point sightline guard between camera and car so convex slope crests & corkscrew twists never block LOS
      for (let si = 0; si < 2; si++) {
        const tMid = si === 0 ? 0.35 : 0.7;
        const uMid = clampU(u - duCam * (1 - tMid));
        if (trk.elev.isGap(uMid)) continue;
        const fMid = trk.fr(uMid);
        _vecA.copy(_camP).lerp(ship.position, tMid);
        _vecB.subVectors(_vecA, fMid.pos);
        const losH = _vecB.dot(fMid.up);
        if (losH < 1.85) {
          const lift = (1.85 - losH) / (1 - tMid);
          _camP.addScaledVector(fMid.up, lift);
        }
      }

      if (maxCamUp < Infinity) {
        _vecA.subVectors(_camP, camFrame.pos);
        const postUp = _vecA.dot(camFrame.up);
        if (postUp > maxCamUp) {
          _camP.addScaledVector(camFrame.up, maxCamUp - postUp);
        }
      }

      this.cam.position.copy(_camP);

      this.camDip *= Math.max(0, 1 - dt * 4.2);
      if (Math.abs(this.camDip) > 0.01) {
        const safeDip = Math.max(-(relUp - 2.2), this.camDip * 0.28);
        this.cam.position.addScaledVector(_camUp, safeDip);
      }

      if (this.screenShake > 0.001) {
        const sh = (this.screenShake * 1.2) / (1 + spd * 0.7);
        this.cam.position.x += (Math.random() - 0.5) * sh;
        this.cam.position.y += (Math.random() - 0.5) * sh;
        this.cam.position.z += (Math.random() - 0.5) * sh;
        this.screenShake *= Math.exp(-dt * 5.0);
      }

      const aheadDist = 18 + spd * 10 + this.camBoost * 6;
      const aheadRoad = trk.fr(clampU(u + aheadDist / (trk.len * liveArcStretch)));
      _vecB.copy(ship.position).addScaledVector(_camT, aheadDist).addScaledVector(_camUp, 0.9);
      _vecC
        .copy(aheadRoad.pos)
        .addScaledVector(aheadRoad.up, 2.4 + (S.air ? S.airY * 0.65 : 0))
        .addScaledVector(aheadRoad.s, S.x * 0.45);
      _vecB.lerp(_vecC, inLoop || inRoll ? 0.34 : 0.46);

      _camLook.lerp(_vecB, 1 - Math.exp(-dt * (22 + speed01 * 10 + stuntRate)));

      // High-speed horizon tilt / aerodynamic cornering roll from track curvature, steering, lateral G, & drift
      const probeCurvDu = Math.min(0.012, 22 / (trk.len * liveArcStretch));
      const fCurvB = trk.fr(clampU(u - probeCurvDu));
      const fCurvA = trk.fr(clampU(u + probeCurvDu));
      const curvSpanM = Math.max(10, 2 * probeCurvDu * trk.len * liveArcStretch);
      const latTurnRad = fCurvA.t.dot(F.s) - fCurvB.t.dot(F.s);
      const curvSigned = latTurnRad / curvSpanM;
      const highSpeedGate = Math.min(1.45, Math.max(0, (spd - 0.14) / 0.86));
      const stuntAtten = inLoop || inRoll ? 0.35 : 1.0;
      const curvRoll = curvSigned * 22.0 * highSpeedGate * stuntAtten;
      const aeroRoll =
        (S.steer * 0.062 + (S.vx / 115) * 0.048 + S.driftAngle * 0.115) *
        (0.24 + 0.76 * highSpeedGate) *
        (1 + this.camBoost * 0.24);
      const targetRoll = THREE.MathUtils.clamp(curvRoll + aeroRoll, -0.165, 0.165);
      this.camRoll += (targetRoll - this.camRoll) * (1 - Math.exp(-dt * (5.6 + speed01 * 2.4)));

      // Orthonormalize rolled up vector around exact camera view ray without perturbing cam position bounds
      _vecC.subVectors(_camLook, this.cam.position).normalize();
      _vecA
        .copy(_camUp)
        .addScaledVector(_vecC, -_camUp.dot(_vecC))
        .normalize();
      _vecB.crossVectors(_vecC, _vecA).normalize();
      _vecA
        .multiplyScalar(Math.cos(this.camRoll))
        .addScaledVector(_vecB, Math.sin(this.camRoll))
        .normalize();

      this.cam.up.copy(_vecA);
      _camBasis.lookAt(this.cam.position, _camLook, _vecA);
      _camDesiredQ.setFromRotationMatrix(_camBasis);
      this.cam.quaternion.slerp(_camDesiredQ, 1 - Math.exp(-dt * (22 + speed01 * 12 + stuntRate)));

      // Dynamic FOV adjustment: expands aggressively when boosting + in high-intensity sections
      const targetFov =
        62 +
        speed01 * 4.5 +
        spd * 2.5 +
        this.camBoost * 11.5 +
        (inLoop ? 3.5 : 0) +
        (inRoll ? corkK * 5.5 : 0);
      this.cam.fov += (targetFov - this.cam.fov) * (1 - Math.exp(-dt * 4.5));
      this.cam.updateProjectionMatrix();
    }

    // Animated Multi-Stage Booster Plumes, Traveling Mach Rings & Underbody Repulsors
    const speedNormBoost = Math.min(1.4, S.v / MAXV);
    const flicker = 0.92 + Math.sin(now * 0.055) * 0.1 + Math.cos(now * 0.087) * 0.06;
    const lenScale = (0.75 + speedNormBoost * 0.85 + (isBoosting ? 1.15 : 0)) * flicker;
    const radScale = 0.86 + speedNormBoost * 0.24 + (isBoosting ? 0.42 : 0);
    this.player.engine.scale.set(radScale, radScale, lenScale);
    for (let bi = 0; bi < this.player.boosterCores.length; bi++) {
      const core = this.player.boosterCores[bi];
      const micro = 0.9 + Math.sin(now * 0.08 + bi * 1.7) * 0.14;
      core.scale.set(micro, micro, 0.94 + Math.sin(now * 0.06 + bi) * 0.12);
    }
    const ringSpeed = isBoosting ? 5.4 : 2.1 + speedNormBoost * 1.8;
    for (let ri = 0; ri < this.player.shockRings.length; ri++) {
      const ring = this.player.shockRings[ri];
      const phase = ((now * 0.001 * ringSpeed + ri * 0.5) % 1 + 1) % 1;
      ring.position.z = -0.35 - phase * 2.75;
      const rSc = (0.95 - phase * 0.48) * (isBoosting ? 1.25 : 0.88);
      ring.scale.setScalar(rSc);
    }
    const hoverFlare = 0.82 + Math.sin(now * 0.012) * 0.12 + (S.air ? 0.35 : 0) + (isBoosting ? 0.28 : 0);
    for (let ci = 0; ci < this.player.repulsorCones.length; ci++) {
      this.player.repulsorCones[ci].scale.set(hoverFlare, hoverFlare * (isBoosting ? 1.3 : 1.0), hoverFlare);
    }
    (this.player.groundHalo.material as THREE.MeshBasicMaterial).opacity =
      S.air ? 0.12 : 0.24 + speedNormBoost * 0.12 + (isBoosting ? 0.15 : 0);
    this.player.light.intensity = 1.2 + speedNormBoost * 1.1 + (isBoosting ? 1.5 : 0);

    const rimSpinRate = dt * (3.2 + S.v * 0.14);
    for (let si = 0; si < this.player.rimSpinners.length; si++) {
      this.player.rimSpinners[si].rotation.x += rimSpinRate;
    }

    if ((S.run || this.step === 'results') && S.v > 20) {
      _vecA.copy(ship.position).addScaledVector(F.s, -0.9).addScaledVector(F.t, -2.8);
      _vecB.copy(ship.position).addScaledVector(F.s, 0.9).addScaledVector(F.t, -2.8);
      this.spawnTrailParticle(_vecA);
      this.spawnTrailParticle(_vecB);
      if (isBoosting && Math.random() < 0.35) this.spawnSparks(ship.position, 6);
      if (this.step === 'results' && this.victoryActive) {
        // Celebratory Victory Lap thruster flare & wingtip gold/cyan neon trail ribbons
        for (let k = 0; k < 4; k++) {
          const wingSide = k % 2 === 0 ? -1.7 : 1.7;
          const tier = k % 2 === 0 ? 3 : 1;
          _vecA
            .copy(ship.position)
            .addScaledVector(F.s, wingSide)
            .addScaledVector(F.t, -2.5)
            .addScaledVector(F.up, Math.sin(victoryBarrelRoll) * wingSide * 0.4);
          this.spawnDriftNeonParticle(
            _vecA,
            F.t.x * -24 + (Math.random() - 0.5) * 14,
            F.t.y * -24 + (Math.random() - 0.5) * 14,
            F.t.z * -24 + (Math.random() - 0.5) * 14,
            tier,
            0.9
          );
        }
      }
      if (S.driftActive && S.run) {
        // Tier-colored trailing neon particles: Blue (0) -> Cyan (1) -> Magenta (2) -> Gold (3)
        const emitCount = 2 + S.driftTier * 2;
        const lifeSpan = 0.52 + S.driftTier * 0.14;
        for (let k = 0; k < emitCount; k++) {
          const isOuter = k % 3 !== 2;
          const latPod = isOuter ? -S.driftDir * (1.55 + Math.random() * 0.45) : S.driftDir * (1.05 + Math.random() * 0.35);
          _vecA
            .copy(ship.position)
            .addScaledVector(F.s, latPod)
            .addScaledVector(F.t, -2.2 - Math.random() * 0.7)
            .addScaledVector(F.up, -0.45 + Math.random() * 0.28);
          const backV = 15 + S.driftTier * 5 + Math.random() * 10;
          const outV = -S.driftDir * (12 + S.driftTier * 7 + Math.random() * 10);
          const upV = 3 + Math.random() * (6 + S.driftTier * 2);
          this.spawnDriftNeonParticle(
            _vecA,
            F.t.x * -backV + F.s.x * outV + F.up.x * upV,
            F.t.y * -backV + F.s.y * outV + F.up.y * upV,
            F.t.z * -backV + F.s.z * outV + F.up.z * upV,
            S.driftTier,
            lifeSpan
          );
        }
      }
    }

    // Rivals (Archetypes, Rubberband Pace, Gate/Obstacle Avoidance & Velocity-Based Nudge Combat)
    const uPlayerNorm = clampU(S.u);
    const playerLongVel = S.v * Math.cos(S.yawOff);
    const playerProg = isSprint ? Math.max(0, Math.min(1, S.u)) : S.lap - 1 + uPlayerNorm;

    for (let rIdx = 0; rIdx < this.rivals.length; rIdx++) {
      const rv = this.rivals[rIdx];
      rv.hitInvuln = Math.max(0, rv.hitInvuln - dt);
      rv.nudgeCool = Math.max(0, rv.nudgeCool - dt);
      rv.disorientTimer = Math.max(0, rv.disorientTimer - dt);

      const isDisabled = rv.wreckTimer > 0 || rv.fallTimer > 0;
      const disorientMul = rv.disorientTimer > 0 ? 0.64 : 1.0;

      // Rubberbanding AI pace scaling relative to player gap
      const rivalProg = isSprint ? Math.max(0, Math.min(1, rv.u)) : rv.lap - 1 + rv.u;
      const gapM = (rivalProg - playerProg) * trk.len;
      let rubberbandMul = 1.0;
      if (S.run && S.t > 3.0) {
        if (gapM < -55) {
          rubberbandMul = 1.15 + Math.min(0.22, (-gapM - 55) / 680);
        } else if (gapM > 140) {
          rubberbandMul = Math.max(0.84, 1 - (gapM - 140) / 1400);
        }
      }

      // Slipstream archetype gains draft speed boost behind any leader within 52m
      let slipBonus = 1.0;
      let slipLeaderOff = rv.off;
      let hasSlipTarget = false;
      if (rv.archetype === 'slipstream' && S.run) {
        let bestSlipDist = 52;
        if (gapM < -3 && -gapM < bestSlipDist) {
          bestSlipDist = -gapM;
          slipLeaderOff = S.x;
          hasSlipTarget = true;
        }
        for (let oi = 0; oi < this.rivals.length; oi++) {
          if (oi === rIdx) continue;
          const other = this.rivals[oi];
          if (other.wreckTimer > 0 || other.fallTimer > 0) continue;
          const oProg = isSprint ? Math.max(0, Math.min(1, other.u)) : other.lap - 1 + other.u;
          const dM = (oProg - rivalProg) * trk.len;
          if (dM > 3 && dM < bestSlipDist) {
            bestSlipDist = dM;
            slipLeaderOff = other.off;
            hasSlipTarget = true;
          }
        }
        if (hasSlipTarget && Math.abs(slipLeaderOff - rv.off) < 10) {
          slipBonus = 1.12;
        }
      }

      const speed = isDisabled
        ? 0
        : MAXV * rv.baseSpeed * disorientMul * rubberbandMul * slipBonus * (S.run ? 1 : this.step === 'paused' ? 0 : this.step === 'results' ? 0.86 : 0.15);
      const rpf0 = trk.fr(clampU(rv.u));
      const rpf1 = trk.fr(clampU(rv.u + 0.0006));
      const rArcStretch = Math.min(3.5, Math.max(1.0, rpf0.pos.distanceTo(rpf1.pos) / (0.0006 * trk.len)));
      if (!(isSprint && rv.u >= 0.996 && this.step !== 'results')) {
        rv.u += (speed * dt) / (trk.len * rArcStretch);
      }
      if (isSprint) {
        if (this.step === 'results' && rv.u >= 0.995) {
          rv.u = 0.12;
        } else {
          rv.u = Math.min(0.996, rv.u);
        }
      } else if (rv.u >= 1) {
        rv.u -= 1;
        rv.lap++;
      }

      if (rv.wreckTimer > 0) {
        rv.wreckTimer = Math.max(0, rv.wreckTimer - dt);
        rv.yawOff += rv.yawVel * dt;
        if (Math.random() < 0.4) this.spawnSparks(rv.g.position, 3);
        if (rv.wreckTimer === 0) {
          rv.hp = 1.0;
          rv.vx = 0;
          rv.yawOff = 0;
          rv.yawVel = 0;
          rv.disorientTimer = 0;
          rv.off = (rIdx - 1) * trk.hw * 0.35;
          rv.u = clampU(S.u + 0.014);
        }
      } else if (rv.fallTimer > 0) {
        rv.fallTimer = Math.max(0, rv.fallTimer - dt);
        rv.off += rv.fallSide * 26 * dt;
        rv.yawOff += rv.fallSide * 4 * dt;
        if (rv.fallTimer === 0) {
          rv.hp = 1.0;
          rv.vx = 0;
          rv.yawOff = 0;
          rv.yawVel = 0;
          rv.disorientTimer = 0;
          rv.off = (rIdx - 1) * trk.hw * 0.35;
          rv.u = clampU(S.u + 0.012);
        }
      } else {
        // Archetype baseline lane + AI Spiral Path-Blocked Gate & Obstacle Avoidance
        const ruCur = clampU(rv.u);
        let targetLane = Math.sin(now * 0.00045 + rIdx * 2.1) * trk.hw * 0.38;
        let steerStiffness = 1.5;

        if (rv.archetype === 'enforcer' && S.run && Math.abs(gapM) < 46 && S.wreckTimer <= 0 && S.edgeFallTimer <= 0) {
          // Aggressive blocker hunts the player's lane
          targetLane = S.x;
          steerStiffness = 2.6;
        } else if (rv.archetype === 'slipstream' && hasSlipTarget) {
          targetLane = slipLeaderOff;
          steerStiffness = 2.1;
        } else if (rv.archetype === 'tactician' && S.run && (S.nudgeTimer > 0 || S.spinTimer > 0) && Math.abs(gapM) < 28) {
          const evadeDir = Math.sign(rv.off - S.x) || 1;
          targetLane = Math.max(-trk.hw * 0.65, Math.min(trk.hw * 0.65, rv.off + evadeDir * trk.hw * 0.42));
          steerStiffness = 3.2;
        }

        // Priority 1: Steer around upcoming obstacles within 115m
        for (let oi = 0; oi < trk.obstacles.length; oi++) {
          const ob = trk.obstacles[oi];
          if (ob.active === false || ob.r <= 0.1 || ob.cool > 0) continue;
          let duOb = ob.u - ruCur;
          if (!isSprint && duOb < 0) duOb += 1;
          const dM = duOb * trk.len;
          if (dM > 2 && dM < 115 && Math.abs(ob.off - rv.off) < ob.r + 14) {
            const away = ob.off > 0 ? -1 : 1;
            targetLane = ob.off + away * (ob.r + 18);
            steerStiffness = 3.8;
            break;
          }
        }

        // Priority 2: Path-blocked spiral gate lane dodge (steer to safe ring within 230m)
        const sGates = trk.spiralBlockGates;
        if (sGates && sGates.length > 0) {
          for (let gi = 0; gi < sGates.length; gi++) {
            const gate = sGates[gi];
            const dM = (gate.u - ruCur) * trk.len;
            if (dM > 0 && dM < 230) {
              targetLane = -gate.blockedSide * trk.hw * 0.48;
              steerStiffness = 4.4;
              break;
            }
          }
        }

        const safeMargin = Math.max(8, trk.hw * trk.widthAt(ruCur) - 9);
        targetLane = Math.max(-safeMargin, Math.min(safeMargin, targetLane));

        rv.vx += (targetLane - rv.off) * (rv.disorientTimer > 0 ? 0.55 : steerStiffness) * dt;
        if (rv.disorientTimer > 0) {
          rv.vx += Math.sin(now * 0.015 + rIdx * 2.7) * 96 * dt;
          rv.yawVel += Math.cos(now * 0.02 + rIdx * 1.9) * 8.4 * dt;
          if (Math.random() < 0.25) this.spawnSparks(rv.g.position, 2);
        }
        rv.vx *= Math.exp(-dt * (rv.disorientTimer > 0 ? 1.8 : 2.7));
        rv.off += rv.vx * dt;
        rv.yawOff += rv.yawVel * dt;
        rv.yawVel *= Math.exp(-dt * 2.8);
        rv.yawOff *= Math.exp(-dt * 1.6);

        const rHasBarrier = trk.hasBarrierAt ? trk.hasBarrierAt(clampU(rv.u)) : true;
        const rDeckEdge = Math.max(10, trk.hw * trk.widthAt(rv.u));
        if (S.run && Math.abs(rv.off) > rDeckEdge + (rHasBarrier ? 2.5 : 1.0)) {
          if (!rHasBarrier || Math.abs(rv.vx) > 74) {
            rv.fallTimer = 1.65;
            rv.fallSide = Math.sign(rv.off) || 1;
            this.spawnSparks(rv.g.position, 32);
            this.awardTakedown('RIVAL KNOCKED OFF');
          } else {
            rv.off = Math.sign(rv.off) * (rDeckEdge - 6);
            rv.vx *= -0.4;
          }
        }
      }

      // Rival-vs-Rival spacing
      for (let jIdx = rIdx + 1; jIdx < this.rivals.length; jIdx++) {
        const rv2 = this.rivals[jIdx];
        if (rv.wreckTimer > 0 || rv.fallTimer > 0 || rv2.wreckTimer > 0 || rv2.fallTimer > 0) continue;
        let du12 = rv.u - rv2.u;
        if (!isSprint) {
          if (du12 > 0.5) du12 -= 1;
          if (du12 < -0.5) du12 += 1;
        }
        if (Math.abs(du12) * trk.len < 9.5 && Math.abs(rv.off - rv2.off) < 6.0) {
          const sepDir = Math.sign(rv.off - rv2.off) || 1;
          rv.vx += sepDir * 28;
          rv2.vx -= sepDir * 28;
        }
      }

      const ru = clampU(rv.u);
      const rf = trk.fr(ru);
      const rArc = trk.elev.arc(ru);
      const rEdgeDrop = rv.fallTimer > 0 ? -Math.sin(((1.65 - rv.fallTimer) / 1.65) * Math.PI * 0.75) * 44 : 0;
      const rSafeOff = rv.fallTimer > 0 ? rv.off : Math.max(-(rf.width + 6), Math.min(rf.width + 6, rv.off));
      rv.g.position.copy(rf.pos).addScaledVector(rf.s, rSafeOff).addScaledVector(rf.up, 2.15 + rArc + rEdgeDrop);
      _vecNegS.copy(rf.s).negate();
      _mat4.makeBasis(_vecNegS, rf.up, rf.t);
      rv.g.quaternion.setFromRotationMatrix(_mat4);
      const rDu = 0.0018 / rArcStretch;
      const ruB = clampU(ru - rDu);
      const ruA = clampU(ru + rDu);
      const rB = trk.fr(ruB);
      const rA = trk.fr(ruA);
      _vecA.copy(rB.pos).addScaledVector(rB.s, rSafeOff).addScaledVector(rB.up, trk.elev.arc(ruB));
      _vecB.copy(rA.pos).addScaledVector(rA.s, rSafeOff).addScaledVector(rA.up, trk.elev.arc(ruA));
      _vecC.subVectors(_vecB, _vecA);
      const rPitch = Math.max(-0.85, Math.min(0.85, Math.atan2(_vecC.dot(rf.up), Math.max(0.5, _vecC.dot(rf.t)))));
      rv.g.rotateX(-rPitch);
      rv.g.rotateY(-rv.yawOff);
      if (rv.wreckTimer > 0) {
        rv.g.rotateZ(now * 0.01);
      } else if (rv.disorientTimer > 0) {
        rv.g.rotateZ(Math.sin(now * 0.022 + rIdx * 1.4) * 0.38);
      }
      rv.engine.scale.set(1, 1, 1.15 + Math.sin(now * 0.02 + rv.off) * 0.2);
      for (let ri = 0; ri < rv.shockRings.length; ri++) {
        const ring = rv.shockRings[ri];
        const rPhase = ((now * 0.003 + ri * 0.5) % 1 + 1) % 1;
        ring.position.z = -0.35 - rPhase * 2.2;
        ring.scale.setScalar(0.9 - rPhase * 0.45);
      }
      for (let si = 0; si < rv.rimSpinners.length; si++) {
        rv.rimSpinners[si].rotation.x += dt * (3 + speed * 0.12);
      }

      if (S.run && rv.wreckTimer <= 0 && rv.fallTimer <= 0 && S.wreckTimer <= 0 && S.edgeFallTimer <= 0) {
        let du = ru - uPlayerNorm;
        if (!isSprint) {
          if (du > 0.5) du -= 1;
          if (du < -0.5) du += 1;
        }
        const longDist = Math.abs(du) * trk.len;
        const latDiff = rv.off - S.x;
        const latDist = Math.abs(latDiff);
        const pushDir = Math.sign(latDiff) || (Math.random() < 0.5 ? 1 : -1);

        // Player 360° Spin Attack AoE Strike + Vortex Disorientation
        if (S.spinTimer > 0 && rv.hitInvuln <= 0 && longDist < 18 && latDist < 17) {
          const prox = 1 - Math.min(1, Math.hypot(longDist, latDist) / 24);
          rv.hitInvuln = 0.44;
          rv.disorientTimer = Math.max(rv.disorientTimer, 2.8);
          rv.vx += pushDir * (118 + prox * 52);
          rv.yawVel += pushDir * (10.2 + prox * 5.8);
          rv.hp -= 0.48 + prox * 0.2;
          S.combatTag = `SPIN DISORIENT // ${rv.racerId}`;
          S.combatTagTimer = 1.3;
          _vecA.copy(ship.position).add(rv.g.position).multiplyScalar(0.5);
          _impactNormal.copy(F.s).multiplyScalar(pushDir);
          this.spawnDirectionalSparks(_vecA, _impactNormal, 34, F.t);
          this.screenShake = Math.max(this.screenShake, 0.58);
          this.hitstopTimer = 0.036;
          this.audio.playCrash();
          if (rv.hp <= 0) {
            rv.wreckTimer = 1.9;
            rv.yawVel = pushDir * 12;
            this.spawnSparks(rv.g.position, 52);
            this.awardTakedown(`${rv.racerId} WRECKED`);
          }
        } else if (S.spinTimer > 0 && longDist < 26 && latDist < 24 && rv.disorientTimer < 1.2) {
          rv.disorientTimer = 2.4;
          rv.yawVel += pushDir * 6.4;
          rv.vx += pushDir * 44;
          S.combatTag = `VORTEX DISORIENT // ${rv.racerId}`;
          S.combatTagTimer = 1.1;
          this.spawnSparks(rv.g.position, 16);
        } else if (S.nudgeTimer > 0 && S.nudgeDir !== 0 && rv.hitInvuln <= 0 && longDist < 12.5 && latDiff * S.nudgeDir > -3 && latDist < 14.5) {
          // Player Side Nudge Strike: relative-velocity physical collision force
          const relLatVel = Math.max(0, (S.vx - rv.vx) * S.nudgeDir);
          const relLongVel = Math.abs(playerLongVel - speed);
          const collisionForce = Math.min(205, Math.max(68, 62 + relLatVel * 0.78 + relLongVel * 0.34));
          rv.hitInvuln = 0.34;
          rv.vx += S.nudgeDir * collisionForce;
          rv.yawVel += S.nudgeDir * (collisionForce * 0.068);
          rv.hp -= Math.min(0.76, Math.max(0.24, collisionForce / 235));
          S.vx -= S.nudgeDir * (collisionForce * 0.24);
          S.v = Math.max(0, S.v - relLongVel * 0.12);
          S.hitSpinVel -= S.nudgeDir * 3.8;
          const impactTier =
            collisionForce >= 145
              ? 'HEAVY VELOCITY SLAM'
              : collisionForce >= 105
                ? 'HIGH-SPEED SHUNT'
                : 'SIDE NUDGE';
          S.combatTag = `${impactTier} (${Math.round(collisionForce)}kN) // ${rv.racerId}`;
          S.combatTagTimer = 1.2;
          _vecA.copy(ship.position).add(rv.g.position).multiplyScalar(0.5);
          _impactNormal.copy(F.s).multiplyScalar(S.nudgeDir);
          this.triggerImpactShield(S.nudgeDir, 0.2, _vecA, _impactNormal, 0xf5c451, F.t);
          this.screenShake = Math.max(this.screenShake, Math.min(0.84, 0.28 + collisionForce / 320));
          this.aberrationPulse = Math.max(this.aberrationPulse, Math.min(0.036, 0.012 + collisionForce / 7500));
          if (collisionForce >= 135) {
            this.hitstopTimer = Math.max(this.hitstopTimer, 0.032);
          }
          this.audio.playCrash();
          if (rv.hp <= 0) {
            rv.wreckTimer = 1.9;
            rv.yawVel = S.nudgeDir * 11;
            this.spawnSparks(rv.g.position, 52);
            this.awardTakedown(`${rv.racerId} WRECKED`);
          }
        } else if (longDist < 10.2 && latDist < 6.2) {
          // Solid bidirectional hover-hull collision + Enforcer opportunistic shunt
          const sepFromRival = -pushDir;
          const relLat = Math.abs(S.vx - rv.vx);
          const relLong = Math.abs(playerLongVel - speed);
          const enforcerMul = rv.archetype === 'enforcer' ? 1.2 : 1.0;
          const hullForce = Math.min(142, Math.max(40, (38 + relLat * 0.45 + relLong * 0.22) * enforcerMul));
          if (rv.nudgeCool <= 0 && S.edgeRecoverInvuln <= 0) {
            rv.nudgeCool = rv.archetype === 'enforcer' ? 2.1 : 3.2;
            S.vx += sepFromRival * (hullForce * 0.92);
            S.e = Math.max(0, S.e - Math.min(0.14, 0.04 + hullForce / 1400));
            S.yawVel += -sepFromRival * (2.8 + hullForce * 0.022);
            S.hitSpinVel += sepFromRival * 4.2;
            S.combatTag = `RIVAL SHUNT // ${rv.racerId}`;
            S.combatTagTimer = 1.0;
          } else {
            S.vx += sepFromRival * (hullForce * 0.56);
          }
          rv.vx += pushDir * (hullForce * 0.68);
          rv.off += pushDir * 1.8;
          S.v *= 0.91;
          _vecA.copy(ship.position).add(rv.g.position).multiplyScalar(0.5);
          _impactNormal.copy(F.s).multiplyScalar(sepFromRival);
          this.triggerImpactShield(pushDir, 0.1, _vecA, _impactNormal, 0xff2e93, F.t);
          this.screenShake = Math.max(this.screenShake, Math.min(0.7, 0.28 + hullForce / 360));
          this.aberrationPulse = Math.max(this.aberrationPulse, 0.02);
          this.audio.playCrash();
        }
      }
    }

    // Incoming Track/Rival Pulse Projectiles + Spin Reflection Combat Loop
    if (this.projAlertTimer > 0) this.projAlertTimer = Math.max(0, this.projAlertTimer - dt);
    if (S.run && S.wreckTimer <= 0 && S.edgeFallTimer <= 0 && S.t > 2.5) {
      this.projSpawnTimer -= dt;
      if (this.projSpawnTimer <= 0) {
        this.spawnIncomingProjectile(uPlayerNorm, trk.len, isSprint, trk.hw);
        this.projSpawnTimer = 2.8 + Math.random() * 1.8;
      }
    } else if (!S.run && this.step !== 'paused') {
      for (let pi = 0; pi < this.projectiles.length; pi++) {
        if (this.projectiles[pi].active) {
          this.projectiles[pi].active = false;
          this.projectiles[pi].group.visible = false;
        }
      }
    }

    let closestIncomingDist = Infinity;
    for (let pi = 0; pi < this.projectiles.length; pi++) {
      const pr = this.projectiles[pi];
      if (!pr.active) continue;

      if (this.step !== 'paused') {
        pr.ttl -= dt;
        if (pr.ttl <= 0) {
          pr.active = false;
          pr.group.visible = false;
          continue;
        }

        const pF0 = trk.fr(clampU(pr.u));
        const pF1 = trk.fr(clampU(pr.u + 0.0006));
        const pArc = Math.min(3.5, Math.max(1.0, pF0.pos.distanceTo(pF1.pos) / (0.0006 * trk.len)));
        pr.u += (pr.speed * dt) / (trk.len * pArc);

        if (isSprint) {
          if (pr.u <= 0.002 || pr.u >= 0.995) {
            pr.active = false;
            pr.group.visible = false;
            continue;
          }
        } else {
          pr.u = ((pr.u % 1) + 1) % 1;
        }

        if (pr.reflected) {
          // Track nearest valid target rival laterally
          let targetRv =
            pr.targetRivalIdx >= 0 && pr.targetRivalIdx < this.rivals.length ? this.rivals[pr.targetRivalIdx] : null;
          if (!targetRv || targetRv.wreckTimer > 0 || targetRv.fallTimer > 0) {
            let bestDist = Infinity;
            targetRv = null;
            for (let ri = 0; ri < this.rivals.length; ri++) {
              const cand = this.rivals[ri];
              if (cand.wreckTimer > 0 || cand.fallTimer > 0) continue;
              let duCand = cand.u - pr.u;
              if (!isSprint) {
                if (duCand > 0.5) duCand -= 1;
                if (duCand < -0.5) duCand += 1;
              }
              const dM = duCand * trk.len;
              if (dM > -10 && dM < 420 && Math.abs(dM) < bestDist) {
                bestDist = Math.abs(dM);
                targetRv = cand;
                pr.targetRivalIdx = ri;
              }
            }
          }
          if (targetRv) {
            const desiredVx = Math.max(-135, Math.min(135, (targetRv.off - pr.off) * 4.5));
            pr.vx += (desiredVx - pr.vx) * Math.min(1, dt * 8);
          }
        } else {
          // Gentle homing nudge toward player lane on incoming pulse
          const desiredVx = Math.max(-42, Math.min(42, (S.x - pr.off) * 1.4));
          pr.vx += (desiredVx - pr.vx) * Math.min(1, dt * 3);
        }

        const pLim = Math.max(8, trk.hw * trk.widthAt(clampU(pr.u)) - 4);
        pr.off = Math.max(-pLim, Math.min(pLim, pr.off + pr.vx * dt));
      }

      const pu = clampU(pr.u);
      const pf = trk.fr(pu);
      const pElev = trk.elev.arc(pu);
      pr.group.position.copy(pf.pos).addScaledVector(pf.s, pr.off).addScaledVector(pf.up, 2.35 + pElev);
      _vecNegS.copy(pf.s).negate();
      _mat4.makeBasis(_vecNegS, pf.up, pf.t);
      pr.group.quaternion.setFromRotationMatrix(_mat4);
      pr.group.rotateZ(now * 0.014);

      if (!S.run) continue;

      if (!pr.reflected) {
        let duP = pu - uPlayerNorm;
        if (!isSprint) {
          if (duP > 0.5) duP -= 1;
          if (duP < -0.5) duP += 1;
        }
        const signedDistP = duP * trk.len;
        const longDistP = Math.abs(signedDistP);
        const latDistP = Math.abs(pr.off - S.x);

        if (signedDistP > 0 && signedDistP < closestIncomingDist) {
          closestIncomingDist = signedDistP;
        }

        if (S.spinTimer > 0 && longDistP < 22 && latDistP < 15.5) {
          // Spin Attack Reflects Projectile Forward at Rival Ships!
          pr.reflected = true;
          pr.speed = Math.max(MAXV * 1.98, S.v + 175);
          pr.ttl = 2.8;
          pr.coreMat.color.setHex(0x00f5ff);
          pr.haloMat.color.setHex(0xffe066);
          pr.group.scale.setScalar(1.38);

          let bestRi = -1;
          let bestDist = Infinity;
          for (let ri = 0; ri < this.rivals.length; ri++) {
            const cand = this.rivals[ri];
            if (cand.wreckTimer > 0 || cand.fallTimer > 0) continue;
            let duR = cand.u - pu;
            if (!isSprint && duR < 0) duR += 1;
            const dM = duR * trk.len;
            if (dM > 0 && dM < bestDist) {
              bestDist = dM;
              bestRi = ri;
            }
          }
          pr.targetRivalIdx = bestRi;

          S.e = Math.min(1, S.e + 0.08);
          this.audio.playDeflect();
          this.spawnSparks(pr.group.position, 28);
          this.screenShake = Math.max(this.screenShake, 0.34);
          this.aberrationPulse = Math.max(this.aberrationPulse, 0.024);
          S.combatTag = 'PULSE REFLECTED // COUNTER';
          S.combatTagTimer = 1.25;
          this.showSplit('PULSE REFLECTED // [F] COUNTER');
        } else if (S.spinTimer <= 0 && S.wreckTimer <= 0 && S.edgeFallTimer <= 0 && S.edgeRecoverInvuln <= 0 && longDistP < 9.5 && latDistP < 5.4) {
          // Direct unshielded projectile hit on player
          pr.active = false;
          pr.group.visible = false;
          const pushP = Math.sign(S.x - pr.off) || (Math.random() < 0.5 ? 1 : -1);
          S.vx += pushP * 60;
          S.v *= 0.78;
          S.e = Math.max(0.05, S.e - 0.11);
          S.yawVel += -pushP * 5.2;
          S.hitSpinVel += pushP * 6.5;
          _impactNormal.copy(F.s).multiplyScalar(pushP);
          this.triggerImpactShield(-pushP, 0.6, ship.position, _impactNormal, 0xff2e63, F.t);
          this.screenShake = Math.max(this.screenShake, 0.65);
          this.aberrationPulse = Math.max(this.aberrationPulse, 0.035);
          this.audio.playCrash();
          S.combatTag = 'PULSE IMPACT';
          S.combatTagTimer = 1.0;
        }
      } else {
        // Reflected projectile strikes rival ships along its path
        for (let ri = 0; ri < this.rivals.length; ri++) {
          const rv = this.rivals[ri];
          if (rv.wreckTimer > 0 || rv.fallTimer > 0) continue;
          let duR = clampU(rv.u) - pu;
          if (!isSprint) {
            if (duR > 0.5) duR -= 1;
            if (duR < -0.5) duR += 1;
          }
          if (Math.abs(duR) * trk.len < 13 && Math.abs(rv.off - pr.off) < 8.8) {
            pr.active = false;
            pr.group.visible = false;
            const knockDir = Math.sign(rv.off - pr.off) || (Math.random() < 0.5 ? 1 : -1);
            rv.vx += knockDir * 108;
            rv.yawVel += knockDir * 11.5;
            rv.disorientTimer = Math.max(rv.disorientTimer, 2.8);
            rv.hp -= 0.58;
            this.spawnSparks(rv.g.position, 42);
            this.screenShake = Math.max(this.screenShake, 0.52);
            this.hitstopTimer = Math.max(this.hitstopTimer, 0.036);
            this.audio.playCrash();
            if (rv.hp <= 0) {
              rv.wreckTimer = 1.9;
              rv.yawVel = knockDir * 13;
              this.spawnSparks(rv.g.position, 56);
              this.awardTakedown(`${rv.racerId} REFLECT KO`);
            } else {
              S.combatTag = `REFLECT HIT // ${rv.racerId}`;
              S.combatTagTimer = 1.2;
              this.showSplit(`COUNTER HIT // ${rv.racerId}`);
            }
            break;
          }
        }
      }
    }

    if (closestIncomingDist < 115 && S.run && !this.hazardAlert.active) {
      this.projAlertTimer = 0.25;
      this.hazardAlert = {
        active: true,
        label: 'INCOMING PULSE // [F] SPIN TO REFLECT',
        kind: 'surge'
      };
    } else if (this.projAlertTimer <= 0 && this.hazardAlert.label === 'INCOMING PULSE // [F] SPIN TO REFLECT') {
      this.hazardAlert = { active: false, label: '', kind: 'debris' };
    }

    // Real-time overtake & position tracking for dynamic Race Announcer commentary
    if (S.run) {
      for (let i = 0; i < this.rivals.length; i++) {
        this.rivals[i].prevProgress = isSprint ? Math.max(0, Math.min(1, this.rivals[i].u)) : this.rivals[i].lap - 1 + this.rivals[i].u;
      }
      this.prevPlayerProgress = isSprint ? Math.max(0, Math.min(1, S.u)) : S.lap - 1 + (((S.u % 1) + 1) % 1);
    }

    // Particles & 3D Shatter Shards
    for (let i = 0; i < this.shards.length; i++) {
      const sh = this.shards[i];
      if (sh.life > 0) {
        sh.life = Math.max(0, sh.life - dt);
        sh.pos.addScaledVector(sh.vel, dt);
        sh.vel.y -= 52 * dt;
        sh.mesh.position.copy(sh.pos);
        sh.mesh.rotation.x += sh.rotVel.x * dt;
        sh.mesh.rotation.y += sh.rotVel.y * dt;
        sh.mesh.rotation.z += sh.rotVel.z * dt;
        sh.mesh.scale.setScalar(Math.max(0.05, sh.life * 1.1));
        if (sh.life === 0) sh.mesh.visible = false;
      }
    }

    for (let i = 0; i < this.SPARK_COUNT; i++) {
      if (this.sparkLife[i] > 0) {
        this.sparkLife[i] -= dt * 2.5;
        this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
        this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
        this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
        this.sparkVel[i * 3 + 1] -= 45 * dt;
      } else {
        this.sparkPos[i * 3 + 1] = -9999;
      }
    }
    this.sparkGeo.attributes.position.needsUpdate = true;

    for (let i = 0; i < this.TRAIL_MAX; i++) {
      if (this.trailLife[i] > 0) this.trailLife[i] -= dt * 2.2;
      else this.trailPos[i * 3 + 1] = -9999;
    }
    this.trailGeo.attributes.position.needsUpdate = true;

    for (let i = 0; i < this.DRIFT_MAX; i++) {
      if (this.driftLife[i] > 0) {
        this.driftLife[i] = Math.max(0, this.driftLife[i] - dt);
        this.driftPos[i * 3] += this.driftVel[i * 3] * dt;
        this.driftPos[i * 3 + 1] += this.driftVel[i * 3 + 1] * dt;
        this.driftPos[i * 3 + 2] += this.driftVel[i * 3 + 2] * dt;
        this.driftVel[i * 3] *= Math.max(0, 1 - dt * 1.8);
        this.driftVel[i * 3 + 1] *= Math.max(0, 1 - dt * 1.8);
        this.driftVel[i * 3 + 2] *= Math.max(0, 1 - dt * 1.8);
        const fade = this.driftLife[i] / Math.max(0.01, this.driftMaxLife[i]);
        const brightness = 0.2 + 0.8 * fade;
        this.driftCol[i * 3] = this.driftBaseCol[i * 3] * brightness;
        this.driftCol[i * 3 + 1] = this.driftBaseCol[i * 3 + 1] * brightness;
        this.driftCol[i * 3 + 2] = this.driftBaseCol[i * 3 + 2] * brightness;
      } else {
        this.driftPos[i * 3 + 1] = -9999;
      }
    }
    this.driftGeo.attributes.position.needsUpdate = true;
    this.driftGeo.attributes.color.needsUpdate = true;

    if (isBoosting || S.v > 180) {
      this.speedlineMat.opacity = Math.min(0.9, (S.v / MAXV) * 0.4 + (isBoosting ? 0.6 : 0));
      const arr = this.speedlineGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < this.SPEEDLINE_COUNT; i++) {
        arr[i * 6 + 2] += 300 * dt;
        arr[i * 6 + 5] += 300 * dt;
        if (arr[i * 6 + 2] > 5) {
          const x = (Math.random() - 0.5) * 55;
          const y = (Math.random() - 0.5) * 40;
          const z = -75 - Math.random() * 20;
          arr[i * 6] = x;
          arr[i * 6 + 1] = y;
          arr[i * 6 + 2] = z;
          arr[i * 6 + 3] = x;
          arr[i * 6 + 4] = y;
          arr[i * 6 + 5] = z - (isBoosting ? 20 : 10);
        }
      }
      this.speedlineGeo.attributes.position.needsUpdate = true;
    } else {
      this.speedlineMat.opacity = 0;
    }

    this.world?.update(dt, now);

    if (this.weather) {
      const weatherAutoAdvance = this.step === 'race' && S.run;
      this.weather.update(
        dt,
        now,
        this.cam,
        this.scene,
        { hemi: this.hemi, keyLight: this.keyLight, rimLight: this.rimLight },
        weatherAutoAdvance
      );

      const wSnap = this.weather.getSnapshot();
      const weatherAudioActive =
        this.step === 'race' || this.step === 'countdown' || this.step === 'preview' || this.step === 'level';
      this.audio.updateWeatherAmbience(wSnap.kind, wSnap.intensity, weatherAudioActive);

      // Update weather-triggered interactive hazards & compute high-speed proximity alert
      if (this.weatherHazards) {
        const lookaheadDist = Math.max(125, Math.min(265, 105 + S.v * 0.55));
        this.weatherHazards.update(
          dt,
          now,
          this.weather.getCurrentPhase(),
          ship.position,
          F.t,
          S.x,
          lookaheadDist,
          S.run,
          _hazardResult
        );

        if (this.debrisAlertTimer > 0) this.debrisAlertTimer = Math.max(0, this.debrisAlertTimer - dt);

        if (S.run) {
          // Also factor close upcoming track barrier obstacles into high-speed proximity alert
          let proxInt = _hazardResult.proximityIntensity;
          let proxKind = _hazardResult.proximityKind;
          let proxSide = _hazardResult.proximitySide;
          let proxDist = _hazardResult.proximityDistM;
          const obsLookahead = Math.min(130, 75 + S.v * 0.35);

          for (let oi = 0; oi < trk.obstacles.length; oi++) {
            const ob = trk.obstacles[oi];
            if (ob.cool > 0 || ob.active === false || ob.r <= 0.1) continue;
            _vecA.subVectors(ob.pos, ship.position);
            const dotFwd = _vecA.dot(F.t);
            if (dotFwd <= 0 || dotFwd > obsLookahead) continue;
            const latDiff = ob.off - S.x;
            if (Math.abs(latDiff) > ob.r + 18) continue;
            const edgeD = Math.max(0, dotFwd - ob.r);
            const obProx = Math.pow(1 - Math.min(1, edgeD / obsLookahead), 1.45);
            if (obProx > proxInt) {
              proxInt = obProx;
              proxKind = 'debris';
              proxSide = Math.max(-1, Math.min(1, latDiff / 22));
              proxDist = Math.round(edgeD);
            }
          }

          const smoothRate = proxInt > this.hazardProximity.intensity ? 12 : 6;
          this.hazardProximity.intensity +=
            (proxInt - this.hazardProximity.intensity) * (1 - Math.exp(-dt * smoothRate));
          this.hazardProximity.active = this.hazardProximity.intensity > 0.05;
          if (proxInt > 0.05) {
            this.hazardProximity.kind = proxKind;
            this.hazardProximity.side = proxSide;
            this.hazardProximity.distanceM = proxDist;
          }

          if (_hazardResult.debrisHit) {
            if (S.spinTimer > 0) {
              S.e = Math.min(1, S.e + 0.05);
              this.spawnSparks(_hazardResult.debrisHitPos, 36);
              this.screenShake = Math.max(this.screenShake, 0.34);
              this.audio.playDeflect();
              S.combatTag = 'DEBRIS DEFLECTED';
              S.combatTagTimer = 1.05;
              this.showSplit('DEBRIS DEFLECTED // 旋风弹开');
            } else {
              S.vx = _hazardResult.debrisPushDir * 52;
              S.v *= 0.68;
              S.e = Math.max(0.06, S.e - 0.09);
              S.hitSpin = (Math.random() - 0.5) * 0.95;
              this.spawnSparks(_hazardResult.debrisHitPos, 32);
              this.screenShake = Math.max(this.screenShake, 0.85);
              this.aberrationPulse = Math.max(this.aberrationPulse, 0.045);
              this.hitstopTimer = 0.034;
              this.audio.playCrash();
              this.debrisAlertTimer = 1.15;
              this.hazardAlert = { active: true, label: _hazardResult.alertLabel, kind: 'debris' };
            }
          }

          if (_hazardResult.inFogZone || _hazardResult.inSurgeZone) {
            S.e = Math.max(0.06, S.e - _hazardResult.energyDrainRate * dt);
            if (_hazardResult.speedDragRate > 0) {
              S.v *= Math.max(0.5, 1 - _hazardResult.speedDragRate * dt);
            }
            if (_hazardResult.lateralJolt !== 0) {
              S.vx += _hazardResult.lateralJolt * dt;
            }
            this.aberrationPulse = Math.max(this.aberrationPulse, 0.015);
            this.audio.updateHazardDrain(true);
            if (this.debrisAlertTimer <= 0) {
              this.hazardAlert = {
                active: true,
                label: _hazardResult.alertLabel,
                kind: _hazardResult.alertKind
              };
            }
          } else {
            this.audio.updateHazardDrain(false);
            if (this.debrisAlertTimer <= 0 && this.projAlertTimer <= 0 && this.hazardAlert.active) {
              this.hazardAlert = { active: false, label: '', kind: 'debris' };
            }
          }
        } else {
          this.audio.updateHazardDrain(false);
          if (this.hazardAlert.active) {
            this.hazardAlert = { active: false, label: '', kind: 'debris' };
          }
          if (this.hazardProximity.active) {
            this.hazardProximity.active = false;
            this.hazardProximity.intensity = 0;
          }
        }
      }

      // Subtle atmospheric track synergy: rain/mist wakes & solar energy trickle
      if (S.run) {
        if ((wSnap.kind === 'rain' || wSnap.kind === 'mist') && !S.air && S.v > 140 && Math.random() < wSnap.intensity * 0.4) {
          _vecA.copy(ship.position).addScaledVector(F.up, -0.7);
          this.spawnSparks(_vecA, 2);
        } else if (wSnap.kind === 'solar' && wSnap.solarPulse > 0.65) {
          S.e = Math.min(1, S.e + 0.018 * dt);
        }
      }

      // Dynamic weather-driven color grading and bloom intensity adjustments
      const defLook = LEVELS[this.activeLevel].look;
      const targetTint = _vecA.set(1.0, 1.0, 1.0);
      const targetShadows = _vecB.set(0.0, 0.0, 0.0);
      let targetContrast = 1.0;
      let targetSaturation = 1.0;
      let targetExposure = defLook.exposure;
      let targetHaze = 0.0;
      const targetHazeColor = _vecC.set(0.05, 0.1, 0.2);

      let targetBloomStrength = defLook.bloom;
      let targetBloomRadius = defLook.bloomRadius;
      let targetBloomThreshold = defLook.bloomThreshold;

      if (wSnap.kind === 'rain') {
        // Rain / Neon Downpour / Electric Squall: High contrast, deep cool shadows, vibrant neon saturation, lightning surges
        targetTint.set(0.86, 1.06, 1.25);
        targetShadows.set(0.015, 0.035, 0.08);
        targetContrast = 1.14;
        targetSaturation = 1.22;
        targetExposure = defLook.exposure * (1.0 + wSnap.lightningFlash * 0.35);
        targetHaze = 0.05 * wSnap.intensity;
        targetHazeColor.set(0.06, 0.12, 0.28);
        targetBloomStrength = Math.min(0.88, defLook.bloom + 0.08 + wSnap.intensity * 0.12 + wSnap.lightningFlash * 0.42);
        targetBloomRadius = defLook.bloomRadius + 0.06;
        targetBloomThreshold = Math.max(0.68, defLook.bloomThreshold - 0.14 - wSnap.lightningFlash * 0.3);
      } else if (wSnap.kind === 'mist') {
        // Mist / Tidal Ion Mist: Aquamarine ocean mist, soft lifted shadows, lower contrast, diffused glow & atmospheric haze
        targetTint.set(0.92, 1.15, 1.12);
        targetShadows.set(0.055, 0.085, 0.10);
        targetContrast = 0.92;
        targetSaturation = 0.94;
        targetExposure = defLook.exposure * 1.04;
        targetHaze = 0.18 * wSnap.intensity;
        targetHazeColor.set(0.18, 0.44, 0.50);
        targetBloomStrength = Math.min(0.85, defLook.bloom + 0.14 + wSnap.intensity * 0.18);
        targetBloomRadius = 0.58;
        targetBloomThreshold = Math.max(0.64, defLook.bloomThreshold - 0.24);
      } else {
        // Solar / Coronal Storm: Warm golden-amber cosmic radiation, sharp contrast, intense corona bloom
        targetTint.set(1.24, 1.08, 0.82);
        targetShadows.set(0.038, 0.018, 0.008);
        targetContrast = 1.16;
        targetSaturation = 1.08;
        targetExposure = defLook.exposure * (1.04 + wSnap.solarPulse * 0.34);
        targetHaze = 0.12 * wSnap.solarPulse;
        targetHazeColor.set(0.48, 0.28, 0.08);
        targetBloomStrength = Math.min(0.92, defLook.bloom + 0.16 + wSnap.intensity * 0.12 + wSnap.solarPulse * 0.42);
        targetBloomRadius = 0.52 + wSnap.solarPulse * 0.18;
        targetBloomThreshold = Math.max(0.60, defLook.bloomThreshold - 0.22 - wSnap.solarPulse * 0.24);
      }

      const blendRate = 1 - Math.exp(-dt * 4.5);
      this.curGradeTint.lerp(targetTint, blendRate);
      this.curGradeShadows.lerp(targetShadows, blendRate);
      this.curGradeContrast += (targetContrast - this.curGradeContrast) * blendRate;
      this.curGradeSaturation += (targetSaturation - this.curGradeSaturation) * blendRate;
      this.curGradeExposure += (targetExposure - this.curGradeExposure) * blendRate;
      this.curHaze += (targetHaze - this.curHaze) * blendRate;
      this.curHazeColor.lerp(targetHazeColor, blendRate);

      this.curBloomStrength += (targetBloomStrength - this.curBloomStrength) * blendRate;
      this.curBloomRadius += (targetBloomRadius - this.curBloomRadius) * blendRate;
      this.curBloomThreshold += (targetBloomThreshold - this.curBloomThreshold) * blendRate;

      if (this.bloomPass) {
        this.bloomPass.strength = this.curBloomStrength;
        this.bloomPass.radius = this.curBloomRadius;
        this.bloomPass.threshold = this.curBloomThreshold;
      }
    }

    this.aberrationPulse = Math.max(0, this.aberrationPulse - dt * 0.08);
    if (this.cyberPass) {
      this.cyberPass.uniforms.uAberration.value =
        (isBoosting ? 0.005 : 0) + (S.v / MAXV) * 0.0012 + Math.min(0.025, this.aberrationPulse);
      this.cyberPass.uniforms.uBlueShift.value = isBoosting ? 0.28 : 0;
      this.cyberPass.uniforms.uBlur.value = isBoosting ? 0.14 : Math.max(0, (S.v / MAXV - 0.8) * 0.12);
      this.cyberPass.uniforms.uSolarFlare.value = this.weather ? this.weather.getSolarFlareUniform() : 0;
      this.cyberPass.uniforms.uLightning.value = this.weather ? this.weather.getLightningFlash() : 0;
      this.cyberPass.uniforms.uTime.value = now * 0.001;
      this.cyberPass.uniforms.uGradeTint.value.copy(this.curGradeTint);
      this.cyberPass.uniforms.uGradeShadows.value.copy(this.curGradeShadows);
      this.cyberPass.uniforms.uGradeContrast.value = this.curGradeContrast;
      this.cyberPass.uniforms.uGradeSaturation.value = this.curGradeSaturation;
      this.cyberPass.uniforms.uGradeExposure.value = this.curGradeExposure;
      this.cyberPass.uniforms.uAtmosphericHaze.value = this.curHaze;
      this.cyberPass.uniforms.uHazeColor.value.copy(this.curHazeColor);
      this.cyberPass.uniforms.uSpinWarp.value =
        S.spinTimer > 0 ? Math.sin(((0.56 - S.spinTimer) / 0.56) * Math.PI) : 0;
      this.cyberPass.uniforms.uSpinTime.value = now * 0.001;
    }
  }

  private emitHud(force: boolean): void {
    const trk = this.world?.trk;
    const S = this.S;
    const isBoosting = ((this.heldKeys.Space || this.heldKeys.KeyC) && S.e > 0.02 && S.run) || S.boost > 0;

    if (!force && this.step !== 'race' && this.step !== 'countdown') return;

    const isSprint = !!trk?.def.isSprint;
    const totalLaps = isSprint ? 1 : TOTAL_LAPS;
    const uNorm = Math.max(0, Math.min(1, isSprint ? S.u : ((S.u % 1) + 1) % 1));
    const playerProfile = SHIP_PROFILES[this.selectedShipId] || SHIP_PROFILES[0];
    const playerIdent = getPlayerIdentity(this.selectedShipId);
    const playerProgress = isSprint ? uNorm : S.lap - 1 + uNorm;

    const unsorted: StandingEntry[] = [
      {
        id: playerProfile.id,
        racerId: playerIdent.racerId,
        teamName: playerIdent.teamName,
        shipName: playerProfile.name,
        colorHex: playerProfile.hex,
        isPlayer: true,
        rank: 1,
        lap: Math.min(S.lap, totalLaps),
        progress: playerProgress
      },
      ...this.rivals.map((rv) => {
        const prof = SHIP_PROFILES[rv.id] || SHIP_PROFILES[0];
        return {
          id: rv.id,
          racerId: rv.racerId,
          teamName: rv.teamName,
          shipName: prof.name,
          colorHex: prof.hex,
          isPlayer: false,
          archetype: rv.archetype,
          rank: 1,
          lap: Math.min(rv.lap, totalLaps),
          progress: isSprint ? Math.max(0, Math.min(1, rv.u)) : rv.lap - 1 + rv.u
        };
      })
    ];

    unsorted.sort((a, b) => b.progress - a.progress);
    let rank = 1;
    unsorted.forEach((entry, idx) => {
      entry.rank = idx + 1;
      if (entry.isPlayer) rank = entry.rank;
    });

    const pPt = this.projectToMinimap(this.player?.g.position.x ?? 0, this.player?.g.position.z ?? 0);
    const pTangent = trk?.fr(uNorm).t;
    const pAngleDeg = pTangent ? Math.atan2(pTangent.z, pTangent.x) * (180 / Math.PI) : 0;

    const playerMarker: MinimapRacerMarker = {
      id: playerProfile.id,
      racerId: playerIdent.racerId,
      colorHex: playerProfile.hex,
      isPlayer: true,
      rank,
      x: pPt.x,
      y: pPt.y,
      angleDeg: pAngleDeg,
      distM: 0,
      isAhead: false,
      isBehind: false
    };

    let closestAhead: { racerId: string; colorHex: string; distM: number; rank: number } | null = null;
    let closestBehind: { racerId: string; colorHex: string; distM: number; rank: number } | null = null;
    let minAheadDist = Infinity;
    let minBehindDist = Infinity;

    const opponentMarkers: MinimapRacerMarker[] = this.rivals.map((rv) => {
      const prof = SHIP_PROFILES[rv.id] || SHIP_PROFILES[0];
      const rPt = this.projectToMinimap(rv.g.position.x, rv.g.position.z);
      const rTangent = trk?.fr(rv.u).t;
      const rAngleDeg = rTangent ? Math.atan2(rTangent.z, rTangent.x) * (180 / Math.PI) : 0;

      const rivalProgress = isSprint ? Math.max(0, Math.min(1, rv.u)) : rv.lap - 1 + rv.u;
      const deltaProgress = rivalProgress - playerProgress;
      const distM = Math.round(deltaProgress * (trk?.len ?? 1000));
      const isAhead = distM > 0;
      const isBehind = distM < 0;

      const oppRank = unsorted.find((e) => e.racerId === rv.racerId)?.rank ?? 1;

      if (isAhead && distM < minAheadDist) {
        minAheadDist = distM;
        closestAhead = {
          racerId: rv.racerId,
          colorHex: prof.hex,
          distM,
          rank: oppRank
        };
      } else if (isBehind && Math.abs(distM) < minBehindDist) {
        minBehindDist = Math.abs(distM);
        closestBehind = {
          racerId: rv.racerId,
          colorHex: prof.hex,
          distM,
          rank: oppRank
        };
      }

      return {
        id: rv.id,
        racerId: rv.racerId,
        colorHex: prof.hex,
        isPlayer: false,
        rank: oppRank,
        x: rPt.x,
        y: rPt.y,
        angleDeg: rAngleDeg,
        distM,
        isAhead,
        isBehind
      };
    });

    const noBarriersActive = !!trk && !(trk.hasBarrierAt ? trk.hasBarrierAt(uNorm) : true);

    this.callbacks.onHudUpdate({
      speedKmh: Math.round(S.v * 3.2),
      speedNorm: S.v / (MAXV * 1.45),
      energy: S.e,
      lap: Math.min(S.lap, totalLaps),
      totalLaps,
      isSprint,
      progressPct: Math.round(uNorm * 100),
      rank,
      totalRacers: this.rivals.length + 1,
      standings: unsorted,
      timeSec: S.t,
      bestLapSec: S.bestLapSec,
      isBoosting,
      isAirborne: S.air,
      onRiskRail: S.onRiskRail,
      noBarriersActive,
      muted: this.audio.isMuted(),
      countdownText: this.countdownText,
      splitText: this.splitText,
      splitActive: this.splitText.length > 0,
      reconSecondsLeft: this.reconSecondsLeft,
      victoryLapActive: this.step === 'results' && this.victoryActive,
      archPhase: this.currentArchPhase,
      grandPrix: this.buildGrandPrixState(),
      weather: this.weather
        ? this.weather.getSnapshot()
        : {
            phaseId: 'neon_downpour',
            label: 'NEON DOWNPOUR',
            cn: '霓虹暴雨',
            kind: 'rain',
            intensity: 0.94,
            lightningFlash: 0,
            solarPulse: 0,
            hazardTag: 'HAZARD: FLOATING DEBRIS'
          },
      hazardAlert: this.hazardAlert,
      hazardProximity: { ...this.hazardProximity },
      spiralWarning: { ...this.spiralWarning },
      wrongWay: S.wrongWay,
      wrecked: S.wreckTimer > 0,
      wreckTimer: S.wreckTimer,
      takedowns: S.takedowns,
      nudgeCooldown: S.nudgeCooldown,
      spinCooldown: S.spinCooldown,
      spinActive: S.spinTimer > 0,
      combatTag: S.combatTag,
      drafting: {
        active: S.draftIntensity > 0.14,
        intensity: S.draftIntensity,
        targetId: S.draftTargetId,
        distM: S.draftDistM,
        slingshotReady: S.draftSlingshotTimer > 0
      },
      ghost: {
        active: this.ghostSamplesSaved.length >= 4,
        bestTimeSec: this.lastRecordOutcome?.record.bestTimeSec ?? this.ghostBestTimeSec,
        deltaSec: this.ghostDeltaSec,
        isNewBestTime: !!this.lastRecordOutcome?.isNewBestTime,
        isNewBestTakedowns: !!this.lastRecordOutcome?.isNewBestTakedowns
      },
      drift: {
        active: S.driftActive,
        dir: S.driftDir,
        tier: S.driftTier,
        charge: S.driftCharge,
        liveScore: S.driftLiveScore,
        totalScore: S.totalDriftScore,
        lastBonusLabel: S.driftBonusLabel
      },
      minimap: {
        circuitId: trk?.def.id ?? 'neon',
        circuitName: trk?.def.name ?? 'NEON SPRAWL',
        pathD: this.minimapPathD,
        isSprint,
        startFinish: this.minimapStartFinish,
        player: playerMarker,
        opponents: opponentMarkers,
        closestAhead,
        closestBehind
      },
      announcer: this.announcer.getSnapshot(),
      replayShot: REPLAY_SHOTS[this.replayShotIdx]?.label || 'WIDE · CRANE SWEEP',
      trackStats: trk
        ? {
            lengthKm: (trk.len / 1000).toFixed(1),
            widthM: Math.round(trk.hw * 2),
            minRadiusM: Math.round(trk.audit.minRadius),
            jumps: trk.elev.jumps.length,
            loops: trk.loops.length,
            rolls: trk.rolls.length,
            obstacles: trk.obstacles.length
          }
        : { lengthKm: '11.8', widthM: 280, minRadiusM: 280, jumps: 3, loops: 2, rolls: 1, obstacles: 18 }
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    if (this.reconInterval !== null) clearInterval(this.reconInterval);
    if (this.splitTimer !== null) clearTimeout(this.splitTimer);
    this.countdownTimers.forEach(clearTimeout);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('resize', this.onResize);

    this.detachTurntable();
    this.announcer.dispose();
    this.audio.dispose();
    this.trailGeo.dispose();
    this.trailMat.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    this.speedlineGeo.dispose();
    this.speedlineMat.dispose();
    this.driftGeo.dispose();
    this.driftMat.dispose();
    this.driftSpriteTex.dispose();
    this.impactShieldGeo?.dispose();
    this.impactShieldMat?.dispose();
    this.shardGeo?.dispose();
    this.shardMats.forEach((m) => m.dispose());
    for (let i = 0; i < this.shards.length; i++) {
      this.scene.remove(this.shards[i].mesh);
    }
    this.shards = [];
    if (this.ghostVehicle) {
      this.scene.remove(this.ghostVehicle.g);
      this.ghostVehicle = null;
    }
    this.ghostMat?.dispose();
    this.projCoreGeo?.dispose();
    this.projHaloGeo?.dispose();
    for (let i = 0; i < this.projectiles.length; i++) {
      this.projectiles[i].coreMat.dispose();
      this.projectiles[i].haloMat.dispose();
      this.scene.remove(this.projectiles[i].group);
    }
    this.projectiles = [];
    if (this.weatherHazards) {
      this.weatherHazards.dispose(this.scene);
      this.weatherHazards = null;
    }
    if (this.weather) {
      this.weather.dispose(this.scene);
      this.weather = null;
    }
    if (this.world) disposeGroup(this.world.group, this.scene);
    this.envTexture.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
