// Scene 1 — the "data hand".
// The hand image is never shown directly: its white pixels are read and redrawn as ~10,000 small white squares.
// No glow: the squares only flicker between 80% and 100% brightness, like a signal being read.

import { layout } from './layout.js'

const STEP = 3 // sample every 3 source pixels

export class ParticleHand {
  constructor(canvas, maskImg, { reduced = false } = {}) {
    this.c = canvas
    this.ctx = canvas.getContext('2d')
    this.reduced = reduced
    this.mode = 'idle' // idle | out | hidden
    this.alpha = 1
    this.mouse = { x: -9999, y: -9999 }

    // read the mask once
    const n = maskImg.naturalWidth
    const off = document.createElement('canvas')
    off.width = off.height = n
    const octx = off.getContext('2d', { willReadFrequently: true })
    octx.drawImage(maskImg, 0, 0)
    const data = octx.getImageData(0, 0, n, n).data
    const pts = []
    for (let y = 0; y < n; y += STEP) {
      for (let x = 0; x < n; x += STEP) {
        if (data[(y * n + x) * 4] > 128) pts.push(x, y)
      }
    }
    this.count = pts.length / 2
    this.src = new Float32Array(pts)
    this.home = new Float32Array(pts.length)
    this.pos = new Float32Array(pts.length)
    this.vel = new Float32Array(pts.length)
    this.seed = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) this.seed[i] = Math.random()
    this.resize()
    this.pos.set(this.home)
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth, H = window.innerHeight
    this.c.width = W * dpr
    this.c.height = H * dpr
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const L = layout(W, H).data
    const k = L.s / 1254
    this.size = Math.max(1.1, STEP * k * 0.62)
    for (let i = 0; i < this.count; i++) {
      this.home[i * 2] = L.x + this.src[i * 2] * k
      this.home[i * 2 + 1] = L.y + this.src[i * 2 + 1] * k
    }
    if (this.mode === 'idle') this.pos.set(this.home)
  }

  setMouse(x, y) { this.mouse.x = x; this.mouse.y = y }

  disperse() {
    this.mode = 'out'
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i]
      this.vel[i * 2] = -(120 + s * 520)
      this.vel[i * 2 + 1] = -(60 + ((s * 7.13) % 1) * 380)
    }
  }

  reset() {
    this.mode = 'idle'
    this.alpha = 1
    this.pos.set(this.home)
    this.vel.fill(0)
  }

  update(dt, t) {
    if (this.mode === 'hidden') return
    const { pos, home, vel } = this
    const mx = this.mouse.x, my = this.mouse.y
    const R = 90, R2 = R * R
    if (this.mode === 'idle') {
      for (let i = 0; i < this.count; i++) {
        const ix = i * 2, iy = ix + 1
        let hx = home[ix], hy = home[iy]
        if (!this.reduced) {
          const s = this.seed[i]
          hx += Math.sin(t * 0.7 + s * 40) * 0.6
          hy += Math.cos(t * 0.6 + s * 31) * 0.6
        }
        // mouse pushes nearby points away, they spring back
        const dx = pos[ix] - mx, dy = pos[iy] - my
        const d2 = dx * dx + dy * dy
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const f = (1 - d / R) * 900
          vel[ix] += (dx / d) * f * dt
          vel[iy] += (dy / d) * f * dt
        }
        vel[ix] += (hx - pos[ix]) * 30 * dt
        vel[iy] += (hy - pos[iy]) * 30 * dt
        vel[ix] *= 0.86; vel[iy] *= 0.86
        pos[ix] += vel[ix] * dt
        pos[iy] += vel[iy] * dt
      }
    } else if (this.mode === 'out') {
      for (let i = 0; i < this.count * 2; i++) pos[i] += vel[i] * dt
      for (let i = 0; i < this.count * 2; i++) vel[i] *= 1.02
      this.alpha = Math.max(0, this.alpha - dt * 0.9)
      if (this.alpha <= 0) this.mode = 'hidden'
    }
  }

  draw(t) {
    const { ctx } = this
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    if (this.mode === 'hidden') return
    const sz = this.size
    // four brightness buckets: 80–100%, changing over time
    for (let b = 0; b < 4; b++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.8 + b * 0.0667) * this.alpha})`
      ctx.beginPath()
      for (let i = 0; i < this.count; i++) {
        const s = this.seed[i]
        const bucket = this.reduced ? 3 : ((s * 4 + t * (0.6 + s)) | 0) & 3
        if (bucket !== b) continue
        ctx.rect(this.pos[i * 2], this.pos[i * 2 + 1], sz, sz)
      }
      ctx.fill()
    }
  }
}
