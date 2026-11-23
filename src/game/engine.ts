import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RaceAnnouncer } from './announcer';
import { SoundEngine } from './audio';
import { generateRivalIdentities, getPlayerIdentity } from './rivals';
import { radialTexture, setTextureMaxAnisotropy } from './textures';
import { LEVELS } from './tracks';
import type {
  GameStep,
  HazardAlert,
  HazardProximityAlert,
  HudSnapshot,
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
    uTime: { value: 0.0 }
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
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5);
      vec2 toCenter = uv - center;
      float dist = length(toCenter);

      vec2 rOffset = toCenter * uAberration;
      vec2 bOffset = toCenter * (-uAberration * 0.85);

      float r = texture2D(tDiffuse, uv + rOffset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + bOffset).b;
      vec3 col = vec3(r, g, b);

      if (uBlueShift > 0.001) {
        vec3 tinted = vec3(col.r * 0.78, col.g * 1.06, col.b * 1.28);
        col = mix(col, tinted, clamp(uBlueShift, 0.0, 1.0));
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

      if (uSolarFlare > 0.001) {
        float flareDist = length(uv - vec2(0.76, 0.78));
        float corona = exp(-flareDist * 3.4) * uSolarFlare;
        float streak = exp(-abs(uv.y - 0.78) * 26.0) * exp(-abs(uv.x - 0.76) * 2.4) * uSolarFlare;
        col += vec3(1.0, 0.68, 0.28) * (corona * 0.24 + streak * 0.18);
      }

      if (uLightning > 0.001) {
        col += vec3(0.32, 0.78, 1.0) * (uLightning * 0.14);
      }

      float vig = smoothstep(1.25, 0.4, dist);
      col *= mix(1.0, vig, uVignette);
      gl_FragColor = vec4(col, 1.0);
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
  u: number;
  lap: number;
  off: number;
  baseSpeed: number;
  prevProgress: number;
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
  private envTexture: THREE.Texture;

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
    air: false,
    airY: 0,
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
    driftBonusTimer: 0
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

    // Mandatory studio environment reflection map via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

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
    } else if (this.step === 'preview' && (e.code === 'Enter' || e.code === 'Space')) {
      this.startCountdown();
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
    if (this.bloomPass) {
      this.bloomPass.strength = def.look.bloom;
      this.bloomPass.radius = def.look.bloomRadius;
      this.bloomPass.threshold = def.look.bloomThreshold;
    }
    this.renderer.toneMappingExposure = def.look.exposure;
    this.trailMat.color.setHex(def.theme.secondary);
    this.speedlineMat.color.setHex(def.theme.accent);
    this.sparkMat.color.setHex(def.theme.secondary);
    this.audio.setLevel(index);
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
    this.scene.add(this.player.g);
  }

  private setupRivals(playerId: number): void {
    for (const r of this.rivals) this.scene.remove(r.g);
    this.rivals = [];
    const trk = this.world?.trk;
    const hw = trk ? trk.hw : 120;
    const ids = [0, 1, 2, 3].filter((id) => id !== playerId);
    const identities = generateRivalIdentities(ids.length);
    ids.forEach((typeId, i) => {
      const prof = SHIP_PROFILES[typeId];
      const built = buildLuxuryHoverCar(typeId, prof.color, 0.96);
      this.scene.add(built.g);
      this.rivals.push({
        ...built,
        id: typeId,
        racerId: identities[i].racerId,
        teamName: identities[i].teamName,
        u: (i + 1) * 0.022,
        lap: 1,
        off: [-0.45, -0.1, 0.42][i] * hw,
        baseSpeed: [0.82, 0.88, 0.94][i],
        prevProgress: (i + 1) * 0.022
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
      this.updateTurntableModel();
      this.resizeTurntable();
    }
    if (next === 'preview') {
      this.startRecon();
    }

    this.callbacks.onStepChange(next);
    this.emitHud(true);
  }

  public selectShip(id: number): void {
    if (!SHIP_PROFILES[id]) return;
    this.audio.playUiClick();
    this.selectedShipId = id;
    this.rebuildPlayer();
    this.setupRivals(id);
    this.updateTurntableModel();
    this.callbacks.onShipChange(id);
    this.callbacks.onCustomizationChange(this.getCustomization(id));
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
    const identities = generateRivalIdentities(this.rivals.length);
    this.rivals.forEach((r, i) => {
      r.racerId = identities[i].racerId;
      r.teamName = identities[i].teamName;
    });
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
      driftBonusTimer: 0
    });
    this.rivals.forEach((r, i) => {
      r.u = (i + 1) * 0.022;
      r.lap = 1;
      r.prevProgress = r.u;
    });
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
      air: false,
      airY: 0,
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
      driftBonusTimer: 0
    });
    this.rivals.forEach((r, i) => {
      r.u = (i + 1) * 0.022;
      r.lap = 1;
      r.prevProgress = r.u;
    });
    this.prevPlayerProgress = 0;
    this.prevRank = 4;
    if (this.world) {
      this.world.trk.obstacles.forEach((o) => {
        o.cool = 0;
      });
    }
    this.weather?.resetCycle();
    this.weatherHazards?.resetCooldowns();
    this.announcer.resetRaceCooldowns();
    this.hazardAlert = { active: false, label: '', kind: 'debris' };
    this.hazardProximity = { active: false, intensity: 0, kind: 'debris', side: 0, distanceM: 999 };
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

  private updateTurntableModel(): void {
    if (!this.pvRoot || !this.pvScene) return;
    while (this.pvRoot.children.length > 0) {
      this.pvRoot.remove(this.pvRoot.children[0]);
    }
    const custom = this.getCustomization(this.selectedShipId);
    const neon = getNeonPreset(custom.neonId);
    const built = buildLuxuryHoverCar(this.selectedShipId, neon.color, 1.0, custom);
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
      if (!this.pvIsDragging) this.pvDragYaw += dt * 0.48;
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

  private stepSimulation(dt: number, now: number): void {
    const trk = this.world?.trk;
    const ship = this.player?.g;
    if (!trk || !ship || !this.player) return;

    const prof = SHIP_PROFILES[this.selectedShipId];
    const S = this.S;

    this.announcer.update(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
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

      S.throttle += ((thr && !brk ? 1 : 0) - S.throttle) * Math.min(1, dt * (thr && !brk ? 0.85 : 2.6));

      const padBoost = S.boost > 0 && thr;
      const boostOn = !brk && (bst || padBoost);
      const accelerating = !brk && (thr || bst);
      const boostMul = boostOn ? 1.68 * prof.bst : 1;
      const top = accelerating
        ? MAXV * prof.spd * (boostOn ? 1 : 0.72 + 0.28 * S.throttle) * boostMul
        : 0;
      const k = brk ? 2.6 : accelerating ? (boostOn ? 3.2 : 0.82 * prof.acc) : 1.9;

      S.v += (top - S.v) * (1 - Math.exp(-dt * k));
      if (brk) S.v = Math.max(0, S.v - 210 * dt);

      if (bst) S.e -= 0.2 * dt;
      else S.e = Math.min(1, S.e + 0.036 * dt);
      S.boost = Math.max(0, S.boost - dt);

      S.steer += (steer - S.steer) * Math.min(1, dt * 11);
      const speedFrac = Math.min(1, S.v / MAXV);
      const boostFrac = boostOn ? 1 : 0;
      const grip = (0.96 - 0.16 * speedFrac) * prof.hnd;

      if (S.driftActive) {
        const effSteer = S.driftDir * 0.58 + S.steer * 0.72;
        const desiredVx = effSteer * (124 + boostFrac * 38) * (0.52 + 0.48 * speedFrac);
        const latAccel = (225 + boostFrac * 240) * grip;
        const dVx = desiredVx - S.vx;
        S.vx += Math.max(-latAccel * dt, Math.min(latAccel * dt, dVx));

        const targetDriftAngle = S.driftDir * (0.3 + Math.min(0.16, Math.abs(effSteer) * 0.14));
        S.driftAngle += (targetDriftAngle - S.driftAngle) * Math.min(1, dt * 8.5);

        const slipFactor = 0.55 + Math.min(1, Math.abs(S.vx) / 90) * 0.45;
        const chargeRate = (0.32 + 0.16 * speedFrac) * slipFactor;
        S.driftCharge = Math.min(1, S.driftCharge + chargeRate * dt);
        S.driftTier = S.driftCharge >= 0.96 ? 3 : S.driftCharge >= 0.62 ? 2 : S.driftCharge >= 0.28 ? 1 : 0;
        S.driftScoreAcc += (145 + S.v * 0.95) * (1 + S.driftTier * 0.45) * dt;
        S.driftLiveScore = Math.floor(S.driftScoreAcc);
        S.driftDuration += dt;
      } else {
        const desiredVx = S.steer * (92 + boostFrac * 36) * (0.48 + 0.52 * speedFrac);
        const latAccel = (175 + boostFrac * 240) * grip;
        const dVx = desiredVx - S.vx;
        S.vx += Math.max(-latAccel * dt, Math.min(latAccel * dt, dVx));
        S.driftAngle += (0 - S.driftAngle) * Math.min(1, dt * 11);
      }

      S.x += S.vx * dt;

      const liveWidth = trk.hw * trk.widthAt(S.u);
      const driftDragMul = S.driftActive ? 0.045 : 0.14;
      S.v *= 1 - Math.min(0.35, Math.abs(S.vx) / liveWidth) * driftDragMul * dt;
      S.hitSpin *= Math.max(0, 1 - dt * 2.4);

      const EDGE_BUFFER = 6.8;
      const limit = Math.max(8, trk.hw * trk.widthAt(S.u) - EDGE_BUFFER);
      if (Math.abs(S.x) > limit) {
        S.x = Math.sign(S.x) * limit;
        S.vx *= -0.3;
        S.v *= 0.965;
        S.e -= 0.004;
        this.spawnSparks(ship.position, 10);
        this.screenShake = Math.max(this.screenShake, 0.22);
      }

      const isSprint = !!trk.def.isSprint;
      const clampU = (val: number) => (isSprint ? Math.max(0, Math.min(1, val)) : ((val % 1) + 1) % 1);
      S.prev = S.u;
      const probeDu = 0.0006;
      const probeF0 = trk.fr(clampU(S.u));
      const probeF1 = trk.fr(clampU(S.u + probeDu));
      const arcStretch = Math.min(3.5, Math.max(1.0, probeF0.pos.distanceTo(probeF1.pos) / (probeDu * trk.len)));
      const stepU = (S.v * dt) / (trk.len * arcStretch);
      const gateAt = [0.2, 0.4, 0.6, 0.8][S.gates];
      if (gateAt !== undefined && S.u < gateAt && S.u + stepU >= gateAt) S.gates++;
      S.u += stepU;
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

      for (const ob of trk.obstacles) {
        if (ob.cool > 0) {
          ob.cool -= dt;
          continue;
        }
        if (ship.position.distanceToSquared(ob.pos) < (ob.r + 2.4) ** 2) {
          const dir = Math.sign(S.x - ob.off) || 1;
          S.vx = dir * 58;
          S.v *= 0.62;
          S.e = Math.max(0, S.e - 0.12);
          S.hitSpin = (Math.random() - 0.5) * 1.1;
          ob.cool = 2.2;
          this.spawnSparks(ob.pos, 38);
          this.screenShake = 0.75;
          this.aberrationPulse = 0.035;
          this.hitstopTimer = 0.042; // 42ms impact hitstop
          this.audio.playCrash();
        }
      }

      if (S.e <= 0) {
        S.e = 0.5;
        S.v = 0;
        S.x = 0;
        S.vx = 0;
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
          this.audio.playLap(true);
          this.audio.updateEngine(0, false, false);
          this.audio.updateDriftSound(false, 0, 0);
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
            this.audio.playLap(true);
            this.audio.updateEngine(0, false, false);
            this.audio.updateDriftSound(false, 0, 0);
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
      const targetCruiseV = MAXV * 0.88;
      S.v += (targetCruiseV - S.v) * (1 - Math.exp(-dt * 2.2));
      const targetLaneX = Math.sin(now * 0.00085) * trk.hw * 0.32;
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

    const hoverBob = S.run || this.step === 'results' ? Math.sin(now * 0.008) * 0.1 : Math.sin(now * 0.003) * 0.2;
    ship.position
      .copy(F.pos)
      .addScaledVector(F.s, S.x)
      .addScaledVector(F.up, 2.15 + S.airY + hoverBob);

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
    ship.rotateY(-S.vx * 0.0007 - S.driftAngle);
    ship.rotateZ(S.steer * 0.038 + S.vx * 0.0016 + S.driftAngle * 0.18 + S.hitSpin);

    const replayMode = this.step === 'paused' || this.step === 'results';
    const racing = this.step === 'race' || this.step === 'countdown';
    const isBoosting =
      ((this.heldKeys.Space || this.heldKeys.KeyC) && S.e > 0.02 && S.run) ||
      S.boost > 0 ||
      (this.step === 'results' && Math.sin(now * 0.0014) > 0.45);

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

    // Rivals
    for (const rv of this.rivals) {
      const speed =
        MAXV * rv.baseSpeed * (S.run ? 1 : this.step === 'paused' ? 0 : this.step === 'results' ? 0.86 : 0.15);
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
      const ru = clampU(rv.u);
      const rf = trk.fr(ru);
      const rArc = trk.elev.arc(ru);
      rv.g.position.copy(rf.pos).addScaledVector(rf.s, rv.off).addScaledVector(rf.up, 2.15 + rArc);
      _vecNegS.copy(rf.s).negate();
      _mat4.makeBasis(_vecNegS, rf.up, rf.t);
      rv.g.quaternion.setFromRotationMatrix(_mat4);
      const rDu = 0.0018 / rArcStretch;
      const ruB = clampU(ru - rDu);
      const ruA = clampU(ru + rDu);
      const rB = trk.fr(ruB);
      const rA = trk.fr(ruA);
      _vecA.copy(rB.pos).addScaledVector(rB.s, rv.off).addScaledVector(rB.up, trk.elev.arc(ruB));
      _vecB.copy(rA.pos).addScaledVector(rA.s, rv.off).addScaledVector(rA.up, trk.elev.arc(ruA));
      _vecC.subVectors(_vecB, _vecA);
      const rPitch = Math.max(-0.85, Math.min(0.85, Math.atan2(_vecC.dot(rf.up), Math.max(0.5, _vecC.dot(rf.t)))));
      rv.g.rotateX(-rPitch);
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

      if (S.run) {
        const dist = ship.position.distanceTo(rv.g.position);
        if (dist < 4.2) {
          const dir = Math.sign(S.x - rv.off || 1);
          S.vx += dir * 30;
          rv.off -= dir * 3;
          S.v *= 0.92;
          _vecA.copy(ship.position).add(rv.g.position).multiplyScalar(0.5);
          this.spawnSparks(_vecA, 22);
          this.screenShake = 0.5;
          this.aberrationPulse = 0.02;
          this.audio.playCrash();
        }
      }
    }

    // Real-time overtake & position tracking for dynamic Race Announcer commentary
    if (S.run) {
      for (let i = 0; i < this.rivals.length; i++) {
        this.rivals[i].prevProgress = isSprint ? Math.max(0, Math.min(1, this.rivals[i].u)) : this.rivals[i].lap - 1 + this.rivals[i].u;
      }
      this.prevPlayerProgress = isSprint ? Math.max(0, Math.min(1, S.u)) : S.lap - 1 + (((S.u % 1) + 1) % 1);
    }

    // Particles
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
            if (ob.cool > 0) continue;
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
            if (this.debrisAlertTimer <= 0 && this.hazardAlert.active) {
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

      if (this.bloomPass) {
        const defLook = LEVELS[this.activeLevel].look;
        this.bloomPass.strength = Math.min(0.68, defLook.bloom + this.weather.getBloomAdd());
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
      muted: this.audio.isMuted(),
      countdownText: this.countdownText,
      splitText: this.splitText,
      splitActive: this.splitText.length > 0,
      reconSecondsLeft: this.reconSecondsLeft,
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
      drift: {
        active: S.driftActive,
        dir: S.driftDir,
        tier: S.driftTier,
        charge: S.driftCharge,
        liveScore: S.driftLiveScore,
        totalScore: S.totalDriftScore,
        lastBonusLabel: S.driftBonusLabel
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
