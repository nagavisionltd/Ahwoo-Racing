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
        return { type, at, w: p / L, narrow: 0.56, blend: 200 / L, turns: q || 1 };
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
  closed: boolean
): { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; up: THREE.Vector3 }[] {
  const frames: { p: THREE.Vector3; t: THREE.Vector3; s: THREE.Vector3; up: THREE.Vector3 }[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= steps; i++) {
    const u = closed ? (i / steps) % 1 : Math.min(1, i / steps);
    const t = curve.getTangentAt(u);
    const p = curve.getPointAt(u);
    const s = i ? frames[i - 1].s.clone() : new THREE.Vector3().crossVectors(t, up);
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
  const frames = buildFrames(curve, steps, closed);
  const elev = makeElevation(def.features);
  const hw = def.hw;
  const audit = auditTrack(curve, steps);

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

    return { p: raw, h, pos, t, s, up, width: hw * widthAt(u) };
  }

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
    anim: []
  };
}
