const U64_MASK = 0xffffffffffffffffn;
const GAMMA = 0x9e3779b97f4a7c15n;

function u64(value: bigint): bigint {
  return value & U64_MASK;
}

export class SplitMix64 {
  private state: bigint;

  public constructor(seed: bigint) {
    this.state = u64(seed);
  }

  public next(): bigint {
    this.state = u64(this.state + GAMMA);
    let z = this.state;
    z = u64((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = u64((z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    z = u64(z ^ (z >> 31n));
    return z;
  }
}
