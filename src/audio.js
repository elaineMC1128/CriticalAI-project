// Sound — off by default; one toggle in the top-right corner.
// Uses Web Audio so the loops repeat without any gap.
//
// The mix is set every frame from main.js with setLevels({ ambient, hum, keys }):
//   Scene 3      faint dreamy ambience
//   Scene 4      ambience fades as the camera pulls away; a faint hum appears at the very end
//   Scene 5      faint hum + fabric tearing on each cut
//   Scene 6      hum at full level + quiet keyboard typing
//   Scene 7      no keyboard; the hum fades as the user scrolls through the credits

export class Sound {
  constructor(urls, button) {
    this.on = false
    this.button = button
    this.urls = urls
    this.levels = { ambient: 0, hum: 0, keys: 0 }
    this.ready = false
    this.lastTear = 0
    button.addEventListener('click', () => this.toggle())
  }

  async init() {
    if (this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(this.ctx.destination)
    const load = async (url) => this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())
    const [ambient, hum, keys, tear] = await Promise.all([
      load(this.urls.sAmbient), load(this.urls.sHum), load(this.urls.sKeys), load(this.urls.sTear),
    ])
    this.tearBuf = tear
    this.tracks = {}
    for (const [k, buf] of Object.entries({ ambient, hum, keys })) {
      const g = this.ctx.createGain()
      g.gain.value = 0
      g.connect(this.master)
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(g)
      src.start()
      this.tracks[k] = g
    }
    this.ready = true
    this.setLevels(this.levels)
  }

  async toggle() {
    this.on = !this.on
    this.button.textContent = this.on ? 'Sound on' : 'Sound off'
    this.button.setAttribute('aria-pressed', String(this.on))
    if (this.on) {
      await this.init()
      if (this.ctx.state === 'suspended') await this.ctx.resume()
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 1 : 0, this.ctx.currentTime, 0.3)
  }

  // target volume per loop, 0–1; changes are smoothed so nothing jumps
  setLevels(levels) {
    this.levels = { ...this.levels, ...levels }
    if (!this.ready) return
    const t = this.ctx.currentTime
    for (const [k, g] of Object.entries(this.tracks)) g.gain.setTargetAtTime(this.levels[k] || 0, t, 0.35)
  }

  tear() {
    if (!this.on || !this.ready) return
    const now = performance.now()
    if (now - this.lastTear < 260) return
    this.lastTear = now
    const src = this.ctx.createBufferSource()
    src.buffer = this.tearBuf
    src.playbackRate.value = 0.85 + Math.random() * 0.35
    const g = this.ctx.createGain()
    g.gain.value = 0.5 + Math.random() * 0.3
    src.connect(g).connect(this.master)
    src.start()
  }
}
