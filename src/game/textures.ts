import * as THREE from 'three';
import type { RoadPalette } from './types';

let maxAniso = 4;

export function setTextureMaxAnisotropy(val: number): void {
  maxAniso = Math.max(1, Math.min(val, 8));
}

export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

export function radialTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 4, 128, 128, 128);
    grd.addColorStop(0, color);
    grd.addColorStop(0.35, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
}

export function glowPlane(color: string, size: number, opacity = 0.55): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: radialTexture(color),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false
    })
  );
}

/**
 * Tiling road substrate. Square, so one tile is the same number of metres in
 * both directions and texel density no longer depends on road width or on how
 * long the ribbon is. Carries no lane markings — those live in
 * makeRoadMarkingsTexture so only they emit light.
 */
export function makeRoadSurfaceTexture(theme: RoadPalette): THREE.CanvasTexture {
  const lifted = new THREE.Color(theme.base).lerp(new THREE.Color('#7d8ba1'), 0.38);
  const baseHex = '#' + lifted.getHexString();

  const t = canvasTexture(512, 512, (g, w, h) => {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    g.fillStyle = baseHex;
    g.fillRect(0, 0, w, h);

    // broad tonal drift
    for (let i = 0; i < 130; i++) {
      g.fillStyle = `rgba(${(rnd(150, 215) | 0)},${(rnd(170, 230) | 0)},240,${rnd(0.01, 0.04)})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(30, 160), rnd(30, 170));
    }

    // aggregate grain
    for (let i = 0; i < 7000; i++) {
      g.fillStyle =
        Math.random() > 0.5
          ? `rgba(232,242,255,${rnd(0.03, 0.1)})`
          : `rgba(0,0,0,${rnd(0.06, 0.18)})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3));
    }

    // brushed direction along the driving line
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd(0.012, 0.035)})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 2.5), rnd(40, 220));
    }

    // camber shading, wrapping cleanly at the tile edges
    const camber = g.createLinearGradient(0, 0, w, 0);
    camber.addColorStop(0, 'rgba(0,0,0,0.26)');
    camber.addColorStop(0.22, 'rgba(0,0,0,0)');
    camber.addColorStop(0.5, 'rgba(255,236,196,0.05)');
    camber.addColorStop(0.78, 'rgba(0,0,0,0)');
    camber.addColorStop(1, 'rgba(0,0,0,0.26)');
    g.fillStyle = camber;
    g.fillRect(0, 0, w, h);

    // one expansion joint per tile, so it repeats down the road
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.fillRect(0, 0, w, 3);
    g.fillStyle = 'rgba(255,236,196,0.1)';
    g.fillRect(0, 3, w, 2);
  });

  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The lit layer: edge lines, lane dividers and guidance chevrons on a
 * transparent field, laid over the road as its own additive ribbon. u runs
 * across the full road width (so markings stay aligned to the edges) while v
 * repeats along the road in metres.
 */
