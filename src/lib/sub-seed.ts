export type BaseMapId = "H" | "R" | "V";

const U64_MASK = 0xffffffffffffffffn;
const MAP_CONST: Record<BaseMapId, bigint> = {
  H: 0x4848484848484848n,
  R: 0x5252525252525252n,
  V: 0x5656565656565656n
};

function u64(value: bigint): bigint {
  return value & U64_MASK;
}

export function mix64(input: bigint): bigint {
  let z = u64(input);
  z = u64((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
  z = u64((z ^ (z >> 27n)) * 0x94d049bb133111ebn);
  z = u64(z ^ (z >> 31n));
  return z;
}

export function subSeed(seed: bigint, mapId: BaseMapId, octaveIndex: number): bigint {
  let z = u64(seed);
  z = u64(z ^ MAP_CONST[mapId]);
  z = u64(z ^ (BigInt(octaveIndex) * 0x9e3779b97f4a7c15n));
  return mix64(z);
}
