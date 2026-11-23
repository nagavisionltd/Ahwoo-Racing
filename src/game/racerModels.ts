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
  // All four cooked exports already point nose-along +Z; any extra yaw here
  // swings the nozzles onto the hull's flank.
};

/**
 * Per-chassis fit trims applied on top of the shared length normalisation.
 * The verdant hull is a broad leaf-creature rather than a wedge, so it sits
 * small and nose-high on the pad; lifted, lengthened and pitched nose-down it
 * reads as a speeder instead of a plant on a dais.
 */
const MODEL_FIT: Record<string, { scale?: number; lift?: number; pitch?: number }> = {
  'green-space-racer': { scale: 1.3, lift: 0.14, pitch: 0.2 }
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
        const fit = MODEL_FIT[name] ?? {};
        const k = (TARGET_LENGTH * (fit.scale ?? 1)) / Math.max(size.z, 0.001);

        src.position.sub(centre);
        const holder = new THREE.Group();
        holder.add(src);
        holder.scale.setScalar(k);
        holder.rotation.y = MODEL_YAW[name] ?? 0;
        holder.rotation.x = fit.pitch ?? 0;
        // Sit the hull just above the hover halo at y = -0.78.
        holder.position.y = -0.55 + (size.y * k) / 2 + (fit.lift ?? 0);

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
