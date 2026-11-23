import * as THREE from 'three';
import { canvasTexture } from './textures';
import { preloadRacerModel, racerModel } from './racerModels';
import type {
  NeonPreset,
  NeonTrimId,
  PaintJobId,
  PaintPreset,
  RimStyleId,
  RimStylePreset,
  ShipProfile,
  VehicleCustomization
} from './types';

export const PAINT_PRESETS: PaintPreset[] = [
  {
    id: 'obsidian',
    name: 'OBSIDIAN MIRROR',
    color: 0x0e121c,
    hex: '#1c2438',
    metalness: 0.78,
    roughness: 0.22,
    clearcoat: 0.9,
    hardwareColor: 0xdfb252
  },
  {
    id: 'pearl',
    name: 'PEARL TITANIUM',
    color: 0xdce6f5,
    hex: '#dce6f5',
    metalness: 0.48,
    roughness: 0.22,
    clearcoat: 0.88,
    hardwareColor: 0xcbd8eb
  },
  {
    id: 'cobalt',
    name: 'COBALT SAPPHIRE',
    color: 0x0f3b8c,
    hex: '#1f64d8',
    metalness: 0.82,
    roughness: 0.2,
    clearcoat: 0.92,
    hardwareColor: 0xd7e4f7
  },
  {
    id: 'crimson',
    name: 'ROSSO CORSA',
    color: 0xa31128,
    hex: '#dc1e3c',
    metalness: 0.76,
    roughness: 0.19,
    clearcoat: 0.94,
    hardwareColor: 0xdfb252
  },
  {
    id: 'jade',
    name: 'VERDANT EMERALD',
    color: 0x0d5c46,
    hex: '#12a37a',
    metalness: 0.8,
    roughness: 0.21,
    clearcoat: 0.9,
    hardwareColor: 0xe6c875
  },
  {
    id: 'bronze',
    name: 'SOLAR BRONZE',
    color: 0x6b421c,
    hex: '#b87635',
    metalness: 0.88,
    roughness: 0.2,
    clearcoat: 0.88,
    hardwareColor: 0xf0c975
  }
];

export const NEON_PRESETS: NeonPreset[] = [
  { id: 'champagne', name: 'CHAMPAGNE GOLD', color: 0xffb838, secondaryColor: 0x00f0ff, hex: '#f5c451' },
  { id: 'cyan', name: 'CYBER CYAN', color: 0x00f0ff, secondaryColor: 0xff2e93, hex: '#00f0ff' },
  { id: 'magenta', name: 'PLASMA MAGENTA', color: 0xff3b94, secondaryColor: 0xffd700, hex: '#ff3b94' },
  { id: 'biolume', name: 'AQUA BIOLUME', color: 0x36f5d8, secondaryColor: 0x00a8ff, hex: '#36f5d8' },
  { id: 'violet', name: 'VIOLET PULSE', color: 0xa86bff, secondaryColor: 0x00f0ff, hex: '#a86bff' },
  { id: 'glacier', name: 'ICE PLATINUM', color: 0xe2f3ff, secondaryColor: 0x5cc8ff, hex: '#e2f3ff' }
];

export const RIM_STYLE_PRESETS: RimStylePreset[] = [
  { id: 'turbine', name: 'TURBINE BLADE', tag: '10-VANE FINNED' },
  { id: 'aero', name: 'AERO MONOBLOCK', tag: 'SHIELDED DISC' },
  { id: 'split', name: 'SPLIT Y-FORGED', tag: '5-FORK ALLOY' },
  { id: 'orbit', name: 'ORBIT HALO', tag: 'GYRO MAG-CORE' }
];

export function getDefaultCustomization(shipId: number): VehicleCustomization {
  const defaults: VehicleCustomization[] = [
    { paintId: 'obsidian', neonId: 'champagne', rimId: 'turbine' },
    { paintId: 'pearl', neonId: 'cyan', rimId: 'aero' },
    { paintId: 'obsidian', neonId: 'magenta', rimId: 'split' },
    { paintId: 'cobalt', neonId: 'violet', rimId: 'orbit' }
  ];
  return { ...(defaults[shipId] || defaults[0]) };
}

export function getPaintPreset(id: PaintJobId): PaintPreset {
  return PAINT_PRESETS.find((p) => p.id === id) || PAINT_PRESETS[0];
}

export function getNeonPreset(id: NeonTrimId): NeonPreset {
  return NEON_PRESETS.find((n) => n.id === id) || NEON_PRESETS[0];
}

export function getRimStylePreset(id: RimStyleId): RimStylePreset {
  return RIM_STYLE_PRESETS.find((r) => r.id === id) || RIM_STYLE_PRESETS[0];
}

