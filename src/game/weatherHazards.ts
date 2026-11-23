import * as THREE from 'three';
import { radialTexture } from './textures';
import type { LevelDef, TrackData, WeatherHazardKind, WeatherPhaseDef } from './types';

export interface WeatherHazardSlot {
  id: number;
  kind: WeatherHazardKind;
  triggerPhases: string[];
  u: number;
  baseOff: number;
  curOff: number;
  driftAmp: number;
  driftSpeed: number;
  phase: number;
  radius: number;
  cool: number;
  activation: number;
  group: THREE.Group;
  bodyGroup: THREE.Group;
  ringMesh: THREE.Mesh;
  extraMeshes: THREE.Mesh[];
  worldPos: THREE.Vector3;
  trackUp: THREE.Vector3;
}

export interface HazardInteractionResult {
  debrisHit: boolean;
  debrisHitPos: THREE.Vector3;
  debrisPushDir: number;
  inFogZone: boolean;
  inSurgeZone: boolean;
  energyDrainRate: number;
  speedDragRate: number;
  lateralJolt: number;
  alertLabel: string;
  alertKind: WeatherHazardKind;
  proximityIntensity: number;
  proximityKind: WeatherHazardKind;
  proximitySide: number;
  proximityDistM: number;
}

// Pre-allocated scratch helpers (zero GC inside update loop)
const _m4 = new THREE.Matrix4();
const _negS = new THREE.Vector3();
const _hitPos = new THREE.Vector3();
const _toHazard = new THREE.Vector3();

const TRIGGER_HAZARD_TAG: Record<string, string> = {
  neon_downpour: 'HAZARD: FLOATING DEBRIS',
  electric_squall: 'HAZARDS: DEBRIS + ION SURGE',
  cyber_drizzle: 'HAZARDS CLEAR',
  tidal_squall: 'HAZARDS: REEF DEBRIS + DRAIN MIST',
  aurora_dusk: 'HAZARD: TIDAL MIST ZONES',
  coastal_breeze: 'HAZARDS CLEAR',
  solar_flare: 'HAZARDS: ORBITAL DEBRIS + FOG',
  ion_storm: 'HAZARD: ENERGY-DRAIN FOG',
  cosmic_drift: 'HAZARDS CLEAR',
  bioluminescent_tide: 'HAZARD: BIOLUMINESCENT MIST',
  cosmic_monsoon: 'HAZARDS: CORAL DEBRIS + MIST',
  starlight_breeze: 'HAZARDS CLEAR',
  vortex_squall: 'HAZARDS: DEBRIS + ION SURGE',
  abyssal_mist: 'HAZARD: ABYSSAL DRAIN MIST',
  singularity_surge: 'HAZARDS: VORTEX SURGE + DEBRIS',
  plasma_gale: 'HAZARDS: RIFT DEBRIS + SURGE',
  ion_maelstrom: 'HAZARDS: MAELSTROM SURGE + DEBRIS',
  rift_haze: 'HAZARD: THERMAL DRAIN MIST'
};

export function getWeatherHazardTag(phaseId: string): string {
  return TRIGGER_HAZARD_TAG[phaseId] || 'HAZARDS CLEAR';
}

export class WeatherHazardManager {
  private group = new THREE.Group();
  private slots: WeatherHazardSlot[] = [];
  private fogTex: THREE.CanvasTexture;
  private sharedMaterials: THREE.Material[] = [];
  private sharedGeometries: THREE.BufferGeometry[] = [];
  private trk: TrackData;
  private def: LevelDef;

  constructor(def: LevelDef, trk: TrackData, scene: THREE.Scene) {
    this.def = def;
    this.trk = trk;
    this.group.name = `weather-hazards-${def.id}`;
    scene.add(this.group);

    const fogColorStr =
      def.id === 'space'
        ? 'rgba(170, 110, 255, 0.85)'
        : def.id === 'gauntlet'
          ? 'rgba(255, 110, 92, 0.84)'
          : def.id === 'beach' || def.id === 'space_beach'
            ? 'rgba(89, 240, 216, 0.82)'
            : 'rgba(0, 240, 255, 0.82)';
    this.fogTex = radialTexture(fogColorStr);

    this.populateHazards();
  }

