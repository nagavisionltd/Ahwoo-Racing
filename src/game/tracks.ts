import * as THREE from 'three';
import type {
  ElevationModel,
  FeatureSpec,
  FeatureType,
  JumpSpec,
  LevelDef,
  TrackAudit,
  TrackData,
  TrackFrame
} from './types';

function xyz(rows: [number, number, number][]): THREE.Vector3[] {
  return rows.map(([x, y, z]) => new THREE.Vector3(x, y, z));
}

function neonPoints(): THREE.Vector3[] {
  return xyz([
    [-1500, 30, -2100], [-400, 30, -2150], [700, 20, -2100], [1650, 10, -1950],
    [2250, 0, -1350], [2350, 5, -550], [2350, 20, 250], [2320, 30, 1050],
    [2120, 20, 1650], [1480, 5, 1960], [650, 15, 1850], [0, 30, 2060],
    [-850, 20, 2150], [-1650, 0, 1850], [-2180, -10, 1180], [-2280, 15, 380],
    [-2260, 30, -420], [-2220, 20, -1200], [-1920, 30, -1850]
  ]);
}

function beachPoints(): THREE.Vector3[] {
  return xyz([
    [-2000, 10, -1000], [-1500, 25, -1700], [-600, 20, -1950], [300, 10, -1650],
    [1150, 5, -1520], [1900, 15, -1720], [2400, 20, -1420], [2620, 25, -720],
    [2380, 10, 250], [1820, 5, 1120], [920, 15, 1820], [-250, 20, 2140],
    [-1300, 10, 1950], [-1950, 25, 1300], [-2250, 15, 300]
  ]);
}

function spacePoints(): THREE.Vector3[] {
  return xyz([
    [-2400, 55, 0], [-2200, 20, -900], [-1500, -25, -1520], [-500, 35, -1760],
    [600, 80, -1540], [1550, 40, -1720], [2320, -15, -1080], [2580, 25, -200],
    [2220, 70, 700], [1420, 20, 1340], [500, -35, 1180], [-320, 25, 1700],
    [-1220, 65, 2040], [-2020, 20, 1520]
  ]);
}

function spaceBeachPoints(): THREE.Vector3[] {
  return xyz([
    [-3400, 38, 2600],
    [-2750, 34, 2100],
    [-2150, 26, 1400],
    [-1600, -35, 700],
    [-1050, -104, 220],
    [-350, -112, 480],
    [350, -108, 1080],
    [1000, -98, 1580],
    [1650, -10, 1620],
    [2150, 32, 1050],
    [2100, 36, 150],
    [1750, -32, -700],
    [1480, -116, -1500],
    [1950, -120, -2250],
    [2750, -100, -2600],
    [3450, 14, -2380],
    [3950, 44, -1850],
    [4350, 46, -1350]
  ]);
}

interface VortexSpiralMeta {
  name: string;
  cn: string;
  centerX: number;
  centerZ: number;
  topY: number;
  bottomY: number;
  startR: number;
  endR: number;
  clockwise: boolean;
  ptStartIdx: number;
  ptEndIdx: number;
}

