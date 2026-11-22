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

export function makeRoadTexture(theme: RoadPalette): THREE.CanvasTexture {
  return canvasTexture(1024, 2048, (g, w, h) => {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    g.fillStyle = theme.base;
    g.fillRect(0, 0, w, h);

    // broad tonal drift
    for (let i = 0; i < 240; i++) {
      g.fillStyle = `rgba(${(rnd(110, 200) | 0)},${(rnd(140, 220) | 0)},255,${rnd(0.006, 0.022)})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(80, 380), rnd(60, 320));
    }
    // camber shading
    const camber = g.createLinearGradient(0, 0, w, 0);
    camber.addColorStop(0, 'rgba(0,0,0,0.42)');
    camber.addColorStop(0.18, 'rgba(0,0,0,0)');
    camber.addColorStop(0.5, 'rgba(255,235,190,0.06)');
    camber.addColorStop(0.82, 'rgba(0,0,0,0)');
    camber.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = camber;
    g.fillRect(0, 0, w, h);

    // carbon aggregate grain
    for (let i = 0; i < 12000; i++) {
      g.fillStyle =
        Math.random() > 0.5
          ? `rgba(220,240,255,${rnd(0.02, 0.08)})`
          : `rgba(0,0,0,${rnd(0.08, 0.22)})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3));
    }

    // rubbered-in hover slipstreams
    const centres = [0.1, 0.3, 0.5, 0.7, 0.9];
    for (const c of centres) {
      for (const o of [-0.045, 0.045]) {
        const x = (c + o) * w;
        for (let y = 0; y < h; y += 8) {
          g.fillStyle = `rgba(0,0,0,${rnd(0.05, 0.18)})`;
          g.fillRect(x - rnd(9, 15), y, rnd(18, 30), 9);
        }
      }
    }

    // wet gloss streaks
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i++) {
      const x = rnd(20, w - 20);
      const y = rnd(0, h);
      const len = rnd(140, 520);
      const grd = g.createLinearGradient(0, y, 0, y + len);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, (i % 2 ? theme.edge : theme.edge2) + '26');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x, y, rnd(3, 11), len);
    }
    g.globalCompositeOperation = 'source-over';

    // expansion joints
    for (let y = 0; y < h; y += 256) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, y, w, 5);
      g.fillStyle = 'rgba(255,220,160,0.22)';
      g.fillRect(0, y + 5, w, 2);
      for (let x = 40; x < w; x += 96) {
        g.fillStyle = 'rgba(220,235,255,0.35)';
        g.fillRect(x, y + 12, 4, 4);
      }
    }

    // guidance chevrons in the two inner lanes
    g.shadowBlur = 12;
    for (const c of [0.3, 0.7]) {
      const cx = c * w;
      g.shadowColor = theme.lane;
      g.fillStyle = theme.lane + '88';
      for (const yy of [1320, 1420]) {
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

    // glowing outer edges
    g.shadowBlur = 24;
    g.fillStyle = theme.edge;
    g.shadowColor = theme.edge;
    g.fillRect(0, 0, 18, h);
    g.fillRect(w - 18, 0, 18, h);
    g.shadowBlur = 12;
    g.fillStyle = theme.edge2;
    g.shadowColor = theme.edge2;
    g.fillRect(18, 0, 8, h);
    g.fillRect(w - 26, 0, 8, h);

    // lane dividers
    g.shadowBlur = 10;
    g.lineWidth = 5;
    for (const x of [w * 0.2, w * 0.4, w * 0.6, w * 0.8]) {
      const mid = x === w * 0.4 || x === w * 0.6;
      g.strokeStyle = mid ? theme.centre : theme.lane;
      g.shadowColor = g.strokeStyle;
      g.setLineDash(mid ? [92, 52] : [52, 52]);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.setLineDash([]);
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
