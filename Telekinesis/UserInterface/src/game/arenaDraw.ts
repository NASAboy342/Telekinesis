import type { Arena, Effect } from './arena'
import type { Distractor } from './distractors'
import { fanOn } from './distractors'
import type { Prop } from './physics'

/**
 * Draws the Arena on a canvas whose transform is already "world units" (so every size here is in world units and every
 * line width is `px / zoom`). Everything is a black outline on white — no fills — like the balls.
 */
const TAU = Math.PI * 2

/** props and distractors (drawn under the balls) */
export function drawArenaWorld(ctx: CanvasRenderingContext2D, arena: Arena, zoom: number): void {
  const px = (n: number) => n / zoom // screen pixels → world units
  ctx.strokeStyle = '#000'
  ctx.fillStyle = '#fff'
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  // the distractors' reach can cross the floor line: never draw below it
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, arena.width, arena.floor)
  ctx.clip()
  for (const d of arena.distractors) drawDistractor(ctx, d, arena.t, px)
  ctx.restore()
  for (const p of arena.phys.props) drawProp(ctx, arena, p, px)
}

/** rings, bursts and score text (drawn over everything) */
export function drawArenaEffects(ctx: CanvasRenderingContext2D, arena: Arena, zoom: number): void {
  const px = (n: number) => n / zoom
  ctx.strokeStyle = '#000'
  ctx.setLineDash([])
  for (const e of arena.effects) drawEffect(ctx, e, px)
  ctx.globalAlpha = 1
}

function drawProp(ctx: CanvasRenderingContext2D, arena: Arena, p: Prop, px: (n: number) => number) {
  const c = arena.phys.pos(p)
  const a = arena.phys.angle(p)
  ctx.lineWidth = px(1.2)
  switch (p.kind) {
    case 'crate': {
      if (p.shape.type !== 'box') return
      const { hw, hh } = p.shape
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(a)
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2)
      ctx.beginPath() // a diagonal brace, so you can see it turn
      ctx.moveTo(-hw, -hh)
      ctx.lineTo(hw, hh)
      ctx.stroke()
      ctx.restore()
      return
    }
    case 'domino': {
      if (p.shape.type !== 'box') return
      const { hw, hh } = p.shape
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(a)
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2)
      ctx.beginPath() // a pip near the top
      ctx.arc(0, -hh * 0.45, hw * 0.28, 0, TAU)
      ctx.stroke()
      ctx.restore()
      return
    }
    case 'platform':
    case 'post': {
      if (p.shape.type !== 'box') return
      const { hw, hh } = p.shape
      ctx.lineWidth = px(2)
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(a)
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2)
      ctx.restore()
      return
    }
    case 'anchor': {
      ctx.beginPath()
      ctx.arc(c.x, c.y, px(2), 0, TAU)
      ctx.stroke()
      return
    }
    case 'gong': {
      if (p.shape.type !== 'circle') return
      const r = p.shape.r
      ctx.lineWidth = px(2)
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, TAU)
      ctx.stroke()
      ctx.lineWidth = px(1.2)
      ctx.beginPath()
      ctx.arc(c.x, c.y, r * 0.58, 0, TAU)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(c.x, c.y, r * 0.12, 0, TAU)
      ctx.stroke()
      return
    }
    case 'boulder': {
      if (p.shape.type !== 'circle') return
      const r = p.shape.r
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, TAU)
      ctx.stroke()
      ctx.beginPath() // an inner arc that turns with it
      ctx.arc(c.x, c.y, r * 0.55, a, a + Math.PI * 1.2)
      ctx.stroke()
      return
    }
    case 'wreck': {
      if (p.shape.type !== 'circle' || !p.anchor) return
      const r = p.shape.r
      const anchor = arena.phys.pos(p.anchor)
      ctx.beginPath() // the rod
      ctx.moveTo(anchor.x, anchor.y)
      ctx.lineTo(c.x, c.y)
      ctx.stroke()
      ctx.lineWidth = px(2)
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, TAU)
      ctx.stroke()
      ctx.lineWidth = px(1.2)
      ctx.beginPath()
      ctx.arc(c.x, c.y, r * 0.5, a, a + Math.PI * 1.4)
      ctx.stroke()
      return
    }
    case 'balloon': {
      if (p.shape.type !== 'circle') return
      const r = p.shape.r
      // the string, down to its anchor
      if (p.anchor) {
        const anchor = arena.phys.pos(p.anchor)
        ctx.beginPath()
        ctx.moveTo(c.x, c.y + r * 1.12)
        ctx.lineTo(anchor.x, anchor.y)
        ctx.stroke()
      }
      ctx.beginPath() // the balloon: a slightly tall ellipse
      ctx.ellipse(c.x, c.y, r * 0.92, r * 1.1, 0, 0, TAU)
      ctx.fillStyle = '#fff' // (white, so the string does not show through)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath() // the knot
      ctx.moveTo(c.x - r * 0.14, c.y + r * 1.28)
      ctx.lineTo(c.x, c.y + r * 1.08)
      ctx.lineTo(c.x + r * 0.14, c.y + r * 1.28)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath() // a little highlight
      ctx.arc(c.x, c.y, r * 0.62, Math.PI * 1.15, Math.PI * 1.45)
      ctx.stroke()
      return
    }
    default:
      return
  }
}