function buildVortexLayout(): { points: THREE.Vector3[]; spirals: VortexSpiralMeta[] } {
  const pts: THREE.Vector3[] = [];
  const spirals: VortexSpiralMeta[] = [];

  const appendSpiral = (
    name: string,
    cn: string,
    cx: number,
    cz: number,
    startAng: number,
    sweepRad: number,
    startR: number,
    endR: number,
    startY: number,
    endY: number,
    segs: number
  ) => {
    const ptStartIdx = pts.length;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const easeY = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
      const ang = startAng + sweepRad * k;
      const r = startR + (endR - startR) * k;
      const y = startY + (endY - startY) * easeY;
      pts.push(new THREE.Vector3(cx + r * Math.cos(ang), y, cz + r * Math.sin(ang)));
    }
    const ptEndIdx = pts.length - 1;
    spirals.push({
      name,
      cn,
      centerX: cx,
      centerZ: cz,
      topY: startY,
      bottomY: endY,
      startR,
      endR,
      clockwise: sweepRad > 0,
      ptStartIdx,
      ptEndIdx
    });
    const endAng = startAng + sweepRad;
    // Outgoing unit XZ tangent: (+sin, -cos) when CCW (sweepRad < 0), (-sin, +cos) when CW (sweepRad > 0)
    const dir = sweepRad > 0 ? 1 : -1;
    const tx = dir * -Math.sin(endAng);
    const tz = dir * Math.cos(endAng);
    const ex = cx + endR * Math.cos(endAng);
    const ez = cz + endR * Math.sin(endAng);
    return { ex, ez, ey: endY, tx, tz };
  };

  // Launch straight heading East (+X) at Y = +680
  const c1x = -2900;
  const c1z = -1500;
  const r1Start = 940;
  pts.push(new THREE.Vector3(c1x - 1400, 690, c1z + r1Start));
  pts.push(new THREE.Vector3(c1x - 700, 686, c1z + r1Start));

  // HELIX I — Upper Cyclone (290 deg CCW downward plunge: +680 -> +260)
  const s1 = appendSpiral(
    'UPPER CYCLONE',
    '上层气旋螺旋',
    c1x,
    c1z,
    Math.PI * 0.5,
    -(290 * Math.PI) / 180,
    r1Start,
    540,
    680,
    260,
    12
  );

  // Chasm Bridge 1 & Mega-Jump toward Helix II
  const b1Len = 2250;
  pts.push(new THREE.Vector3(s1.ex + s1.tx * 520, 250, s1.ez + s1.tz * 520));
  pts.push(new THREE.Vector3(s1.ex + s1.tx * 1180, 225, s1.ez + s1.tz * 1180));
  pts.push(new THREE.Vector3(s1.ex + s1.tx * 1760, 200, s1.ez + s1.tz * 1760));
  const h2EntryX = s1.ex + s1.tx * b1Len;
  const h2EntryZ = s1.ez + s1.tz * b1Len;

  // Align CW Helix II center smoothly perpendicular to incoming bridge tangent
  const r2Start = 960;
  const h2StartAng = Math.atan2(-s1.tx, s1.tz);
  const c2x = h2EntryX - r2Start * Math.cos(h2StartAng);
  const c2z = h2EntryZ - r2Start * Math.sin(h2StartAng);

  // HELIX II — Twin Maelstrom (290 deg CW reverse plunge: +185 -> -245)
  const s2 = appendSpiral(
    'TWIN MAELSTROM',
    '双生漩涡螺旋',
    c2x,
    c2z,
    h2StartAng,
    (290 * Math.PI) / 180,
    r2Start,
    540,
    185,
    -245,
    12
  );

  // Hyper-Velocity Abyss Straight + Corkscrew Connector toward Helix III
  const b2Len = 2900;
  pts.push(new THREE.Vector3(s2.ex + s2.tx * 560, -252, s2.ez + s2.tz * 560));
  pts.push(new THREE.Vector3(s2.ex + s2.tx * 1450, -258, s2.ez + s2.tz * 1450));
  pts.push(new THREE.Vector3(s2.ex + s2.tx * 2280, -264, s2.ez + s2.tz * 2280));
  const h3EntryX = s2.ex + s2.tx * b2Len;
  const h3EntryZ = s2.ez + s2.tz * b2Len;

  // Align CCW Helix III center perpendicular to incoming tangent
  const r3Start = 980;
  const h3StartAng = Math.atan2(s2.tx, -s2.tz);
  const c3x = h3EntryX - r3Start * Math.cos(h3StartAng);
  const c3z = h3EntryZ - r3Start * Math.sin(h3StartAng);

  // HELIX III — Singularity Core (295 deg CCW deep plunge: -270 -> -670)
  const s3 = appendSpiral(
    'SINGULARITY CORE',
    '奇点深渊螺旋',
    c3x,
    c3z,
    h3StartAng,
    -(295 * Math.PI) / 180,
    r3Start,
    530,
    -270,
    -670,
    12
  );

  // Final Abyss Core Finish Straight
  pts.push(new THREE.Vector3(s3.ex + s3.tx * 520, -678, s3.ez + s3.tz * 520));
  pts.push(new THREE.Vector3(s3.ex + s3.tx * 1160, -682, s3.ez + s3.tz * 1160));
  pts.push(new THREE.Vector3(s3.ex + s3.tx * 1760, -682, s3.ez + s3.tz * 1760));

  return { points: pts, spirals };
}

const VORTEX_LAYOUT = buildVortexLayout();

