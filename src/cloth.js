// Scene 5 — the tearable sky.
//
// Physics adapted from Dissimulate, "Tearable Cloth" (MIT licence)
// https://github.com/Dissimulate/Tearable-Cloth
// Changes for this project: the cloth is drawn as a textured Three.js mesh carrying the sky video (instead of lines),
// it is positioned exactly over the 3D curtain, dragging cuts through it, and once enough of it is torn the top
// pins let go and the remaining sky falls away.

import * as THREE from 'three'
import { clothVert, skyFrag } from './world.js'

const COLS = 64
const ROWS = 36
const ACCURACY = 4
const SAFETY_S = 45 // if someone keeps hesitating, the sky falls by itself this long after the first tear

export class Cloth {
  constructor(rect, { texture, wrinkle = 0.5, pixel = 1, threshold = 0.3, onTear, onFirstTear, onRelease }) {
    this.rect = rect
    this.threshold = threshold
    this.onTear = onTear
    this.onFirstTear = onFirstTear
    this.onRelease = onRelease
    this.released = false
    this.firstTorn = false
    this.gravity = 260
    this.time = 0

    const n = (COLS + 1) * (ROWS + 1)
    this.n = n
    this.sx = rect.w / COLS
    this.sy = rect.h / ROWS
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.pinned = new Uint8Array(n)
    this.cl = new Uint8Array(n) // constraint to the left neighbour is intact
    this.cu = new Uint8Array(n) // constraint to the neighbour above is intact
    const uvs = new Float32Array(n * 2)
    for (let j = 0; j <= ROWS; j++) {
      for (let i = 0; i <= COLS; i++) {
        const k = j * (COLS + 1) + i
        this.x[k] = this.px[k] = rect.x + i * this.sx
        this.y[k] = this.py[k] = rect.y + j * this.sy
        this.pinned[k] = j === 0 ? 1 : 0
        this.cl[k] = i > 0 ? 1 : 0
        this.cu[k] = j > 0 ? 1 : 0
        uvs[k * 2] = i / COLS
        uvs[k * 2 + 1] = 1 - j / ROWS
      }
    }
    this.totalCells = COLS * ROWS

    this.geo = new THREE.BufferGeometry()
    this.pos = new Float32Array(n * 3)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    this.index = new Uint32Array(this.totalCells * 6)
    this.geo.setIndex(new THREE.BufferAttribute(this.index, 1).setUsage(THREE.DynamicDrawUsage))
    this.mat = new THREE.ShaderMaterial({
      vertexShader: clothVert,
      fragmentShader: skyFrag,
      side: THREE.DoubleSide,
      depthTest: false,
      uniforms: {
        uTex: { value: texture },
        uWrinkle: { value: wrinkle },
        uPixel: { value: pixel },
        uBright: { value: 1.08 },
      },
    })
    this.mesh = new THREE.Mesh(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.mouse = { down: false, x: 0, y: 0, px: 0, py: 0 }
    this.dirty = true
    this.rebuildIndex()
    this.writePositions()
  }

  // How much of the sky is really gone: a cell still "covers" the screen only if it is intact AND
  // still roughly where it started. Pieces that were cut loose and fell away count as torn, even though
  // their own links are unbroken (this is what used to leave people stuck in Scene 5).
  get tornFraction() {
    const W = COLS + 1
    const { rect } = this
    const maxDrift = rect.h * 0.45 // a piece swinging around is not gone; one that has dropped this far is
    let covering = 0
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1
        if (!(this.cl[b] && this.cu[c] && this.cl[d] && this.cu[d])) continue
        const cx = (this.x[a] + this.x[d]) * 0.5, cy = (this.y[a] + this.y[d]) * 0.5
        const rx = rect.x + (i + 0.5) * this.sx, ry = rect.y + (j + 0.5) * this.sy
        if (Math.abs(cx - rx) < maxDrift && Math.abs(cy - ry) < maxDrift) covering++
      }
    }
    return 1 - covering / this.totalCells
  }

  rebuildIndex() {
    let c = 0
    let alive = 0
    const W = COLS + 1
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1
        if (this.cl[b] && this.cu[cc] && this.cl[d] && this.cu[d]) {
          this.index[c++] = a; this.index[c++] = cc; this.index[c++] = b
          this.index[c++] = b; this.index[c++] = cc; this.index[c++] = d
          alive++
        }
      }
    }
    this.alive = alive
    this.geo.setDrawRange(0, c)
    this.geo.index.needsUpdate = true
    this.dirty = false
  }

  writePositions() {
    for (let k = 0; k < this.n; k++) {
      this.pos[k * 3] = this.x[k]
      this.pos[k * 3 + 1] = this.y[k]
      this.pos[k * 3 + 2] = 0
    }
    this.geo.attributes.position.needsUpdate = true
  }

  cutPoint(k) {
    const W = COLS + 1
    let changed = false
    if (this.cl[k]) { this.cl[k] = 0; changed = true }
    if (this.cu[k]) { this.cu[k] = 0; changed = true }
    if (k % W < COLS && this.cl[k + 1]) { this.cl[k + 1] = 0; changed = true }
    if (k + W < this.n && this.cu[k + W]) { this.cu[k + W] = 0; changed = true }
    return changed
  }

  // pointer, already mapped into undistorted screen space
  pointer(type, x, y) {
    const m = this.mouse
    if (type === 'down') { m.down = true; m.px = m.x = x; m.py = m.y = y }
    else if (type === 'up') { m.down = false }
    else { m.px = m.x; m.py = m.y; m.x = x; m.y = y }
  }

  step(dt) {
    this.time += dt
    const W = COLS + 1
    const { x, y, px, py, pinned } = this
    const m = this.mouse
    const g = this.gravity * dt * dt

    // cutting: every point near the pointer's path loses its links
    if (m.down && !this.released) {
      const cut = Math.max(12, this.sx * 0.95)
      const infl = cut * 3
      const sdx = m.x - m.px, sdy = m.y - m.py
      const segLen2 = sdx * sdx + sdy * sdy || 1
      let cutAny = false
      for (let k = 0; k < this.n; k++) {
        let t = ((x[k] - m.px) * sdx + (y[k] - m.py) * sdy) / segLen2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const qx = m.px + sdx * t - x[k], qy = m.py + sdy * t - y[k]
        const d2 = qx * qx + qy * qy
        if (d2 < cut * cut) {
          if (this.cutPoint(k)) cutAny = true
        } else if (d2 < infl * infl && !pinned[k]) {
          // tug the cloth along with the pointer
          px[k] -= sdx * 0.12
          py[k] -= sdy * 0.12
        }
      }
      if (cutAny) {
        this.dirty = true
        if (!this.firstTorn) { this.firstTorn = true; this.firstTearAt = this.time; this.onFirstTear && this.onFirstTear() }
        this.onTear && this.onTear()
      }
    }

    // verlet integration
    for (let k = 0; k < this.n; k++) {
      if (pinned[k]) continue
      const nx = x[k] + (x[k] - px[k]) * 0.985
      const ny = y[k] + (y[k] - py[k]) * 0.985 + g
      px[k] = x[k]; py[k] = y[k]
      x[k] = nx; y[k] = ny
    }

    // constraints
    const tear = Math.max(this.sx, this.sy) * 6
    for (let it = 0; it < ACCURACY; it++) {
      for (let k = 0; k < this.n; k++) {
        if (this.cl[k]) this.solve(k, k - 1, this.sx, tear, 'l')
        if (this.cu[k]) this.solve(k, k - W, this.sy, tear, 'u')
      }
    }

    // after release the top edge lets go point by point and gravity builds up, so the sky peels off instead of dropping at once
    if (this.released) {
      this.releaseT += dt
      this.gravity = Math.min(2600, 500 + this.releaseT * 1800)
      const due = Math.floor(Math.min(1, this.releaseT / 0.9) * this.unpinOrder.length)
      while (this.unpinned < due) pinned[this.unpinOrder[this.unpinned++]] = 0
    }

    if (this.dirty) this.rebuildIndex()
    // check every few frames, not only when a link breaks: loose pieces keep falling afterwards
    this.frame = (this.frame || 0) + 1
    if (!this.released && this.firstTorn && this.frame % 6 === 0) {
      this.lastFraction = this.tornFraction
      // the torn share has to stay above the threshold for about a second, so a big swing doesn't count
      this.overSince = this.lastFraction >= this.threshold ? (this.overSince ?? this.time) : null
      if (this.overSince != null && this.time - this.overSince > 1) this.release()
      // safety net: never leave anyone stuck — 45 s after the first tear the rest of the sky lets go
      else if (this.time - this.firstTearAt > SAFETY_S) this.release()
    }
    this.writePositions()
  }

  solve(a, b, rest, tear, kind) {
    const { x, y, pinned } = this
    const dx = x[a] - x[b], dy = y[a] - y[b]
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < rest) return
    if (dist > tear) {
      if (kind === 'l') this.cl[a] = 0
      else this.cu[a] = 0
      this.dirty = true
      return
    }
    const diff = (rest - dist) / dist
    const mul = diff * 0.5
    const ox = dx * mul, oy = dy * mul
    if (!pinned[a]) { x[a] += ox; y[a] += oy }
    if (!pinned[b]) { x[b] -= ox; y[b] -= oy }
  }

  release() {
    this.released = true
    this.releaseT = 0
    this.unpinned = 0
    // unpin the top row from the middle outwards, slightly shuffled
    const order = []
    for (let i = 0; i <= COLS; i++) order.push(i)
    order.sort((a, b) => Math.abs(a - COLS / 2) + Math.random() * 8 - (Math.abs(b - COLS / 2) + Math.random() * 8))
    this.unpinOrder = order
    this.gravity = 500
    this.onRelease && this.onRelease()
  }

  get fallenOut() {
    if (!this.released) return false
    let minY = Infinity
    for (let k = 0; k < this.n; k++) if (this.y[k] < minY) minY = this.y[k]
    return minY > window.innerHeight + 20
  }
}
