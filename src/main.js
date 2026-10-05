// Behind the Cloud — main controller
// Meilin Chen · Critical AI · 2026
//
// Seven scenes, one page:
//   1 landing   — a data hand and a human hand, a small window between them
//   2 ui        — "Nimbus", a clean AI chat product
//   3 peep      — the orb becomes a peephole into a perfect sky
//   4 pull      — scroll: the camera pulls back; the sky is a projection on a hanging curtain, and it is being filmed
//   5 tear      — the user tears the sky open by hand
//   6 studio    — a green-screen studio: a cloud of bulbs, powered by workers in chroma suits
//   7 ending    — the studio shrinks back into the window; a green hand returns; credits for the uncredited

import gsap from 'gsap'
import { loadAll, makeVideo } from './assets.js'
import { layout } from './layout.js'
import { ParticleHand } from './particleHand.js'
import { World } from './world.js'
import { Cloth } from './cloth.js'
import { Viewfinder } from './viewfinder.js'
import { Sound } from './audio.js'
import { buildCredits } from './credits.js'

const $ = (s) => document.querySelector(s)
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }

// tuning — change these freely
const CONFIG = {
  pullScreens: 3.5,     // how much scrolling the pull-back takes (in screen heights)
  zoomScreens: 2,       // scrolling up in the studio to reach the closest view
  endingScreens: 8,     // scrolling for the whole ending + credits
  tearThreshold: 0.55,   // share of the sky that must be torn before it falls
}

const S = {
  state: 'loading',
  pull: 0, pullT: 0,
  u: 0, uT: 0,              // studio/ending scroll position in pixels (negative = zoom in)
  fallT: 0,
  prompt: '',
  mouse: { x: -9999, y: -9999, nx: 0, ny: 0, sx: 0, sy: 0 },
  caSpike: 0, glitch: 0, hover: 0,
  lastPointer: performance.now(),
}

let world, hand, vf, sound, cloth, assets
const videos = {}
const el = {
  gl: $('#gl'), frame: $('#ui-frame'), ui: $('#ui'), particles: $('#particles'),
  handUser: $('#hand-user'), handGreen: $('#hand-green'), hit: $('#enter-hit'),
  vf: $('#viewfinder'), hint: $('#hint'), title: $('#title-small'), sound: $('#sound'),
  credits: $('#credits'), roll: $('#credits-roll'), endcard: $('#endcard'),
  loader: $('#loader'), ldFill: $('#ld-fill'), ldPct: $('#ld-pct'),
  card: $('#card'), bubble: $('#bubble'), orb: $('#orb'), ask: $('#ask'), chips: $('#chips'),
  composer: $('#composer'), input: $('#prompt'), send: $('#send'), brand: document.querySelector('.brand'), foot: $('#foot'),
}

/* ---------------- boot ---------------- */

async function boot() {
  assets = await loadAll((p) => {
    el.ldFill.style.width = `${Math.round(p * 100)}%`
    el.ldPct.textContent = `${Math.round(p * 100)}%`
  })
  const { urls, images } = assets
  videos.sky = makeVideo(urls.skyVideo)
  videos.eyes = [makeVideo(urls.eyes1), makeVideo(urls.eyes2), makeVideo(urls.eyes3)]
  $('#orb-video').src = urls.skyVideo
  ;[videos.sky, ...videos.eyes, $('#orb-video')].forEach((v, i) => {
    v.play().catch(() => {})
    // start each pair of eyes at a different moment so they never blink in unison
    if (i >= 1 && i <= 3) {
      const jump = () => { v.currentTime = ((i * 0.37) % 1) * v.duration }
      if (v.readyState >= 1) jump(); else v.addEventListener('loadedmetadata', jump, { once: true })
    }
  })

  world = new World(el.gl, { videos, workerUrl: urls.worker })
  await world.loadWorkers()
  world.setPullCamera(0)
  world.render() // warm up shaders while hidden

  hand = new ParticleHand(el.particles, images.handMask, { reduced })
  el.handUser.src = urls.handUser
  el.handGreen.src = urls.handGreen
  vf = new Viewfinder(el.vf)
  sound = new Sound(urls, el.sound)

  bindInput()
  window.addEventListener('resize', onResize)
  gsap.to(el.loader, { opacity: 0, duration: 0.8, onComplete: () => el.loader.remove() })
  enterLanding()
  requestAnimationFrame(tick)
}

/* ---------------- helpers ---------------- */