function buildGauntletLayout(): { points: THREE.Vector3[]; spirals: VortexSpiralMeta[] } {
  const pts: THREE.Vector3[] = [];
  const spirals: VortexSpiralMeta[] = [];

  const appendSpiral = (
    name: string,
    cn: string,
    cx: number,
    cz: number,
    startAng: number,
    sweepRad: number,
    startR: number,
    endR: number,
    startY: number,
    endY: number,
    segs: number
  ) => {
    const ptStartIdx = pts.length;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const easeY = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
      const ang = startAng + sweepRad * k;
      const r = startR + (endR - startR) * k;
      const y = startY + (endY - startY) * easeY;
      pts.push(new THREE.Vector3(cx + r * Math.cos(ang), y, cz + r * Math.sin(ang)));
    }
    const ptEndIdx = pts.length - 1;
    spirals.push({
      name,
      cn,
      centerX: cx,
      centerZ: cz,
      topY: startY,
      bottomY: endY,
      startR,
      endR,
      clockwise: sweepRad > 0,
      ptStartIdx,
      ptEndIdx
    });
    const endAng = startAng + sweepRad;
    const dir = sweepRad > 0 ? 1 : -1;
    const tx = dir * -Math.sin(endAng);
    const tz = dir * Math.cos(endAng);
    const ex = cx + endR * Math.cos(endAng);
    const ez = cz + endR * Math.sin(endAng);
    return { ex, ez, ey: endY, tx, tz };
  };

  // Launch straight heading East (+X) at Y = +660 -> Jump 1
  const c1x = -3200;
  const c1z = 300;
  const r1Start = 900;
  pts.push(new THREE.Vector3(c1x - 2400, 665, c1z + r1Start));
  pts.push(new THREE.Vector3(c1x - 1600, 663, c1z + r1Start));
  pts.push(new THREE.Vector3(c1x - 800, 661, c1z + r1Start));

  // DESCENDING SPIRAL I — Solar Helix (345 deg CCW plunge: +660 -> +230)
  const s1 = appendSpiral(
    'SOLAR HELIX',
    '烈日下沉螺旋',
    c1x,
    c1z,
    Math.PI * 0.5,
    -(345 * Math.PI) / 180,
    r1Start,
    540,
    660,
    230,
    14
  );

  // Mid-Course Canyon Gauntlet (6500m): Corkscrew Tunnel 1 -> No-Barrier Zone 1 -> Loop 1 -> Jump 2
  const b1Len = 6500;
  for (let d = 650; d <= 5850; d += 650) {
    const k = d / b1Len;
    pts.push(
      new THREE.Vector3(
        s1.ex + s1.tx * d,
        226 - k * 66,
        s1.ez + s1.tz * d
      )
    );
  }
  const h2EntryX = s1.ex + s1.tx * b1Len;
  const h2EntryZ = s1.ez + s1.tz * b1Len;

  // Align CW Helix II smoothly perpendicular to incoming tangent
  const r2Start = 900;
  const h2StartAng = Math.atan2(-s1.tx, s1.tz);
  const c2x = h2EntryX - r2Start * Math.cos(h2StartAng);
  const c2z = h2EntryZ - r2Start * Math.sin(h2StartAng);

  // DESCENDING SPIRAL II — Rift Maelstrom (345 deg CW plunge: +155 -> -285)
  const s2 = appendSpiral(
    'RIFT MAELSTROM',
    '裂谷深渊螺旋',
    c2x,
    c2z,
    h2StartAng,
    (345 * Math.PI) / 180,
    r2Start,
    540,
    155,
    -285,
    14
  );

  // Final High-Speed Gauntlet Run (6800m): Loop 2 -> Corkscrew Tunnel 2 -> No-Barrier Slalom -> Jump 3 -> Finish
  const b2Len = 6800;
  for (let d = 680; d <= b2Len; d += 680) {
    const k = d / b2Len;
    pts.push(
      new THREE.Vector3(
        s2.ex + s2.tx * d,
        -292 - k * 148,
        s2.ez + s2.tz * d
      )
    );
  }

  return { points: pts, spirals };
}

const GAUNTLET_LAYOUT = buildGauntletLayout();

type FeatureRow = [FeatureType, number, number, number?, number?, boolean?];

function planFeatures(pts: THREE.Vector3[], rows: FeatureRow[], isSprint = false): FeatureSpec[] {
  const L = new THREE.CatmullRomCurve3(pts, !isSprint, 'centripetal').getLength();
  return rows.map(([type, at, p, q = 0, r = 0, underwater = false]) => {
    switch (type) {
      case 'jump':
        return { type, at, w: p / L, h: q, gap: r / L };
      case 'descent':
        return { type, at, w: p / L, h: -q };
      case 'hill':
        return { type, at, w: p / L, h: q };
      case 'loop':
        return { type, at, w: (p * 2.65) / L, radius: p, narrow: 0.36, blend: 340 / L };
      case 'corkscrew':
        return { type, at, w: p / L, narrow: r || 0.56, blend: 200 / L, turns: q || 1 };
      case 'tunnel':
        return { type, at, w: p / L, height: q, underwater };
    }
  });
}

