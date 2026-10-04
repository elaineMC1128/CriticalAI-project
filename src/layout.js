// Shared geometry for Scene 1 (landing) and Scene 7 (ending):
// the small window in the middle, and where each hand image sits.
//
// Like The Creation of Adam, the two index fingers lie on one diagonal line that passes
// through the window: the upper-left hand points down-right, the lower-right hand points up-left.
// Each hand is rotated slightly around its fingertip so both fingers follow the same line.

const IMG = 1254
// index fingertip (source pixels) and the direction the finger points (degrees, screen space)
const HANDS = {
  data: { tip: [782, 744], dir: 57.0 },
  green: { tip: [795, 723], dir: 55.3 },
  user: { tip: [533, 514], dir: 180 + 28.6 }, // points up-left
}
const LINE = 28 // angle of the shared finger line, degrees below horizontal (left → right)
const TURN = 0.6 // how far each hand is turned toward that line (0 = not at all, 1 = fully)

export function layout(W = window.innerWidth, H = window.innerHeight) {
  // the window ("door") between the two fingers
  const fw = Math.round(Math.min(Math.max(H * 0.31, 220), W * 0.42))
  const fh = Math.round(fw * 0.643)
  const fx = Math.round(W / 2 - fw / 2)
  const fy = Math.round(H / 2 - fh / 2)
  const radius = Math.round(fw * 0.05)

  const S = Math.min(H * 1.2, W * 0.9)
  const gap = Math.max(14, H * 0.03)
  const cx = W / 2, cy = H / 2
  const a = (LINE * Math.PI) / 180
  const dx = Math.cos(a), dy = Math.sin(a)
  // distance from the centre to where the line leaves the window, plus a small gap
  const exit = Math.min(fw / 2 / dx, fh / 2 / dy) + gap
  const leftTip = [cx - dx * exit, cy - dy * exit]
  const rightTip = [cx + dx * exit, cy + dy * exit]

  const place = (h, at, targetDir) => {
    const k = S / IMG
    return {
      x: at[0] - h.tip[0] * k,
      y: at[1] - h.tip[1] * k,
      s: S,
      ox: h.tip[0] * k, // rotation origin inside the image (the fingertip)
      oy: h.tip[1] * k,
      rot: (((targetDir - h.dir + 540) % 360) - 180) * TURN,
    }
  }

  return {
    frame: { x: fx, y: fy, w: fw, h: fh, r: radius },
    data: place(HANDS.data, leftTip, LINE),
    green: place(HANDS.green, leftTip, LINE),
    user: place(HANDS.user, rightTip, LINE + 180),
    imgSize: IMG,
  }
}
