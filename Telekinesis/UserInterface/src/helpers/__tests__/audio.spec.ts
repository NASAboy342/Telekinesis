import { describe, expect, it } from 'vitest'
import { Sfx, pentatonicHz } from '../audio'

describe('pentatonicHz: the combo ladder', () => {
  it('starts on the root and climbs through the pentatonic scale', () => {
    expect(pentatonicHz(0)).toBeCloseTo(220, 6)
    const semis = [0, 1, 2, 3, 4].map((i) => 12 * Math.log2(pentatonicHz(i) / 220))
    semis.forEach((s, i) => expect(s).toBeCloseTo([0, 2, 4, 7, 9][i]!, 6))
  })

  it('every fifth step is the same note one octave higher', () => {
    expect(pentatonicHz(5)).toBeCloseTo(440, 6)
    expect(pentatonicHz(7)).toBeCloseTo(pentatonicHz(2) * 2, 6)
  })

  it('always rises (so a longer chain always sounds higher) until the top, then stays', () => {
    for (let i = 1; i < 10; i++) expect(pentatonicHz(i)).toBeGreaterThan(pentatonicHz(i - 1))
    expect(pentatonicHz(10)).toBe(pentatonicHz(9))
    expect(pentatonicHz(500)).toBe(pentatonicHz(9))
  })

  it('copes with junk: negative, fractional, NaN', () => {
    expect(pentatonicHz(-3)).toBe(pentatonicHz(0))
    expect(pentatonicHz(2.9)).toBe(pentatonicHz(2))
    expect(pentatonicHz(Number.NaN)).toBe(pentatonicHz(0))
  })
})

/** just enough of the Web Audio API to count what is created */
function fakeContext() {
  const created = { osc: 0, gain: 0, source: 0, filter: 0 }
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  })
  const node = <T extends object>(extra: T) => {
    const n: Record<string, unknown> = { connect: (to: unknown) => to, ...extra }
    return n
  }
  const ctx = {
    currentTime: 1,
    sampleRate: 8000,
    state: 'suspended' as 'suspended' | 'running',
    destination: node({}),
    resumed: 0,
    resume() {
      this.resumed++
      this.state = 'running'
      return Promise.resolve()
    },
    createGain() {
      created.gain++
      return node({ gain: param() })
    },
    createOscillator() {
      created.osc++
      return node({ type: 'sine', frequency: param(), start() {}, stop() {} })
    },
    createBiquadFilter() {
      created.filter++
      return node({ type: 'lowpass', frequency: param(), Q: param() })
    },
    createBuffer(_c: number, len: number) {
      return { getChannelData: () => new Float32Array(len) }
    },
    createBufferSource() {
      created.source++
      return node({ buffer: null, start() {} })
    },
  }
  return { ctx, created }
}

describe('Sfx', () => {
  it('is silent and never throws before it is unlocked, or when there is no Web Audio at all', () => {
    const none = new Sfx(() => null)
    none.unlock()
    expect(none.available).toBe(false)
    expect(() => {
      none.note(3)
      none.gong(2)
      none.pop()
      none.thud(0.7)
    }).not.toThrow()
    const early = new Sfx(() => fakeContext().ctx as unknown as AudioContext)
    expect(() => early.note(0)).not.toThrow() // not unlocked yet
  })

  it('a factory that throws is survived', () => {
    const bad = new Sfx(() => {
      throw new Error('no audio device')
    })
    expect(() => bad.unlock()).not.toThrow()
    expect(bad.available).toBe(false)
    expect(() => bad.note(1)).not.toThrow()
  })

  it('unlock creates the context once and resumes it; the voices make sound afterwards', () => {
    const { ctx, created } = fakeContext()
    let made = 0
    const sfx = new Sfx(() => {
      made++
      return ctx as unknown as AudioContext
    })
    sfx.unlock()
    sfx.unlock()
    expect(made).toBe(1)
    expect(ctx.resumed).toBeGreaterThanOrEqual(1)
    expect(sfx.available).toBe(true)
    sfx.note(2)
    expect(created.osc).toBeGreaterThanOrEqual(1)
    ctx.currentTime += 1
    sfx.pop()
    expect(created.source).toBe(1)
    ctx.currentTime += 1
    sfx.thud(1)
    ctx.currentTime += 1
    sfx.gong(0)
    expect(created.osc).toBeGreaterThanOrEqual(6) // note (2) + thud (1) + gong (3)
  })

  it('muting makes everything silent, unmuting brings it back', () => {
    const { ctx, created } = fakeContext()
    const sfx = new Sfx(() => ctx as unknown as AudioContext)
    sfx.unlock()
    sfx.setMuted(true)
    sfx.note(1)
    sfx.pop()
    sfx.thud(0.5)
    sfx.gong(1)
    expect(created.osc + created.source).toBe(0)
    sfx.setMuted(false)
    ctx.currentTime += 1
    sfx.note(1)
    expect(created.osc).toBeGreaterThan(0)
  })

  it('a storm of identical events is rate-limited (a crashing pile is not a wall of noise)', () => {
    const { ctx, created } = fakeContext()
    const sfx = new Sfx(() => ctx as unknown as AudioContext)
    sfx.unlock()
    for (let i = 0; i < 50; i++) sfx.thud(0.6) // all at the same instant
    expect(created.osc).toBe(1)
    ctx.currentTime += 0.2
    sfx.thud(0.6)
    expect(created.osc).toBe(2)
  })
})