export const LEVELS: LevelDef[] = [
  {
    id: 'neon',
    num: '01',
    name: 'NEON SPRAWL',
    cn: '霓虹都市',
    sub: 'RAIN-SLICK HYPER HIGHWAY',
    tagline: 'NEON SPRAWL',
    badge: 'NEON',
    weatherBadge: 'NEON RAIN',
    weatherTitle: 'NEON RAINSTORM // 霓虹暴雨',
    desc: 'Skyscraper canyon circuit with AHWOO mega-gantries, twin 360° helix loops, and extended air jumps.',
    trackTrackTitle: 'SKYLINE OVERDRIVE',
    points: neonPoints(),
    hw: 96,
    obstacles: 18,
    scale: 1,
    features: planFeatures(neonPoints(), [
      ['jump', 0.040, 390, 110, 760],
      ['descent', 0.180, 780, 165],
      ['loop', 0.260, 235],
      ['hill', 0.345, 660, 78],
      ['tunnel', 0.415, 860, 36],
      ['corkscrew', 0.500, 1300, 1],
      ['jump', 0.608, 370, 112, 720],
      ['descent', 0.735, 720, 155],
      ['loop', 0.805, 215],
      ['jump', 0.875, 340, 102, 650]
    ]),
    look: {
      sky: 0x100a24,
      fog: 0x1a0f36,
      fogNear: 330,
      fogFar: 3900,
      ambient: 0x6b7fb8,
      ambientI: 0.75,
      hemiSky: 0x9fd4ff,
      hemiGround: 0x33194d,
      hemiI: 1.35,
      sun: 0xffd296,
      sunI: 1.85,
      rim: 0x00f0ff,
      rimI: 0.85,
      exposure: 1.02,
      bloom: 0.46,
      bloomRadius: 0.32,
      bloomThreshold: 1.06
    },
    road: {
      base: '#0b1028',
      edge: '#00f0ff',
      edge2: '#f5c451',
      lane: '#8fe9ff',
      centre: '#ffd700'
    },
    theme: { accent: 0x00f0ff, secondary: 0xf5c451, wall: 0x00f0ff }
  },
  {
    id: 'beach',
    num: '02',
    name: 'VESPER SHORE',
    cn: '暮星海岸',
    sub: 'ALIEN TIDELINE · PINK SKIES · EMERALD SAND',
    tagline: 'VESPER SHORE',
    badge: 'SHORE',
    weatherBadge: 'TIDAL MIST',
    weatherTitle: 'BIOLUMINESCENT SQUALL // 潮汐霓雾',
    desc: 'Sunset coastal ribbon above bioluminescent emerald dunes, sweeping helix loop, and wide-air ramps.',
    trackTrackTitle: 'TIDELINE LUXURY',
    points: beachPoints(),
    hw: 92,
    obstacles: 16,
    scale: 1,
    features: planFeatures(beachPoints(), [
      ['hill', 0.025, 680, 68],
      ['corkscrew', 0.100, 1250, 1],
      ['jump', 0.215, 380, 110, 740],
      ['descent', 0.355, 700, 150],
      ['tunnel', 0.415, 780, 34],
      ['loop', 0.505, 225],
      ['descent', 0.588, 700, 145],
      ['jump', 0.655, 370, 112, 740],
      ['hill', 0.802, 640, 75],
      ['corkscrew', 0.872, 1220, 1]
    ]),
    look: {
      sky: 0xffb7d9,
      fog: 0xffc2dd,
      fogNear: 230,
      fogFar: 2600,
      ambient: 0xffd9ef,
      ambientI: 0.85,
      hemiSky: 0xff9ecb,
      hemiGround: 0x2e8f63,
      hemiI: 1.45,
      sun: 0xffd0a8,
      sunI: 1.9,
      rim: 0x67e8ff,
      rimI: 0.55,
      exposure: 1.0,
      bloom: 0.38,
      bloomRadius: 0.36,
      bloomThreshold: 1.08
    },
    road: {
      base: '#3c2460',
      edge: '#59f0d8',
      edge2: '#ff8ad4',
      lane: '#d8fff6',
      centre: '#ffe9a6'
    },
    theme: { accent: 0x59f0d8, secondary: 0xff8ad4, wall: 0x8cf7e4 }
  },
  {
    id: 'space',
    num: '03',
    name: 'EVENT HORIZON',
    cn: '事件视界',
    sub: 'NEBULA PASSAGE · WORMHOLE SPRINT',
    tagline: 'EVENT HORIZON',
    badge: 'DEEP SPACE',
    weatherBadge: 'SOLAR FLARES',
    weatherTitle: 'SOLAR FLARE SURGE // 太阳耀斑',
    desc: 'Orbital wormhole ring suspended between ringed gas giants, high-hang deep-space jumps, and zero-G loops.',
    trackTrackTitle: 'STARLIGHT APEX',
    points: spacePoints(),
    hw: 88,
    obstacles: 20,
    scale: 1,
    features: planFeatures(spacePoints(), [
      ['hill', 0.020, 680, 105],
      ['tunnel', 0.085, 760, 36],
      ['descent', 0.155, 720, 170],
      ['jump', 0.220, 360, 114, 760],
      ['loop', 0.375, 225],
      ['corkscrew', 0.462, 1260, 1],
      ['hill', 0.578, 640, 110],
      ['descent', 0.630, 720, 170],
      ['jump', 0.690, 360, 112, 740],
      ['tunnel', 0.822, 660, 36],
      ['loop', 0.902, 215]
    ]),
    look: {
      sky: 0x03040d,
      fog: 0x050817,
      fogNear: 900,
      fogFar: 7200,
      ambient: 0x6b7fbf,
      ambientI: 0.7,
      hemiSky: 0xb8d4ff,
      hemiGround: 0x241a44,
      hemiI: 1.0,
      sun: 0xfff0d0,
      sunI: 1.75,
      rim: 0x9d7bff,
      rimI: 0.85,
      exposure: 1.0,
      bloom: 0.52,
      bloomRadius: 0.38,
      bloomThreshold: 1.06
    },
    road: {
      base: '#0a0d2c',
      edge: '#8f7dff',
      edge2: '#31e8ff',
      lane: '#9fb8ff',
      centre: '#ffd5f4'
    },
    theme: { accent: 0x9d7bff, secondary: 0x31e8ff, wall: 0x8f7dff }
  },
  {
    id: 'space_beach',
    num: '04',
    name: 'SPACE BEACH',
    cn: '星海潜滩',
    sub: 'POINT-TO-POINT SPRINT · UNDERWATER GLASS TUNNELS',
    tagline: 'SPACE BEACH',
    badge: 'SPRINT',
    weatherBadge: 'COSMIC TIDE',
    weatherTitle: 'COSMIC ABYSSAL TIDE // 星海潮汐',
    desc: 'One-way point-to-point oceanic-cosmic sprint through transparent underwater glass tunnels teeming with sea life.',
    trackTrackTitle: 'ABYSSAL HORIZON',
    isSprint: true,
    points: spaceBeachPoints(),
    hw: 94,
    obstacles: 14,
    scale: 1,
    features: planFeatures(
      spaceBeachPoints(),
      [
        ['hill', 0.055, 580, 44],
        ['tunnel', 0.228, 2550, 42, 0, true],
        ['jump', 0.545, 380, 106, 720],
        ['tunnel', 0.708, 2100, 44, 0, true],
        ['hill', 0.905, 560, 42]
      ],
      true
    ),
    look: {
      sky: 0x0a1c3c,
      fog: 0x0d2b4e,
      fogNear: 360,
      fogFar: 4600,
      ambient: 0x7bc2ea,
      ambientI: 0.85,
      hemiSky: 0x8df6ff,
      hemiGround: 0x0d3658,
      hemiI: 1.45,
      sun: 0xffe4b8,
      sunI: 1.85,
      rim: 0x36f5d8,
      rimI: 0.9,
      exposure: 1.02,
      bloom: 0.44,
      bloomRadius: 0.34,
      bloomThreshold: 1.08
    },
    road: {
      base: '#0b223d',
      edge: '#36f5d8',
      edge2: '#f5c451',
      lane: '#9ef9ff',
      centre: '#ffdf88'
    },
    theme: { accent: 0x36f5d8, secondary: 0xf5c451, wall: 0x52f7e4 }
  },
  {
    id: 'vortex',
    num: '05',
    name: 'VORTEX ABYSS',
    cn: '螺旋深渊',
    sub: 'TRIPLE DESCENDING HELIX · ACTIVE BARRIER CORRIDOR',
    tagline: 'VORTEX ABYSS',
    badge: 'HELIX SPRINT',
    weatherBadge: 'ION VORTEX',
    weatherTitle: 'VORTEX ION SQUALL // 深渊电离暴',
    desc: 'Monumental 1,370m vertical descent across three counter-rotating spiral chasms with live shifting holographic barriers.',
    trackTrackTitle: 'ABYSSAL SPIRAL',
    isSprint: true,
    points: VORTEX_LAYOUT.points,
    hw: 92,
    obstacles: 14,
    scale: 1,
    features: planFeatures(
      VORTEX_LAYOUT.points,
      [
        ['jump', 0.312, 340, 88, 620],
        ['corkscrew', 0.618, 1180, 1],
        ['tunnel', 0.945, 760, 38]
      ],
      true
    ),
    look: {
      sky: 0x070419,
      fog: 0x11092e,
      fogNear: 380,
      fogFar: 5200,
      ambient: 0x7a6fd4,
      ambientI: 0.78,
      hemiSky: 0x99d8ff,
      hemiGround: 0x380f4a,
      hemiI: 1.35,
      sun: 0xffd2b8,
      sunI: 1.75,
      rim: 0xff2e93,
      rimI: 1.05,
      exposure: 1.02,
      bloom: 0.5,
      bloomRadius: 0.36,
      bloomThreshold: 1.04
    },
    road: {
      base: '#0a0924',
      edge: '#00f0ff',
      edge2: '#ff2e93',
      lane: '#c8b6ff',
      centre: '#f5c451'
    },
    theme: { accent: 0x00f0ff, secondary: 0xff2e93, wall: 0x9d4edd }
  },
  {
    id: 'gauntlet',
    num: '06',
    name: 'HYPERION RIFT',
    cn: '海伯利安裂谷',
    sub: 'SPRINT GAUNTLET · NO-BARRIER LEDGES · CORKSCREW TUNNELS',
    tagline: 'HYPERION RIFT',
    badge: 'GAUNTLET SPRINT',
    weatherBadge: 'PLASMA GALE',
    weatherTitle: 'SOLAR PLASMA GALE // 等离子狂风',
    desc: 'High-stakes start-to-finish sprint uniting 3 mega-jumps, twin descending spirals, enclosed corkscrew tunnels, dual loop-de-loops, unbarriered drops, and dynamic moving obstacles.',
    trackTrackTitle: 'GAUNTLET OVERDRIVE',
    isSprint: true,
    points: GAUNTLET_LAYOUT.points,
    hw: 94,
    obstacles: 34,
    scale: 1,
    features: planFeatures(
      GAUNTLET_LAYOUT.points,
      [
        ['jump', 0.028, 320, 84, 560],
        ['corkscrew', 0.282, 1140, 1, 0.68],
        ['tunnel', 0.282, 1140, 38],
        ['loop', 0.422, 210],
        ['jump', 0.470, 340, 92, 600],
        ['loop', 0.728, 200],
        ['corkscrew', 0.785, 1140, 1, 0.68],
        ['tunnel', 0.785, 1140, 38],
        ['jump', 0.916, 320, 82, 540]
      ],
      true
    ),
    noBarrierZones: [
      { at: 0.348, to: 0.402 },
      { at: 0.592, to: 0.665 },
      { at: 0.855, to: 0.905 }
    ],
    look: {
      sky: 0x0c051c,
      fog: 0x1b0b28,
      fogNear: 420,
      fogFar: 5600,
      ambient: 0x9b709c,
      ambientI: 0.8,
      hemiSky: 0xffb38a,
      hemiGround: 0x260c38,
      hemiI: 1.4,
      sun: 0xffc67d,
      sunI: 1.9,
      rim: 0xff425b,
      rimI: 1.15,
      exposure: 1.03,
      bloom: 0.48,
      bloomRadius: 0.35,
      bloomThreshold: 1.04
    },
    road: {
      base: '#0f0c20',
      edge: '#ff425b',
      edge2: '#f5c451',
      lane: '#ff9ec2',
      centre: '#00f0ff'
    },
    theme: { accent: 0xf5c451, secondary: 0xff425b, wall: 0xff6b3d }
  }
];

