import { DIR8_NONE } from "../domain/hydrology.js";
import type { GridShape } from "../domain/topography.js";
import { mix64 } from "../lib/sub-seed.js";

const U64_MASK = 0xffffffffffffffffn;
const X_MIX = 0x9e3779b97f4a7c15n;
const Y_MIX = 0xc2b2ae3d27d4eb4fn;

export const DIR8_NEIGHBORS = [
  { dir: 0, dx: 1, dy: 0 }, // E
  { dir: 1, dx: 1, dy: 1 }, // SE
  { dir: 2, dx: 0, dy: 1 }, // S
  { dir: 3, dx: -1, dy: 1 }, // SW
  { dir: 4, dx: -1, dy: 0 }, // W
  { dir: 5, dx: -1, dy: -1 }, // NW
  { dir: 6, dx: 0, dy: -1 }, // N
  { dir: 7, dx: 1, dy: -1 } // NE
] as const;

export interface FlowDirectionParams {
  minDropThreshold: number;
  tieEps: number;
}

function u64(value: bigint): bigint {
  return value & U64_MASK;
}

function validateMapLength(shape: GridShape, map: ArrayLike<unknown>, mapName: string): void {
  if (map.length !== shape.size) {
    throw new Error(
      `Hydrology ${mapName} length mismatch: expected ${shape.size}, got ${map.length}.`
    );
  }
}

export function tieBreakHash64(seed: bigint, x: number, y: number): bigint {
  let z = u64(seed);
  z = u64(z ^ u64(BigInt(x) * X_MIX));
  z = u64(z ^ u64(BigInt(y) * Y_MIX));
  return mix64(z);
}

export function deriveFlowDirection(
  shape: GridShape,
  h: Float32Array,
  seed: bigint,
  params: FlowDirectionParams
): Uint8Array {
  validateMapLength(shape, h, "H");

  const fd = new Uint8Array(shape.size).fill(DIR8_NONE);
  const { minDropThreshold, tieEps } = params;

  for (let y = 0; y < shape.height; y += 1) {
    for (let x = 0; x < shape.width; x += 1) {
      const centerIndex = y * shape.width + x;
      const centerHeight = h[centerIndex];

      let maxDrop = Number.NEGATIVE_INFINITY;
      const tiedCandidates: number[] = [];

      for (const neighbor of DIR8_NEIGHBORS) {
        const nx = x + neighbor.dx;
        const ny = y + neighbor.dy;
        if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
          continue;
        }

        const neighborHeight = h[ny * shape.width + nx];
        const drop = centerHeight - neighborHeight;
        if (drop < minDropThreshold) {
          continue;
        }

        if (drop > maxDrop + tieEps) {
          maxDrop = drop;
          tiedCandidates.length = 0;
          tiedCandidates.push(neighbor.dir);
        } else if (Math.abs(drop - maxDrop) <= tieEps) {
          tiedCandidates.push(neighbor.dir);
        }
      }

      if (tiedCandidates.length === 1) {
        fd[centerIndex] = tiedCandidates[0];
      } else if (tiedCandidates.length > 1) {
        const pick = Number(tieBreakHash64(seed, x, y) % BigInt(tiedCandidates.length));
        fd[centerIndex] = tiedCandidates[pick];
      }
    }
  }

  return fd;
}

export { DIR8_NONE };
