// Sound — off by default; one toggle in the top-right corner.
// Scenes 3–4: dreamy ambience · Scene 5: fabric tearing · Scenes 6–7: electrical hum + keyboard typing.

import gsap from 'gsap'

export class Sound {
  constructor(urls, button) {
    this.on = false
    this.button = button
    const loop = (src) => { const a = new Audio(src); a.loop = true; a.volume = 0; a.preload = 'auto'; return a }
    this.tracks = {
      ambient: loop(urls.sAmbient),
      hum: loop(urls.sHum),
      keys: loop(urls.sKeys),
    }
    this.tearSrc = urls.sTear
    this.target = { ambient: 0, hum: 0, keys: 0 }
    this.lastTear = 0
    button.addEventListener('click', () => this.toggle())
  }

  toggle() {
    this.on = !this.on
    this.button.textContent = this.on ? 'Sound on' : 'Sound off'
    this.button.setAttribute('aria-pressed', String(this.on))
    this.apply()
  }

  // set the mix for the current scene, e.g. mix({ ambient: 0.6 })
  mix(levels) {
    this.target = { ambient: 0, hum: 0, keys: 0, ...levels }
    this.apply()
  }

  apply() {
    for (const [k, a] of Object.entries(this.tracks)) {
      const v = this.on ? this.target[k] : 0
      if (v > 0 && a.paused) a.play().catch(() => {})
      gsap.to(a, {
        volume: v, duration: 1.2, overwrite: true,
        onComplete: () => { if (v === 0) a.pause() },
      })
    }
  }

  tear() {
    if (!this.on) return
    const now = performance.now()
    if (now - this.lastTear < 260) return
    this.lastTear = now
    const a = new Audio(this.tearSrc)
    a.volume = 0.55 + Math.random() * 0.3
    a.playbackRate = 0.85 + Math.random() * 0.35
    a.play().catch(() => {})
  }
}
