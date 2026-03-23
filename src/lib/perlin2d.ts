import { SplitMix64 } from "./splitmix64.js";

const SQRT_2 = Math.SQRT2;
const PERM_TABLE_SIZE = 256;
const PERM_TABLE_EXPANDED_SIZE = 512;

const GRADIENTS_2D: readonly [number, number][] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

export type PermutationTable = Uint16Array;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function gradDot(hash: number, x: number, y: number): number {
  const [gx, gy] = GRADIENTS_2D[hash & 7];
  return gx * x + gy * y;
}

function floorFast(value: number): number {
  return Math.floor(value);
}

export function createPermutationTable(seed: bigint): PermutationTable {
  const rng = new SplitMix64(seed);
  const perm = new Uint16Array(PERM_TABLE_SIZE);
  for (let i = 0; i < PERM_TABLE_SIZE; i += 1) {
    perm[i] = i;
  }

  for (let i = PERM_TABLE_SIZE - 1; i > 0; i -= 1) {
    const rand = rng.next();
    const j = Number(rand % BigInt(i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }

  const expanded = new Uint16Array(PERM_TABLE_EXPANDED_SIZE);
  for (let i = 0; i < PERM_TABLE_EXPANDED_SIZE; i += 1) {
    expanded[i] = perm[i & 255];
  }
  return expanded;
}

export function perlinNoise2d(x: number, y: number, perm: PermutationTable): number {
  const x0 = floorFast(x);
  const y0 = floorFast(y);
  const xf = x - x0;
  const yf = y - y0;

  const xi = x0 & 255;
  const yi = y0 & 255;

  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];

  const x1 = lerp(gradDot(aa, xf, yf), gradDot(ba, xf - 1, yf), u);
  const x2 = lerp(gradDot(ab, xf, yf - 1), gradDot(bb, xf - 1, yf - 1), u);

  // Normalize 2D gradient dot output into [-1, 1] before octave composition.
  return clamp(lerp(x1, x2, v) / SQRT_2, -1, 1);
}
