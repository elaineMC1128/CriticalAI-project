// Scene 4 — the camera viewfinder that reveals someone has been filming all along.
// Corner brackets, REC, a timecode that started when the user pressed "send", a focus box,
// a zoom ruler whose focal length changes as the camera pulls back, battery and 2K · 24fps.

export class Viewfinder {
  constructor(root) {
    this.root = root
    this.svg = root.querySelector('#vf-svg')
    this.tc = root.querySelector('#vf-tc')
    this.ruler = root.querySelector('#vf-ruler')
    this.mm = root.querySelector('#vf-mm')
    this.lost = root.querySelector('#vf-lost')
    this.start = performance.now()
    this.draw()
    window.addEventListener('resize', () => this.draw())
  }

  draw() {
    const W = window.innerWidth, H = window.innerHeight
    const m = 28, L = 46
    const s = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="2" />`
    const cx = W / 2, cy = H / 2, fw = 110, fh = 74, fl = 16
    this.svg.innerHTML = [
      s(m, m, m + L, m), s(m, m, m, m + L),
      s(W - m, m, W - m - L, m), s(W - m, m, W - m, m + L),
      s(m, H - m, m + L, H - m), s(m, H - m, m, H - m - L),
      s(W - m, H - m, W - m - L, H - m), s(W - m, H - m, W - m, H - m - L),
      // focus box
      s(cx - fw, cy - fh, cx - fw + fl, cy - fh), s(cx - fw, cy - fh, cx - fw, cy - fh + fl),
      s(cx + fw, cy - fh, cx + fw - fl, cy - fh), s(cx + fw, cy - fh, cx + fw, cy - fh + fl),
      s(cx - fw, cy + fh, cx - fw + fl, cy + fh), s(cx - fw, cy + fh, cx - fw, cy + fh - fl),
      s(cx + fw, cy + fh, cx + fw - fl, cy + fh), s(cx + fw, cy + fh, cx + fw, cy + fh - fl),
      `<line x1="${cx - 8}" y1="${cy}" x2="${cx + 8}" y2="${cy}" stroke="#fff" stroke-width="1" opacity=".7"/>`,
      `<line x1="${cx}" y1="${cy - 8}" x2="${cx}" y2="${cy + 8}" stroke="#fff" stroke-width="1" opacity=".7"/>`,
    ].join('')
  }

  // the clock starts the moment the user sends a prompt
  startClock() { this.start = performance.now() }

  set(opacity, zoom01) {
    this.root.style.opacity = opacity
    if (opacity <= 0) return
    const t = (performance.now() - this.start) / 1000
    const fps = 24
    const f = Math.floor((t * fps) % fps)
    const sec = Math.floor(t) % 60, min = Math.floor(t / 60) % 60, hr = Math.floor(t / 3600)
    const p2 = (n) => String(n).padStart(2, '0')
    this.tc.textContent = `${p2(hr)}:${p2(min)}:${p2(sec)}:${p2(f)}`
    const mm = Math.round(85 - zoom01 * 61)
    this.mm.textContent = `${mm}mm`
    this.ruler.style.transform = `translateX(${-150 - zoom01 * 600}px)`
  }

  // three flashes of SIGNAL LOST (≤ 3 per second), then the viewfinder is gone
  signalLost(done) {
    const el = this.lost
    el.style.display = 'block'
    let n = 0
    const tick = () => {
      n++
      el.style.visibility = n % 2 ? 'hidden' : 'visible'
      this.root.style.opacity = n % 2 ? 0.25 : 1
      if (n < 6) setTimeout(tick, 360)
      else {
        el.style.display = 'none'
        el.style.visibility = 'visible'
        this.root.style.opacity = 0
        done && done()
      }
    }
    setTimeout(tick, 360)
  }
}
