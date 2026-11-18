/**
 * Sound for the Arena, synthesised with the Web Audio API — no audio files. Scoring events climb a pentatonic
 * ladder with the combo (a chain reaction turns into a little tune); pops, thuds and gongs have their own voices.
 * Nothing here may ever throw: a browser without Web Audio simply stays silent.
 */
const ROOT_HZ = 220 // A3
/** major pentatonic, in semitones above the root — every note of it sounds good after any other */
const SCALE = [0, 2, 4, 7, 9]
/** the ladder is two octaves long; the combo can't climb past its top */
const LADDER = SCALE.length * 2

/** The frequency of step `index` of the ladder (0 = the root, 5 = one octave up, clamped to the top note). */
export function pentatonicHz(index: number): number {
  const i = Math.max(0, Math.min(Math.floor(Number.isFinite(index) ? index : 0), LADDER - 1))
  const octave = Math.floor(i / SCALE.length)
  const semitones = SCALE[i % SCALE.length]! + 12 * octave
  return ROOT_HZ * 2 ** (semitones / 12)
}

type CtxFactory = () => AudioContext | null

function defaultFactory(): AudioContext | null {
  const w = globalThis as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  return Ctor ? new Ctor() : null
}

export class Sfx {
  muted = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private last = new Map<string, number>()

  constructor(private readonly factory: CtxFactory = defaultFactory) {}

  /** Call from a user gesture (click, key, pointer): browsers only allow audio after one. Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = this.factory()
        if (this.ctx) {
          this.master = this.ctx.createGain()
          this.master.gain.value = 0.45
          this.master.connect(this.ctx.destination)
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      this.ctx = null
      this.master = null
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  /** Is there anything to play on (after an `unlock`)? */
  get available(): boolean {
    return !!this.ctx && !!this.master
  }

  /** at most one sound of a kind per `gap` seconds, so a pile of crates crashing doesn't become noise */
  private ready(kind: string, gap: number): boolean {
    if (this.muted || !this.ctx || !this.master) return false
    const now = this.ctx.currentTime
    if (now - (this.last.get(kind) ?? -1) < gap) return false
    this.last.set(kind, now)
    return true
  }

  /** A soft bell: a note of the ladder. Used for every scoring event; `index` = combo − 1. */
  note(index: number, volume = 1): void {
    if (!this.ready('note', 0.03)) return
    try {
      const f = pentatonicHz(index)
      this.tone(f, 0.55, 0.22 * volume)
      this.tone(f * 2, 0.3, 0.07 * volume) // a little shimmer an octave up
    } catch {
      /* silent */
    }
  }

  /** The big one: a gong — a low note with inharmonic partials and a long tail. */
  gong(index: number): void {
    if (!this.ready('gong', 0.15)) return
    try {
      const f = pentatonicHz(index) / 2
      this.tone(f, 2.2, 0.3)
      this.tone(f * 2.76, 1.4, 0.12)
      this.tone(f * 5.4, 0.8, 0.06)
    } catch {
      /* silent */
    }
  }

  /** A balloon pop: a short burst of filtered noise. */
  pop(): void {
    if (!this.ready('pop', 0.04) || !this.ctx || !this.master) return
    try {
      const ctx = this.ctx
      const len = Math.floor(ctx.sampleRate * 0.12)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
      const src = ctx.createBufferSource()
      src.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1800
      filter.Q.value = 1.1
      const g = ctx.createGain()
      g.gain.value = 0.5
      src.connect(filter).connect(g).connect(this.master)
      src.start()
    } catch {
      /* silent */
    }
  }

  /** A wooden thud, `strength` 0..1 (a harder crash is lower and louder). */
  thud(strength: number): void {
    if (!this.ready('thud', 0.05) || !this.ctx || !this.master) return
    try {
      const ctx = this.ctx
      const s = Math.max(0, Math.min(1, strength))
      const t = ctx.currentTime
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(150 - 60 * s, t)
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.18)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.12 + 0.3 * s, t + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      osc.connect(g).connect(this.master)
      osc.start(t)
      osc.stop(t + 0.25)
    } catch {
      /* silent */
    }
  }

  private tone(freq: number, seconds: number, volume: number): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(volume, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
    osc.connect(g).connect(this.master!)
    osc.start(t)
    osc.stop(t + seconds + 0.05)
  }
}
