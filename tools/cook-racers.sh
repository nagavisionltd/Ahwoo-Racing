#!/usr/bin/env bash
# Cook the Meshy racer exports into game-ready GLBs.
#
# The source exports (gltfpack 1.2) ship 0.7M-3.1M triangles, 2048^2 maps,
# double-sided materials, no tangents, a corner pivot and stale POSITION
# min/max from the original quantization. This pipeline fixes all of that:
#
#   dequantize  drop KHR_mesh_quantization so bounds and pivots are truthful
#   weld        merge split vertices before simplifying (verts/tri was 0.53)
#   simplify    meshoptimizer decimation to the target vertex ratio
#   tangents    MikkTSpace tangents so normal maps shade correctly
#   resize      maps down to 1024^2
#   webp        quality 84
#   meshopt     EXT_meshopt_compression for transport
#
# Usage: tools/cook-racers.sh [name ...]     (default: all four)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/assets/models"
WORK="${WORK:-/tmp/racer-cook}"
CLI=(npx --yes @gltf-transform/cli@4)

mkdir -p "$OUT" "$WORK"

# name|source|simplify ratio|output file
MODELS=(
  "chao|$HOME/Downloads/meshy-batch/chao-space-racer/model.glb|0.15|chao-space-racer.glb"
  "green|$HOME/Downloads/meshy-batch/green-space-racer/model.glb|0.05|green-space-racer.glb"
  "angel|$HOME/Downloads/meshy-batch/anrgy-chao-angel-racer/model.glb|0.065|angel-chao-racer.glb"
  "majesty|$HOME/Downloads/meshy-tools/midnight-aero-majesty/model.glb|0.032|midnight-aero-majesty.glb"
)

cook() {
  local name="$1" src="$2" ratio="$3" dest="$4"
  echo "== $name"
  "${CLI[@]}" dequantize "$src" "$WORK/$name-a.glb" >/dev/null
  "${CLI[@]}" weld "$WORK/$name-a.glb" "$WORK/$name-b.glb" >/dev/null
  "${CLI[@]}" simplify "$WORK/$name-b.glb" "$WORK/$name-c.glb" --ratio "$ratio" --error 0.0015
  "${CLI[@]}" tangents "$WORK/$name-c.glb" "$WORK/$name-d.glb" >/dev/null
  "${CLI[@]}" resize "$WORK/$name-d.glb" "$WORK/$name-e.glb" --width 1024 --height 1024
  "${CLI[@]}" webp "$WORK/$name-e.glb" "$WORK/$name-f.glb" --quality 84
  "${CLI[@]}" meshopt "$WORK/$name-f.glb" "$WORK/$name-final.glb"
  cp "$WORK/$name-final.glb" "$OUT/$dest"
  ls -lh "$OUT/$dest"
}

wanted=("$@")
for entry in "${MODELS[@]}"; do
  IFS='|' read -r name src ratio dest <<<"$entry"
  if [ ${#wanted[@]} -eq 0 ] || printf '%s\n' "${wanted[@]}" | grep -qx "$name"; then
    cook "$name" "$src" "$ratio" "$dest"
  fi
done