function makeElevation(features: FeatureSpec[]): ElevationModel {
  const hills = features.filter((f) => f.type === 'hill');
  const descents = features.filter((f) => f.type === 'descent');
  const jumps: JumpSpec[] = features
    .filter((f): f is FeatureSpec & { type: 'jump'; h: number; gap: number } => f.type === 'jump')
    .map((f) => {
      const h = f.h ?? 110;
      const gap = f.gap ?? 0.055;
      const lip = f.at + f.w;
      const land = lip + gap;
      const landLen = f.w * 2.15;
      const deck = h * 0.14;
      const launchSlopeRatio = (gap / f.w) * 0.58;
      return {
        ...f,
        h,
        gap,
        lip,
        land,
        landLen,
        deck,
        end: land + landLen,
        apex: Math.max(92, h * launchSlopeRatio + (h - deck) * 0.45)
      };
    });

  function value(u: number): number {
    let h = 0;
    for (const f of hills) {
      if (u >= f.at && u <= f.at + f.w) {
        h += (f.h ?? 0) * 0.5 * (1 - Math.cos((Math.PI * 2 * (u - f.at)) / f.w));
      }
    }
    for (const f of descents) {
      if (u < f.at || u > f.at + f.w) continue;
      const k = (u - f.at) / f.w;
      const fh = f.h ?? 0;
      // C-infinity smooth descent dip with balanced uphill recovery slope
      h += fh * 0.5 * (1 - Math.cos(Math.PI * 2 * k));
    }
    for (const j of jumps) {
      if (u >= j.at && u < j.lip) {
        // Kicker ramp: zero slope at entry (k=0), positive launch angle at lip (k=1)
        const k = (u - j.at) / j.w;
        h += j.h * k * k * (2.0 - k);
      } else if (u >= j.lip && u < j.land) {
        h += j.h + (j.deck - j.h) * ((u - j.lip) / j.gap);
      } else if (u >= j.land && u <= j.end) {
        h += j.deck * 0.5 * (1 + Math.cos((Math.PI * (u - j.land)) / j.landLen));
      }
    }
    return h;
  }

  const isGap = (u: number): boolean => jumps.some((j) => u >= j.lip && u < j.land);

  function arc(u: number): number {
    for (const j of jumps) {
      if (u >= j.lip && u < j.land) {
        const k = (u - j.lip) / j.gap;
        // Smooth finite-slope quartic hang curve (eliminates infinite derivative kink at launch/landing)
        const arch = 4 * k * (1 - k);
        return j.apex * arch * (0.84 + 0.16 * arch);
      }
    }
    return 0;
  }

  return { value, isGap, arc, jumps };
}