export const SHIP_PROFILES: ShipProfile[] = [
  {
    id: 0,
    kanji: '王者',
    name: 'AHWOO SOVEREIGN GT',
    subtitle: 'OBSIDIAN & CHAMPAGNE GOLD',
    color: 0xffb838,
    secondaryColor: 0x00f0ff,
    hex: '#f5c451',
    cls: 'Obsidian Hover Luxury Coupe',
    spd: 1.03,
    acc: 1.06,
    hnd: 1.04,
    bst: 1.08,
    pilotName: 'KAIRO // CYBER-GOLD RIDER'
  },
  {
    id: 1,
    kanji: '青鸾',
    name: 'VALKYRIE AERO-S',
    subtitle: 'PEARL TITANIUM & CYAN',
    color: 0x00f0ff,
    secondaryColor: 0xff2e93,
    hex: '#00f0ff',
    cls: 'Twin-Hull Luxury Catamaran',
    spd: 1.08,
    acc: 0.96,
    hnd: 1.14,
    bst: 0.98,
    pilotName: 'LYRA // AERO DIVISION'
  },
  {
    id: 2,
    kanji: '玄武',
    name: 'NOCTIS PHANTOM IX',
    subtitle: 'STEALTH CARBON & ROSE GOLD',
    color: 0xff4d94,
    secondaryColor: 0xffd700,
    hex: '#ff4d94',
    cls: 'Armored Delta Grand Tourer',
    spd: 0.98,
    acc: 0.93,
    hnd: 0.9,
    bst: 1.24,
    pilotName: 'VEX // APEX SYNDICATE'
  },
  {
    id: 3,
    kanji: '极光',
    name: 'AURORA APEX V',
    subtitle: 'LIQUID CHROME & VIOLET',
    color: 0xa86bff,
    secondaryColor: 0x00f0ff,
    hex: '#a86bff',
    cls: 'Quad-Foil Hyper Roadster',
    spd: 1.04,
    acc: 1.1,
    hnd: 1.05,
    bst: 1.04,
    pilotName: 'SORA // SKYLINE ELITE'
  },
  {
    id: 4,
    kanji: '混沌',
    name: 'CHAO SPACE RACER',
    subtitle: 'FACTORY LIVERY · BAKED TEXTURES',
    color: 0x59b2ff,
    secondaryColor: 0xff5a4d,
    hex: '#59b2ff',
    cls: 'Biolume Chao Prototype',
    spd: 1.06,
    acc: 1.12,
    hnd: 1.18,
    bst: 0.96,
    pilotName: 'CHAO // SPACE DIVISION',
    model: 'chao-space-racer',
    fixedLivery: true
  },
  {
    id: 5,
    kanji: '青葉',
    name: 'VERDANT ORBIT RUNNER',
    subtitle: 'FACTORY LIVERY · BAKED TEXTURES',
    color: 0x7ddc5a,
    secondaryColor: 0x1e6b3a,
    hex: '#7ddc5a',
    cls: 'Foliage-Class Space Racer',
    spd: 1.09,
    acc: 1.02,
    hnd: 1.07,
    bst: 1.05,
    pilotName: 'FENN // VERDANT WORKS',
    model: 'green-space-racer',
    fixedLivery: true
  },
  {
    id: 6,
    kanji: '聖歌',
    name: 'SERAPH CHAO RACER',
    subtitle: 'FACTORY LIVERY · BAKED TEXTURES',
    color: 0xf2f6ff,
    secondaryColor: 0xf5c451,
    hex: '#f2f6ff',
    cls: 'Biolume Chao Seraph',
    spd: 1.01,
    acc: 1.16,
    hnd: 1.12,
    bst: 1.0,
    pilotName: 'AVIEL // CHOIR FLIGHT',
    model: 'angel-chao-racer',
    fixedLivery: true
  },
  {
    id: 7,
    kanji: '夜皇',
    name: 'MIDNIGHT AERO MAJESTY',
    subtitle: 'FACTORY LIVERY · BAKED TEXTURES',
    color: 0x8f74ff,
    secondaryColor: 0x2a2f52,
    hex: '#8f74ff',
    cls: 'Midnight Aero Flagship',
    spd: 1.12,
    acc: 0.99,
    hnd: 1.01,
    bst: 1.14,
    pilotName: 'NYX // NOCTURNE COURT',
    model: 'midnight-aero-majesty',
    fixedLivery: true
  }
];

// Shared luxury PBR materials (calibrated clearcoat so bloom highlights stay crisp)
const obsidianPaintMat = new THREE.MeshPhysicalMaterial({
  color: 0x0e121c,
  metalness: 0.74,
  roughness: 0.24,
  clearcoat: 0.88,
  clearcoatRoughness: 0.11
});

const pearlPaintMat = new THREE.MeshPhysicalMaterial({
  color: 0xd8e2f0,
  metalness: 0.45,
  roughness: 0.24,
  clearcoat: 0.85,
  clearcoatRoughness: 0.1
});

const carbonTrimMat = new THREE.MeshStandardMaterial({
  color: 0x171b26,
  metalness: 0.38,
  roughness: 0.64
});

const champagneGoldMat = new THREE.MeshPhysicalMaterial({
  color: 0xdfb252,
  metalness: 0.92,
  roughness: 0.19,
  anisotropy: 0.75,
  clearcoat: 0.55
});

const chromeMat = new THREE.MeshPhysicalMaterial({
  color: 0xcbd8eb,
  metalness: 0.94,
  roughness: 0.16,
  anisotropy: 0.7
});

const canopyGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0x10203a,
  metalness: 0.12,
  roughness: 0.08,
  transparent: true,
  opacity: 0.36,
  clearcoat: 0.9,
  depthWrite: false
});

const jacketCreamMat = new THREE.MeshStandardMaterial({
  color: 0xe3ddd2,
  roughness: 0.58,
  metalness: 0.08
});

const riderSkinMat = new THREE.MeshStandardMaterial({
  color: 0x8a583d,
  roughness: 0.55,
  metalness: 0.05
});

const riderHairMat = new THREE.MeshStandardMaterial({
  color: 0x121115,
  roughness: 0.75,
  metalness: 0.1
});

let cachedFlameTex: THREE.CanvasTexture | null = null;
function getFlameTexture(): THREE.CanvasTexture {
  if (cachedFlameTex) return cachedFlameTex;
  cachedFlameTex = canvasTexture(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    grd.addColorStop(0.28, 'rgba(255, 224, 150, 0.78)');
    grd.addColorStop(0.65, 'rgba(255, 165, 64, 0.32)');
    grd.addColorStop(1.0, 'rgba(255, 120, 20, 0.0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // Subtle longitudinal jet plasma striations
    for (let i = 0; i < 18; i++) {
      const x = (i / 18) * w + 3;
      const sg = g.createLinearGradient(0, 0, 0, h * 0.85);
      sg.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
      sg.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
      g.fillStyle = sg;
      g.fillRect(x, 0, 2.5, h * 0.85);
    }
  });
  return cachedFlameTex;
}

function makeThrusterBellGeo(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.06, 0),
    new THREE.Vector2(0.35, 0),
    new THREE.Vector2(0.4, 0.22),
    new THREE.Vector2(0.3, 0.56),
    new THREE.Vector2(0.34, 0.78),
    new THREE.Vector2(0.06, 0.78)
  ];
  return new THREE.LatheGeometry(pts, 18);
}

const thrusterBellGeo = makeThrusterBellGeo();

function makeAeroWingGeo(span: number, chord: number, sweep: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(span, -sweep);
  shape.lineTo(span, -sweep - chord * 0.55);
  shape.lineTo(0, -chord);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.11,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2
  });
  geo.rotateX(Math.PI / 2);
  return geo;
}

