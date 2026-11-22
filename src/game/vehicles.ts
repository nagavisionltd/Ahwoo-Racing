import * as THREE from 'three';
import type { ShipProfile } from './types';

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
  }
];

// Shared luxury PBR materials
const obsidianPaintMat = new THREE.MeshPhysicalMaterial({
  color: 0x10131e,
  metalness: 0.72,
  roughness: 0.22,
  clearcoat: 1.0,
  clearcoatRoughness: 0.08
});

const pearlPaintMat = new THREE.MeshPhysicalMaterial({
  color: 0xe6edf8,
  metalness: 0.48,
  roughness: 0.2,
  clearcoat: 1.0,
  clearcoatRoughness: 0.06
});

const carbonTrimMat = new THREE.MeshStandardMaterial({
  color: 0x171b26,
  metalness: 0.35,
  roughness: 0.68
});

const champagneGoldMat = new THREE.MeshPhysicalMaterial({
  color: 0xe5b858,
  metalness: 0.94,
  roughness: 0.16,
  anisotropy: 0.8,
  clearcoat: 0.65
});

const chromeMat = new THREE.MeshPhysicalMaterial({
  color: 0xd8e4f5,
  metalness: 0.96,
  roughness: 0.12,
  anisotropy: 0.7
});

const canopyGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0x13223b,
  metalness: 0.15,
  roughness: 0.06,
  transparent: true,
  opacity: 0.42,
  clearcoat: 1.0,
  depthWrite: false
});

const jacketCreamMat = new THREE.MeshStandardMaterial({
  color: 0xebe6dc,
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

function makeThrusterBellGeo(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0.05, 0),
    new THREE.Vector2(0.34, 0),
    new THREE.Vector2(0.38, 0.2),
    new THREE.Vector2(0.28, 0.55),
    new THREE.Vector2(0.32, 0.75),
    new THREE.Vector2(0.05, 0.75)
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

/** Builds the stylized Cyber-Gold Rider seated in the cockpit. */
function buildCyberRider(accentHex: number): THREE.Group {
  const rider = new THREE.Group();

  // Jacketed torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.62, 10), jacketCreamMat);
  torso.position.set(0, 0.34, 0);
  rider.add(torso);

  // Gold shoulder collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.06, 8, 16), champagneGoldMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.62, 0);
  rider.add(collar);

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
    new THREE.BoxGeometry(0.26, 0.03, 0.12),
    new THREE.MeshBasicMaterial({ color: accentHex, toneMapped: false })
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

/** Builds a hovering repulsor pad under the chassis. */
function buildRepulsorPad(accentHex: number): THREE.Group {
  const pad = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.14, 16), carbonTrimMat);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.05, 8, 20),
    new THREE.MeshBasicMaterial({ color: accentHex, toneMapped: false })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.06;

  const plasma = new THREE.Mesh(
    new THREE.ConeGeometry(0.44, 0.72, 14),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })
  );
  plasma.rotation.x = Math.PI;
  plasma.position.y = -0.38;
  pad.add(housing, rim, plasma);
  return pad;
}

export interface BuiltVehicle {
  g: THREE.Group;
  engine: THREE.Mesh;
  light: THREE.PointLight;
  accentMat: THREE.MeshStandardMaterial;
  typeIndex: number;
}