function drawDistractor(
  ctx: CanvasRenderingContext2D,
  d: Distractor,
  t: number,
  px: (n: number) => number,
) {
  ctx.lineWidth = px(1.2)
  if (d.kind === 'lantern') {
    // the reach of its pull: a faint dashed circle
    faintCircle(ctx, d.x, d.y, d.radius, px)
    const flick = 1 + 0.12 * Math.sin(t * 9 + d.x) + 0.08 * Math.sin(t * 15.3)
    ctx.beginPath()
    ctx.arc(d.x, d.y, 48, 0, TAU)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(d.x, d.y, 20 * flick, 0, TAU)
    ctx.stroke()
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * TAU + t * 0.4
      const len = (i % 2 ? 26 : 44) * flick
      ctx.beginPath()
      ctx.moveTo(d.x + Math.cos(ang) * 66, d.y + Math.sin(ang) * 66)
      ctx.lineTo(d.x + Math.cos(ang) * (66 + len), d.y + Math.sin(ang) * (66 + len))
      ctx.stroke()
    }
    return
  }
  if (d.kind === 'whirlpool') {
    faintCircle(ctx, d.x, d.y, d.radius, px)
    ctx.beginPath()
    ctx.arc(d.x, d.y, d.core, 0, TAU)
    ctx.stroke()
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath()
      for (let k = 0; k <= 60; k++) {
        const f = k / 60
        const r = d.core + f * (d.radius * 0.8 - d.core)
        const ang = (arm / 3) * TAU - t * 2.2 + f * 5
        const x = d.x + Math.cos(ang) * r
        const y = d.y + Math.sin(ang) * r
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    return
  }
  // fan: its wind zone, a hub with turning blades, and wind streaks while it blows
  const on = fanOn(d, t)
  const x0 = d.x - d.w / 2
  const y0 = d.y - d.h / 2
  ctx.save()
  ctx.globalAlpha = on ? 0.5 : 0.22
  ctx.setLineDash([px(4), px(5)])
  ctx.lineWidth = px(0.8)
  ctx.strokeRect(x0, y0, d.w, d.h)
  ctx.restore()
  const hx = x0 + 70
  const hy = d.y
  const spin = t * (on ? 16 : 1.2)
  ctx.beginPath()
  ctx.arc(hx, hy, 62, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(hx, hy, 9, 0, TAU)
  ctx.stroke()
  for (let b = 0; b < 3; b++) {
    const ang = spin + (b / 3) * TAU
    ctx.beginPath()
    ctx.ellipse(hx + Math.cos(ang) * 34, hy + Math.sin(ang) * 34, 30, 11, ang, 0, TAU)
    ctx.stroke()
  }
  if (on) {
    ctx.save()
    ctx.setLineDash([px(8), px(10)])
    ctx.lineDashOffset = -t * px(90)
    ctx.lineWidth = px(0.9)
    for (let i = 1; i <= 4; i++) {
      const y = y0 + (d.h * i) / 5
      ctx.beginPath()
      ctx.moveTo(x0 + 150, y)
      ctx.lineTo(x0 + d.w - 10, y)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function faintCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  px: (n: number) => number,
) {
  ctx.save()
  ctx.globalAlpha = 0.2
  ctx.setLineDash([px(3), px(6)])
  ctx.lineWidth = px(0.8)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.stroke()
  ctx.restore()
}

function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, px: (n: number) => number) {
  const p = e.age / e.life
  const ease = 1 - (1 - p) * (1 - p)
  ctx.globalAlpha = Math.max(0, 1 - p)
  ctx.lineWidth = px(1.2)
  if (e.kind === 'ring') {
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * ease, 0, TAU)
    ctx.stroke()
  } else if (e.kind === 'burst') {
    const from = e.r0 * 0.4 + (e.r1 - e.r0) * ease * 0.6
    const to = e.r0 * 0.7 + (e.r1 - e.r0) * ease
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU + 0.3
      ctx.beginPath()
      ctx.moveTo(e.x + Math.cos(ang) * from, e.y + Math.sin(ang) * from)
      ctx.lineTo(e.x + Math.cos(ang) * to, e.y + Math.sin(ang) * to)
      ctx.stroke()
    }
  } else if (e.text) {
    // outlined text (strokeText only — no fill), rising; solid for most of its life so it reads, fading at the end
    ctx.globalAlpha = p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.45)
    ctx.font = `700 ${px(19)}px Inter, ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.lineWidth = px(1.1)
    ctx.lineJoin = 'round'
    ctx.strokeText(e.text, e.x, e.y - 160 * ease)
  }
}