/** Builds stylized Cyber-Gold Rider + steering yoke + cockpit holo-console (matching intro video). */
function buildCyberRider(accentHex: number, trimMat: THREE.Material = champagneGoldMat): THREE.Group {
  const rider = new THREE.Group();

  // Luxury bucket headrest & seat bolster behind rider
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.78, 0.2), carbonTrimMat);
  headrest.position.set(0, 0.54, -0.34);
  headrest.rotation.x = -0.14;
  rider.add(headrest);

  const headrestTrim = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.22), trimMat);
  headrestTrim.position.set(0, 0.88, -0.39);
  rider.add(headrestTrim);

  // Jacketed torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.62, 10), jacketCreamMat);
  torso.position.set(0, 0.34, 0);
  rider.add(torso);

  // Gold shoulder collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.055, 8, 16), trimMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.62, 0);
  rider.add(collar);

  // Arms reaching forward to flight steering yoke
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.34, 4, 8), jacketCreamMat);
    sleeve.position.set(side * 0.3, 0.45, 0.24);
    sleeve.rotation.x = 1.08;
    sleeve.rotation.z = side * 0.22;
    rider.add(sleeve);

    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.14), carbonTrimMat);
    glove.position.set(side * 0.23, 0.36, 0.46);
    rider.add(glove);
  }

  // Sculpted Cyber Steering Yoke + Holo Console
  const yokeBar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.032, 8, 16, Math.PI * 1.15), trimMat);
  yokeBar.position.set(0, 0.34, 0.5);
  yokeBar.rotation.x = -0.35;
  yokeBar.rotation.z = -0.075 * Math.PI;
  rider.add(yokeBar);

  const holoDash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.16),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  holoDash.position.set(0, 0.45, 0.64);
  holoDash.rotation.x = -0.45;
  rider.add(holoDash);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), riderSkinMat);
  head.position.set(0, 0.88, 0.03);
  rider.add(head);

  // Shades
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.16), carbonTrimMat);
  shades.position.set(0, 0.91, 0.19);
  rider.add(shades);

  // Cyber Gold Half-Mask
  const mask = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.24, 6), obsidianPaintMat);
  mask.rotation.x = -Math.PI * 0.65;
  mask.position.set(0, 0.79, 0.18);
  rider.add(mask);

  const maskGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.028, 0.1),
    new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 0.75 })
  );
  maskGlow.position.set(0, 0.8, 0.24);
  rider.add(maskGlow);

  // Locs / dreadlocks crown swept back
  for (let i = -3; i <= 3; i++) {
    const loc = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.36, 4, 6), riderHairMat);
    loc.position.set(i * 0.07, 0.98 - Math.abs(i) * 0.03, -0.14);
    loc.rotation.x = -0.75 - Math.abs(i) * 0.08;
    loc.rotation.z = i * 0.14;
    rider.add(loc);
  }

  return rider;
}

/** Builds a hovering repulsor pad under the chassis and returns its plasma cone for dynamic animation. */
function buildRepulsorPad(
  accentHex: number,
  rimMat: THREE.Material = champagneGoldMat,
  rimStyle: RimStyleId = 'turbine'
): { pad: THREE.Group; plasma: THREE.Mesh } {
  const pad = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.44, 0.16, 16), carbonTrimMat);
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, rimStyle === 'aero' ? 0.068 : 0.045, 8, 20),
    rimMat
  );
  bezel.rotation.x = Math.PI / 2;
  bezel.position.y = -0.02;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.038, 8, 20),
    new THREE.MeshBasicMaterial({ color: accentHex, transparent: true, opacity: 0.88 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.07;

  const plasma = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 0.82, 14, 1, true),
    new THREE.MeshBasicMaterial({
      map: getFlameTexture(),
      color: accentHex,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  plasma.rotation.x = Math.PI;
  plasma.position.y = -0.44;
  pad.add(housing, bezel, rim, plasma);
  return { pad, plasma };
}

/**
 * Builds sculpted outrigger hover-rim / magnetic turbine wheel hardware (distinct silhouette per RimStyleId)
 * mounted symmetrically on the 4 corners of the vehicle so rim customization reads sharply in 360°.
 */
function buildHoverRimPod(
  rimStyle: RimStyleId,
  metalMat: THREE.Material,
  neonHex: number,
  side: number,
  rimSpinners: THREE.Object3D[]
): THREE.Group {
  const pod = new THREE.Group();

  // Outer sculpted mag-shroud tire/ring facing outward along X
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 24, 1, true), carbonTrimMat);
  shroud.rotation.z = Math.PI / 2;
  pod.add(shroud);

  const lipRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 24), metalMat);
  lipRing.rotation.y = Math.PI / 2;
  lipRing.position.x = side * 0.12;
  pod.add(lipRing);

  const neonArc = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.024, 6, 24),
    new THREE.MeshBasicMaterial({ color: neonHex })
  );
  neonArc.rotation.y = Math.PI / 2;
  neonArc.position.x = side * 0.135;
  pod.add(neonArc);

  const spinner = new THREE.Group();
  spinner.position.x = side * 0.02;

  if (rimStyle === 'turbine') {
    // 10-blade angled jet turbine vanes + central glowing spinner cap
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 14), metalMat);
    hub.rotation.z = Math.PI / 2;
    spinner.add(hub);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.34), metalMat);
      blade.position.set(side * 0.04, Math.cos(a) * 0.22, Math.sin(a) * 0.22);
      blade.rotation.x = a;
      blade.rotation.y = side * 0.35;
      spinner.add(blade);
    }
  } else if (rimStyle === 'aero') {
    // Monoblock deep-dish aero fan disc + slotted vent arcs
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.16, 24), metalMat);
    disc.rotation.z = Math.PI / 2;
    spinner.add(disc);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.12), carbonTrimMat);
      slot.position.set(side * 0.02, Math.cos(a) * 0.25, Math.sin(a) * 0.25);
      slot.rotation.x = a;
      spinner.add(slot);
    }
  } else if (rimStyle === 'split') {
    // Forged 5 split Y-fork spokes revealing glowing caliper inner ring
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.03, 6, 18),
      new THREE.MeshBasicMaterial({ color: neonHex, transparent: true, opacity: 0.72 })
    );
    innerRing.rotation.y = Math.PI / 2;
    spinner.add(innerRing);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const fork of [-0.14, 0.14]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.038, 0.34), metalMat);
        spoke.position.set(side * 0.06, Math.cos(a + fork) * 0.2, Math.sin(a + fork) * 0.2);
        spoke.rotation.x = a + fork * 0.5;
        spinner.add(spoke);
      }
    }
  } else {
    // Orbit halo gyroscopic core: dual crossed rings around incandescent levitation orb
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 10),
      new THREE.MeshBasicMaterial({ color: neonHex })
    );
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.028, 6, 18), metalMat);
    ringA.rotation.y = Math.PI / 2;
    ringA.rotation.x = 0.45;
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.024, 6, 18), metalMat);
    ringB.rotation.y = Math.PI / 2;
    ringB.rotation.z = 0.55;
    spinner.add(orb, ringA, ringB);
  }

  const centerCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.25, 12),
    new THREE.MeshBasicMaterial({ color: neonHex })
  );
  centerCap.rotation.z = Math.PI / 2;
  spinner.add(centerCap);

  pod.add(spinner);
  rimSpinners.push(spinner);
  return pod;
}

