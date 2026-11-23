import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { GameStep, WeatherSnapshot } from '../game/types';

export interface WeatherEngineProps {
  weather: WeatherSnapshot;
  speedNorm?: number;
  step: GameStep;
}

function detectSoftwareGl(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl =
      (c.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (c.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const ren = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      if (/SwiftShader|llvmpipe|Software|ANGLE \(.*SwiftShader/i.test(ren)) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uIntensity;
  uniform float uRainMix;
  uniform float uMistMix;
  uniform float uSolarMix;
  uniform float uLightning;
  uniform float uBoltStrength;
  uniform float uBoltOrigin;
  uniform float uBoltSeed;
  uniform float uSolarPulse;
  uniform float uSpeedNorm;
  uniform float uActivity;
  uniform float uLowSpec;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    // Fixed loop count for WebGL1/WebGL2 GLSL compatibility; blend weight handles low-spec
    for (int i = 0; i < 4; i++) {
      float w = (i >= 3 && uLowSpec > 0.5) ? 0.0 : 1.0;
      val += w * amp * noise2(p * freq);
      freq *= 2.04;
      amp *= 0.5;
      p += vec2(1.7, 9.2);
    }
    return val;
  }

  // Jagged procedural bolt coordinate offset along vertical scanline
  float boltDisplacement(float y, float seed) {
    float n1 = noise2(vec2(y * 7.5 + seed * 13.7, seed * 3.1)) - 0.5;
    float n2 = noise2(vec2(y * 19.0 - seed * 21.3, seed * 7.9)) - 0.5;
    float n3 = noise2(vec2(y * 42.0 + seed * 5.4, seed * 11.2)) - 0.5;
    return n1 * 0.16 + n2 * 0.065 + n3 * 0.022;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(1.0, uResolution.y);
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    float radialDist = length(p * vec2(0.85, 1.05));

    // Keep the player's central sightline cleanly readable while filling periphery & horizon
    float edgeFocus = smoothstep(0.14, 0.72, radialDist);
    float horizonBand = smoothstep(0.68, 0.04, uv.y);

    // 1. Volumetric Fog & Drifting Atmospheric Plumes
    float speedDrift = uTime * (0.28 + uSpeedNorm * 0.65);
    vec2 fogUvA = vec2(uv.x * aspect * 2.1 + speedDrift * 0.35, uv.y * 2.4 - uTime * 0.09);
    vec2 fogUvB = vec2(uv.x * aspect * 3.6 - speedDrift * 0.52, uv.y * 3.1 + uTime * 0.14);

    float fogA = fbm(fogUvA);
    float fogB = fbm(fogUvB);
    float fogLayer = clamp(fogA * 0.62 + fogB * 0.48, 0.0, 1.0);

    // Subtle diagonal volumetric shafts descending from upper atmosphere
    float shaftCoord = (uv.x - 0.5) * aspect + (1.0 - uv.y) * 0.42;
    float shafts = fbm(vec2(shaftCoord * 4.5 + uTime * 0.12, uv.y * 1.15));
    shafts = pow(smoothstep(0.32, 0.85, shafts), 2.0) * smoothstep(0.05, 0.92, uv.y);

    // Weather-driven volumetric fog palettes
    vec3 rainFogCol = mix(vec3(0.02, 0.14, 0.28), vec3(0.10, 0.34, 0.58), fogB);
    rainFogCol += vec3(0.28, 0.05, 0.32) * smoothstep(0.58, 0.95, fogA) * 0.55;

    vec3 mistFogCol = mix(vec3(0.04, 0.36, 0.44), vec3(0.18, 0.76, 0.72), fogLayer);
    mistFogCol = mix(mistFogCol, vec3(0.65, 0.36, 0.58), smoothstep(0.62, 0.92, fogB) * 0.36);

    vec3 solarFogCol = mix(vec3(0.34, 0.12, 0.04), vec3(0.95, 0.58, 0.22), fogLayer);
    solarFogCol += vec3(1.0, 0.82, 0.45) * shafts * (0.45 + uSolarPulse * 0.6);

    vec3 fogColor =
      rainFogCol * uRainMix +
      mistFogCol * uMistMix +
      solarFogCol * uSolarMix;

    // Density scaled cleanly by weather kind
    float mistDensity = uMistMix * (0.14 + horizonBand * 0.22 + edgeFocus * 0.16) * (0.45 + 0.55 * fogLayer);
    float rainDensity = uRainMix * (0.06 + horizonBand * 0.12 + edgeFocus * 0.10) * (0.35 + 0.65 * fogLayer);
    float solarDensity = uSolarMix * (0.04 + shafts * 0.16 + edgeFocus * 0.07) * (0.45 + 0.55 * uSolarPulse);

    float fogAlpha = (mistDensity + rainDensity + solarDensity) * (0.35 + 0.65 * uIntensity);

    // Mist horizon billow accent ribbon
    float billow = smoothstep(0.45, 0.88, fogLayer) * horizonBand * uMistMix * 0.14;
    fogAlpha += billow;

    // 2. Procedural GLSL Lightning Strikes & Fork Branches (primarily during 'rain')
    vec3 boltColor = vec3(0.0);
    float boltAlpha = 0.0;

    float activeFlash = max(uLightning, uBoltStrength);
    if (activeFlash > 0.01 && uRainMix > 0.05) {
      float cloudSheet = fbm(vec2(uv.x * aspect * 3.0 + uBoltSeed * 5.0, uv.y * 3.5));
      float cloudGlow = smoothstep(0.28, 0.92, cloudSheet) * smoothstep(0.15, 1.0, uv.y);

      // Main primary jagged strike path from cloud deck down to horizon
      float boltCenterX = uBoltOrigin + boltDisplacement(uv.y, uBoltSeed);
      float xDist = abs((uv.x - boltCenterX) * aspect);

      // Taper strike slightly near horizon impact point
      float verticalMask = smoothstep(0.14, 0.34, uv.y) * smoothstep(1.0, 0.86, uv.y);
      float coreLine = exp(-xDist * 230.0) * verticalMask;
      float auraLine = exp(-xDist * 28.0) * verticalMask;

      // Secondary branching fork shooting diagonally from mid-sky
      float forkOriginY = 0.62 + 0.12 * sin(uBoltSeed * 19.0);
      float forkDir = sign(sin(uBoltSeed * 37.0 + 0.5));
      float forkProgress = max(0.0, forkOriginY - uv.y);
      float forkCenterX = boltCenterX + forkDir * forkProgress * 0.42 + boltDisplacement(uv.y * 1.35 + 0.4, uBoltSeed + 4.7) * 0.65;
      float forkDist = abs((uv.x - forkCenterX) * aspect);
      float forkMask = smoothstep(forkOriginY + 0.01, forkOriginY - 0.02, uv.y) * smoothstep(0.24, 0.42, uv.y);
      float forkCore = exp(-forkDist * 300.0) * forkMask * 0.72;
      float forkAura = exp(-forkDist * 36.0) * forkMask * 0.55;

      // Impact ground electric scatter burst
      vec2 impactPt = vec2((uv.x - (uBoltOrigin + boltDisplacement(0.24, uBoltSeed))) * aspect, uv.y - 0.22);
      float impactFlash = exp(-length(impactPt) * 5.2) * 0.65;

      float strikeIntensity = uBoltStrength * uRainMix;
      float electricCore = (coreLine + forkCore) * strikeIntensity;
      float electricGlow = (auraLine + forkAura + impactFlash) * strikeIntensity;
      float skyIllum = (cloudGlow * 0.34 + 0.08) * activeFlash * uRainMix;

      boltColor =
        vec3(0.88, 0.97, 1.0) * electricCore * 1.4 +
        vec3(0.20, 0.72, 1.0) * electricGlow * 0.95 +
        vec3(0.45, 0.32, 0.95) * skyIllum;

      boltAlpha = clamp(electricCore * 0.95 + electricGlow * 0.55 + skyIllum * 0.45, 0.0, 0.85);
    }

    // 3. Subtle Neon Rain Canopy Shimmer at top corners when speeding in heavy rain
    float topRainRim = smoothstep(0.72, 1.0, uv.y) * uRainMix * uIntensity * 0.08;
    fogColor += vec3(0.0, 0.78, 0.98) * topRainRim;

    vec3 finalColor = mix(fogColor, fogColor + boltColor, clamp(boltAlpha * 1.25, 0.0, 1.0));
    float finalAlpha = clamp((fogAlpha + boltAlpha * 0.72) * uActivity, 0.0, 0.62);

    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;

const PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute float aRole;      // 0.0 = atmospheric streak/spore/ember, 1.0 = neon rain splash ripple
  attribute vec3 aOrigin;     // normalized base screen coords (-1..1, -1..1, depth 0..1)
  attribute float aPhase;     // 0..1 random cycle seed
  attribute float aSize;      // base particle size
  attribute float aColorMix;  // 0..1 color variation selector

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uRainMix;
  uniform float uMistMix;
  uniform float uSolarMix;
  uniform float uIntensity;
  uniform float uSpeedNorm;
  uniform float uLightning;
  uniform float uSolarPulse;
  uniform float uActivity;

  varying float vRole;
  varying float vLife;
  varying float vColorMix;
  varying float vStreakAspect;
  varying float vAlpha;

  void main() {
    vRole = aRole;
    vColorMix = aColorMix;

    float activeBoost = 0.55 + uSpeedNorm * 0.95;

    if (aRole < 0.5) {
      // ROLE A: Atmospheric Streaks (rain), Billowing Spores (mist), Rising Embers (solar)
      float cycleSpeed =
        uRainMix * (1.25 + uSpeedNorm * 1.45) +
        uMistMix * (0.14 + uSpeedNorm * 0.18) +
        uSolarMix * (0.28 + uSolarPulse * 0.35);

      float t = fract(aPhase + uTime * max(0.08, cycleSpeed));
      vLife = t;

      // Rain falls diagonally fast; Mist drifts smoothly sideways; Solar rises upward
      vec2 rainPos = vec2(
        mod(aOrigin.x + 1.2 - t * 0.45, 2.4) - 1.2,
        1.18 - t * 2.36
      );

      vec2 mistPos = vec2(
        mod(aOrigin.x + 1.2 + uTime * (0.06 + aOrigin.z * 0.08) + sin(uTime * 0.5 + aPhase * 6.283) * 0.08, 2.4) - 1.2,
        aOrigin.y * 0.72 - 0.14 + cos(uTime * 0.65 + aPhase * 6.283) * 0.07
      );

      vec2 solarPos = vec2(
        aOrigin.x + sin(uTime * 0.9 + aPhase * 12.56) * 0.06,
        -1.12 + t * 2.24
      );

      vec2 finalPos =
        rainPos * uRainMix +
        mistPos * uMistMix +
        solarPos * uSolarMix;

      gl_Position = vec4(finalPos, 0.0, 1.0);

      // Keep center lane cleaner at high speed so visibility stays razor sharp
      float centerHole = smoothstep(0.12, 0.58, length(finalPos * vec2(0.85, 1.15)));
      float lifeFade = sin(t * 3.14159265);

      float rainSize = aSize * (1.0 + uSpeedNorm * 0.55) * uRainMix;
      float mistSize = aSize * 2.6 * uMistMix;
      float solarSize = aSize * (1.1 + uSolarPulse * 0.6) * uSolarMix;

      gl_PointSize = clamp((rainSize + mistSize + solarSize) * uPixelRatio, 2.0, 96.0);
      vStreakAspect = mix(1.0, 3.8 + uSpeedNorm * 2.2, uRainMix);

      float modeAlpha =
        uRainMix * (0.48 + uLightning * 0.35) +
        uMistMix * 0.32 +
        uSolarMix * (0.42 + uSolarPulse * 0.35);

      vAlpha = lifeFade * modeAlpha * (0.35 + 0.65 * centerHole) * (0.35 + 0.65 * uIntensity) * uActivity;
    } else {
      // ROLE B: Neon Rain Splashes & Expanding Impact Ripples (visible during 'rain')
      float splashRate = 0.85 + uSpeedNorm * 0.95 + aOrigin.z * 0.45;
      float life = fract(aPhase + uTime * splashRate);
      vLife = life;
      vStreakAspect = 1.0;

      // Re-scatter slightly each ripple cycle deterministically using cycle integer step
      float stepIdx = floor(aPhase + uTime * splashRate);
      float jitterX = fract(sin(stepIdx * 91.7 + aPhase * 43.1) * 4375.54) * 0.36 - 0.18;
      float jitterY = fract(cos(stepIdx * 57.3 + aPhase * 19.7) * 2841.19) * 0.20 - 0.10;

      // Concentrate neon rain splashes across the lower wet road reflection zone + outer bottom spray edges
      vec2 splashPos = vec2(
        clamp(aOrigin.x + jitterX, -0.96, 0.96),
        clamp(-0.92 + abs(aOrigin.y) * 0.68 + jitterY, -0.96, -0.14)
      );

      gl_Position = vec4(splashPos, 0.0, 1.0);

      // Expand rapidly on impact then dissipate
      float expand = 0.35 + 1.35 * sqrt(life);
      gl_PointSize = clamp(aSize * 2.4 * expand * activeBoost * uPixelRatio * uRainMix, 0.0, 110.0);

      float impactFade = smoothstep(0.0, 0.10, life) * (1.0 - smoothstep(0.32, 1.0, life));
      vAlpha = impactFade * uRainMix * (0.45 + 0.55 * uIntensity) * (0.75 + uLightning * 0.45) * uActivity;
    }
  }
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  varying float vRole;
  varying float vLife;
  varying float vColorMix;
  varying float vStreakAspect;
  varying float vAlpha;

  uniform float uRainMix;
  uniform float uMistMix;
  uniform float uSolarMix;

  void main() {
    if (vAlpha < 0.008) discard;

    vec2 centered = gl_PointCoord - vec2(0.5);

    if (vRole < 0.5) {
      // Atmospheric Streak / Spore / Ember
      // Slight diagonal rain wind shear when in rain mode
      float shear = uRainMix * 0.18;
      vec2 sheared = vec2(centered.x + centered.y * shear, centered.y);
      vec2 scaled = vec2(sheared.x * vStreakAspect * 2.2, sheared.y * 2.0);
      float dist = length(scaled);
      float core = exp(-dist * dist * 4.5);

      if (core < 0.03) discard;

      // Palette per weather kind
      vec3 rainCol = mix(
        vec3(0.08, 0.92, 1.0),   // Electric Neon Cyan
        mix(vec3(0.96, 0.24, 0.88), vec3(0.75, 0.88, 1.0), step(0.68, vColorMix)),
        smoothstep(0.25, 0.75, vColorMix)
      );

      vec3 mistCol = mix(
        vec3(0.18, 0.94, 0.84),
        vec3(0.62, 0.78, 1.0),
        vColorMix
      );

      vec3 solarCol = mix(
        vec3(1.0, 0.76, 0.24),
        vec3(1.0, 0.42, 0.20),
        vColorMix
      );

      vec3 col = rainCol * uRainMix + mistCol * uMistMix + solarCol * uSolarMix;
      gl_FragColor = vec4(col, core * vAlpha);
    } else {
      // ROLE B: Neon Rain Splash Ripple Ring + Crown Droplets
      vec2 squashed = vec2(centered.x * 1.0, centered.y * 1.48); // Perspective foreshortened ground ripple
      float r = length(squashed) * 2.0;
      if (r > 1.0) discard;

      float ringRadius = 0.22 + vLife * 0.68;
      float ringWidth = 0.095 * (1.0 - vLife * 0.45);
      float mainRing = exp(-pow((r - ringRadius) / max(0.02, ringWidth), 2.0));

      // Secondary inner ripple
      float innerRing = exp(-pow((r - ringRadius * 0.56) / 0.055, 2.0)) * 0.65 * (1.0 - vLife);

      // Upward neon splash crown droplets around upper arc
      float angle = atan(centered.y, centered.x);
      float crown = pow(max(0.0, cos(angle * 6.0)), 6.0)
        * exp(-pow((r - (0.18 + vLife * 0.45)) / 0.14, 2.0))
        * smoothstep(0.25, -0.35, centered.y)
        * (1.0 - vLife);

      // Central splash flash spark at early impact
      float flashCore = exp(-r * r * 28.0) * (1.0 - smoothstep(0.0, 0.32, vLife));

      float splashShape = clamp(mainRing + innerRing + crown * 0.85 + flashCore * 0.9, 0.0, 1.0);
      if (splashShape < 0.02) discard;

      vec3 neonCyan = vec3(0.12, 0.96, 1.0);
      vec3 neonMagenta = vec3(1.0, 0.22, 0.82);
      vec3 splashTint = mix(neonCyan, neonMagenta, smoothstep(0.35, 0.82, vColorMix));
      vec3 hotCenter = vec3(0.92, 0.98, 1.0);

      vec3 finalSplashCol = mix(splashTint, hotCenter, flashCore * 0.65);
      gl_FragColor = vec4(finalSplashCol, splashShape * vAlpha);
    }
  }
`;

export function WeatherEngine({ weather, speedNorm = 0, step }: WeatherEngineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Store fast-changing HUD props inside a ref so WebGL renderer & shaders never re-mount
  const latestPropsRef = useRef({ weather, speedNorm, step });
  latestPropsRef.current = { weather, speedNorm, step };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      });
    } catch {
      return;
    }

    const getPixelRatio = () =>
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);

    renderer.setPixelRatio(getPixelRatio());
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);

    let contextLost = false;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // 1. Volumetric Fog & Procedural Lightning Fullscreen Shader Quad
    const atmoGeo = new THREE.PlaneGeometry(2, 2);
    const atmoUniforms = {
      uTime: { value: 0 },
      uResolution: {
        value: new THREE.Vector2(
          container.clientWidth || window.innerWidth,
          container.clientHeight || window.innerHeight
        )
      },
      uIntensity: { value: weather.intensity },
      uRainMix: { value: weather.kind === 'rain' ? 1 : 0 },
      uMistMix: { value: weather.kind === 'mist' ? 1 : 0 },
      uSolarMix: { value: weather.kind === 'solar' ? 1 : 0 },
      uLightning: { value: 0 },
      uBoltStrength: { value: 0 },
      uBoltOrigin: { value: 0.25 },
      uBoltSeed: { value: 1.7 },
      uSolarPulse: { value: 0 },
      uSpeedNorm: { value: 0 },
      uActivity: { value: 1 },
      uLowSpec: { value: isSoftwareGl ? 1 : 0 }
    };

    const atmoMat = new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      vertexShader: ATMOSPHERE_VERTEX_SHADER,
      fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const atmoQuad = new THREE.Mesh(atmoGeo, atmoMat);
    atmoQuad.frustumCulled = false;
    scene.add(atmoQuad);

    // 2. Dual-Role GPU Particle Shader (Streaks/Mist/Embers + Neon Rain Splash Ripples)
    const particleCount = isSoftwareGl ? 220 : 440;
    const splashCount = Math.floor(particleCount * 0.36);

    const positions = new Float32Array(particleCount * 3);
    const origins = new Float32Array(particleCount * 3);
    const roles = new Float32Array(particleCount);
    const phases = new Float32Array(particleCount);
    const sizes = new Float32Array(particleCount);
    const colorMixes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const isSplash = i >= particleCount - splashCount;
      roles[i] = isSplash ? 1.0 : 0.0;

      // Deterministic pseudo-random layout without allocating helper arrays
      const r1 = Math.sin(i * 12.9898 + 1.23) * 43758.5453;
      const r2 = Math.sin(i * 78.233 + 4.56) * 29341.127;
      const r3 = Math.sin(i * 39.425 + 7.89) * 18423.819;
      const f1 = r1 - Math.floor(r1);
      const f2 = r2 - Math.floor(r2);
      const f3 = r3 - Math.floor(r3);

      const ox = (f1 * 2.0 - 1.0) * 1.05;
      const oy = (f2 * 2.0 - 1.0) * 1.05;
      const oz = f3;

      origins[i * 3] = ox;
      origins[i * 3 + 1] = oy;
      origins[i * 3 + 2] = oz;

      positions[i * 3] = ox;
      positions[i * 3 + 1] = oy;
      positions[i * 3 + 2] = 0;

      phases[i] = (i * 0.6180339887) % 1;
      sizes[i] = isSplash ? 12 + f3 * 22 : 10 + f3 * 16;
      colorMixes[i] = (f1 * 0.6 + f3 * 0.4) % 1;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
    particleGeo.setAttribute('aRole', new THREE.BufferAttribute(roles, 1));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    particleGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    particleGeo.setAttribute('aColorMix', new THREE.BufferAttribute(colorMixes, 1));

    const particleUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: getPixelRatio() },
      uRainMix: { value: weather.kind === 'rain' ? 1 : 0 },
      uMistMix: { value: weather.kind === 'mist' ? 1 : 0 },
      uSolarMix: { value: weather.kind === 'solar' ? 1 : 0 },
      uIntensity: { value: weather.intensity },
      uSpeedNorm: { value: 0 },
      uLightning: { value: 0 },
      uSolarPulse: { value: 0 },
      uActivity: { value: 1 }
    };

    const particleMat = new THREE.ShaderMaterial({
      uniforms: particleUniforms,
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    particles.frustumCulled = false;
    scene.add(particles);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const pr = getPixelRatio();
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h);
      atmoUniforms.uResolution.value.set(w, h);
      particleUniforms.uPixelRatio.value = pr;
    };
    window.addEventListener('resize', onResize);

    // Smooth animation state
    let rafId = 0;
    let timerId: number | null = null;
    let disposed = false;
    let simTime = 0;
    let lastNow = performance.now();

    let smoothRain = weather.kind === 'rain' ? 1 : 0;
    let smoothMist = weather.kind === 'mist' ? 1 : 0;
    let smoothSolar = weather.kind === 'solar' ? 1 : 0;
    let smoothIntensity = weather.intensity;
    let smoothSpeed = 0;
    let smoothActivity = 1;
    let prevLightning = 0;
    let boltStrength = 0;
    let autoBoltTimer = 3.2;

    const triggerBolt = (strength: number) => {
      boltStrength = Math.max(boltStrength, strength);
      atmoUniforms.uBoltOrigin.value = 0.14 + Math.random() * 0.72;
      atmoUniforms.uBoltSeed.value = 1 + Math.random() * 90;
    };

    const tick = (now: number) => {
      if (disposed) return;

      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const { weather: curWeather, speedNorm: curSpeed, step: curStep } = latestPropsRef.current;

      // Pause sim time cleanly while pause menu is active, keep atmospheric preview in menus
      const isPaused = curStep === 'paused';
      const isMenu = curStep === 'home' || curStep === 'driver' || curStep === 'level';
      const targetActivity = isPaused ? 0.25 : isMenu ? 0.58 : 1.0;

      if (!isPaused) {
        simTime += rawDt;
      }

      const damp = 1 - Math.exp(-rawDt * 3.8);
      const fastDamp = 1 - Math.exp(-rawDt * 8.0);

      const targetRain = curWeather.kind === 'rain' ? 1 : 0;
      const targetMist = curWeather.kind === 'mist' ? 1 : 0;
      const targetSolar = curWeather.kind === 'solar' ? 1 : 0;

      smoothRain += (targetRain - smoothRain) * damp;
      smoothMist += (targetMist - smoothMist) * damp;
      smoothSolar += (targetSolar - smoothSolar) * damp;
      smoothIntensity += (curWeather.intensity - smoothIntensity) * damp;
      smoothSpeed += (curSpeed - smoothSpeed) * fastDamp;
      smoothActivity += (targetActivity - smoothActivity) * damp;

      // Sync procedural lightning strikes with HUD lightningFlash + organic rainstorm discharges
      const hudFlash = curWeather.lightningFlash || 0;
      if (hudFlash > prevLightning + 0.22 && curWeather.kind === 'rain') {
        triggerBolt(Math.min(1, hudFlash * 1.15));
      }
      prevLightning = hudFlash;

      if (!isPaused && curWeather.kind === 'rain' && curWeather.intensity > 0.35) {
        autoBoltTimer -= rawDt * (0.65 + curWeather.intensity * 0.85);
        if (autoBoltTimer <= 0) {
          autoBoltTimer = 3.8 + Math.random() * 5.2;
          triggerBolt(0.85 + Math.random() * 0.2);
        }
      }
      boltStrength = Math.max(0, boltStrength - rawDt * 3.4);

      // Update uniforms
      atmoUniforms.uTime.value = simTime;
      atmoUniforms.uRainMix.value = smoothRain;
      atmoUniforms.uMistMix.value = smoothMist;
      atmoUniforms.uSolarMix.value = smoothSolar;
      atmoUniforms.uIntensity.value = smoothIntensity;
      atmoUniforms.uLightning.value = hudFlash;
      atmoUniforms.uBoltStrength.value = boltStrength;
      atmoUniforms.uSolarPulse.value = curWeather.solarPulse || 0;
      atmoUniforms.uSpeedNorm.value = smoothSpeed;
      atmoUniforms.uActivity.value = smoothActivity;

      particleUniforms.uTime.value = simTime;
      particleUniforms.uRainMix.value = smoothRain;
      particleUniforms.uMistMix.value = smoothMist;
      particleUniforms.uSolarMix.value = smoothSolar;
      particleUniforms.uIntensity.value = smoothIntensity;
      particleUniforms.uSpeedNorm.value = smoothSpeed;
      particleUniforms.uLightning.value = Math.max(hudFlash, boltStrength);
      particleUniforms.uSolarPulse.value = curWeather.solarPulse || 0;
      particleUniforms.uActivity.value = smoothActivity;

      if (!contextLost) {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        timerId = window.setTimeout(() => {
          if (!disposed) rafId = requestAnimationFrame(tick);
        }, 70);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      scene.remove(atmoQuad);
      scene.remove(particles);
      atmoGeo.dispose();
      atmoMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();

      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-weather-kind={weather.kind}
      aria-hidden="true"
      className="fixed inset-0 z-[4] pointer-events-none overflow-hidden"
    />
  );
}
