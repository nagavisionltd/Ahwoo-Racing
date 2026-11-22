import * as THREE from 'three';
import { canvasTexture, radialTexture } from './textures';
import type { LevelDef, WeatherPhaseDef, WeatherSnapshot } from './types';
import { getWeatherHazardTag } from './weatherHazards';

const STREAK_COUNT = 640;
const MOTE_COUNT = 260;

// Bounding box dimensions (centered on camera) for seamless 3D weather wrapping
const BOX_W = 220;
const BOX_H = 120;
const BOX_D = 240;

const PHASE_DURATION_SEC = 22;

export const LEVEL_WEATHER_PHASES: Record<LevelDef['id'], WeatherPhaseDef[]> = {
  neon: [
    {
      id: 'neon_downpour',
      label: 'NEON DOWNPOUR',
      cn: '霓虹暴雨',
      kind: 'rain',
      intensity: 0.94,
      wind: [-26, -155, 14],
      streakSpeed: 1.15,
      streakLength: 10.5,
      streakOpacity: 0.72,
      moteOpacity: 0.48,
      streakColors: [0x00f0ff, 0xff4fd8, 0xf5c451],
      moteColor: 0x6ceeff,
      fogNearMul: 0.72,
      fogFarMul: 0.68,
      fogTint: 0x10183a,
      fogTintMix: 0.55,
      keyMul: 0.78,
      keyTint: 0x99d6ff,
      keyTintMix: 0.35,
      rimMul: 1.45,
      rimTint: 0x00f0ff,
      rimTintMix: 0.55,
      hemiMul: 0.85,
      bloomAdd: 0.16,
      solarFlareStrength: 0,
      lightningRate: 0.36
    },
    {
      id: 'electric_squall',
      label: 'ELECTRIC SQUALL',
      cn: '电离雷暴',
      kind: 'rain',
      intensity: 0.82,
      wind: [42, -135, -18],
      streakSpeed: 1.05,
      streakLength: 9.2,
      streakOpacity: 0.64,
      moteOpacity: 0.55,
      streakColors: [0x8f7dff, 0x00f0ff, 0xff2e93],
      moteColor: 0xc29eff,
      fogNearMul: 0.82,
      fogFarMul: 0.78,
      fogTint: 0x1d1142,
      fogTintMix: 0.45,
      keyMul: 0.85,
      keyTint: 0xb6c8ff,
      keyTintMix: 0.3,
      rimMul: 1.65,
      rimTint: 0x9d7bff,
      rimTintMix: 0.65,
      hemiMul: 0.92,
      bloomAdd: 0.2,
      solarFlareStrength: 0,
      lightningRate: 0.58
    },
    {
      id: 'cyber_drizzle',
      label: 'CYBER DRIZZLE',
      cn: '微雨霓虹',
      kind: 'rain',
      intensity: 0.42,
      wind: [-10, -95, 6],
      streakSpeed: 0.72,
      streakLength: 5.8,
      streakOpacity: 0.42,
      moteOpacity: 0.3,
      streakColors: [0x00f0ff, 0xf5c451, 0x8fe9ff],
      moteColor: 0x9be8ff,
      fogNearMul: 0.95,
      fogFarMul: 0.92,
      fogTint: 0x1a0f36,
      fogTintMix: 0.18,
      keyMul: 0.98,
      keyTint: 0xffd296,
      keyTintMix: 0.1,
      rimMul: 1.05,
      rimTint: 0x00f0ff,
      rimTintMix: 0.2,
      hemiMul: 1.0,
      bloomAdd: 0.05,
      solarFlareStrength: 0,
      lightningRate: 0.08
    }
  ],
  beach: [
    {
      id: 'tidal_squall',
      label: 'TIDAL ION MIST',
      cn: '潮汐霓雾',
      kind: 'mist',
      intensity: 0.86,
      wind: [38, -22, -26],
      streakSpeed: 0.88,
      streakLength: 7.4,
      streakOpacity: 0.46,
      moteOpacity: 0.72,
      streakColors: [0x59f0d8, 0xff9ecb, 0xffe9a6],
      moteColor: 0x8cf7e4,
      fogNearMul: 0.7,
      fogFarMul: 0.68,
      fogTint: 0xffa6d2,
      fogTintMix: 0.48,
      keyMul: 0.88,
      keyTint: 0xffb8dc,
      keyTintMix: 0.32,
      rimMul: 1.35,
      rimTint: 0x59f0d8,
      rimTintMix: 0.55,
      hemiMul: 1.05,
      bloomAdd: 0.12,
      solarFlareStrength: 0.18,
      lightningRate: 0
    },
    {
      id: 'aurora_dusk',
      label: 'AURORA DUSK',
      cn: '极光暮霭',
      kind: 'mist',
      intensity: 0.62,
      wind: [-22, -8, 18],
      streakSpeed: 0.54,
      streakLength: 5.2,
      streakOpacity: 0.34,
      moteOpacity: 0.68,
      streakColors: [0xffe9a6, 0x59f0d8, 0xff8ad4],
      moteColor: 0xffd685,
      fogNearMul: 0.88,
      fogFarMul: 0.84,
      fogTint: 0xffcaa8,
      fogTintMix: 0.34,
      keyMul: 1.15,
      keyTint: 0xffd6a0,
      keyTintMix: 0.45,
      rimMul: 1.2,
      rimTint: 0x67e8ff,
      rimTintMix: 0.35,
      hemiMul: 1.08,
      bloomAdd: 0.14,
      solarFlareStrength: 0.32,
      lightningRate: 0
    },
    {
      id: 'coastal_breeze',
      label: 'LUMINOUS BREEZE',
      cn: '海风萤雾',
      kind: 'mist',
      intensity: 0.36,
      wind: [14, -4, 12],
      streakSpeed: 0.36,
      streakLength: 3.8,
      streakOpacity: 0.24,
      moteOpacity: 0.52,
      streakColors: [0x8cf7e4, 0xffd9ef, 0xb9ffd2],
      moteColor: 0xb9ffd2,
      fogNearMul: 1.0,
      fogFarMul: 1.0,
      fogTint: 0xffc2dd,
      fogTintMix: 0.12,
      keyMul: 1.0,
      keyTint: 0xffd0a8,
      keyTintMix: 0.1,
      rimMul: 1.0,
      rimTint: 0x67e8ff,
      rimTintMix: 0.15,
      hemiMul: 1.0,
      bloomAdd: 0.04,
      solarFlareStrength: 0.1,
      lightningRate: 0
    }
  ],
  space: [
    {
      id: 'solar_flare',
      label: 'SOLAR FLARE SURGE',
      cn: '太阳耀斑',
      kind: 'solar',
      intensity: 0.96,
      wind: [58, -26, 44],
      streakSpeed: 1.4,
      streakLength: 12.5,
      streakOpacity: 0.78,
      moteOpacity: 0.82,
      streakColors: [0xffc451, 0xff6b3d, 0xfff2b8],
      moteColor: 0xffb347,
      fogNearMul: 0.78,
      fogFarMul: 0.8,
      fogTint: 0x2c1418,
      fogTintMix: 0.62,
      keyMul: 1.65,
      keyTint: 0xffae52,
      keyTintMix: 0.72,
      rimMul: 1.5,
      rimTint: 0xff6b3d,
      rimTintMix: 0.62,
      hemiMul: 1.25,
      bloomAdd: 0.28,
      solarFlareStrength: 1.0,
      lightningRate: 0
    },
    {
      id: 'ion_storm',
      label: 'ION MAGNETO-STORM',
      cn: '磁暴脉冲',
      kind: 'solar',
      intensity: 0.78,
      wind: [-44, 18, 36],
      streakSpeed: 1.15,
      streakLength: 10.0,
      streakOpacity: 0.64,
      moteOpacity: 0.66,
      streakColors: [0x9d7bff, 0x31e8ff, 0xff94f0],
      moteColor: 0x7fe8ff,
      fogNearMul: 0.86,
      fogFarMul: 0.88,
      fogTint: 0x160e38,
      fogTintMix: 0.55,
      keyMul: 1.15,
      keyTint: 0xb99eff,
      keyTintMix: 0.45,
      rimMul: 1.7,
      rimTint: 0x31e8ff,
      rimTintMix: 0.7,
      hemiMul: 1.15,
      bloomAdd: 0.22,
      solarFlareStrength: 0.38,
      lightningRate: 0
    },
    {
      id: 'cosmic_drift',
      label: 'COSMIC DUST DRIFT',
      cn: '星尘微澜',
      kind: 'solar',
      intensity: 0.35,
      wind: [18, -6, 16],
      streakSpeed: 0.55,
      streakLength: 5.5,
      streakOpacity: 0.34,
      moteOpacity: 0.44,
      streakColors: [0x9fb8ff, 0xffd5f4, 0x31e8ff],
      moteColor: 0xc9a8ff,
      fogNearMul: 1.0,
      fogFarMul: 1.0,
      fogTint: 0x050817,
      fogTintMix: 0.15,
      keyMul: 1.0,
      keyTint: 0xfff0d0,
      keyTintMix: 0.1,
      rimMul: 1.0,
      rimTint: 0x9d7bff,
      rimTintMix: 0.2,
      hemiMul: 1.0,
      bloomAdd: 0.04,
      solarFlareStrength: 0.14,
      lightningRate: 0
    }
  ]
};

