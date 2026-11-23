import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Cooked racer chassis loader.
 *
 * The exported GLBs are centred and metre-scaled by tools/cook-racers.sh, but
 * they still need a pivot/scale pass per chassis because each Meshy model came
 * out of the generator at a different length. Loading is async, so the vehicle
 * builder draws a halo-only placeholder and the engine rebuilds the ship once
 * `onRacerModelReady` fires.
 */
const TARGET_LENGTH = 4.6;

/** Yaw needed so the model's nose points along +Z like the procedural hulls. */
const MODEL_YAW: Record<string, number> = {
  'chao-space-racer': 0,
  // These three were generated nose-along-X, so they need a quarter turn to
  // point down +Z like the Chao and the procedural hulls.
  'green-space-racer': -Math.PI / 2,
  'angel-chao-racer': -Math.PI / 2,
  'midnight-aero-majesty': -Math.PI / 2
};

const cache = new Map<string, THREE.Group>();
const pending = new Set<string>();
const listeners: (() => void)[] = [];

export function onRacerModelReady(cb: () => void): void {
  listeners.push(cb);
}

export function racerModel(name: string): THREE.Group | null {
  return cache.get(name) ?? null;
}

export function preloadRacerModel(name: string): void {
  if (cache.has(name) || pending.has(name)) return;
  pending.add(name);

  new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .load(
      `/assets/models/${name}.glb`,
      (gltf) => {
        const src = gltf.scene;
        src.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          // Accessor bounds in these files are not trustworthy for culling.
          mesh.geometry.computeBoundingBox();
          mesh.geometry.computeBoundingSphere();
          mesh.frustumCulled = false;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial;
            // Baked livery: single-sided and a touch of reflection lift so the
            // model sits in the same lighting as the procedural hulls.
            std.side = THREE.FrontSide;
            std.envMapIntensity = 1.1;
          }
        });

        src.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(src);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const k = TARGET_LENGTH / Math.max(size.z, 0.001);

        src.position.sub(centre);
        const holder = new THREE.Group();
        holder.add(src);
        holder.scale.setScalar(k);
        holder.rotation.y = MODEL_YAW[name] ?? 0;
        // Sit the hull just above the hover halo at y = -0.78.
        holder.position.y = -0.55 + (size.y * k) / 2;

        pending.delete(name);
        cache.set(name, holder);
        for (const cb of listeners) cb();
      },
      undefined,
      () => {
        pending.delete(name);
      }
    );
}