/** Builds multi-layered animated afterburner exhaust cones + traveling Mach shock rings for every nozzle. */
function buildBoosterRig(
  nozzleCoords: [number, number, number][],
  accentHex: number,
  secondaryHex: number,
  plumeRadius = 0.32,
  plumeLength = 3.2
): {
  engine: THREE.Group;
  boosterCores: THREE.Mesh[];
  shockRings: THREE.Mesh[];
} {
  const engine = new THREE.Group();
  const boosterCores: THREE.Mesh[] = [];
  const shockRings: THREE.Mesh[] = [];
  const flameTex = getFlameTexture();

  // Accent-tinted, but pushed toward exhaust heat: a pure blue or white plume
  // washes out against the cyan road markings and reads as no exhaust at all.
  const plumeTint = new THREE.Color(accentHex).lerp(new THREE.Color(0xff9a4a), 0.42);

  const outerMat = new THREE.MeshBasicMaterial({
    map: flameTex,
    color: plumeTint,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const innerMat = new THREE.MeshBasicMaterial({
    map: flameTex,
    color: 0xfff3d4,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const shockMat = new THREE.MeshBasicMaterial({
    color: secondaryHex,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const outerGeo = new THREE.ConeGeometry(plumeRadius, plumeLength, 14, 1, true);
  // Shift cone so base (wide end) sits at local z=0 and tip extends along -Z when rotated -PI/2 around X
  outerGeo.translate(0, -plumeLength * 0.5, 0);
  outerGeo.rotateX(Math.PI / 2);

  const innerGeo = new THREE.ConeGeometry(plumeRadius * 0.56, plumeLength * 0.78, 12, 1, true);
  innerGeo.translate(0, -plumeLength * 0.34, 0);
  innerGeo.rotateX(Math.PI / 2);

  const ringGeo = new THREE.TorusGeometry(plumeRadius * 0.65, 0.038, 6, 18);

  for (const [nx, ny, nz] of nozzleCoords) {
    const nozzlePlume = new THREE.Group();
    nozzlePlume.position.set(nx, ny, nz);

    const outerCone = new THREE.Mesh(outerGeo, outerMat);
    const innerCone = new THREE.Mesh(innerGeo, innerMat);
    nozzlePlume.add(outerCone, innerCone);
    boosterCores.push(outerCone, innerCone);

    // 2 traveling shock diamond rings per nozzle
    for (let r = 0; r < 2; r++) {
      const ring = new THREE.Mesh(ringGeo, shockMat);
      ring.position.z = -0.35 - r * (plumeLength * 0.35);
      nozzlePlume.add(ring);
      shockRings.push(ring);
    }

    engine.add(nozzlePlume);
  }

  return { engine, boosterCores, shockRings };
}

export interface BuiltVehicle {
  g: THREE.Group;
  engine: THREE.Object3D;
  boosterCores: THREE.Mesh[];
  shockRings: THREE.Mesh[];
  repulsorCones: THREE.Mesh[];
  rimSpinners: THREE.Object3D[];
  groundHalo: THREE.Mesh;
  light: THREE.PointLight;
  accentMat: THREE.MeshStandardMaterial;
  typeIndex: number;
}

/**
 * Fixed-livery chassis: a cooked GLB replaces the procedural hull and keeps its
 * baked paint, so the customization object is deliberately ignored. The model
 * loads async, so until it arrives this returns the halo and light only and the
 * engine rebuilds the ship from the ready callback.
 */
/** Team plate colours for the three grid slots. */
const RIVAL_PLATES = [0xff3b6b, 0x2ee6ff, 0xffc23b];

function buildFixedLiveryChassis(
  profile: ShipProfile,
  accentHex: number,
  scale: number,
  rivalSlot?: number
): BuiltVehicle {
  const g = new THREE.Group();
  // Baked-livery ships carry their own glow identity, so workshop neon does not
  // tint the halo, plumes or repulsors.
  const accent = profile.color;

  const loaded = profile.model ? racerModel(profile.model) : null;
  if (profile.model && !loaded) preloadRacerModel(profile.model);
  const hull = loaded ? loaded.clone(true) : null;
  if (hull) g.add(hull);

  // The cooked hull has no animated exhaust, so plumes and hover pads are
  // procedural and drive the same engine/booster hooks as the built ships.
  const box = hull
    ? new THREE.Box3().setFromObject(hull)
    : new THREE.Box3(new THREE.Vector3(-1.2, -0.55, -2.3), new THREE.Vector3(1.2, 1.05, 2.3));
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const rearZ = box.min.z + Math.max(0.12, size.z * 0.04);
  const nozzleY = box.min.y + size.y * 0.42;
  const nozzleX = Math.max(0.3, (size.x / 2) * 0.34);
  const nozzleCoords: [number, number, number][] = [
    [-nozzleX, nozzleY, rearZ],
    [nozzleX, nozzleY, rearZ]
  ];
  const rig = buildBoosterRig(
    nozzleCoords,
    accent,
    profile.secondaryColor,
    Math.max(0.3, (size.x / 2) * 0.21),
    Math.max(2.4, size.z * 0.66)
  );
  const engine = rig.engine;
  g.add(engine);

  // Rivals should read as opponents at a glance rather than clones of the
  // player's factory hull: tint the baked shell toward a team plate and add a
  // pair of glowing tail bands that show from the chase camera.
  if (rivalSlot !== undefined && hull) {
    const plateHex = RIVAL_PLATES[rivalSlot % RIVAL_PLATES.length];
    const plateColor = new THREE.Color(plateHex);
    hull.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const wasArray = Array.isArray(mesh.material);
      const mats: THREE.Material[] = wasArray
        ? (mesh.material as THREE.Material[])
        : [(mesh.material as THREE.Material)];
      const tinted = mats.map((m) => {
        const std = (m as THREE.MeshStandardMaterial).clone();
        std.color.lerp(plateColor, 0.3);
        return std;
      });
      mesh.material = wasArray ? tinted : tinted[0];
    });

    const bandMat = new THREE.MeshStandardMaterial({
      color: plateHex,
      emissive: plateHex,
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.35
    });
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(size.x * 0.26, size.y * 0.07, 0.05),
        bandMat
      );
      band.position.set(side * size.x * 0.24, nozzleY + size.y * 0.2, rearZ - 0.03);
      g.add(band);
    }
  }

  const accentMat = new THREE.MeshStandardMaterial({
    color: accent,
    metalness: 0.85,
    roughness: 0.2,
    emissive: accent,
    emissiveIntensity: 0.45
  });

  const repulsorCones: THREE.Mesh[] = [];
  const padScale = Math.max(0.6, size.z * 0.16);
  for (const px of [-nozzleX * 1.2, nozzleX * 1.2]) {
    const { pad, plasma } = buildRepulsorPad(accent, accentMat, 'turbine');
    pad.scale.setScalar(padScale);
    pad.position.set(px, box.min.y + 0.02, centre.z * 0.25);
    g.add(pad);
    repulsorCones.push(plasma);
  }

  const groundHalo = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 2.05, 28),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  groundHalo.rotation.x = -Math.PI / 2;
  groundHalo.position.set(0, -0.78, 0.1);
  g.add(groundHalo);

  const light = new THREE.PointLight(accent, 1.6, 30);
  light.position.set(0, 0.42, -3.2);
  g.add(light);

  g.scale.setScalar(scale);
  return {
    g,
    engine,
    boosterCores: rig.boosterCores,
    shockRings: rig.shockRings,
    repulsorCones,
    rimSpinners: [],
    groundHalo,
    light,
    accentMat,
    typeIndex: profile.id
  };
}

export function buildLuxuryHoverCar(
  typeIndex: number,
  accentHex: number,
  scale = 1.0,
  custom?: VehicleCustomization,
  rivalSlot?: number
): BuiltVehicle {
  const g = new THREE.Group();
  const profile = SHIP_PROFILES[typeIndex] || SHIP_PROFILES[0];

  if (profile.fixedLivery) {
    return buildFixedLiveryChassis(profile, accentHex, scale, rivalSlot);
  }

  const paintPreset = custom ? getPaintPreset(custom.paintId) : null;
  const neonPreset = custom ? getNeonPreset(custom.neonId) : null;
  const rimStyle: RimStyleId = custom ? custom.rimId : 'turbine';

  const activeAccentHex = neonPreset ? neonPreset.color : accentHex;
  const secondaryHex = neonPreset ? neonPreset.secondaryColor : profile.secondaryColor;

  // Per-vehicle customizable hull & trim materials when customized; rivals keep shared factory PBR materials
  const bodyPaintMat: THREE.Material = paintPreset
    ? new THREE.MeshPhysicalMaterial({
        color: paintPreset.color,
        metalness: paintPreset.metalness,
        roughness: paintPreset.roughness,
        clearcoat: paintPreset.clearcoat,
        clearcoatRoughness: 0.1
      })
    : typeIndex === 1
      ? pearlPaintMat
      : typeIndex === 3
        ? chromeMat
        : obsidianPaintMat;

  const trimMetalMat: THREE.Material = paintPreset
    ? new THREE.MeshPhysicalMaterial({
        color: paintPreset.hardwareColor,
        metalness: 0.92,
        roughness: 0.18,
        anisotropy: 0.72,
        clearcoat: 0.6
      })
    : typeIndex === 1 || typeIndex === 3
      ? chromeMat
      : champagneGoldMat;

  const secondaryBodyMat: THREE.Material = paintPreset ? bodyPaintMat : obsidianPaintMat;

  const accentMat = new THREE.MeshStandardMaterial({
    color: activeAccentHex,
    metalness: 0.85,
    roughness: 0.2,
    emissive: activeAccentHex,
    emissiveIntensity: 0.45
  });
  // Controlled emissive brightness so the player vehicle never over-blooms into a white blob
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: activeAccentHex,
    emissiveIntensity: 0.85,
    roughness: 0.15,
    metalness: 0.2
  });
  const intakeGlowMat = new THREE.MeshBasicMaterial({
    color: secondaryHex,
    transparent: true,
    opacity: 0.78
  });

  const repulsorCones: THREE.Mesh[] = [];
  const rimSpinners: THREE.Object3D[] = [];
  let engine: THREE.Object3D;
  let boosterCores: THREE.Mesh[] = [];
  let shockRings: THREE.Mesh[] = [];
  let light: THREE.PointLight;

  if (typeIndex === 0) {
    /* ================================================================
       TYPE 0: AHWOO SOVEREIGN GT (Obsidian & Champagne Gold Hover Coupe)
       Matches intro video hero car: articulated front hover outriggers,
       gold chamfer trims, bubble canopy + steering yoke, quad thrusters
       ================================================================ */
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-1.35, -2.5);
    bodyShape.lineTo(1.35, -2.5);
    bodyShape.lineTo(1.55, 0.3);
    bodyShape.lineTo(1.05, 2.55);
    bodyShape.lineTo(0, 3.08);
    bodyShape.lineTo(-1.05, 2.55);
    bodyShape.lineTo(-1.55, 0.3);
    bodyShape.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 0.62,
      bevelEnabled: true,
      bevelThickness: 0.24,
      bevelSize: 0.18,
      bevelSegments: 3
    });
    hullGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, bodyPaintMat);
    hull.position.y = 0.56;
    g.add(hull);

    // Sculpted Champagne-Gold Front Splitter & Twin Lower Vent Strakes
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.14, 1.12), trimMetalMat);
    splitter.position.set(0, -0.02, 2.55);
    g.add(splitter);

    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.22, 0.65), carbonTrimMat);
    rearDiffuser.position.set(0, -0.1, -2.42);
    g.add(rearDiffuser);

    for (let v = -2; v <= 2; v++) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.72), trimMetalMat);
      vane.position.set(v * 0.45, -0.12, -2.46);
      g.add(vane);
    }

    // Golden Hood Crest & Spine Trim
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), trimMetalMat);
    crest.scale.set(1.2, 0.35, 1.4);
    crest.position.set(0, 0.83, 2.38);
    g.add(crest);

    const hoodIntake = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.75), carbonTrimMat);
    hoodIntake.position.set(0, 0.79, 1.65);
    g.add(hoodIntake);

    // Bubble Glass Canopy + Rider inside
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.96, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
      canopyGlassMat
    );
    canopy.scale.set(0.95, 0.92, 1.75);
    canopy.position.set(0, 0.64, 0.15);
    canopy.renderOrder = 3;
    g.add(canopy);

    const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.055, 8, 28), trimMetalMat);
    canopyFrame.rotation.x = Math.PI / 2;
    canopyFrame.scale.set(0.95, 1.75, 1);
    canopyFrame.position.set(0, 0.68, 0.15);
    g.add(canopyFrame);

    const rider = buildCyberRider(activeAccentHex, trimMetalMat);
    rider.position.set(0, 0.25, 0.1);
    g.add(rider);

    // Side Aero Pontoon Wings, Articulated Front Hover Nacelles & Rear Swept Fins
    const wingGeo = makeAeroWingGeo(1.18, 2.15, 0.55);
    for (const side of [-1, 1]) {
      const sidePod = new THREE.Mesh(wingGeo, bodyPaintMat);
      sidePod.scale.x = side;
      sidePod.position.set(side * 1.15, 0.24, 0.65);
      g.add(sidePod);

      // Front angled hover outrigger nacelle
      const frontOutrigger = new THREE.Group();
      frontOutrigger.position.set(side * 1.56, 0.18, 1.88);
      frontOutrigger.rotation.y = side * 0.18;
      frontOutrigger.rotation.z = -side * 0.08;
      const podShell = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 1.58), bodyPaintMat);
      const podTrim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 1.62), trimMetalMat);
      podTrim.position.y = 0.16;
      const podVent = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.12), headlightMat);
      podVent.position.set(0, 0.02, 0.8);
      frontOutrigger.add(podShell, podTrim, podVent);
      g.add(frontOutrigger);

      // 4-Corner Hover Rim Pods (front & rear lateral mag-rims)
      const fwdRim = buildHoverRimPod(rimStyle, trimMetalMat, activeAccentHex, side, rimSpinners);
      fwdRim.position.set(side * 1.66, 0.06, 1.55);
      g.add(fwdRim);
      const rearRim = buildHoverRimPod(rimStyle, trimMetalMat, activeAccentHex, side, rimSpinners);
      rearRim.position.set(side * 1.56, 0.06, -1.55);
      g.add(rearRim);

      // Gold side trim blade & accent intake louver
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 3.2), trimMetalMat);
      blade.position.set(side * 1.62, 0.36, -0.25);
      blade.rotation.y = side * 0.08;
      g.add(blade);

      const intakeBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.45), intakeGlowMat);
      intakeBar.position.set(side * 1.66, 0.22, -0.35);
      intakeBar.rotation.y = side * 0.08;
      g.add(intakeBar);

      // Slanted LED Headlight + eyebrow accent
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.11, 0.85), headlightMat);
      headlight.position.set(side * 0.92, 0.56, 2.25);
      headlight.rotation.y = -side * 0.38;
      headlight.rotation.x = 0.2;
      g.add(headlight);

      // Rear sculpted tail fin + fin glowing vent
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.88, 1.8), trimMetalMat);
      fin.position.set(side * 1.2, 0.98, -1.75);
      fin.rotation.z = -side * 0.32;
      fin.rotation.x = 0.18;
      g.add(fin);

      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.2, 0.92), headlightMat);
      vent.position.set(side * 1.2, 0.92, -1.9);
      vent.rotation.z = -side * 0.32;
      g.add(vent);
    }

    // Quad Rear Turbine Thrusters (2x2 signature layout)
    const nozzleCoords: [number, number, number][] = [
      [-0.54, 0.68, -2.92],
      [0.54, 0.68, -2.92],
      [-0.58, 0.18, -2.92],
      [0.58, 0.18, -2.92]
    ];
    for (const [nx, ny] of nozzleCoords) {
      const bell = new THREE.Mesh(thrusterBellGeo, carbonTrimMat);
      bell.rotation.x = Math.PI / 2;
      bell.position.set(nx, ny, -2.55);
      g.add(bell);

      const nozzleTrim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 18), trimMetalMat);
      nozzleTrim.position.set(nx, ny, -2.91);
      g.add(nozzleTrim);

      const core = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), headlightMat);
      core.rotation.y = Math.PI;
      core.position.set(nx, ny, -2.92);
      g.add(core);
    }

    // Dual underbody hover repulsor pads
    for (const [px, pz] of [
      [-0.88, 1.55],
      [0.88, 1.55],
      [0, -1.75]
    ] as [number, number][]) {
      const { pad, plasma } = buildRepulsorPad(activeAccentHex, trimMetalMat, rimStyle);
      pad.position.set(px, -0.18, pz);
      g.add(pad);
      repulsorCones.push(plasma);
    }

    const rig = buildBoosterRig(nozzleCoords, activeAccentHex, secondaryHex, 0.34, 3.4);
    engine = rig.engine;
    boosterCores = rig.boosterCores;
    shockRings = rig.shockRings;
    g.add(engine);

    light = new THREE.PointLight(activeAccentHex, 1.5, 28);
    light.position.set(0, 0.45, -3.5);
    g.add(light);
  } else if (typeIndex === 1) {
    /* ================================================================
       TYPE 1: VALKYRIE AERO-S (Pearl Titanium Twin-Hull Luxury Cruiser)
       ================================================================ */
    const nozzleCoords: [number, number, number][] = [];
    for (const side of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.x = side * 1.45;

      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.65, 4.4, 8), bodyPaintMat);
      nose.rotation.x = Math.PI / 2;
      nose.scale.set(0.95, 0.72, 0.5);
      nose.position.z = 1.65;
      pod.add(nose);

      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.68, 3.6), custom ? trimMetalMat : obsidianPaintMat);
      hull.position.set(0, 0.15, -0.4);
      pod.add(hull);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 3.7), headlightMat);
      stripe.position.set(side * 0.48, 0.34, -0.2);
      pod.add(stripe);

      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.14), intakeGlowMat);
      intake.position.set(0, 0.14, 1.44);
      pod.add(intake);

      const wing = new THREE.Mesh(makeAeroWingGeo(1.18, 1.68, 0.45), bodyPaintMat);
      wing.scale.x = side;
      wing.position.set(side * 0.42, 0.18, 0.3);
      pod.add(wing);

      const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 1.15), trimMetalMat);
      winglet.position.set(side * 1.5, 0.48, -0.65);
      winglet.rotation.z = -side * 0.22;
      pod.add(winglet);

      const fwdRim = buildHoverRimPod(rimStyle, trimMetalMat, activeAccentHex, side, rimSpinners);
      fwdRim.position.set(side * 0.56, 0.04, 1.25);
      pod.add(fwdRim);
      const rearRim = buildHoverRimPod(rimStyle, trimMetalMat, activeAccentHex, side, rimSpinners);
      rearRim.position.set(side * 0.56, 0.04, -1.25);
      pod.add(rearRim);

      const bell = new THREE.Mesh(thrusterBellGeo, trimMetalMat);
      bell.rotation.x = Math.PI / 2;
      bell.scale.setScalar(0.88);
      bell.position.set(0, 0.2, -2.25);
      pod.add(bell);

      const core = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), headlightMat);
      core.rotation.y = Math.PI;
      core.position.set(0, 0.2, -2.56);
      pod.add(core);

      const { pad, plasma } = buildRepulsorPad(activeAccentHex, trimMetalMat, rimStyle);
      pad.scale.setScalar(0.82);
      pad.position.set(0, -0.18, 0.4);
      pod.add(pad);
      repulsorCones.push(plasma);

      nozzleCoords.push([side * 1.45, 0.2, -2.58]);
      g.add(pod);
    }

    // Forward stabilizer crossbeam & splitter
    const fwdBeam = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.56), trimMetalMat);
    fwdBeam.position.set(0, 0.04, 1.85);
    g.add(fwdBeam);

    // Central luxury bridge & induction core
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 2.0), bodyPaintMat);
    bridge.position.set(0, 0.26, -0.2);
    g.add(bridge);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
      canopyGlassMat
    );
    canopy.scale.set(0.9, 0.85, 1.6);
    canopy.position.set(0, 0.42, 0.05);
    canopy.renderOrder = 3;
    g.add(canopy);

    const rider = buildCyberRider(activeAccentHex, trimMetalMat);
    rider.scale.setScalar(0.86);
    rider.position.set(0, 0.15, 0.0);
    g.add(rider);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.07, 8, 28), accentMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 0.32, -0.2);
    g.add(halo);

    const rig = buildBoosterRig(nozzleCoords, activeAccentHex, secondaryHex, 0.32, 3.2);
    engine = rig.engine;
    boosterCores = rig.boosterCores;
    shockRings = rig.shockRings;
    g.add(engine);

    light = new THREE.PointLight(activeAccentHex, 1.4, 28);
    light.position.set(0, 0.25, -3.2);
    g.add(light);
  } else if (typeIndex === 2) {
    /* ================================================================
       TYPE 2: NOCTIS PHANTOM IX (Stealth Carbon & Rose-Gold Delta GT)
       ================================================================ */
    const deltaShape = new THREE.Shape();
    deltaShape.moveTo(0, 3.25);
    deltaShape.lineTo(2.48, -1.9);
    deltaShape.lineTo(1.2, -2.55);
    deltaShape.lineTo(-1.2, -2.55);
    deltaShape.lineTo(-2.48, -1.9);
    deltaShape.closePath();

    const deltaGeo = new THREE.ExtrudeGeometry(deltaShape, {
      depth: 0.48,
      bevelEnabled: true,
      bevelThickness: 0.2,
      bevelSize: 0.16,
      bevelSegments: 2
    });
    deltaGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(deltaGeo, bodyPaintMat);
    hull.position.y = 0.44;
    g.add(hull);

    const spine = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.56, 3.4), carbonTrimMat);
    spine.position.set(0, 0.55, -0.45);
    g.add(spine);

    const noseCanard = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.1, 0.65), trimMetalMat);
    noseCanard.position.set(0, 0.14, 2.55);
    g.add(noseCanard);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.84, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
      canopyGlassMat
    );
    canopy.scale.set(0.95, 0.88, 1.7);
    canopy.position.set(0, 0.62, 0.25);
    canopy.renderOrder = 3;
    g.add(canopy);

    const rider = buildCyberRider(secondaryHex, trimMetalMat);
    rider.scale.setScalar(0.9);
    rider.position.set(0, 0.24, 0.2);
    g.add(rider);

    for (const side of [-1, 1]) {
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 3.6), trimMetalMat);
      splitter.position.set(side * 1.4, 0.4, -0.2);
      splitter.rotation.y = side * 0.36;
      g.add(splitter);

      const frontLaser = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 1.0), headlightMat);
      frontLaser.position.set(side * 0.8, 0.45, 2.05);
      frontLaser.rotation.y = side * 0.34;
      g.add(frontLaser);

      const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 1.5), bodyPaintMat);
      winglet.position.set(side * 2.35, 0.68, -1.55);
      winglet.rotation.z = -side * 0.2;
      g.add(winglet);

      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.14), headlightMat);
      blade.position.set(side * 2.35, 0.68, -0.82);
      blade.rotation.z = -side * 0.2;
      g.add(blade);

      const fwdRim = buildHoverRimPod(rimStyle, trimMetalMat, activeAccentHex, side, rimSpinners);
      fwdRim.position.set(side * 1.44, 0.06, 0.98);
      g.add(fwdRim);
      const rearRim = buildHoverRimPod(rimStyle, trimMetalMat, activeAccentHex, side, rimSpinners);
      rearRim.position.set(side * 2.12, 0.08, -1.62);
      g.add(rearRim);

      const { pad, plasma } = buildRepulsorPad(activeAccentHex, trimMetalMat, rimStyle);
      pad.position.set(side * 1.3, -0.15, -0.9);
      g.add(pad);
      repulsorCones.push(plasma);
    }

    const nozzleCoords: [number, number, number][] = [
      [0, 0.44, -2.98],
      [-0.86, 0.34, -2.72],
      [0.86, 0.34, -2.72]
    ];

    const bigBell = new THREE.Mesh(thrusterBellGeo, trimMetalMat);
    bigBell.rotation.x = Math.PI / 2;
    bigBell.scale.set(1.75, 1.35, 1.75);
    bigBell.position.set(0, 0.42, -2.55);
    g.add(bigBell);

    for (const side of [-1, 1]) {
      const auxBell = new THREE.Mesh(thrusterBellGeo, carbonTrimMat);
      auxBell.rotation.x = Math.PI / 2;
      auxBell.scale.setScalar(0.85);
      auxBell.position.set(side * 0.86, 0.34, -2.42);
      g.add(auxBell);
    }

    const frontPad = buildRepulsorPad(activeAccentHex, trimMetalMat, rimStyle);
    frontPad.pad.position.set(0, -0.15, 1.75);
    g.add(frontPad.pad);
    repulsorCones.push(frontPad.plasma);

    const rig = buildBoosterRig(nozzleCoords, activeAccentHex, secondaryHex, 0.42, 3.6);
    engine = rig.engine;
    boosterCores = rig.boosterCores;
    shockRings = rig.shockRings;
    g.add(engine);

    light = new THREE.PointLight(activeAccentHex, 1.6, 30);
    light.position.set(0, 0.42, -3.5);
    g.add(light);
  } else {
    /* ================================================================
       TYPE 3: AURORA APEX V (Liquid Chrome & Violet Quad-Foil Roadster)
       ================================================================ */
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.78, 3.6, 8, 16), bodyPaintMat);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1.15, 1, 0.68);
    body.position.set(0, 0.34, 0.1);
    g.add(body);

    const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 2.2), secondaryBodyMat);
    cowl.position.set(0, 0.56, 1.15);
    g.add(cowl);

    const noseSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 0.95), trimMetalMat);
    noseSplitter.position.set(0, 0.06, 2.38);
    g.add(noseSplitter);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.78, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.54),
      canopyGlassMat
    );
    canopy.scale.set(0.92, 0.85, 1.55);
    canopy.position.set(0, 0.58, 0.12);
    canopy.renderOrder = 3;
    g.add(canopy);

    const rider = buildCyberRider(activeAccentHex, trimMetalMat);
    rider.scale.setScalar(0.88);
    rider.position.set(0, 0.22, 0.08);
    g.add(rider);

    const upperWingGeo = makeAeroWingGeo(1.75, 1.4, 0.35);
    const lowerWingGeo = makeAeroWingGeo(1.65, 1.3, 0.35);
    const nozzleCoords: [number, number, number][] = [];
    for (const side of [-1, 1]) {
      const upWing = new THREE.Mesh(upperWingGeo, trimMetalMat);
      upWing.scale.x = side;
      upWing.position.set(side * 0.6, 0.64, -0.3);
      upWing.rotation.z = side * 0.26;
      g.add(upWing);

      const dnWing = new THREE.Mesh(lowerWingGeo, bodyPaintMat);
      dnWing.scale.x = side;
      dnWing.position.set(side * 0.6, 0.14, -0.3);
      dnWing.rotation.z = -side * 0.22;
      g.add(dnWing);

      const rearFin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, 1.35), secondaryBodyMat);
      rearFin.position.set(side * 0.76, 0.72, -1.55);
      rearFin.rotation.z = -side * 0.24;
      g.add(rearFin);

      const fwdRim = buildHoverRimPod(rimStyle, trimMetalMat, activeAccentHex, side, rimSpinners);
      fwdRim.position.set(side * 1.42, 0.04, 1.25);
      g.add(fwdRim);
      const rearRim = buildHoverRimPod(rimStyle, trimMetalMat, activeAccentHex, side, rimSpinners);
      rearRim.position.set(side * 1.48, 0.06, -1.25);
      g.add(rearRim);

      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.5, 10), accentMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(side * 2.25, 0.82, -0.95);
      g.add(coil);

      const lowerCoil = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.35, 10), intakeGlowMat);
      lowerCoil.rotation.x = Math.PI / 2;
      lowerCoil.position.set(side * 2.15, -0.04, -0.95);
      g.add(lowerCoil);

      const bell = new THREE.Mesh(thrusterBellGeo, carbonTrimMat);
      bell.rotation.x = Math.PI / 2;
      bell.position.set(side * 0.58, 0.34, -2.05);
      g.add(bell);

      const { pad, plasma } = buildRepulsorPad(activeAccentHex, trimMetalMat, rimStyle);
      pad.position.set(side * 0.9, -0.18, 1.0);
      g.add(pad);
      repulsorCones.push(plasma);

      nozzleCoords.push([side * 0.58, 0.34, -2.42]);
    }

    const rearPad = buildRepulsorPad(secondaryHex, trimMetalMat, rimStyle);
    rearPad.pad.position.set(0, -0.18, -1.6);
    g.add(rearPad.pad);
    repulsorCones.push(rearPad.plasma);

    const rig = buildBoosterRig(nozzleCoords, activeAccentHex, secondaryHex, 0.34, 3.3);
    engine = rig.engine;
    boosterCores = rig.boosterCores;
    shockRings = rig.shockRings;
    g.add(engine);

    light = new THREE.PointLight(activeAccentHex, 1.5, 28);
    light.position.set(0, 0.34, -3.2);
    g.add(light);
  }

  // Subtle calibrated underbody hover projection ring
  const groundHalo = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 2.05, 28),
    new THREE.MeshBasicMaterial({
      color: activeAccentHex,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  groundHalo.rotation.x = -Math.PI / 2;
  groundHalo.position.set(0, -0.78, 0.1);
  g.add(groundHalo);

  g.scale.setScalar(scale);
  return {
    g,
    engine,
    boosterCores,
    shockRings,
    repulsorCones,
    rimSpinners,
    groundHalo,
    light,
    accentMat,
    typeIndex
  };
}

export function frameChassis(g: THREE.Group, target = 3.4): THREE.Group {
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const k = target / (Math.max(size.x, size.y, size.z) || 1);
  g.scale.multiplyScalar(k);
  g.position.copy(centre).multiplyScalar(-k);
  g.position.y -= 0.12;
  return g;
}