// Pre-allocated scratch helpers (zero GC inside update loop)
const _baseFogCol = new THREE.Color();
const _tintFogCol = new THREE.Color();
const _baseKeyCol = new THREE.Color();
const _tintKeyCol = new THREE.Color();
const _baseRimCol = new THREE.Color();
const _tintRimCol = new THREE.Color();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _cPick = new THREE.Color();
const _dir = new THREE.Vector3();

export interface WeatherUpdateHooks {
  onPhaseChange?: (phase: WeatherPhaseDef, isManual: boolean) => void;
  onLightning?: (strength: number) => void;
  onSolarSurge?: (strength: number) => void;
}

export class WeatherSystem {
  private group: THREE.Group;
  private def: LevelDef;
  private phases: WeatherPhaseDef[];
  private phaseIdx = 0;
  private phaseElapsed = 0;

  // Particle buffers
  private streakPos = new Float32Array(STREAK_COUNT * 6);
  private streakCol = new Float32Array(STREAK_COUNT * 6);
  private streakOff = new Float32Array(STREAK_COUNT * 3);
  private streakRand = new Float32Array(STREAK_COUNT);
  private streakGeo = new THREE.BufferGeometry();
  private streakMat: THREE.LineBasicMaterial;
  private streaks: THREE.LineSegments;