function buildFrames(
  curve: THREE.CatmullRomCurve3,
  steps: number,
  closed: boolean,
  worldUpLock = false
): { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; up: THREE.Vector3 }[] {
  const frames: { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; up: THREE.Vector3 }[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= steps; i++) {
    const u = closed ? (i / steps) % 1 : Math.min(1, i / steps);
    const t = curve.getTangentAt(u);
    const p = curve.getPointAt(u);
    const s =
      i && !worldUpLock
        ? frames[i - 1].s.clone()
        : new THREE.Vector3().crossVectors(t, up);
    s.addScaledVector(t, -s.dot(t)).normalize();
    frames.push({ p, t, s, up: new THREE.Vector3().crossVectors(s, t).normalize() });
  }
  if (closed) {
    const a = Math.atan2(
      new THREE.Vector3().crossVectors(frames[frames.length - 1].s, frames[0].s).dot(frames[0].t),
      frames[frames.length - 1].s.dot(frames[0].s)
    );
    frames.forEach((f, i) => {
      f.s.applyAxisAngle(f.t, (a * i) / steps);
      f.up = new THREE.Vector3().crossVectors(f.s, f.t).normalize();
    });
  }
  return frames;
}

function auditTrack(curve: THREE.CatmullRomCurve3, steps: number): TrackAudit {
  const N = 360;
  const pts: THREE.Vector3[] = [];
  const closed = curve.closed;
  for (let i = 0; i < N; i++) pts.push(curve.getPointAt(closed ? i / N : i / (N - 1)));
  let minRadius = Infinity;
  const vAB = new THREE.Vector3();
  const vCA = new THREE.Vector3();
  const startIdx = closed ? 0 : 1;
  const endIdx = closed ? N : N - 1;
  for (let i = startIdx; i < endIdx; i++) {
    const a = pts[(i - 1 + N) % N];
    const b = pts[i];
    const c = pts[(i + 1) % N];
    const ab = a.distanceTo(b);
    const bc = b.distanceTo(c);
    const ca = c.distanceTo(a);
    const area = vAB.subVectors(b, a).cross(vCA.subVectors(c, a)).length() * 0.5;
    if (area > 1e-4) minRadius = Math.min(minRadius, (ab * bc * ca) / (4 * area));
  }
  const orient = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const segHit = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3) => {
    const o1 = orient(p, q, r);
    const o2 = orient(p, q, s);
    const o3 = orient(r, s, p);
    const o4 = orient(r, s, q);
    return o1 * o2 < 0 && o3 * o4 < 0;
  };
  let selfIntersections = 0;
  const segCount = closed ? N : N - 1;
  for (let i = 0; i < segCount; i++) {
    for (let j = i + 2; j < segCount; j++) {
      if (closed && i === 0 && j === N - 1) continue;
      if (segHit(pts[i], pts[(i + 1) % N], pts[j], pts[(j + 1) % N])) selfIntersections++;
    }
  }
  return {
    minRadius: Number.isFinite(minRadius) ? minRadius : 0,
    selfIntersections,
    sampled: N,
    closed,
    steps
  };
}

