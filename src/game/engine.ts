import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SoundEngine } from './audio';
import { generateRivalIdentities, getPlayerIdentity } from './rivals';
import { setTextureMaxAnisotropy } from './textures';
import { LEVELS } from './tracks';
import type { GameStep, HazardAlert, HudSnapshot, StandingEntry } from './types';
import { buildLuxuryHoverCar, frameChassis, SHIP_PROFILES, type BuiltVehicle } from './vehicles';
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
}

export interface EngineCallbacks {
  onStepChange: (step: GameStep) => void;
  onHudUpdate: (hud: HudSnapshot) => void;
  onShipChange: (shipId: number) => void;
  onLevelChange: (levelIdx: number, previewIdx: number) => void;
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
  alertKind: 'debris'
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
    gates: 0
  };

  private firstFrame = true;
  private screenShake = 0;
  private aberrationPulse = 0;
  private camDip = 0;
  private camBack = 10.2;
  private camUpD = 2.6;
  private camBoost = 0;
  private hitstopTimer = 0;
  private reconU = 0;
  private reconSecondsLeft = 6;
  private reconInterval: number | null = null;
  private countdownText = '3';
  private countdownTimers: number[] = [];
  private splitText = '';
  private splitTimer: number | null = null;
  private hazardAlert: HazardAlert = { active: false, label: '', kind: 'debris' };
  private debrisAlertTimer = 0;

  private heldKeys: Record<string, boolean> = {};
  private frameId = 0;
  private lastTickMs = 0;
  private lastHudEmitMs = 0;
  private disposed = false;

  public readonly audio = new SoundEngine();

  // Turntable preview renderer
  private pvCanvas: HTMLCanvasElement | null = null;
  private pvRenderer: THREE.WebGLRenderer | null = null;
  private pvScene: THREE.Scene | null = null;
  private pvCam: THREE.PerspectiveCamera | null = null;
  private pvRoot: THREE.Group | null = null;
  private pvPlatform: THREE.Group | null = null;
  private pvRing: THREE.Mesh | null = null;
  private pvDragYaw = -0.55;
  private pvIsDragging = false;
  private pvLastX = 0;
  private pvEnvTexture: THREE.Texture | null = null;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
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
    this.cam = new THREE.PerspectiveCamera(64, w / h, 0.4, 14000);

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

    // Initial world & vehicles
    this.loadLevel(0);
    this.rebuildPlayer();
    this.setupRivals(this.selectedShipId);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.cam);
    }

    this.bindEvents();
    this.emitHud(true);
    this.lastTickMs = performance.now();
    this.tick();
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
      this.showSplit(muted ? 'AUDIO MUTED' : 'AUDIO ACTIVE');
      this.emitHud(true);
    }

    if (e.code === 'KeyV' && (this.step === 'race' || this.step === 'preview' || this.step === 'level')) {
      this.cycleWeather();
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

  private rebuildPlayer(): void {
    if (this.player) this.scene.remove(this.player.g);
    const prof = SHIP_PROFILES[this.selectedShipId];
    this.player = buildLuxuryHoverCar(this.selectedShipId, prof.color, 1.05);
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
        baseSpeed: [0.82, 0.88, 0.94][i]
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
      gates: 0
    });
    this.rivals.forEach((r, i) => {
      r.u = (i + 1) * 0.022;
      r.lap = 1;
    });
    this.firstFrame = true;
    this.setStep('race');
    this.showSplit(`LAP 1 / ${TOTAL_LAPS}`);
  }

  public pauseRace(): void {
    if (this.step !== 'race') return;
    this.S.run = false;
    this.heldKeys = {};
    this.audio.updateEngine(0, false, false);
    this.audio.updateWeatherAmbience('rain', 0, false);
    this.audio.updateHazardDrain(false);
    this.setStep('paused');
  }

  public resumeRace(): void {
    if (this.step !== 'paused') return;
    this.S.run = true;
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
      gates: 0
    });
    this.rivals.forEach((r, i) => {
      r.u = (i + 1) * 0.022;
      r.lap = 1;
    });
    if (this.world) {
      this.world.trk.obstacles.forEach((o) => {
        o.cool = 0;
      });
    }
    this.weather?.resetCycle();
    this.weatherHazards?.resetCooldowns();
    this.hazardAlert = { active: false, label: '', kind: 'debris' };
    this.debrisAlertTimer = 0;
    this.firstFrame = true;
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
    const prof = SHIP_PROFILES[this.selectedShipId];
    const built = buildLuxuryHoverCar(this.selectedShipId, prof.color, 1.0);
    frameChassis(built.g, 3.6);
    this.pvRoot.add(built.g);
    if (this.pvRing) {
      (this.pvRing.material as THREE.MeshBasicMaterial).color.setHex(prof.color);
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
      const steer = (right ? 1 : 0) - (left ? 1 : 0);

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
      const desiredVx = S.steer * (92 + boostFrac * 36) * (0.48 + 0.52 * speedFrac);
      const latAccel = (175 + boostFrac * 240) * grip;
      const dVx = desiredVx - S.vx;
      S.vx += Math.max(-latAccel * dt, Math.min(latAccel * dt, dVx));
      S.x += S.vx * dt;

      const liveWidth = trk.hw * trk.widthAt(S.u);
      S.v *= 1 - Math.min(0.35, Math.abs(S.vx) / liveWidth) * 0.14 * dt;
      S.hitSpin *= Math.max(0, 1 - dt * 2.4);

      const limit = trk.hw * trk.widthAt(S.u) - 4.2;
      if (Math.abs(S.x) > limit) {
        S.x = Math.sign(S.x) * limit;
        S.vx *= -0.3;
        S.v *= 0.965;
        S.e -= 0.004;
        this.spawnSparks(ship.position, 10);
        this.screenShake = Math.max(this.screenShake, 0.22);
      }

      S.prev = S.u;
      const probeDu = 0.0006;
      const probeF0 = trk.fr(S.u);
      const probeF1 = trk.fr(S.u + probeDu);
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

      const sec = Math.floor((((S.u % 1) + 1) % 1) * 4);
      if (sec !== S.sector) {
        S.sector = sec;
        const split = S.t - S.lastSplit;
        S.lastSplit = S.t;
        if (S.t > 1) this.showSplit(`SECTOR ${sec + 1} · ${split.toFixed(2)}s`);
      }

      if (S.u >= 1) {
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
            S.run = false;
            S.done = true;
            this.audio.playLap(true);
            this.audio.updateEngine(0, false, false);
            this.setStep('results');
          } else {
            this.audio.playLap(false);
            this.showSplit(`LAP ${S.lap} / ${TOTAL_LAPS}`);
          }
        }
      }
      S.e = Math.max(0, Math.min(1, S.e));
    }

    // Update vehicle transform
    const u = ((S.u % 1) + 1) % 1;
    const F = trk.fr(u);
    const hoverBob = S.run ? Math.sin(now * 0.008) * 0.1 : Math.sin(now * 0.003) * 0.3;
    ship.position
      .copy(F.pos)
      .addScaledVector(F.s, S.x)
      .addScaledVector(F.up, 1.35 + S.airY + hoverBob);

    _vecNegS.copy(F.s).negate();
    _mat4.makeBasis(_vecNegS, F.up, F.t);
    ship.quaternion.setFromRotationMatrix(_mat4);

    const uAhead = (u + 0.002) % 1;
    const upcomingH = trk.fr(uAhead).h + trk.elev.arc(uAhead);
    const pitch = Math.atan((upcomingH - F.h - trk.elev.arc(u)) / (0.002 * trk.len));
    ship.rotateX(-pitch);
    ship.rotateY(-S.vx * 0.0007);
    ship.rotateZ(S.steer * 0.035 + S.vx * 0.0016 + S.hitSpin);

    const racing = this.step === 'race' || this.step === 'countdown' || this.step === 'paused';
    const isBoosting = ((this.heldKeys.Space || this.heldKeys.KeyC) && S.e > 0.02 && S.run) || S.boost > 0;

    this.audio.updateEngine(Math.min(1.5, S.v / MAXV), isBoosting, this.step === 'race' && S.run);

    if (!racing) {
      const sweep = this.step === 'preview' ? 0.032 : this.step === 'level' ? 0.018 : 0.007;
      const aerialH = this.step === 'preview' ? 540 : this.step === 'level' ? 460 : 400;
      const aerialFov = this.step === 'preview' ? 78 : this.step === 'level' ? 74 : 68;
      this.reconU = (this.reconU + dt * sweep) % 1;
      const rf = trk.fr(this.reconU);
      const ahead = trk.fr((this.reconU + 0.045) % 1);
      this.cam.position
        .copy(rf.pos)
        .addScaledVector(rf.up, aerialH)
        .addScaledVector(rf.t, -230);
      this.cam.up.set(0, 1, 0);
      _vecA.copy(ahead.pos).addScaledVector(ahead.up, 40);
      this.cam.lookAt(_vecA);
      this.cam.fov += (aerialFov - this.cam.fov) * Math.min(1, dt * 4);
      this.cam.updateProjectionMatrix();
      this.screenShake = 0;
    } else {
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
      const stuntRate = (inLoop ? 18 : 0) + (inRoll ? 16 : 0);

      // Zoomed-in hero chase framing so the luxury hovercar stays large, detailed, and centered
      const targetBack = 9.4 + spd * 1.9 + this.camBoost * 2.2 + (S.air ? 1.5 : 0) - (inLoop ? 0.7 : 0);
      const targetUp = 2.45 + spd * 0.25 + this.camBoost * 0.24 + (S.air ? 0.3 : 0);
      this.camBack += (targetBack - this.camBack) * (1 - Math.exp(-dt * 4.5));
      this.camUpD += (targetUp - this.camUpD) * (1 - Math.exp(-dt * 4.5));

      _camT.lerp(F.t, 1 - Math.exp(-dt * (16 + speed01 * 8 + stuntRate))).normalize();
      _camUp.lerp(F.up, 1 - Math.exp(-dt * (12 + speed01 * 6 + stuntRate))).normalize();
      _camUp.addScaledVector(_camT, -_camUp.dot(_camT)).normalize();
      _camS.crossVectors(_camT, _camUp).normalize();

      // Anchor directly to ship.position so the vehicle can NEVER outrun the camera on boost, jumps, or loops
      _camP
        .copy(ship.position)
        .addScaledVector(_camT, -this.camBack)
        .addScaledVector(_camUp, this.camUpD + (inRoll ? corkK * 2.2 : 0))
        .addScaledVector(_camS, -S.vx * 0.012);

      if (this.firstFrame) {
        _camLook.copy(ship.position).addScaledVector(_camT, 18);
        this.firstFrame = false;
      }
      this.cam.position.copy(_camP);

      this.camDip *= Math.max(0, 1 - dt * 4.2);
      if (Math.abs(this.camDip) > 0.01) this.cam.position.addScaledVector(_camUp, this.camDip * 0.42);

      if (this.screenShake > 0.001) {
        const sh = (this.screenShake * 1.4) / (1 + spd * 0.7);
        this.cam.position.x += (Math.random() - 0.5) * sh;
        this.cam.position.y += (Math.random() - 0.5) * sh;
        this.cam.position.z += (Math.random() - 0.5) * sh;
        this.screenShake *= Math.exp(-dt * 5.0);
      }

      const aheadDist = 18 + spd * 10 + this.camBoost * 6;
      const aheadRoad = trk.fr(u + aheadDist / trk.len);
      _vecB.copy(ship.position).addScaledVector(_camT, aheadDist).addScaledVector(_camUp, 1.05);
      _vecC
        .copy(aheadRoad.pos)
        .addScaledVector(aheadRoad.up, 2.2 + (S.air ? S.airY * 0.65 : 0))
        .addScaledVector(aheadRoad.s, S.x * 0.45);
      _vecB.lerp(_vecC, inLoop || inRoll ? 0.34 : 0.46);

      _camLook.lerp(_vecB, 1 - Math.exp(-dt * (22 + speed01 * 10 + stuntRate)));
      this.cam.up.copy(_camUp);
      _camBasis.lookAt(this.cam.position, _camLook, _camUp);
      _camDesiredQ.setFromRotationMatrix(_camBasis);
      this.cam.quaternion.slerp(_camDesiredQ, 1 - Math.exp(-dt * (22 + speed01 * 12 + stuntRate)));

      const targetFov = 62 + speed01 * 4 + spd * 2.5 + this.camBoost * 6.5 + (inRoll ? corkK * 5 : 0);
      this.cam.fov += (targetFov - this.cam.fov) * (1 - Math.exp(-dt * 3.8));
      this.cam.updateProjectionMatrix();
    }

    // Engine pulse
    const flamePulse = 1 + Math.sin(now * 0.045) * 0.16 + (isBoosting ? 1.8 : 0);
    this.player.engine.scale.set(flamePulse, flamePulse, 1.0 + (S.v / MAXV) * 1.4 + (isBoosting ? 2.2 : 0));
    this.player.light.intensity = 1.4 + (S.v / MAXV) * 1.8 + (isBoosting ? 5 : 0);

    if (S.run && S.v > 20) {
      _vecA.copy(ship.position).addScaledVector(F.s, -0.9).addScaledVector(F.t, -2.8);
      _vecB.copy(ship.position).addScaledVector(F.s, 0.9).addScaledVector(F.t, -2.8);
      this.spawnTrailParticle(_vecA);
      this.spawnTrailParticle(_vecB);
      if (isBoosting && Math.random() < 0.35) this.spawnSparks(ship.position, 6);
    }

    // Rivals
    for (const rv of this.rivals) {
      const speed = MAXV * rv.baseSpeed * (S.run ? 1 : this.step === 'paused' ? 0 : 0.15);
      rv.u += (speed * dt) / trk.len;
      if (rv.u >= 1) {
        rv.u -= 1;
        rv.lap++;
      }
      const rf = trk.fr(rv.u);
      const rArc = trk.elev.arc(rv.u);
      rv.g.position.copy(rf.pos).addScaledVector(rf.s, rv.off).addScaledVector(rf.up, 1.35 + rArc);
      _vecNegS.copy(rf.s).negate();
      _mat4.makeBasis(_vecNegS, rf.up, rf.t);
      rv.g.quaternion.setFromRotationMatrix(_mat4);
      const rAhead = (rv.u + 0.002) % 1;
      const rPitch = Math.atan((trk.fr(rAhead).h + trk.elev.arc(rAhead) - rf.h - rArc) / (0.002 * trk.len));
      rv.g.rotateX(-rPitch);
      rv.engine.scale.set(1, 1, 1.15 + Math.sin(now * 0.02 + rv.off) * 0.2);

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

      // Update weather-triggered interactive hazards (floating debris, energy-draining fog, ion surges)
      if (this.weatherHazards) {
        this.weatherHazards.update(
          dt,
          now,
          this.weather.getCurrentPhase(),
          ship.position,
          S.x,
          S.run,
          _hazardResult
        );

        if (this.debrisAlertTimer > 0) this.debrisAlertTimer = Math.max(0, this.debrisAlertTimer - dt);

        if (S.run) {
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
        this.bloomPass.strength = defLook.bloom + this.weather.getBloomAdd();
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

    const playerProfile = SHIP_PROFILES[this.selectedShipId] || SHIP_PROFILES[0];
    const playerIdent = getPlayerIdentity(this.selectedShipId);
    const playerProgress = S.lap - 1 + S.u;

    const unsorted: StandingEntry[] = [
      {
        id: playerProfile.id,
        racerId: playerIdent.racerId,
        teamName: playerIdent.teamName,
        shipName: playerProfile.name,
        colorHex: playerProfile.hex,
        isPlayer: true,
        rank: 1,
        lap: Math.min(S.lap, TOTAL_LAPS),
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
          lap: Math.min(rv.lap, TOTAL_LAPS),
          progress: rv.lap - 1 + rv.u
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
      lap: Math.min(S.lap, TOTAL_LAPS),
      totalLaps: TOTAL_LAPS,
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
    this.audio.dispose();
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