  private motePos = new Float32Array(MOTE_COUNT * 3);
  private moteCol = new Float32Array(MOTE_COUNT * 3);
  private moteOff = new Float32Array(MOTE_COUNT * 3);
  private motePhase = new Float32Array(MOTE_COUNT);
  private moteGeo = new THREE.BufferGeometry();
  private moteTex: THREE.CanvasTexture;
  private moteMat: THREE.PointsMaterial;
  private motes: THREE.Points;

  // Track-specific atmospheric sky FX
  private skyFxGroup = new THREE.Group();
  private lightningPlanes: THREE.Mesh[] = [];
  private lightningCooldown = 2.4;
  private lightningFlash = 0;

  private solarStarGroup: THREE.Group | null = null;
  private solarCoronaInner: THREE.Mesh | null = null;
  private solarCoronaOuter: THREE.Mesh | null = null;
  private solarFlareRings: { mesh: THREE.Mesh; phase: number }[] = [];
  private solarBurstTimer = 4.5;
  private solarBurst = 0;

  private mistVeilPlanes: { mesh: THREE.Mesh; speed: number; baseY: number; phase: number }[] = [];

  // Smoothly interpolated live parameters
  private curIntensity = 0.8;
  private curWind = new THREE.Vector3();
  private curStreakSpeed = 1.0;
  private curStreakLen = 8.0;
  private curStreakOpacity = 0.6;
  private curMoteOpacity = 0.5;
  private curBloomAdd = 0.1;
  private curSolarStrength = 0;
  private curFogNearMul = 1;
  private curFogFarMul = 1;
  private curFogTintMix = 0;
  private curKeyMul = 1;
  private curKeyTintMix = 0;
  private curRimMul = 1;
  private curRimTintMix = 0;
  private curHemiMul = 1;

  private prevCamPos = new THREE.Vector3();
  private hasCamInit = false;
  private hooks: WeatherUpdateHooks;

