// Preloads every asset with a single progress bar, then hands back blob URLs.
// All files live in public/assets/.

const BASE = `${import.meta.env.BASE_URL}assets/`

export const FILES = {
  skyVideo: 'sky_loop.mp4',
  skyImage: 'sky_cloud.webp',
  handData: 'hand_data.webp',
  handMask: 'hand_data_mask.png',
  handGreen: 'hand_green.webp',
  handUser: 'hand_user.webp',
  eyes1: 'eyes_01.mp4',
  eyes2: 'eyes_02.mp4',
  eyes3: 'eyes_03.mp4',
  worker: 'worker.glb',
  sAmbient: 'ambient.mp3',
  sHum: 'hum.mp3',
  sTear: 'tear.mp3',
  sKeys: 'keyboard.mp3',
}

async function fetchWithProgress(url, onBytes) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body || !total) {
    const blob = await res.blob()
    onBytes(blob.size, blob.size)
    return blob
  }
  const reader = res.body.getReader()
  const chunks = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    onBytes(got, total)
  }
  return new Blob(chunks, { type: res.headers.get('content-type') || '' })
}

export async function loadAll(onProgress) {
  const keys = Object.keys(FILES)
  const state = Object.fromEntries(keys.map((k) => [k, { got: 0, total: 1 }]))
  const report = () => {
    let g = 0, t = 0
    for (const k of keys) { g += state[k].got; t += state[k].total }
    onProgress(Math.min(1, g / t))
  }
  const urls = {}
  await Promise.all(keys.map(async (k) => {
    const blob = await fetchWithProgress(BASE + FILES[k], (got, total) => {
      state[k] = { got, total }
      report()
    })
    urls[k] = URL.createObjectURL(blob)
  }))
  const img = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src })
  const images = {
    handMask: await img(urls.handMask),
    handData: await img(urls.handData),
    handGreen: await img(urls.handGreen),
    handUser: await img(urls.handUser),
    sky: await img(urls.skyImage),
  }
  return { urls, images }
}

export function makeVideo(src) {
  const v = document.createElement('video')
  v.src = src
  v.muted = true
  v.loop = true
  v.playsInline = true
  v.crossOrigin = 'anonymous'
  v.preload = 'auto'
  return v
}
