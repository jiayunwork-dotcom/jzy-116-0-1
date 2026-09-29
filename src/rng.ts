/**
 * Seeded random number generation.
 *
 * The generator is a fixed, deterministic algorithm (mulberry32) so that a
 * given seed always produces the exact same stream of uniforms. Inter-arrival
 * and service times are sampled from an exponential distribution via inverse
 * transform: -ln(1 - U) / rate.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Uniform(0, 1). Deterministic for a given seed. */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Exponential(rate) sample, rate > 0. */
  exponential(rate: number): number {
    return -Math.log(1 - this.next()) / rate;
  }
}