function hint(text, { dark = false, delay = 0 } = {}) {
  gsap.killTweensOf(el.hint)
  if (!text) { gsap.to(el.hint, { opacity: 0, duration: 0.4 }); return }
  el.hint.classList.toggle('dark', dark)
  gsap.to(el.hint, {
    opacity: 0, duration: 0.2,
    onComplete: () => { el.hint.textContent = text; gsap.to(el.hint, { opacity: 0.85, duration: 0.8, delay }) },
  })
}

// position a hand photo; it is rotated around its fingertip so both index fingers share one line
function placeImg(img, L, dx = 0, dy = 0) {
  img.style.width = `${L.s}px`
  img.style.height = `${L.s}px`
  img.style.transformOrigin = `${L.ox}px ${L.oy}px`
  img.style.transform = `translate(${L.x + dx}px, ${L.y + dy}px) rotate(${L.rot}deg)`
}

// The UI lives full-screen; in Scene 1 it is clipped to the small window and scaled to fit inside it.
function setFrame(t) {
  // t = 0: small window, t = 1: full screen
  const W = window.innerWidth, H = window.innerHeight
  const f0 = layout(W, H).frame
  const g = 1 + 0.04 * (S.hover || 0) // hover: the window grows by 4%
  const f = { w: f0.w * g, h: f0.h * g, x: W / 2 - (f0.w * g) / 2, y: H / 2 - (f0.h * g) / 2, r: f0.r }
  const top = lerp(f.y, 0, t), left = lerp(f.x, 0, t)
  const right = lerp(W - f.x - f.w, 0, t), bottom = lerp(H - f.y - f.h, 0, t)
  const r = lerp(f.r, 0, t)
  el.frame.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${r}px)`
  const cardH = el.card.offsetHeight || 540
  const s = lerp(Math.max(f.h / (cardH * 1.18), f.w / W), 1, t)
  el.ui.style.transform = `scale(${s})`
}

// map a pointer through the barrel distortion so tearing happens exactly under the cursor
function undistort(x, y) {
  const W = window.innerWidth, H = window.innerHeight
  const k = world.post.uniforms.uDistort.value
  const ux = x / W - 0.5, uy = (1 - y / H) - 0.5
  const f = (1 + k * (ux * ux + uy * uy)) / (1 + 0.5 * k)
  return [(0.5 + ux * f) * W, (1 - (0.5 + uy * f)) * H]
}

/* ---------------- Scene 1: landing ---------------- */

function enterLanding() {
  S.state = 'landing'
  const W = window.innerWidth, H = window.innerHeight
  const L = layout(W, H)
  el.frame.style.visibility = 'visible'
  el.ui.style.transformOrigin = `${W / 2}px ${H / 2}px`
  setFrame(0)
  placeImg(el.handUser, L.user)
  gsap.fromTo(el.handUser, { opacity: 0 }, { opacity: 1, duration: 1.6, delay: 0.3 })
  Object.assign(el.hit.style, { display: 'block', left: `${L.frame.x}px`, top: `${L.frame.y}px`, width: `${L.frame.w}px`, height: `${L.frame.h}px` })
  gsap.to([el.title, el.sound], { opacity: 0.9, duration: 1.2, delay: 0.6 })
  hint('CLICK THE WINDOW TO ENTER', { delay: 1.4 })
  el.hit.focus({ preventScroll: true })
}

function enter() {
  if (S.state !== 'landing') return
  S.state = 'toUI'
  el.hit.style.display = 'none'
  hand.disperse()
  hint('')
  gsap.killTweensOf(el.handUser)
  const W = window.innerWidth, H = window.innerHeight
  const L = layout(W, H).user
  gsap.to(el.handUser, {
    duration: 1.3, ease: 'power2.in', opacity: 0,
    onUpdate() { const p = this.progress(); placeImg(el.handUser, L, p * W * 0.35, p * H * 0.35) },
  })
  gsap.to(el.title, { opacity: 0, duration: 0.6 })
  const o = { t: 0 }
  gsap.to(o, {
    t: 1, duration: 1.6, ease: 'power3.inOut', delay: 0.15,
    onUpdate: () => setFrame(o.t),
    onComplete: () => {
      el.frame.style.clipPath = 'none'
      el.ui.style.transform = 'none'
      el.ui.inert = false
      S.state = 'ui'
      el.input.focus({ preventScroll: true })
    },
  })
}

/* ---------------- Scene 2: Nimbus ---------------- */

function sendPrompt(e) {
  e && e.preventDefault()
  const text = el.input.value.trim()
  if (S.state !== 'ui' || !text) return
  S.state = 'thinking'
  S.prompt = text
  vf.startClock()
  el.bubble.textContent = text
  gsap.fromTo(el.bubble, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 })
  el.input.value = ''
  el.send.disabled = true
  el.ui.inert = true
  el.ask.textContent = 'Thinking…'
  el.orb.classList.add('thinking')
  setTimeout(flyOut, 1300)
}

function flyOut() {
  const H = window.innerHeight, W = window.innerWidth
  const fly = [el.brand, el.bubble, el.ask, el.chips, el.composer, el.foot]
  gsap.to(fly, { y: -H, opacity: 0, duration: 0.9, ease: 'power2.in', stagger: 0.06 })
  gsap.to(el.card, { backgroundColor: 'rgba(255,255,255,0)', boxShadow: '0 0 0 rgba(0,0,0,0)', duration: 0.8, delay: 0.3 })
  gsap.to(el.frame, { backgroundColor: '#ffffff', duration: 0.8, delay: 0.3 })
  el.orb.classList.remove('thinking')
  const r = el.orb.getBoundingClientRect()
  gsap.to(el.orb, {
    x: W / 2 - (r.left + r.width / 2), y: H / 2 - (r.top + r.height / 2),
    duration: 1.0, delay: 0.5, ease: 'power2.inOut',
    onComplete: startPeep,
  })
}

/* ---------------- Scene 3: peephole ---------------- */

function startPeep() {
  S.state = 'peep'
  el.particles.style.display = 'none'
  const W = window.innerWidth, H = window.innerHeight
  world.setPullCamera(0)
  el.gl.style.visibility = 'visible'
  const o = { r: 48 }
  const set = () => { el.gl.style.clipPath = `circle(${o.r}px at ${W / 2}px ${H / 2}px)` }
  set()
  gsap.to(o, {
    r: Math.hypot(W, H) / 2 + 40, duration: 1.3, ease: 'power3.in', onUpdate: set,
    onComplete: () => {
      el.gl.style.clipPath = 'none'
      el.frame.style.visibility = 'hidden'
      S.state = 'pull'
      hint('SCROLL ↓', { delay: 2 })
    },
  })
}

/* ---------------- Scene 4: pull back (in tick) ---------------- */

function pullParams(p) {
  return {
    k: 0.32 * smooth(0.2, 0.85, p),
    ca: 2.5 * smooth(0.2, 0.85, p),
    vig: 0.45 * smooth(0.15, 0.7, p),
    grain: 0.02 * smooth(0.0, 0.2, p) + 0.04 * smooth(0.3, 0.9, p),
    sat: 1 - 0.18 * smooth(0.3, 1, p),
    cool: 0,
    wrinkle: smooth(0.45, 0.9, p),
    pixel: smooth(0.55, 1, p),
    vf: p < 0.2 ? lerp(0.08, 1, p / 0.2) : 1,
  }
}
const STUDIO_P = { k: 0, ca: 0, vig: 0.25, grain: 0.035, sat: 0.86, cool: 1 }

/* ---------------- Scene 5: tear ---------------- */

function startTear() {
  S.state = 'tear'
  world.setPullCamera(1)
  const P = pullParams(1)
  const rect = world.curtainRect()
  world.curtain.visible = false
  cloth = new Cloth(rect, {
    texture: world.skyTex,
    wrinkle: P.wrinkle,
    pixel: P.pixel,
    threshold: CONFIG.tearThreshold,
    onTear: () => sound.tear(),
    onFirstTear: () => {
      hint('')
      vf.signalLost()
      S.vfGone = true
      gsap.fromTo(S, { glitch: 1, caSpike: 9 }, { glitch: 0, caSpike: 0, duration: reduced ? 0.01 : 1.4, ease: 'power2.out' })
    },
    onRelease: startFall,
  })
  world.overlay.add(cloth.mesh)
  document.body.classList.add('cursor-cut')
  setTimeout(() => { if (S.state === 'tear' && !cloth.firstTorn) hint('DRAG TO TEAR') }, 2000)
}

/* ---------------- Scene 6: studio ---------------- */

function startFall() {
  S.state = 'fall'
  document.body.classList.remove('cursor-cut')
  el.handUser.style.opacity = 0
  buildCredits(el.roll)
  const from = { p: world.camera.position.clone(), t: new THREE_Vec(0, 4.5, 0) }
  S.fallFrom = from
  S.fallT = 0
  gsap.to(S, {
    fallT: 1, duration: 2.6, delay: 1.2, ease: 'power2.inOut',
    onComplete: () => {
      if (cloth) { world.overlay.remove(cloth.mesh); cloth = null }
      S.state = 'studio'
      S.u = S.uT = 0
    },
  })
}

// tiny vector helper so main.js does not need to import three
function THREE_Vec(x, y, z) { return { x, y, z, clone() { return THREE_Vec(this.x, this.y, this.z) } } }

/* ---------------- Scene 7: ending (in tick) ---------------- */

function endingFrameRect(e) {
  const W = window.innerWidth, H = window.innerHeight
  const f = layout(W, H).frame
  const shrink = smooth(0.0, 0.18, e)
  const away = smooth(0.34, 0.44, e) - smooth(0.86, 0.97, e) // move up for the credits, then come back
  const x = lerp(0, f.x, shrink), y = lerp(0, f.y, shrink) - away * H * 0.75
  const w = lerp(W, f.w, shrink), h = lerp(H, f.h, shrink)
  return { x, y, w, h, r: lerp(0, f.r, shrink), away }
}

/* ---------------- input ---------------- */

function scrollBy(dy) {
  const H = window.innerHeight
  if (S.state === 'landing') {
    S.landAcc = (S.landAcc || 0) + Math.max(0, dy)
    if (S.landAcc > 60) enter()
    return
  }
  if (S.state === 'pull') {
    S.pullT = clamp(S.pullT + dy / (H * CONFIG.pullScreens))
    if (S.pullT > 0.02) hint('')
    return
  }
  if (S.state === 'studio') {
    S.uT = clamp(S.uT + dy, -H * CONFIG.zoomScreens, H * CONFIG.endingScreens)
  }
}

function bindInput() {
  window.addEventListener('wheel', (e) => {
    e.preventDefault()
    scrollBy(e.deltaY * (e.deltaMode === 1 ? 16 : 1))
  }, { passive: false })

  let ty = null
  window.addEventListener('touchstart', (e) => { ty = e.touches[0].clientY }, { passive: true })
  window.addEventListener('touchmove', (e) => {
    if (ty === null || S.state === 'tear') return
    const y = e.touches[0].clientY
    scrollBy((ty - y) * 2.2)
    ty = y
  }, { passive: true })

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === el.input) return
    const H = window.innerHeight
    if (e.key === 'Enter' && S.state === 'landing') { e.preventDefault(); enter() }
    else if (['PageDown', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); scrollBy(H * 0.25) }
    else if (['PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); scrollBy(-H * 0.25) }
  })

  window.addEventListener('pointermove', (e) => {
    S.mouse.x = e.clientX; S.mouse.y = e.clientY
    S.mouse.nx = (e.clientX / window.innerWidth) * 2 - 1
    S.mouse.ny = (e.clientY / window.innerHeight) * 2 - 1
    if (hand) hand.setMouse(e.clientX, e.clientY)
    if (cloth && S.state === 'tear') { const [x, y] = undistort(e.clientX, e.clientY); cloth.pointer('move', x, y) }
  })
  window.addEventListener('pointerdown', (e) => {
    if (cloth && S.state === 'tear') { const [x, y] = undistort(e.clientX, e.clientY); cloth.pointer('down', x, y) }
  })
  window.addEventListener('pointerup', () => { if (cloth) cloth.pointer('up') })

  el.hit.addEventListener('click', enter)
  const hover = (v) => () => { if (S.state === 'landing') gsap.to(S, { hover: v, duration: 0.3, onUpdate: () => setFrame(0) }) }
  el.hit.addEventListener('pointerenter', hover(1))
  el.hit.addEventListener('pointerleave', hover(0))
  el.hit.addEventListener('focus', hover(1))
  el.hit.addEventListener('blur', hover(0))
  el.input.addEventListener('input', () => { el.send.disabled = !el.input.value.trim() })
  el.chips.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    el.input.value = c.textContent
    el.send.disabled = false
    el.input.focus()
  }))
  el.composer.addEventListener('submit', sendPrompt)
  $('#replay').addEventListener('click', () => window.location.reload())
}

function onResize() {
  world.resize()
  hand.resize()
  if (S.state === 'landing') {
    const W = window.innerWidth, H = window.innerHeight
    const L = layout(W, H)
    el.ui.style.transformOrigin = `${W / 2}px ${H / 2}px`
    setFrame(0)
    placeImg(el.handUser, L.user)
    Object.assign(el.hit.style, { left: `${L.frame.x}px`, top: `${L.frame.y}px`, width: `${L.frame.w}px`, height: `${L.frame.h}px` })
  }
}

/* ---------------- frame loop ---------------- */

let last = performance.now()
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const t = now / 1000
  const W = window.innerWidth, H = window.innerHeight
  const u = world.post.uniforms
  const m = S.mouse
  m.sx += (m.nx - m.sx) * Math.min(1, dt * 3)
  m.sy += (m.ny - m.sy) * Math.min(1, dt * 3)

  // Scene 1 particles, and the human hand's slow float (6px, 4s)
  if (S.state === 'landing' || S.state === 'toUI' || S.state === 'ui') {
    hand.update(dt, t)
    hand.draw(t)
  }
  if (S.state === 'landing') placeImg(el.handUser, layout(W, H).user, 0, reduced ? 0 : Math.sin(t * Math.PI / 2) * 6)

  world.update(dt, t)
  let P = { k: 0, ca: 0, vig: 0, grain: 0, sat: 1, cool: 0 }
  let win = null

  if (S.state === 'peep' || S.state === 'pull' || S.state === 'tear') {
    if (S.state === 'pull') {
      S.pull += (S.pullT - S.pull) * Math.min(1, dt * 5)
      if (S.pullT >= 1 && S.pull > 0.995) { S.pull = 1; startTear() }
    }
    const p = S.state === 'tear' ? 1 : S.pull
    if (S.state !== 'tear') world.setPullCamera(p)
    const pp = pullParams(p)
    P = pp
    // projector beam: visible while the camera swings to the side, gone before the curtain faces us
    world.beamMat.uniforms.uOpacity.value = S.state === 'pull' ? smooth(0.08, 0.3, p) * (1 - smooth(0.62, 0.84, p)) : 0
    world.curtainMat.uniforms.uWrinkle.value = pp.wrinkle
    world.curtainMat.uniforms.uPixel.value = pp.pixel
    world.sideMat.uniforms.uPixel.value = pp.pixel
    if (!S.vfGone) vf.set(S.state === 'peep' ? 0.08 : pp.vf, p)
    if (cloth) cloth.step(dt)
  } else if (S.state === 'fall') {
    if (cloth) cloth.step(dt)
    const pe = pullParams(1)
    const f = S.fallT
    P = { k: lerp(pe.k, 0, f), ca: lerp(pe.ca, 0, f), vig: lerp(pe.vig, STUDIO_P.vig, f), grain: lerp(pe.grain, STUDIO_P.grain, f), sat: lerp(pe.sat, STUDIO_P.sat, f), cool: f }
    const v = world.studioView(0)
    const a = S.fallFrom.p
    world.camera.position.set(lerp(a.x, v.p.x, f), lerp(a.y, v.p.y, f), lerp(a.z, v.p.z, f))
    world.camera.lookAt(lerp(0, v.t.x, f), lerp(4.5, v.t.y, f), lerp(0, v.t.z, f))
  } else if (S.state === 'studio') {
    S.u += (S.uT - S.u) * Math.min(1, dt * 4)
    const zoom = clamp(-S.u / (H * CONFIG.zoomScreens))
    const e = clamp(S.u / (H * CONFIG.endingScreens))
    const v = world.studioView(zoom, reduced ? { x: 0, y: 0 } : { x: m.sx, y: -m.sy })
    // during the ending the camera drifts back so the whole box sits inside the small window
    const back = smooth(0.0, 0.2, e)
    world.camera.position.set(v.p.x, lerp(v.p.y, 4.2, back), v.p.z + back * 9)
    world.camera.lookAt(v.t.x, lerp(v.t.y, 4.2, back), v.t.z)
    P = { ...STUDIO_P }
    if (e > 0) {
      win = endingFrameRect(e)
      P.grain = 0.02
      updateEnding(e, win)
    } else {
      hideEnding()
    }
  }

  // sound mix for this frame (see audio.js for the plan)
  sound.setLevels(soundLevels(S.state))

  // post uniforms
  const kill = reduced ? 0 : 1
  u.uDistort.value = P.k * kill
  u.uCA.value = (P.ca + S.caSpike) * kill
  u.uVig.value = P.vig
  u.uGrain.value = P.grain
  u.uSat.value = P.sat
  u.uCool.value = P.cool
  u.uGlitch.value = S.glitch * kill
  if (win) {
    const dpr = world.size.dpr
    u.uWin.value.set(win.x / W, 1 - (win.y + win.h) / H, win.w / W, win.h / H)
    u.uWinR.value = win.r * dpr
  } else {
    u.uWin.value.set(0, 0, 1, 1)
    u.uWinR.value = 0
  }

  if (el.gl.style.visibility === 'visible') world.render()
  requestAnimationFrame(tick)
}

// volume of each loop per scene (0–1)
const MIX = { ambient: 0.15, humFaint: 0.08, hum: 0.5, keys: 0.25 }
function soundLevels(state) {
  const H = window.innerHeight
  if (state === 'peep') return { ambient: MIX.ambient, hum: 0, keys: 0 }
  if (state === 'pull') {
    const p = S.pull
    // the ambience drifts away as the camera pulls back; the hum creeps in as the curtain comes into full view
    return { ambient: MIX.ambient * (1 - smooth(0.05, 0.97, p)), hum: MIX.humFaint * smooth(0.8, 1, p), keys: 0 }
  }
  if (state === 'tear') return { ambient: 0, hum: MIX.humFaint, keys: 0 }
  if (state === 'fall') return { ambient: 0, hum: lerp(MIX.humFaint, MIX.hum, S.fallT), keys: MIX.keys * S.fallT }
  if (state === 'studio') {
    const e = clamp(S.u / (H * CONFIG.endingScreens))
    if (e <= 0) return { ambient: 0, hum: MIX.hum, keys: MIX.keys }
    // ending: no typing; the hum is a little quieter and fades away as the user scrolls
    return { ambient: 0, hum: MIX.hum * 0.7 * (1 - smooth(0, 1, e)), keys: 0 }
  }
  return { ambient: 0, hum: 0, keys: 0 }
}

let endingShown = false
function updateEnding(e, win) {
  const W = window.innerWidth, H = window.innerHeight
  const L = layout(W, H)
  if (!endingShown) {
    endingShown = true
    el.credits.style.visibility = 'visible'
    el.endcard.style.visibility = 'visible'
  }
  // hands reach in from the corners, leave with the window, then reach back in at the very end
  const reach = smooth(0.16, 0.3, e)
  const away = win.away
  const dy = -away * H * 0.75
  const inG = (1 - reach) * L.green.s * 0.45
  placeImg(el.handGreen, L.green, -inG, -inG + dy)
  const follow = reduced ? 0 : 1
  placeImg(el.handUser, L.user, inG + m2(S.mouse.sx) * 20 * follow, inG + dy + m2(S.mouse.sy) * 14 * follow)
  const op = reach * (1 - smooth(0.36, 0.44, e) + smooth(0.86, 0.95, e))
  el.handGreen.style.opacity = clamp(op)
  el.handUser.style.opacity = clamp(op)
  // credits roll
  const rollH = el.roll.offsetHeight
  const q = clamp((e - 0.4) / 0.48)
  el.roll.style.transform = `translateY(${lerp(H, -rollH, q)}px)`
  el.credits.style.opacity = q > 0 && q < 1 ? 1 : 0
  el.endcard.style.opacity = smooth(0.92, 1, e)
}
const m2 = (v) => clamp(v, -1, 1)

function hideEnding() {
  if (!endingShown) return
  endingShown = false
  el.handGreen.style.opacity = 0
  el.handUser.style.opacity = 0
  el.credits.style.visibility = 'hidden'
  el.endcard.style.visibility = 'hidden'
  el.endcard.style.opacity = 0
}

boot().catch((err) => {
  console.error(err)
  el.ldPct.textContent = 'Could not load — please refresh'
})

// handy for testing in the browser console: __btc.state
window.__btc = {
  S, get world() { return world }, get cloth() { return cloth }, enter, startTear, startFall,
  // jump straight to the studio (for testing): __btc.jumpStudio('my prompt')
  jumpStudio(prompt = 'Plan a weekend in Kyoto') {
    S.prompt = prompt
    el.frame.style.visibility = 'hidden'
    el.particles.style.display = 'none'
    el.handUser.style.opacity = 0
    el.hit.style.display = 'none'
    el.title.style.opacity = 0
    hint('')
    el.gl.style.visibility = 'visible'
    el.gl.style.clipPath = 'none'
    world.curtain.visible = false
    S.vfGone = true
    world.setPullCamera(1)
    startFall()
  },
}