export function makeRoadMarkingsTexture(theme: RoadPalette): THREE.CanvasTexture {
  const t = canvasTexture(1024, 2048, (g, w, h) => {
    g.clearRect(0, 0, w, h);

    // glowing outer edges
    g.shadowBlur = 26;
    g.fillStyle = theme.edge;
    g.shadowColor = theme.edge;
    g.fillRect(0, 0, 16, h);
    g.fillRect(w - 16, 0, 16, h);
    g.shadowBlur = 14;
    g.fillStyle = theme.edge2;
    g.shadowColor = theme.edge2;
    g.fillRect(18, 0, 7, h);
    g.fillRect(w - 25, 0, 7, h);

    // lane dividers
    g.shadowBlur = 12;
    g.lineWidth = 5;
    for (const x of [w * 0.2, w * 0.4, w * 0.6, w * 0.8]) {
      const mid = x === w * 0.4 || x === w * 0.6;
      g.strokeStyle = mid ? theme.centre : theme.lane;
      g.shadowColor = g.strokeStyle;
      g.setLineDash(mid ? [110, 60] : [64, 64]);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.setLineDash([]);

    // guidance chevrons in the two inner lanes
    g.shadowBlur = 16;
    for (const c of [0.3, 0.7]) {
      const cx = c * w;
      g.shadowColor = theme.lane;
      g.fillStyle = theme.lane + 'cc';
      for (const yy of [h * 0.42, h * 0.6]) {
        g.beginPath();
        g.moveTo(cx - 62, yy + 62);
        g.lineTo(cx, yy);
        g.lineTo(cx + 62, yy + 62);
        g.lineTo(cx + 62, yy + 90);
        g.lineTo(cx, yy + 28);
        g.lineTo(cx - 62, yy + 90);
        g.closePath();
        g.fill();
      }
    }

    // reflected studs along the expansion joint
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(220,235,255,0.4)';
    for (let x = 40; x < w; x += 96) g.fillRect(x, 10, 4, 14);
  });

  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ---- Authored surface maps -------------------------------------------------
 * CC0 set: Poly Haven `asphalt_02` (albedo / OpenGL normal / ARM packed as
 * R=AO, G=roughness, B=metalness). Loaded once and cached, because level
 * switches dispose the world and would otherwise re-upload every map.
 */

const authoredLoader = new THREE.TextureLoader();
const authoredCache = new Map<string, THREE.Texture>();

function authoredMap(url: string, srgb: boolean): THREE.Texture {
  const hit = authoredCache.get(url);
  if (hit) return hit;
  const t = authoredLoader.load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  authoredCache.set(url, t);
  return t;
}

/** Real asphalt for the city circuit, replacing the painted canvas surface. */
export function makeAsphaltRoadMaterial(): THREE.MeshStandardMaterial {
  const albedo = authoredMap('/assets/textures/asphalt/asphalt-albedo.webp', true);
  const normal = authoredMap('/assets/textures/asphalt/asphalt-normal.webp', false);
  const arm = authoredMap('/assets/textures/asphalt/asphalt-arm.webp', false);
  return new THREE.MeshStandardMaterial({
    map: albedo,
    normalMap: normal,
    roughnessMap: arm,
    metalnessMap: arm,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 0.95,
    side: THREE.DoubleSide
  });
}

export function makeKerbTexture(a: string, b: string): THREE.CanvasTexture {
  const t = canvasTexture(16, 64, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 16, 32);
    g.fillStyle = b;
    g.fillRect(0, 32, 16, 32);
  });
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeWallTexture(theme: RoadPalette, kind: 'hex' | 'bio' | 'grid'): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 0, 128, 128);

    if (kind === 'hex') {
      g.strokeStyle = 'rgba(0,240,255,0.8)';
      g.lineWidth = 2.4;
      const r = 24;
      const hh = r * Math.sqrt(3);
      const hex = (x: number, y: number) => {
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2;
          const px = x + r * Math.cos(ang);
          const py = y + r * Math.sin(ang);
          if (k) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.closePath();
        g.stroke();
      };
      for (let x = 0; x <= 152; x += r * 3) {
        for (let y = 0; y <= 152; y += hh) {
          hex(x, y);
          hex(x + r * 1.5, y + hh / 2);
        }
      }
    } else if (kind === 'bio') {
      g.strokeStyle = 'rgba(140,247,228,0.55)';
      g.lineWidth = 2;
      for (let x = 0; x < 128; x += 16) {
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 10, 40, x - 10, 90, x, 128);
        g.stroke();
      }
      g.fillStyle = 'rgba(89,240,216,0.25)';
      for (let i = 0; i < 12; i++) {
        g.beginPath();
        g.arc(Math.random() * 128, Math.random() * 128, 1.5 + Math.random() * 3, 0, 7);
        g.fill();
      }
    } else {
      g.strokeStyle = 'rgba(143,125,255,0.75)';
      g.lineWidth = 2;
      for (let x = 0; x < 128; x += 10) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, 128);
        g.stroke();
      }
      g.strokeStyle = 'rgba(49,232,255,0.5)';
      for (let y = 0; y < 128; y += 24) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(128, y);
        g.stroke();
      }
    }
    g.fillStyle = theme.edge;
    g.fillRect(0, 0, 128, 6);
    g.fillStyle = theme.edge2;
    g.fillRect(0, 122, 128, 6);
  });
}

export function padTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(512, 128, (g) => {
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 12;
    for (let col = 0; col < 4; col++) {
      const cx = col * 128 + 64;
      for (let i = 0; i < 3; i++) {
        const o = i * 36;
        g.beginPath();
        g.moveTo(cx - 44, 106 - o);
        g.lineTo(cx, 52 - o);
        g.lineTo(cx + 44, 106 - o);
        g.lineTo(cx + 44, 120 - o);
        g.lineTo(cx, 66 - o);
        g.lineTo(cx - 44, 120 - o);
        g.closePath();
        g.fill();
      }
    }
  });
}

export function planetTexture(a: string, b: string, c: string, bands: boolean): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, a);
    grd.addColorStop(0.5, b);
    grd.addColorStop(1, c);
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    if (bands) {
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.07})`;
        g.fillRect(0, Math.random() * 512, 512, 6 + Math.random() * 24);
      }
    } else {
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.14})`;
        g.beginPath();
        g.arc(Math.random() * 512, Math.random() * 512, 6 + Math.random() * 34, 0, 7);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.beginPath();
        g.arc(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 8, 0, 7);
        g.fill();
      }
    }
  });
}

export function nebulaTexture(c1: string, c2: string): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (g) => {
    g.clearRect(0, 0, 1024, 1024);
    for (let i = 0; i < 14; i++) {
      const x = 200 + Math.random() * 620;
      const y = 200 + Math.random() * 620;
      const r = 180 + Math.random() * 320;
      const grd = g.createRadialGradient(x, y, 8, x, y, r);
      grd.addColorStop(0, c1);
      grd.addColorStop(0.45, c2);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 1024);
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 1.6, 1.6);
    }
  });
}
