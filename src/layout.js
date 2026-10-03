// Shared geometry for Scene 1 (landing) and Scene 7 (ending):
// the small window in the middle, and where each hand image sits so the fingertips meet it.

// Fingertip positions measured in the 1254×1254 source images
const IMG = 1254
const TIP = {
  data: [782, 744],
  green: [795, 723],
  user: [492, 729],
}

export function layout(W = window.innerWidth, H = window.innerHeight) {
  // the window ("door") between the two fingers
  const fw = Math.round(Math.min(Math.max(H * 0.31, 220), W * 0.42))
  const fh = Math.round(fw * 0.643)
  const fx = Math.round(W / 2 - fw / 2)
  const fy = Math.round(H / 2 - fh / 2)
  const radius = Math.round(fw * 0.05)

  // hand image size: big enough that the user's arm reaches the bottom-right edge
  const S = Math.min(H * 1.2, W * 0.9)
  const gap = Math.max(10, H * 0.025)
  const cy = H / 2
  const leftTip = [fx - gap, cy]
  const rightTip = [fx + fw + gap, cy]

  const place = (tip, at) => ({
    x: at[0] - (tip[0] / IMG) * S,
    y: at[1] - (tip[1] / IMG) * S,
    s: S,
  })

  return {
    frame: { x: fx, y: fy, w: fw, h: fh, r: radius },
    data: place(TIP.data, leftTip),
    green: place(TIP.green, leftTip),
    user: place(TIP.user, rightTip),
    imgSize: IMG,
  }
}