  private isSafeTrackSlot(u: number): boolean {
    if (u < 0.06 || u > 0.94) return false;
    if (this.trk.inSpecial(u)) return false;
    if (this.trk.elev.jumps.some((j) => u > j.at - 0.03 && u < j.end + 0.03)) return false;
    if (this.trk.pads.some((p) => Math.abs(p - u) < 0.02)) return false;
    if (this.trk.obstacles.some((o) => Math.abs(o.u - u) < 0.012)) return false;
    return true;
  }

  private populateHazards(): void {
    const hw = this.trk.hw;
    const accent = this.def.theme.accent;
    const secondary = this.def.theme.secondary;

    // Shared PBR & emissive materials for composite debris
    const hullMat = new THREE.MeshStandardMaterial({
      color: this.def.id === 'beach' || this.def.id === 'space_beach' ? 0x26444b : 0x1a2138,
      metalness: 0.82,
      roughness: 0.28,
      flatShading: true
    });
    const trimMetalMat = new THREE.MeshStandardMaterial({
      color: this.def.id === 'space' ? 0x625784 : 0x38466b,
      metalness: 0.65,
      roughness: 0.42
    });
    const debrisGlowMat = new THREE.MeshBasicMaterial({
      color: this.def.id === 'space' ? 0xffae42 : this.def.id === 'beach' || this.def.id === 'space_beach' ? 0x36f5d8 : 0xff2e93,
      toneMapped: false
    });
    const debrisRingMat = new THREE.MeshBasicMaterial({
      color: secondary,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    const fogColor = this.def.id === 'space' ? 0x9d7bff : 0x59f0d8;
    const fogWarnColor = this.def.id === 'space' ? 0xff6b4a : 0xff8ad4;
    const fogRingMat = new THREE.MeshBasicMaterial({
      color: fogWarnColor,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const fogInnerRingMat = new THREE.MeshBasicMaterial({
      color: fogColor,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const fogCloudMat = new THREE.MeshBasicMaterial({
      map: this.fogTex,
      color: fogColor,
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false
    });
    const fogColumnMat = new THREE.MeshBasicMaterial({
      color: fogColor,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    const surgeRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const surgeArcMat = new THREE.MeshBasicMaterial({
      color: 0xc89eff,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    this.sharedMaterials.push(
      hullMat,
      trimMetalMat,
      debrisGlowMat,
      debrisRingMat,
      fogRingMat,
      fogInnerRingMat,
      fogCloudMat,
      fogColumnMat,
      surgeRingMat,
      surgeArcMat
    );

    // Shared geometries
    const hullGeo = new THREE.DodecahedronGeometry(3.4, 0);
    const girderGeo = new THREE.BoxGeometry(8.6, 1.3, 2.2);
    const coreGeo = new THREE.OctahedronGeometry(1.7, 0);
    const shardGeo = new THREE.TetrahedronGeometry(1.6, 0);
    const debrisWarnGeo = new THREE.RingGeometry(5.2, 6.4, 24);
    const fogOuterGeo = new THREE.RingGeometry(24, 27, 36);
    const fogInnerGeo = new THREE.RingGeometry(11, 13.5, 32);
    const fogPlaneGeo = new THREE.PlaneGeometry(50, 50);
    const fogColGeo = new THREE.CylinderGeometry(23, 26, 18, 22, 1, true);
    const surgeOuterGeo = new THREE.RingGeometry(18, 21, 32);
    const surgePillarGeo = new THREE.CylinderGeometry(0.85, 1.4, 24, 8, 1, true);

    this.sharedGeometries.push(
      hullGeo,
      girderGeo,
      coreGeo,
      shardGeo,
      debrisWarnGeo,
      fogOuterGeo,
      fogInnerGeo,
      fogPlaneGeo,
      fogColGeo,
      surgeOuterGeo,
      surgePillarGeo
    );

    const createDebrisSlot = (id: number, u: number, offSign: number, triggerPhases: string[]) => {
      const f = this.trk.fr(u);
      const baseOff = offSign * hw * (0.24 + (id % 3) * 0.14);
      const group = new THREE.Group();
      const bodyGroup = new THREE.Group();

      const hull = new THREE.Mesh(hullGeo, hullMat);
      hull.scale.set(1.2, 0.78, 1.05);
      const girder = new THREE.Mesh(girderGeo, trimMetalMat);
      girder.rotation.z = 0.28;
      const core = new THREE.Mesh(coreGeo, debrisGlowMat);
      core.position.y = 1.1;
      const shardA = new THREE.Mesh(shardGeo, trimMetalMat);
      shardA.position.set(3.4, 1.6, 1.2);
      const shardB = new THREE.Mesh(shardGeo, debrisGlowMat);
      shardB.position.set(-3.3, -0.8, -1.3);
      shardB.scale.setScalar(0.75);
      bodyGroup.add(hull, girder, core, shardA, shardB);
      bodyGroup.position.y = 3.2;

      const ringMesh = new THREE.Mesh(debrisWarnGeo, debrisRingMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.36;

      group.add(bodyGroup, ringMesh);
      group.position.copy(f.pos).addScaledVector(f.s, baseOff);
      _negS.copy(f.s).negate();
      _m4.makeBasis(_negS, f.up, f.t);
      group.quaternion.setFromRotationMatrix(_m4);
      group.visible = false;
      this.group.add(group);

      this.slots.push({
        id,
        kind: 'debris',
        triggerPhases,
        u,
        baseOff,
        curOff: baseOff,
        driftAmp: hw * 0.18,
        driftSpeed: 0.55 + (id % 4) * 0.16,
        phase: id * 1.37,
        radius: 5.8,
        cool: 0,
        activation: 0,
        group,
        bodyGroup,
        ringMesh,
        extraMeshes: [core, shardB],
        worldPos: new THREE.Vector3(),
        trackUp: f.up.clone()
      });
    };

    const createFogSlot = (id: number, u: number, offSign: number, triggerPhases: string[]) => {
      const f = this.trk.fr(u);
      const baseOff = offSign * hw * 0.34;
      const group = new THREE.Group();
      const bodyGroup = new THREE.Group();

      const ringMesh = new THREE.Mesh(fogOuterGeo, fogRingMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.38;

      const innerRing = new THREE.Mesh(fogInnerGeo, fogInnerRingMat);
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.y = 0.44;

      const colMesh = new THREE.Mesh(fogColGeo, fogColumnMat);
      colMesh.position.y = 9.0;

      const extraMeshes: THREE.Mesh[] = [innerRing, colMesh];
      for (let k = 0; k < 4; k++) {
        const cloud = new THREE.Mesh(fogPlaneGeo, fogCloudMat);
        cloud.rotation.x = -Math.PI / 2;
        cloud.position.set((k - 1.5) * 4.5, 2.2 + k * 3.1, ((k % 2) - 0.5) * 5);
        cloud.scale.setScalar(0.82 + (k % 2) * 0.24);
        bodyGroup.add(cloud);
        extraMeshes.push(cloud);
      }
      bodyGroup.add(innerRing, colMesh);
      group.add(bodyGroup, ringMesh);

      group.position.copy(f.pos).addScaledVector(f.s, baseOff);
      _negS.copy(f.s).negate();
      _m4.makeBasis(_negS, f.up, f.t);
      group.quaternion.setFromRotationMatrix(_m4);
      group.visible = false;
      this.group.add(group);

      this.slots.push({
        id,
        kind: 'fog',
        triggerPhases,
        u,
        baseOff,
        curOff: baseOff,
        driftAmp: 0,
        driftSpeed: 0,
        phase: id * 1.9,
        radius: 26,
        cool: 0,
        activation: 0,
        group,
        bodyGroup,
        ringMesh,
        extraMeshes,
        worldPos: new THREE.Vector3(),
        trackUp: f.up.clone()
      });
    };

    const createSurgeSlot = (id: number, u: number, offSign: number, triggerPhases: string[]) => {
      const f = this.trk.fr(u);
      const baseOff = offSign * hw * 0.32;
      const group = new THREE.Group();
      const bodyGroup = new THREE.Group();

      const ringMesh = new THREE.Mesh(surgeOuterGeo, surgeRingMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.4;

      const pA = new THREE.Mesh(surgePillarGeo, surgeArcMat);
      pA.position.set(-4.5, 12, 0);
      pA.rotation.z = 0.14;
      const pB = new THREE.Mesh(surgePillarGeo, surgeArcMat);
      pB.position.set(4.5, 12, 0);
      pB.rotation.z = -0.14;
      const arcCore = new THREE.Mesh(coreGeo, debrisGlowMat);
      arcCore.position.y = 8;
      arcCore.scale.setScalar(1.4);

      bodyGroup.add(pA, pB, arcCore);
      group.add(bodyGroup, ringMesh);

      group.position.copy(f.pos).addScaledVector(f.s, baseOff);
      _negS.copy(f.s).negate();
      _m4.makeBasis(_negS, f.up, f.t);
      group.quaternion.setFromRotationMatrix(_m4);
      group.visible = false;
      this.group.add(group);

      this.slots.push({
        id,
        kind: 'surge',
        triggerPhases,
        u,
        baseOff,
        curOff: baseOff,
        driftAmp: hw * 0.08,
        driftSpeed: 0.7,
        phase: id * 1.6,
        radius: 20,
        cool: 0,
        activation: 0,
        group,
        bodyGroup,
        ringMesh,
        extraMeshes: [pA, pB, arcCore],
        worldPos: new THREE.Vector3(),
        trackUp: f.up.clone()
      });
    };

    // Place weather-triggered hazards at safe, non-overlapping track coordinates
    const candidateUs: number[] = [];
    for (let k = 0; k < 28; k++) {
      const u = 0.075 + k * 0.031;
      if (this.isSafeTrackSlot(u)) candidateUs.push(u);
    }

    let idCounter = 0;
    if (this.def.id === 'neon') {
      // Neon Sprawl: Floating storm debris in Neon Downpour & Electric Squall + Ion Surge zones in Electric Squall
      candidateUs.forEach((u, idx) => {
        const sign = idx % 2 === 0 ? 1 : -1;
        if (idx % 3 === 1) {
          createSurgeSlot(idCounter++, u, sign, ['electric_squall']);
        } else if (idx < 14) {
          createDebrisSlot(idCounter++, u, sign, ['neon_downpour', 'electric_squall']);
        }
      });
    } else if (this.def.id === 'beach') {
      // Vesper Shore: Drifting reef debris + Tidal energy-draining mist zones
      candidateUs.forEach((u, idx) => {
        const sign = idx % 2 === 0 ? -1 : 1;
        if (idx % 2 === 0 && idx < 12) {
          createFogSlot(idCounter++, u, sign, ['tidal_squall', 'aurora_dusk']);
        } else if (idx < 14) {
          createDebrisSlot(idCounter++, u, sign, ['tidal_squall']);
        }
      });
    } else if (this.def.id === 'space_beach') {
      // Space Beach: Coral debris during Cosmic Monsoon + Bioluminescent mist zones along above-water coastal spans
      candidateUs.forEach((u, idx) => {
        const sign = idx % 2 === 0 ? -1 : 1;
        if (idx % 2 === 0) {
          createFogSlot(idCounter++, u, sign, ['bioluminescent_tide', 'cosmic_monsoon']);
        } else {
          createDebrisSlot(idCounter++, u, sign, ['cosmic_monsoon']);
        }
      });
    } else if (this.def.id === 'vortex') {
      // Vortex Abyss: Spinning abyssal debris + deep chasm mist + vortex ion surges
      candidateUs.forEach((u, idx) => {
        const sign = idx % 2 === 0 ? 1 : -1;
        if (idx % 3 === 1) {
          createSurgeSlot(idCounter++, u, sign, ['vortex_squall', 'singularity_surge']);
        } else if (idx % 3 === 2) {
          createFogSlot(idCounter++, u, sign, ['abyssal_mist']);
        } else if (idx < 16) {
          createDebrisSlot(idCounter++, u, sign, ['vortex_squall', 'singularity_surge']);
        }
      });
    } else if (this.def.id === 'gauntlet') {
      // Hyperion Rift: Plasma debris, maelstrom ion surges, and thermal drain mist
      candidateUs.forEach((u, idx) => {
        const sign = idx % 2 === 0 ? 1 : -1;
        if (idx % 3 === 1) {
          createSurgeSlot(idCounter++, u, sign, ['plasma_gale', 'ion_maelstrom']);
        } else if (idx % 3 === 2) {
          createFogSlot(idCounter++, u, sign, ['rift_haze']);
        } else {
          createDebrisSlot(idCounter++, u, sign, ['plasma_gale', 'ion_maelstrom']);
        }
      });
    } else {
      // Event Horizon: Temporary energy-draining fog zones (Solar Flare / Ion Storm) + Orbital debris (Solar Flare)
      candidateUs.forEach((u, idx) => {
        const sign = idx % 2 === 0 ? 1 : -1;
        if (idx % 2 === 0 && idx < 14) {
          createFogSlot(idCounter++, u, sign, ['solar_flare', 'ion_storm']);
        } else if (idx < 14) {
          createDebrisSlot(idCounter++, u, sign, ['solar_flare']);
        }
      });
    }

    // Also include accent color reference to avoid lint warnings if unused
    void accent;
  }

  public update(
    dt: number,
    now: number,
    phase: WeatherPhaseDef,
    shipPos: THREE.Vector3,
    forwardDir: THREE.Vector3,
    playerX: number,
    lookaheadDist: number,
    isRacing: boolean,
    outResult: HazardInteractionResult
  ): void {
    outResult.debrisHit = false;
    outResult.inFogZone = false;
    outResult.inSurgeZone = false;
    outResult.energyDrainRate = 0;
    outResult.speedDragRate = 0;
    outResult.lateralJolt = 0;
    outResult.alertLabel = '';
    outResult.proximityIntensity = 0;
    outResult.proximityKind = 'debris';
    outResult.proximitySide = 0;
    outResult.proximityDistM = 999;

    const t = now * 0.001;
    const lookaheadSq = lookaheadDist * lookaheadDist;

    for (let i = 0; i < this.slots.length; i++) {
      const h = this.slots[i];
      if (h.cool > 0) h.cool = Math.max(0, h.cool - dt);

      const activeNow = h.triggerPhases.includes(phase.id);
      const targetAct = activeNow ? 1 : 0;
      h.activation += (targetAct - h.activation) * (1 - Math.exp(-dt * (activeNow ? 2.1 : 3.2)));

      if (h.activation < 0.03) {
        h.group.visible = false;
        continue;
      }
      h.group.visible = true;

      // Update lateral storm drift and world position
      const f = this.trk.fr(h.u);
      const limit = f.width * 0.42;
      const drift = h.driftAmp > 0 ? Math.sin(t * h.driftSpeed + h.phase) * h.driftAmp : 0;
      h.curOff = Math.max(-limit, Math.min(limit, h.baseOff + drift));

      h.group.position.copy(f.pos).addScaledVector(f.s, h.curOff);
      h.worldPos.copy(h.group.position).addScaledVector(f.up, h.kind === 'debris' ? 3.2 : 4.0);

      // Animate meshes smoothly with zero GC
      const sc = h.activation;
      h.group.scale.setScalar(sc);

      if (h.kind === 'debris') {
        h.bodyGroup.position.y = 3.1 + Math.sin(t * 2.6 + h.phase) * 1.1;
        h.bodyGroup.rotation.y += dt * 1.35;
        h.bodyGroup.rotation.x = Math.sin(t * 1.7 + h.phase) * 0.25;
        h.ringMesh.scale.setScalar(0.95 + 0.1 * Math.sin(t * 5 + h.phase));
      } else if (h.kind === 'fog') {
        h.bodyGroup.rotation.y += dt * 0.35;
        for (let k = 0; k < h.extraMeshes.length; k++) {
          h.extraMeshes[k].rotation.z += dt * (k % 2 === 0 ? 0.22 : -0.18);
        }
        h.ringMesh.scale.setScalar(0.96 + 0.06 * Math.sin(t * 3.2 + h.phase));
      } else {
        // Surge zone
        h.bodyGroup.rotation.y -= dt * 1.8;
        const pulse = 0.88 + 0.2 * Math.sin(t * 9 + h.phase);
        h.ringMesh.scale.setScalar(pulse);
        if (h.extraMeshes[2]) h.extraMeshes[2].scale.setScalar(1.1 + 0.35 * Math.sin(t * 12 + h.phase));
      }

      if (!isRacing || h.activation < 0.55) continue;

      const distSq = shipPos.distanceToSquared(h.worldPos);

      // High-speed forward proximity anticipation check (debris, fog drain zones, ion surges)
      if (h.cool <= 0 && distSq < lookaheadSq) {
        _toHazard.subVectors(h.worldPos, shipPos);
        const dotFwd = _toHazard.dot(forwardDir);
        const dist = Math.sqrt(distSq);
        const edgeDist = Math.max(0, dist - h.radius);
        // Trigger when inside hazard or approaching ahead within lookahead cone
        if (edgeDist <= 2 || (dotFwd > -4 && dist <= lookaheadDist)) {
          const prox = edgeDist <= 0 ? 1.0 : Math.pow(1 - Math.min(1, edgeDist / lookaheadDist), 1.35) * h.activation;
          if (prox > outResult.proximityIntensity) {
            outResult.proximityIntensity = prox;
            outResult.proximityKind = h.kind;
            outResult.proximityDistM = Math.round(edgeDist);
            const latDelta = h.curOff - playerX;
            outResult.proximitySide = Math.max(-1, Math.min(1, latDelta / Math.max(18, f.width * 0.28)));
          }
        }
      }

      if (h.kind === 'debris') {
        const hitR = h.radius + 2.2;
        if (h.cool <= 0 && distSq < hitR * hitR) {
          h.cool = 2.0;
          outResult.debrisHit = true;
          outResult.debrisHitPos.copy(h.worldPos);
          outResult.debrisPushDir = Math.sign(playerX - h.curOff) || 1;
          outResult.alertLabel =
            this.def.id === 'space'
              ? 'ORBITAL DEBRIS IMPACT // 轨道残骸'
              : this.def.id === 'beach' || this.def.id === 'space_beach'
                ? 'REEF DEBRIS IMPACT // 礁石残骸'
                : 'STORM DEBRIS IMPACT // 浮空残骸';
          outResult.alertKind = 'debris';
          _hitPos.copy(h.worldPos);
        }
      } else if (h.kind === 'fog') {
        const hitR = h.radius;
        if (distSq < hitR * hitR) {
          outResult.inFogZone = true;
          outResult.energyDrainRate = Math.max(outResult.energyDrainRate, 0.26 * h.activation);
          outResult.speedDragRate = Math.max(outResult.speedDragRate, 0.18 * h.activation);
          outResult.alertLabel =
            this.def.id === 'space'
              ? 'ENERGY DRAIN // HORIZON FOG'
              : 'ENERGY DRAIN // TIDAL MIST';
          outResult.alertKind = 'fog';
        }
      } else if (h.kind === 'surge') {
        const hitR = h.radius;
        if (distSq < hitR * hitR) {
          outResult.inSurgeZone = true;
          outResult.energyDrainRate = Math.max(outResult.energyDrainRate, 0.22 * h.activation);
          outResult.lateralJolt = Math.sin(t * 22 + h.phase) * 32 * h.activation;
          outResult.alertLabel = 'ION SURGE ZONE // 电离脉冲';
          outResult.alertKind = 'surge';
        }
      }
    }
  }

  public resetCooldowns(): void {
    for (const h of this.slots) h.cool = 0;
  }

  public dispose(scene: THREE.Scene): void {
    this.fogTex.dispose();
    for (const g of this.sharedGeometries) g.dispose();
    for (const m of this.sharedMaterials) m.dispose();
    this.sharedGeometries = [];
    this.sharedMaterials = [];
    this.slots = [];
    scene.remove(this.group);
  }
}
