/** One Euro filter: smooths jitter when still, stays responsive when moving fast. */
export class OneEuro {
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev = 0

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.05,
    private readonly dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  /** @param t time in seconds (monotonic) */
  filter(x: number, t: number): number {
    if (this.xPrev === null) {
      this.xPrev = x
      this.tPrev = t
      return x
    }
    const dt = Math.max(t - this.tPrev, 1e-3)
    const dx = (x - this.xPrev) / dt
    const aD = OneEuro.alpha(this.dCutoff, dt)
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev)
    const a = OneEuro.alpha(cutoff, dt)
    this.xPrev = a * x + (1 - a) * this.xPrev
    this.tPrev = t
    return this.xPrev
  }
}