export function buildLuxuryHoverCar(typeIndex: number, accentHex: number, scale = 1.0): BuiltVehicle {
  const g = new THREE.Group();
  const profile = SHIP_PROFILES[typeIndex] || SHIP_PROFILES[0];
  const secondaryHex = profile.secondaryColor;

  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    metalness: 0.85,
    roughness: 0.18,
    emissive: accentHex,
    emissiveIntensity: 0.65
  });
  const neonMat = new THREE.MeshBasicMaterial({ color: accentHex, toneMapped: false });
  const secNeonMat = new THREE.MeshBasicMaterial({ color: secondaryHex, toneMapped: false });

  let engine: THREE.Mesh;
  let light: THREE.PointLight;

  if (typeIndex === 0) {
    /* ================================================================
       TYPE 0: AHWOO SOVEREIGN GT (Obsidian & Champagne Gold Hover Coupe)
       Matches the uploaded turntable & video hero hover supercar
       ================================================================ */
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-1.35, -2.5);
    bodyShape.lineTo(1.35, -2.5);
    bodyShape.lineTo(1.55, 0.3);
    bodyShape.lineTo(1.05, 2.55);
    bodyShape.lineTo(0, 3.05);
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
    const hull = new THREE.Mesh(hullGeo, obsidianPaintMat);
    hull.position.y = 0.56;
    g.add(hull);

    // Sculpted Champagne-Gold Front Splitter & Aero Cheek Blades
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 1.1), champagneGoldMat);
    splitter.position.set(0, -0.02, 2.55);
    g.add(splitter);

    // Golden Hood Crest & Spine Trim
    const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), champagneGoldMat);
    crest.scale.set(1.2, 0.35, 1.4);
    crest.position.set(0, 0.82, 2.35);
    g.add(crest);

    // Bubble Glass Canopy + Rider inside
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.96, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), canopyGlassMat);
    canopy.scale.set(0.95, 0.92, 1.75);
    canopy.position.set(0, 0.64, 0.15);
    canopy.renderOrder = 3;
    g.add(canopy);

    const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.055, 8, 28), champagneGoldMat);
    canopyFrame.rotation.x = Math.PI / 2;
    canopyFrame.scale.set(0.95, 1.75, 1);
    canopyFrame.position.set(0, 0.68, 0.15);
    g.add(canopyFrame);

    const rider = buildCyberRider(accentHex);
    rider.position.set(0, 0.25, 0.1);
    g.add(rider);

    // Side Aero Pontoon Wings, Headlight Blades & Rear Swept Fins
    const wingGeo = makeAeroWingGeo(1.15, 2.1, 0.55);
    for (const side of [-1, 1]) {
      const sidePod = new THREE.Mesh(wingGeo, obsidianPaintMat);
      sidePod.scale.x = side;
      sidePod.position.set(side * 1.15, 0.24, 0.65);
      g.add(sidePod);

      // Gold side trim blade
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 3.2), champagneGoldMat);
      blade.position.set(side * 1.62, 0.36, -0.25);
      blade.rotation.y = side * 0.08;
      g.add(blade);

      // Slanted LED Headlight
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.85), neonMat);
      headlight.position.set(side * 0.92, 0.56, 2.25);
      headlight.rotation.y = -side * 0.38;
      headlight.rotation.x = 0.2;
      g.add(headlight);

      // Rear sculpted tail fin
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 1.75), champagneGoldMat);
      fin.position.set(side * 1.18, 0.96, -1.75);
      fin.rotation.z = -side * 0.32;
      fin.rotation.x = 0.18;
      g.add(fin);

      // Fin glowing vent
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.9), neonMat);
      vent.position.set(side * 1.18, 0.92, -1.9);
      vent.rotation.z = -side * 0.32;
      g.add(vent);
    }

    // Quad Rear Turbine Thrusters (2x2 signature layout from turntable art)
    const nozzleCoords: [number, number][] = [
      [-0.52, 0.68],
      [0.52, 0.68],
      [-0.56, 0.18],
      [0.56, 0.18]
    ];
    for (const [nx, ny] of nozzleCoords) {
      const bell = new THREE.Mesh(thrusterBellGeo, carbonTrimMat);
      bell.rotation.x = Math.PI / 2;
      bell.position.set(nx, ny, -2.55);
      g.add(bell);

      const core = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), neonMat);
      core.rotation.y = Math.PI;
      core.position.set(nx, ny, -2.92);
      g.add(core);
    }

    // Dual underbody hover repulsor pads
    for (const [px, pz] of [
      [-0.85, 1.5],
      [0.85, 1.5],
      [0, -1.75]
    ] as [number, number][]) {
      const pad = buildRepulsorPad(accentHex);
      pad.position.set(px, -0.18, pz);
      g.add(pad);
    }

    engine = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 4.2, 14),
      new THREE.MeshBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    engine.rotation.x = -Math.PI / 2;
    engine.position.set(0, 0.42, -4.65);
    g.add(engine);

    light = new THREE.PointLight(accentHex, 2.4, 42);
    light.position.set(0, 0.45, -3.5);
    g.add(light);
  } else if (typeIndex === 1) {
    /* ================================================================
       TYPE 1: VALKYRIE AERO-S (Pearl Titanium Twin-Hull Luxury Cruiser)
       ================================================================ */
    for (const side of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.x = side * 1.45;

      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.65, 4.4, 8), pearlPaintMat);
      nose.rotation.x = Math.PI / 2;
      nose.scale.set(0.95, 0.72, 0.5);
      nose.position.z = 1.65;
      pod.add(nose);

      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.68, 3.6), obsidianPaintMat);
      hull.position.set(0, 0.15, -0.4);
      pod.add(hull);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 3.7), neonMat);
      stripe.position.set(side * 0.48, 0.34, -0.2);
      pod.add(stripe);

      const wing = new THREE.Mesh(makeAeroWingGeo(1.15, 1.65, 0.45), pearlPaintMat);
      wing.scale.x = side;
      wing.position.set(side * 0.42, 0.18, 0.3);
      pod.add(wing);

      const bell = new THREE.Mesh(thrusterBellGeo, chromeMat);
      bell.rotation.x = Math.PI / 2;
      bell.scale.setScalar(0.85);
      bell.position.set(0, 0.2, -2.25);
      pod.add(bell);

      const pad = buildRepulsorPad(accentHex);
      pad.scale.setScalar(0.82);
      pad.position.set(0, -0.18, 0.4);
      pod.add(pad);

      g.add(pod);
    }

    // Central luxury bridge & induction core
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 2.0), pearlPaintMat);
    bridge.position.set(0, 0.26, -0.2);
    g.add(bridge);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.82, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), canopyGlassMat);
    canopy.scale.set(0.9, 0.85, 1.6);
    canopy.position.set(0, 0.42, 0.05);
    g.add(canopy);

    const rider = buildCyberRider(accentHex);
    rider.scale.setScalar(0.86);
    rider.position.set(0, 0.15, 0.0);
    g.add(rider);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.08, 8, 28), neonMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 0.32, -0.2);
    g.add(halo);

    engine = new THREE.Mesh(
      new THREE.ConeGeometry(0.56, 3.8, 12),
      new THREE.MeshBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    engine.rotation.x = -Math.PI / 2;
    engine.position.set(0, 0.25, -4.1);
    g.add(engine);

    light = new THREE.PointLight(accentHex, 2.2, 42);
    light.position.set(0, 0.25, -3.2);
    g.add(light);
  } else if (typeIndex === 2) {
    /* ================================================================
       TYPE 2: NOCTIS PHANTOM IX (Stealth Carbon & Rose-Gold Delta GT)
       ================================================================ */
    const deltaShape = new THREE.Shape();
    deltaShape.moveTo(0, 3.2);
    deltaShape.lineTo(2.45, -1.9);
    deltaShape.lineTo(1.2, -2.55);
    deltaShape.lineTo(-1.2, -2.55);
    deltaShape.lineTo(-2.45, -1.9);
    deltaShape.closePath();

    const deltaGeo = new THREE.ExtrudeGeometry(deltaShape, {
      depth: 0.48,
      bevelEnabled: true,
      bevelThickness: 0.2,
      bevelSize: 0.16,
      bevelSegments: 2
    });
    deltaGeo.rotateX(Math.PI / 2);
    const hull = new THREE.Mesh(deltaGeo, obsidianPaintMat);
    hull.position.y = 0.44;
    g.add(hull);

    const spine = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.56, 3.4), carbonTrimMat);
    spine.position.set(0, 0.55, -0.45);
    g.add(spine);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.84, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), canopyGlassMat);
    canopy.scale.set(0.95, 0.88, 1.7);
    canopy.position.set(0, 0.62, 0.25);
    g.add(canopy);

    const rider = buildCyberRider(secondaryHex);
    rider.scale.setScalar(0.9);
    rider.position.set(0, 0.24, 0.2);
    g.add(rider);

    for (const side of [-1, 1]) {
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 3.6), champagneGoldMat);
      splitter.position.set(side * 1.4, 0.4, -0.2);
      splitter.rotation.y = side * 0.36;
      g.add(splitter);

      const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 1.5), obsidianPaintMat);
      winglet.position.set(side * 2.35, 0.68, -1.55);
      winglet.rotation.z = -side * 0.2;
      g.add(winglet);

      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.16), neonMat);
      blade.position.set(side * 2.35, 0.68, -0.82);
      blade.rotation.z = -side * 0.2;
      g.add(blade);

      const pad = buildRepulsorPad(accentHex);
      pad.position.set(side * 1.3, -0.15, -0.9);
      g.add(pad);
    }

    const bigBell = new THREE.Mesh(thrusterBellGeo, champagneGoldMat);
    bigBell.rotation.x = Math.PI / 2;
    bigBell.scale.set(1.8, 1.4, 1.8);
    bigBell.position.set(0, 0.42, -2.55);
    g.add(bigBell);

    const frontPad = buildRepulsorPad(accentHex);
    frontPad.position.set(0, -0.15, 1.75);
    g.add(frontPad);

    engine = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 4.6, 14),
      new THREE.MeshBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    engine.rotation.x = -Math.PI / 2;
    engine.position.set(0, 0.42, -4.8);
    g.add(engine);

    light = new THREE.PointLight(accentHex, 2.5, 45);
    light.position.set(0, 0.42, -3.5);
    g.add(light);
  } else {
    /* ================================================================
       TYPE 3: AURORA APEX V (Liquid Chrome & Violet Quad-Foil Roadster)
       ================================================================ */
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.78, 3.6, 8, 16), chromeMat);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1.15, 1, 0.68);
    body.position.set(0, 0.34, 0.1);
    g.add(body);

    const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 2.2), obsidianPaintMat);
    cowl.position.set(0, 0.56, 1.15);
    g.add(cowl);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.54), canopyGlassMat);
    canopy.scale.set(0.92, 0.85, 1.55);
    canopy.position.set(0, 0.58, 0.12);
    g.add(canopy);

    const rider = buildCyberRider(accentHex);
    rider.scale.setScalar(0.88);
    rider.position.set(0, 0.22, 0.08);
    g.add(rider);

    const upperWingGeo = makeAeroWingGeo(1.75, 1.4, 0.35);
    const lowerWingGeo = makeAeroWingGeo(1.65, 1.3, 0.35);
    for (const side of [-1, 1]) {
      const upWing = new THREE.Mesh(upperWingGeo, chromeMat);
      upWing.scale.x = side;
      upWing.position.set(side * 0.6, 0.64, -0.3);
      upWing.rotation.z = side * 0.26;
      g.add(upWing);

      const dnWing = new THREE.Mesh(lowerWingGeo, obsidianPaintMat);
      dnWing.scale.x = side;
      dnWing.position.set(side * 0.6, 0.14, -0.3);
      dnWing.rotation.z = -side * 0.22;
      g.add(dnWing);

      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.5, 10), neonMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(side * 2.25, 0.82, -0.95);
      g.add(coil);

      const lowerCoil = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.35, 10), secNeonMat);
      lowerCoil.rotation.x = Math.PI / 2;
      lowerCoil.position.set(side * 2.15, -0.04, -0.95);
      g.add(lowerCoil);

      const bell = new THREE.Mesh(thrusterBellGeo, carbonTrimMat);
      bell.rotation.x = Math.PI / 2;
      bell.position.set(side * 0.58, 0.34, -2.05);
      g.add(bell);

      const pad = buildRepulsorPad(accentHex);
      pad.position.set(side * 0.9, -0.18, 1.0);
      g.add(pad);
    }

    const rearPad = buildRepulsorPad(secondaryHex);
    rearPad.position.set(0, -0.18, -1.6);
    g.add(rearPad);

    engine = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 4.2, 12),
      new THREE.MeshBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );
    engine.rotation.x = -Math.PI / 2;
    engine.position.set(0, 0.34, -4.35);
    g.add(engine);

    light = new THREE.PointLight(accentHex, 2.3, 42);
    light.position.set(0, 0.34, -3.2);
    g.add(light);
  }

  g.scale.setScalar(scale);
  return { g, engine, light, accentMat, typeIndex };
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