  constructor(def: LevelDef, scene: THREE.Scene, hooks: WeatherUpdateHooks = {}) {
    this.def = def;
    this.hooks = hooks;
    this.phases = LEVEL_WEATHER_PHASES[def.id];
    this.group = new THREE.Group();
    this.group.name = `weather-${def.id}`;
    scene.add(this.group);

    // Initialize streaks
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streakOff[i * 3] = (Math.random() - 0.5) * BOX_W;
      this.streakOff[i * 3 + 1] = (Math.random() - 0.5) * BOX_H;
      this.streakOff[i * 3 + 2] = (Math.random() - 0.5) * BOX_D;
      this.streakRand[i] = 0.72 + Math.random() * 0.65;
    }
    this.streakGeo.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    this.streakGeo.setAttribute('color', new THREE.BufferAttribute(this.streakCol, 3));
    this.streakMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    this.streaks = new THREE.LineSegments(this.streakGeo, this.streakMat);
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);

    // Initialize motes
    for (let i = 0; i < MOTE_COUNT; i++) {
      this.moteOff[i * 3] = (Math.random() - 0.5) * BOX_W;
      this.moteOff[i * 3 + 1] = (Math.random() - 0.5) * BOX_H;
      this.moteOff[i * 3 + 2] = (Math.random() - 0.5) * BOX_D;
      this.motePhase[i] = Math.random() * Math.PI * 2;
    }
    this.moteGeo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    this.moteGeo.setAttribute('color', new THREE.BufferAttribute(this.moteCol, 3));
    this.moteTex = radialTexture('rgba(255,255,255,0.95)');
    this.moteMat = new THREE.PointsMaterial({
      map: this.moteTex,
      size: def.id === 'space' ? 3.2 : def.id === 'beach' ? 2.8 : 2.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    this.motes = new THREE.Points(this.moteGeo, this.moteMat);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);

    this.group.add(this.skyFxGroup);
    this.buildSkyPhenomena();
    this.applyPhaseImmediate(this.phases[0]);
  }

  private buildSkyPhenomena(): void {
    if (this.def.id === 'neon') {
      // Distant lightning sheet-flash curtains over the skyline
      const boltTex = canvasTexture(512, 512, (g) => {
        g.clearRect(0, 0, 512, 512);
        const grd = g.createRadialGradient(256, 180, 10, 256, 220, 240);
        grd.addColorStop(0, 'rgba(180, 245, 255, 0.95)');
        grd.addColorStop(0.35, 'rgba(0, 240, 255, 0.42)');
        grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 512, 512);

        // Crisp jagged electric arc inside the flash glow
        g.strokeStyle = 'rgba(240, 252, 255, 0.95)';
        g.shadowColor = '#00f0ff';
        g.shadowBlur = 18;
        g.lineWidth = 4;
        g.beginPath();
        let x = 256;
        let y = 12;
        g.moveTo(x, y);
        for (let step = 0; step < 9; step++) {
          x += (Math.random() - 0.5) * 76;
          y += 48 + Math.random() * 14;
          g.lineTo(x, y);
        }
        g.stroke();
      });

      const positions: [number, number, number, number][] = [
        [-2200, 920, -2800, 0.4],
        [2400, 880, -2500, -0.5],
        [-2000, 960, 2400, 2.5],
        [2200, 900, 2200, -2.4]
      ];
      for (const [x, y, z, ry] of positions) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(1600, 1400),
          new THREE.MeshBasicMaterial({
            map: boltTex,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide,
            toneMapped: false
          })
        );
        m.position.set(x, y, z);
        m.rotation.y = ry;
        this.skyFxGroup.add(m);
        this.lightningPlanes.push(m);
      }
    } else if (this.def.id === 'beach') {
      // Drifting bioluminescent coastal mist veils near horizon
      const mistTex = radialTexture('rgba(165, 255, 232, 0.38)');
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const rad = 1800 + (i % 3) * 650;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1600, 520),
          new THREE.MeshBasicMaterial({
            map: mistTex,
            color: i % 2 === 0 ? 0x8cf7e4 : 0xffb3da,
            transparent: true,
            opacity: 0.22,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
            side: THREE.DoubleSide,
            toneMapped: false
          })
        );
        const baseY = -120 + (i % 3) * 90;
        mesh.position.set(Math.cos(ang) * rad, baseY, Math.sin(ang) * rad);
        mesh.lookAt(0, baseY, 0);
        this.skyFxGroup.add(mesh);
        this.mistVeilPlanes.push({ mesh, speed: 0.04 + (i % 3) * 0.015, baseY, phase: i * 1.1 });
      }
    } else {
      // Event Horizon: Erupting 3D Solar Flare Star + Volumetric Corona + CME Rings
      const solarGroup = new THREE.Group();
      solarGroup.position.set(2700, 1550, -3400);
      solarGroup.lookAt(0, 0, 0);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(260, 32, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff3d1, fog: false, toneMapped: false })
      );
      solarGroup.add(core);

      const innerCoronaTex = radialTexture('rgba(255, 196, 84, 0.92)');
      const outerCoronaTex = radialTexture('rgba(255, 92, 48, 0.65)');

      const innerHalo = new THREE.Mesh(
        new THREE.PlaneGeometry(1800, 1800),
        new THREE.MeshBasicMaterial({
          map: innerCoronaTex,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          toneMapped: false
        })
      );
      const outerHalo = new THREE.Mesh(
        new THREE.PlaneGeometry(3600, 3600),
        new THREE.MeshBasicMaterial({
          map: outerCoronaTex,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          toneMapped: false
        })
      );
      solarGroup.add(innerHalo, outerHalo);
      this.solarCoronaInner = innerHalo;
      this.solarCoronaOuter = outerHalo;

      // Expanding plasma prominence / CME shockwave rings
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(320 + i * 110, 12 + i * 4, 12, 72),
          new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? 0xffb347 : 0xff5e3a,
            transparent: true,
            opacity: 0.45,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
            toneMapped: false
          })
        );
        ring.rotation.set(0.5 * i, 0.7 * i, 0);
        solarGroup.add(ring);
        this.solarFlareRings.push({ mesh: ring, phase: i * 0.33 });
      }

      this.skyFxGroup.add(solarGroup);
      this.solarStarGroup = solarGroup;
    }
  }

  private applyPhaseImmediate(phase: WeatherPhaseDef): void {
    this.curIntensity = phase.intensity;
    this.curWind.set(...phase.wind);
    this.curStreakSpeed = phase.streakSpeed;
    this.curStreakLen = phase.streakLength;
    this.curStreakOpacity = phase.streakOpacity;
    this.curMoteOpacity = phase.moteOpacity;
    this.curBloomAdd = phase.bloomAdd;
    this.curSolarStrength = phase.solarFlareStrength;
    this.curFogNearMul = phase.fogNearMul;
    this.curFogFarMul = phase.fogFarMul;
    this.curFogTintMix = phase.fogTintMix;
    this.curKeyMul = phase.keyMul;
    this.curKeyTintMix = phase.keyTintMix;
    this.curRimMul = phase.rimMul;
    this.curRimTintMix = phase.rimTintMix;
    this.curHemiMul = phase.hemiMul;
    this.recolorParticles(phase);
  }

  private recolorParticles(phase: WeatherPhaseDef): void {
    _c0.setHex(phase.streakColors[0]);
    _c1.setHex(phase.streakColors[1]);
    _c2.setHex(phase.streakColors[2]);
    for (let i = 0; i < STREAK_COUNT; i++) {
      const m = i % 3;
      _cPick.copy(m === 0 ? _c0 : m === 1 ? _c1 : _c2);
      const bright = 0.75 + (i % 5) * 0.1;
      const b = i * 6;
      this.streakCol[b] = _cPick.r * bright;
      this.streakCol[b + 1] = _cPick.g * bright;
      this.streakCol[b + 2] = _cPick.b * bright;
      this.streakCol[b + 3] = _cPick.r * bright * 0.35;
      this.streakCol[b + 4] = _cPick.g * bright * 0.35;
      this.streakCol[b + 5] = _cPick.b * bright * 0.35;
    }
    this.streakGeo.attributes.color.needsUpdate = true;

    _c0.setHex(phase.moteColor);
    for (let i = 0; i < MOTE_COUNT; i++) {
      const bright = 0.7 + ((i * 7) % 10) * 0.05;
      this.moteCol[i * 3] = _c0.r * bright;
      this.moteCol[i * 3 + 1] = _c0.g * bright;
      this.moteCol[i * 3 + 2] = _c0.b * bright;
    }
    this.moteGeo.attributes.color.needsUpdate = true;
  }

  public getCurrentPhase(): WeatherPhaseDef {
    return this.phases[this.phaseIdx];
  }

  public getSnapshot(): WeatherSnapshot {
    const p = this.phases[this.phaseIdx];
    return {
      phaseId: p.id,
      label: p.label,
      cn: p.cn,
      kind: p.kind,
      intensity: this.curIntensity,
      lightningFlash: this.lightningFlash,
      solarPulse: Math.max(this.curSolarStrength, this.solarBurst),
      hazardTag: getWeatherHazardTag(p.id)
    };
  }

  public getBloomAdd(): number {
    return this.curBloomAdd + this.lightningFlash * 0.18 + this.solarBurst * 0.22;
  }

  public getSolarFlareUniform(): number {
    return Math.min(1.2, this.curSolarStrength * 0.55 + this.solarBurst * 0.65);
  }

  public getLightningFlash(): number {
    return this.lightningFlash;
  }

  public cyclePhase(manual = true): WeatherPhaseDef {
    this.phaseIdx = (this.phaseIdx + 1) % this.phases.length;
    this.phaseElapsed = 0;
    const next = this.phases[this.phaseIdx];
    this.recolorParticles(next);
    if (next.kind === 'solar' && next.solarFlareStrength > 0.7) {
      this.solarBurst = 1.0;
      this.hooks.onSolarSurge?.(1.0);
    } else if (next.kind === 'rain' && next.lightningRate > 0.3) {
      this.triggerLightning(0.85);
    }
    this.hooks.onPhaseChange?.(next, manual);
    return next;
  }

  public resetCycle(): void {
    this.phaseIdx = 0;
    this.phaseElapsed = 0;
    const p = this.phases[0];
    this.applyPhaseImmediate(p);
  }

  private triggerLightning(strength = 1.0): void {
    this.lightningFlash = Math.max(this.lightningFlash, strength);
    for (const m of this.lightningPlanes) {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = (0.35 + Math.random() * 0.55) * strength;
    }
    this.hooks.onLightning?.(strength);
  }

  public update(
    dt: number,
    now: number,
    cam: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    lights: {
      hemi: THREE.HemisphereLight;
      keyLight: THREE.DirectionalLight;
      rimLight: THREE.DirectionalLight;
    },
    autoAdvance: boolean
  ): void {
    if (autoAdvance) {
      this.phaseElapsed += dt;
      if (this.phaseElapsed >= PHASE_DURATION_SEC) {
        this.cyclePhase(false);
      }
    }

    const phase = this.phases[this.phaseIdx];
    const k = 1 - Math.exp(-dt * 1.4);

    this.curIntensity += (phase.intensity - this.curIntensity) * k;
    this.curWind.x += (phase.wind[0] - this.curWind.x) * k;
    this.curWind.y += (phase.wind[1] - this.curWind.y) * k;
    this.curWind.z += (phase.wind[2] - this.curWind.z) * k;
    this.curStreakSpeed += (phase.streakSpeed - this.curStreakSpeed) * k;
    this.curStreakLen += (phase.streakLength - this.curStreakLen) * k;
    this.curStreakOpacity += (phase.streakOpacity - this.curStreakOpacity) * k;
    this.curMoteOpacity += (phase.moteOpacity - this.curMoteOpacity) * k;
    this.curBloomAdd += (phase.bloomAdd - this.curBloomAdd) * k;
    this.curSolarStrength += (phase.solarFlareStrength - this.curSolarStrength) * k;
    this.curFogNearMul += (phase.fogNearMul - this.curFogNearMul) * k;
    this.curFogFarMul += (phase.fogFarMul - this.curFogFarMul) * k;
    this.curFogTintMix += (phase.fogTintMix - this.curFogTintMix) * k;
    this.curKeyMul += (phase.keyMul - this.curKeyMul) * k;
    this.curKeyTintMix += (phase.keyTintMix - this.curKeyTintMix) * k;
    this.curRimMul += (phase.rimMul - this.curRimMul) * k;
    this.curRimTintMix += (phase.rimTintMix - this.curRimTintMix) * k;
    this.curHemiMul += (phase.hemiMul - this.curHemiMul) * k;

    // Lightning simulation (Neon Sprawl)
    if (phase.lightningRate > 0) {
      this.lightningCooldown -= dt * (0.6 + phase.lightningRate);
      if (this.lightningCooldown <= 0) {
        this.triggerLightning(0.65 + Math.random() * 0.45);
        this.lightningCooldown = 2.4 + Math.random() * 5.2;
      }
    }
    if (this.lightningFlash > 0.001) {
      this.lightningFlash *= Math.exp(-dt * 7.5);
      for (const m of this.lightningPlanes) {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity *= Math.exp(-dt * 8.0);
      }
    } else {
      this.lightningFlash = 0;
    }

    // Solar flare CME burst simulation (Event Horizon)
    if (this.def.id === 'space') {
      if (phase.solarFlareStrength > 0.5) {
        this.solarBurstTimer -= dt;
        if (this.solarBurstTimer <= 0) {
          this.solarBurst = 1.0;
          this.solarBurstTimer = 5.5 + Math.random() * 4.5;
          this.hooks.onSolarSurge?.(0.95);
        }
      }
      this.solarBurst *= Math.exp(-dt * 1.15);

      if (this.solarStarGroup && this.solarCoronaInner && this.solarCoronaOuter) {
        const pulse = 0.85 + 0.15 * Math.sin(now * 0.0032);
        const flareScale = 0.72 + this.curSolarStrength * 0.68 + this.solarBurst * 0.55;
        this.solarStarGroup.scale.setScalar(flareScale);
        (this.solarCoronaInner.material as THREE.MeshBasicMaterial).opacity = Math.min(
          1,
          (0.35 + this.curSolarStrength * 0.65 + this.solarBurst * 0.4) * pulse
        );
        (this.solarCoronaOuter.material as THREE.MeshBasicMaterial).opacity = Math.min(
          0.95,
          (0.2 + this.curSolarStrength * 0.52 + this.solarBurst * 0.45) * pulse
        );
        this.solarCoronaInner.rotation.z += dt * 0.14;
        this.solarCoronaOuter.rotation.z -= dt * 0.08;

        for (const r of this.solarFlareRings) {
          r.phase = (r.phase + dt * (0.22 + this.curSolarStrength * 0.35)) % 1;
          const sc = 0.85 + r.phase * 2.2;
          r.mesh.scale.setScalar(sc);
          r.mesh.rotation.z += dt * 0.45;
          const rMat = r.mesh.material as THREE.MeshBasicMaterial;
          rMat.opacity = (1 - r.phase) * (0.18 + this.curSolarStrength * 0.5 + this.solarBurst * 0.35);
        }
      }
    }

    // Coastal mist veils (Vesper Shore)
    if (this.def.id === 'beach') {
      const t = now * 0.001;
      for (const v of this.mistVeilPlanes) {
        v.mesh.position.y = v.baseY + Math.sin(t * 0.7 + v.phase) * 28;
        const mat = v.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.1 + this.curIntensity * 0.24;
      }
    }

    // Dynamic Fog & Lighting modulation
    const look = this.def.look;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = look.fogNear * this.curFogNearMul;
      scene.fog.far = look.fogFar * this.curFogFarMul;
      _baseFogCol.setHex(look.fog);
      _tintFogCol.setHex(phase.fogTint);
      _baseFogCol.lerp(_tintFogCol, this.curFogTintMix);
      if (this.lightningFlash > 0.05) {
        _cPick.setHex(0x64b8ff);
        _baseFogCol.lerp(_cPick, this.lightningFlash * 0.38);
      }
      scene.fog.color.copy(_baseFogCol);
    }

    _baseKeyCol.setHex(look.sun);
    _tintKeyCol.setHex(phase.keyTint);
    _baseKeyCol.lerp(_tintKeyCol, this.curKeyTintMix);
    lights.keyLight.color.copy(_baseKeyCol);
    lights.keyLight.intensity =
      look.sunI * this.curKeyMul + this.solarBurst * 1.15 + this.lightningFlash * 0.9;

    _baseRimCol.setHex(look.rim);
    _tintRimCol.setHex(phase.rimTint);
    _baseRimCol.lerp(_tintRimCol, this.curRimTintMix);
    lights.rimLight.color.copy(_baseRimCol);
    lights.rimLight.intensity =
      look.rimI * this.curRimMul + this.lightningFlash * 2.6 + this.solarBurst * 0.75;

    lights.hemi.intensity = look.hemiI * this.curHemiMul + this.lightningFlash * 0.85;

    // Camera-delta parallax wrapping for weather particles
    if (!this.hasCamInit) {
      this.prevCamPos.copy(cam.position);
      this.hasCamInit = true;
    }
    const camDx = cam.position.x - this.prevCamPos.x;
    const camDy = cam.position.y - this.prevCamPos.y;
    const camDz = cam.position.z - this.prevCamPos.z;
    this.prevCamPos.copy(cam.position);

    const cx = cam.position.x;
    const cy = cam.position.y;
    const cz = cam.position.z;
    const halfW = BOX_W * 0.5;
    const halfH = BOX_H * 0.5;
    const halfD = BOX_D * 0.5;

    const wx = this.curWind.x * this.curStreakSpeed;
    const wy = this.curWind.y * this.curStreakSpeed;
    const wz = this.curWind.z * this.curStreakSpeed;

    // Direction vector for streak elongation (wind + slight camera velocity feel)
    _dir.set(wx - camDx / Math.max(dt, 0.005) * 0.18, wy - camDy / Math.max(dt, 0.005) * 0.18, wz - camDz / Math.max(dt, 0.005) * 0.18);
    if (_dir.lengthSq() < 0.01) _dir.set(0, -1, 0);
    _dir.normalize();

    this.streakMat.opacity = Math.min(0.95, this.curStreakOpacity + this.lightningFlash * 0.2 + this.solarBurst * 0.18);
    this.moteMat.opacity = Math.min(0.95, this.curMoteOpacity + this.solarBurst * 0.22);

    const activeStreaks = Math.max(80, Math.floor(STREAK_COUNT * (0.25 + 0.75 * this.curIntensity)));
    for (let i = 0; i < STREAK_COUNT; i++) {
      if (i >= activeStreaks) {
        const b = i * 6;
        this.streakPos[b + 1] = -9999;
        this.streakPos[b + 4] = -9999;
        continue;
      }
      const sp = this.streakRand[i];
      let ox = this.streakOff[i * 3] + wx * sp * dt - camDx;
      let oy = this.streakOff[i * 3 + 1] + wy * sp * dt - camDy;
      let oz = this.streakOff[i * 3 + 2] + wz * sp * dt - camDz;

      if (ox < -halfW) ox += BOX_W;
      else if (ox > halfW) ox -= BOX_W;
      if (oy < -halfH) oy += BOX_H;
      else if (oy > halfH) oy -= BOX_H;
      if (oz < -halfD) oz += BOX_D;
      else if (oz > halfD) oz -= BOX_D;

      this.streakOff[i * 3] = ox;
      this.streakOff[i * 3 + 1] = oy;
      this.streakOff[i * 3 + 2] = oz;

      const px = cx + ox;
      const py = cy + oy;
      const pz = cz + oz;
      const len = this.curStreakLen * sp;
      const b = i * 6;
      this.streakPos[b] = px;
      this.streakPos[b + 1] = py;
      this.streakPos[b + 2] = pz;
      this.streakPos[b + 3] = px - _dir.x * len;
      this.streakPos[b + 4] = py - _dir.y * len;
      this.streakPos[b + 5] = pz - _dir.z * len;
    }
    this.streakGeo.attributes.position.needsUpdate = true;

    // Update atmospheric motes / embers / spores
    const t = now * 0.0015;
    const activeMotes = Math.max(40, Math.floor(MOTE_COUNT * (0.25 + 0.75 * this.curIntensity)));
    for (let i = 0; i < MOTE_COUNT; i++) {
      if (i >= activeMotes) {
        this.motePos[i * 3 + 1] = -9999;
        continue;
      }
      const ph = this.motePhase[i];
      let ox = this.moteOff[i * 3] + (wx * 0.22 + Math.sin(t + ph) * 8) * dt - camDx;
      let oy = this.moteOff[i * 3 + 1] + (wy * 0.16 + Math.cos(t * 1.2 + ph) * 6) * dt - camDy;
      let oz = this.moteOff[i * 3 + 2] + (wz * 0.22 + Math.sin(t * 0.8 + ph) * 8) * dt - camDz;

      if (ox < -halfW) ox += BOX_W;
      else if (ox > halfW) ox -= BOX_W;
      if (oy < -halfH) oy += BOX_H;
      else if (oy > halfH) oy -= BOX_H;
      if (oz < -halfD) oz += BOX_D;
      else if (oz > halfD) oz -= BOX_D;

      this.moteOff[i * 3] = ox;
      this.moteOff[i * 3 + 1] = oy;
      this.moteOff[i * 3 + 2] = oz;

      this.motePos[i * 3] = cx + ox;
      this.motePos[i * 3 + 1] = cy + oy;
      this.motePos[i * 3 + 2] = cz + oz;
    }
    this.moteGeo.attributes.position.needsUpdate = true;
  }

  public dispose(scene: THREE.Scene): void {
    this.streakGeo.dispose();
    this.streakMat.dispose();
    this.moteGeo.dispose();
    this.moteMat.dispose();
    this.moteTex.dispose();
    this.skyFxGroup.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) {
        const rec = m as unknown as Record<string, unknown>;
        for (const k of Object.keys(rec)) {
          const v = rec[k] as { isTexture?: boolean; dispose?: () => void } | null;
          if (v && v.isTexture && v.dispose) v.dispose();
        }
        m.dispose();
      }
    });
    scene.remove(this.group);
  }
}