export function buildTrack(def: LevelDef): TrackData {
  const isSprint = !!def.isSprint;
  const closed = !isSprint;
  const scale = def.scale || 1;
  const pts = scale === 1 ? def.points : def.points.map((p) => new THREE.Vector3(p.x * scale, p.y, p.z * scale));
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const len = curve.getLength();
  const steps = Math.max(1200, Math.round(len / 3.4));
  const frames = buildFrames(curve, steps, closed, def.id === 'vortex' || def.id === 'gauntlet');
  const elev = makeElevation(def.features);
  const hw = def.hw;
  const audit = auditTrack(curve, steps);

  const findClosestU = (target: THREE.Vector3, minIdx: number) => {
    let bestI = minIdx;
    let bestD = Infinity;
    for (let i = minIdx; i <= steps; i++) {
      const d = frames[i].p.distanceToSquared(target);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return bestI / steps;
  };

  let scanCursor = 0;
  const rawSpirals =
    def.id === 'vortex'
      ? VORTEX_LAYOUT.spirals
      : def.id === 'gauntlet'
        ? GAUNTLET_LAYOUT.spirals
        : [];
  const spiralZones = rawSpirals.map((sp) => {
    const startU = findClosestU(pts[sp.ptStartIdx], scanCursor);
    scanCursor = Math.min(steps, Math.round(startU * steps));
    const endU = findClosestU(pts[sp.ptEndIdx], scanCursor);
    scanCursor = Math.min(steps, Math.round(endU * steps));
    return {
      name: sp.name,
      cn: sp.cn,
      startU,
      endU,
      center: new THREE.Vector3(sp.centerX, (sp.topY + sp.bottomY) * 0.5, sp.centerZ),
      topY: sp.topY,
      bottomY: sp.bottomY,
      startR: sp.startR,
      endR: sp.endR,
      clockwise: sp.clockwise
    };
  });

  const normU = (u0: number): number =>
    closed ? ((u0 % 1) + 1) % 1 : Math.max(0, Math.min(1, u0));

  const tapers = def.features
    .filter((f) => f.type === 'loop' || f.type === 'corkscrew')
    .map((f) => ({
      at: f.at - (f.blend ?? 0.018),
      to: f.at + f.w + (f.blend ?? 0.018),
      min: f.narrow ?? 0.4
    }));

  function widthAt(u0: number): number {
    const u = normU(u0);
    let w = 1;
    for (const t of tapers) {
      if (u < t.at || u > t.to) continue;
      const k = (u - t.at) / (t.to - t.at);
      w = Math.min(w, 1 - (1 - t.min) * Math.pow(Math.sin(Math.PI * k), 0.75));
    }
    return w;
  }

  const loops = def.features
    .filter((f) => f.type === 'loop')
    .map((f) => {
      const i = Math.min(steps, Math.round(f.at * steps));
      return {
        ...f,
        anchor: {
          p: frames[i].p.clone(),
          t: frames[i].t.clone(),
          s: frames[i].s.clone(),
          up: frames[i].up.clone()
        },
        drift: len * f.w,
        radius: f.radius ?? 220
      };
    });

  const rolls = def.features.filter((f) => f.type === 'corkscrew');
  const tunnels = def.features.filter((f) => f.type === 'tunnel');

  const inSpecial = (u: number): boolean =>
    loops.some((f) => u >= f.at && u <= f.at + f.w) ||
    rolls.some((f) => u >= f.at - 0.01 && u <= f.at + f.w + 0.01) ||
    tunnels.some((f) => u >= f.at - 0.008 && u <= f.at + f.w + 0.008);

  function baseFrameAt(u0: number) {
    const u = normU(u0);
    const x = u * steps;
    const i = Math.min(steps - 1, Math.floor(x));
    const f = x - i;
    const a = frames[i];
    const b = frames[i + 1];
    return {
      u,
      raw: curve.getPointAt(u),
      h: elev.value(u),
      t: a.t.clone().lerp(b.t, f).normalize(),
      s: a.s.clone().lerp(b.s, f).normalize(),
      up: a.up.clone().lerp(b.up, f).normalize()
    };
  }

  function fr(u0: number): TrackFrame {
    const base = baseFrameAt(u0);
    const { u, raw, h } = base;
    const pos = raw.clone().addScaledVector(base.up, h);
    let t = base.t.clone();
    let s = base.s.clone();
    let up = base.up.clone();

    let inLoop = false;
    for (const L of loops) {
      if (u < L.at || u > L.at + L.w) continue;
      inLoop = true;
      const narrow = L.narrow ?? 0.4;
      const loopFullWidth = 2 * hw * narrow;
      const D = Math.max(L.radius * 0.65, (loopFullWidth + 96) / 1.414);
      const lpAt = (uu: number) => {
        const clampedU = Math.max(L.at, Math.min(L.at + L.w, uu));
        const k = (clampedU - L.at) / L.w;
        const ang = k * Math.PI * 2;
        const bf = baseFrameAt(clampedU);
        const lateralEnv = Math.pow(Math.sin(Math.PI * k), 1.15);
        return bf.raw
          .clone()
          .addScaledVector(bf.up, bf.h)
          .addScaledVector(bf.t, L.radius * Math.sin(ang))
          .addScaledVector(bf.up, L.radius * (1 - Math.cos(ang)))
          .addScaledVector(bf.s, D * Math.sin(ang) * lateralEnv);
      };
      const d = 0.00055;
      const uA = u - d;
      const uB = u + d;
      const lp = lpAt(u);
      const bA = baseFrameAt(uA);
      const bB = baseFrameAt(uB);
      const pA = uA < L.at ? bA.raw.clone().addScaledVector(bA.up, bA.h) : lpAt(uA);
      const pB = uB > L.at + L.w ? bB.raw.clone().addScaledVector(bB.up, bB.h) : lpAt(uB);
      const lt = pB.sub(pA).normalize();
      const lu = new THREE.Vector3().crossVectors(base.s, lt).normalize();
      pos.copy(lp);
      t = lt;
      up = lu;
      s = new THREE.Vector3().crossVectors(t, up).normalize();
      up = new THREE.Vector3().crossVectors(s, t).normalize();
      break;
    }

    if (!inLoop) {
      const dSlope = 0.00045;
      const uA = normU(u - dSlope);
      const uB = normU(u + dSlope);
      if (uB > uA + 1e-6 || closed) {
        const bA = baseFrameAt(uA);
        const bB = baseFrameAt(uB);
        const pA = bA.raw.clone().addScaledVector(bA.up, bA.h);
        const pB = bB.raw.clone().addScaledVector(bB.up, bB.h);
        t = pB.sub(pA).normalize();
        s = base.s.clone().addScaledVector(t, -base.s.dot(t)).normalize();
        up = new THREE.Vector3().crossVectors(s, t).normalize();
        s = new THREE.Vector3().crossVectors(t, up).normalize();
      }
    }

    for (const R of rolls) {
      if (u < R.at || u > R.at + R.w) continue;
      const k = (u - R.at) / R.w;
      const ang = (R.turns ?? 1) * Math.PI * 2 * (k * k * (3 - 2 * k));
      s.applyAxisAngle(t, ang);
      up.applyAxisAngle(t, ang);
    }

    // Smooth inward banking along descending vortex helix turns
    for (const Z of spiralZones) {
      if (u < Z.startU || u > Z.endU) continue;
      const k = (u - Z.startU) / Math.max(0.0001, Z.endU - Z.startU);
      const bankEnv = Math.pow(Math.sin(Math.PI * k), 0.72);
      // CCW turn curves left (-s), CW turn curves right (+s); tilt up slightly inward for natural spiral carving
      const bankRad = (Z.clockwise ? 0.25 : -0.25) * bankEnv;
      s.applyAxisAngle(t, bankRad);
      up.applyAxisAngle(t, bankRad);
    }

    return { p: raw, h, pos, t, s, up, width: hw * widthAt(u) };
  }

  const noBarrierZones = def.noBarrierZones ?? [];
  const hasBarrierAt = (u0: number): boolean => {
    if (!noBarrierZones.length) return true;
    const u = normU(u0);
    return !noBarrierZones.some((z) => u >= z.at && u <= z.to);
  };

  return {
    def,
    curve,
    len,
    steps,
    frames,
    elev,
    hw,
    audit,
    clearance: 180,
    fr,
    widthAt,
    inSpecial,
    loops,
    rolls,
    pads: [],
    obstacles: [],
    anim: [],
    noBarrierZones,
    hasBarrierAt,
    spiralZones
  };
}
