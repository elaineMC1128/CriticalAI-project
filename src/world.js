// The 3D world (Scenes 3–7), built with Three.js.
//
// Layout (units ≈ metres):
//   - A large box installation stands on a dark warehouse floor. Its front face (16 × 9) is a hanging
//     fabric curtain with the sky video projected on it; the outer side faces also carry the sky.
//   - Inside the box is a green-screen studio: chroma-green floor, cove and walls, ceiling truss,
//     a cloud made of light bulbs, and ~40 workers in chroma suits whose monitor-heads show tired eyes.
//     A cable runs from every monitor up to a bulb in the cloud.
//   - Everything is rendered into an off-screen target, then a single post-processing pass applies
//     barrel distortion, chromatic aberration, vignette, grain and the ending "window" mask.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const BOX = { w: 16, h: 9, d: 14 }
const CHROMA = new THREE.Color('#00b140')
const FOV = 40

// deterministic random, so the studio looks the same on every visit
function rng(seed = 7) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/* ---------------- shaders ---------------- */

const curtainVert = /* glsl */ `
  uniform float uTime;
  uniform float uWrinkle;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vUv = uv;
    vec3 p = position;
    float x = uv.x, y = uv.y;
    float hang = 1.0 - y;
    float folds = sin(x * 42.0 + 1.3) * 0.10 + sin(x * 17.0 + 0.4) * 0.16 + sin(x * 91.0) * 0.03;
    float sway = sin(uTime * 0.6 + x * 3.0) * 0.05 * hang;
    p.z += uWrinkle * (folds * (0.6 + 0.4 * hang) + sway);
    float clip = abs(sin(x * 3.14159 * 8.0));
    p.y -= uWrinkle * 0.12 * clip * smoothstep(0.85, 1.0, y);
    vShade = 1.0 + uWrinkle * 0.16 * (cos(x * 42.0 + 1.3) + 0.6 * cos(x * 17.0 + 0.4));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

export const skyFrag = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uPixel;
  uniform float uBright;
  uniform float uWrinkle;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vec2 uv = vUv;
    if (uPixel > 0.001) {
      float n = mix(900.0, 260.0, uPixel);
      vec2 g = vec2(n, n * 9.0 / 16.0);
      uv = (floor(uv * g) + 0.5) / g;
    }
    vec3 c = texture2D(uTex, uv).rgb * uBright * vShade;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`

// used by the 2D tearable cloth so it matches the 3D curtain exactly
export const clothVert = /* glsl */ `
  uniform float uWrinkle;
  varying vec2 vUv;
  varying float vShade;
  void main() {
    vUv = uv;
    float x = uv.x;
    vShade = 1.0 + uWrinkle * 0.16 * (cos(x * 42.0 + 1.3) + 0.6 * cos(x * 17.0 + 0.4));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const postVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const postFrag = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uRes;
  uniform float uTime, uDistort, uCA, uVig, uGrain, uSat, uGlitch, uFade, uCool, uWinR;
  uniform vec4 uWin; // x, y (bottom-left, uv), w, h
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  vec2 barrel(vec2 uv, float k) {
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    return 0.5 + c * (1.0 + k * r2) / (1.0 + 0.5 * k);
  }

  void main() {
    // ending: the studio shrinks into a small rounded window
    vec2 center = (uWin.xy + uWin.zw * 0.5);
    vec2 q = (vUv - center) * uRes;
    vec2 b = uWin.zw * uRes * 0.5;
    float d = length(max(abs(q) - b + uWinR, 0.0)) - uWinR;
    float mask = clamp(0.5 - d, 0.0, 1.0);
    vec2 uv = (vUv - uWin.xy) / uWin.zw;

    uv = barrel(uv, uDistort);

    if (uGlitch > 0.001) {
      float row = floor(uv.y * 38.0);
      float t = floor(uTime * 9.0);
      float on = step(0.72, hash(vec2(row, t)));
      uv.x += (hash(vec2(t, row)) - 0.5) * 0.06 * on * uGlitch;
    }

    vec2 dir = (uv - 0.5);
    vec2 off = dir * (uCA / uRes.x) * 2.0;
    vec3 col;
    col.r = texture2D(tDiffuse, uv + off).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - off).b;

    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, uSat);
    col *= mix(vec3(1.0), vec3(0.9, 1.0, 1.05), uCool);

    vec2 vv = uv - 0.5;
    col *= 1.0 - uVig * smoothstep(0.25, 0.85, length(vv * vec2(1.0, 0.9)));

    col *= (1.0 - uFade);
    col *= mask;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain * mask;
  }
`

/* ---------------- world ---------------- */

export class World {
  constructor(canvas, { videos, workerUrl }) {
    this.canvas = canvas
    this.videos = videos
    this.workerUrl = workerUrl
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x000000, 0.012)
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 300)

    this.skyTex = new THREE.VideoTexture(videos.sky)
    this.skyTex.colorSpace = THREE.SRGBColorSpace

    // ?q=low in the address bar renders at reduced quality (useful on slow machines)
    this.low = new URLSearchParams(location.search).get('q') === 'low'
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: this.low ? 0 : 4 })
    this.post = new THREE.ShaderMaterial({
      vertexShader: postVert,
      fragmentShader: postFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uDistort: { value: 0 },
        uCA: { value: 0 },
        uVig: { value: 0 },
        uGrain: { value: 0 },
        uSat: { value: 1 },
        uGlitch: { value: 0 },
        uFade: { value: 0 },
        uCool: { value: 0 },
        uWin: { value: new THREE.Vector4(0, 0, 1, 1) },
        uWinR: { value: 0 },
      },
    })
    this.postScene = new THREE.Scene()
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post))

    // overlay scene for the 2D tearable cloth (pixel coordinates, y down)
    this.overlay = new THREE.Scene()
    this.overlayCam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10)

    this.flicker = 1
    this.rand = rng(11)
    this.buildLights()
    this.buildWarehouse()
    this.buildInstallation()
    this.buildStudio()
    this.buildBulbCloud()
    this.resize()
  }

  async loadWorkers() {
    const gltf = await new GLTFLoader().loadAsync(this.workerUrl)
    let src = null
    gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o })
    this.buildWorkers(src)
  }

  /* ---------- building ---------- */

  buildLights() {
    this.ambient = new THREE.AmbientLight(0xdfffee, 0.55)
    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0x0a2a14, 0.6)
    const key = new THREE.DirectionalLight(0xf2fbff, 1.6)
    key.position.set(2, 12, 6)
    const fill = new THREE.DirectionalLight(0xd8ffe8, 0.5)
    fill.position.set(-6, 6, -2)
    this.lights = [this.ambient, this.hemi, key, fill]
    this.lights.forEach((l) => this.scene.add(l))
  }

  buildWarehouse() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.6, metalness: 0.0 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    this.scene.add(floor)

    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.7, metalness: 0.4 })
    const g = new THREE.Group()
    // light stands either side of the installation
    for (const sx of [-1, 1]) {
      const stand = new THREE.Group()
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2), dark)
        const a = (i / 3) * Math.PI * 2
        leg.position.set(Math.cos(a) * 0.45, 1.0, Math.sin(a) * 0.45)
        leg.lookAt(0, 2.2, 0)
        leg.rotateX(Math.PI / 2)
        stand.add(leg)
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.2), dark)
      pole.position.y = 3.6
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), dark)
      head.position.set(0, 5.8, 0)
      head.rotation.x = -0.35
      stand.add(pole, head)
      stand.position.set(sx * 11.5, 0, 5)
      stand.rotation.y = sx * 0.4
      g.add(stand)
    }
    // ceiling grid of trusses above everything
    for (let i = -3; i <= 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(60, 0.18, 0.18), dark)
      bar.position.set(0, 13, i * 4)
      g.add(bar)
    }
    this.scene.add(g)
  }

  buildInstallation() {
    const { w, h } = BOX
    this.curtainMat = new THREE.ShaderMaterial({
      vertexShader: curtainVert,
      fragmentShader: skyFrag,
      uniforms: {
        uTex: { value: this.skyTex },
        uTime: { value: 0 },
        uWrinkle: { value: 0 },
        uPixel: { value: 0 },
        uBright: { value: 1.08 },
      },
    })
    this.curtain = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 160, 90), this.curtainMat)
    this.curtain.position.set(0, h / 2, 0.02)
    this.scene.add(this.curtain)

    // outer side faces with the projection continuing around the corner
    const sideMat = new THREE.ShaderMaterial({
      vertexShader: curtainVert,
      fragmentShader: skyFrag,
      uniforms: {
        uTex: { value: this.skyTex },
        uTime: { value: 0 },
        uWrinkle: { value: 0 },
        uPixel: { value: 0 },
        uBright: { value: 0.72 },
      },
    })
    this.sideMat = sideMat
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(BOX.d, h, 2, 2), sideMat)
      side.position.set(sx * w / 2, h / 2, -BOX.d / 2)
      side.rotation.y = sx * Math.PI / 2
      this.scene.add(side)
    }
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.3, 0.25, BOX.d + 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.8 }),
    )
    roof.position.set(0, h + 0.13, -BOX.d / 2)
    this.scene.add(roof)

    // the pipe the curtain hangs from, with clamps
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.4, metalness: 0.8 })
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, w + 0.8, 12), metal)
    pipe.rotation.z = Math.PI / 2
    pipe.position.set(0, h + 0.05, 0.12)
    this.scene.add(pipe)
    for (let i = 0; i <= 16; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.14), metal)
      c.position.set(-w / 2 + (i * w) / 16, h - 0.05, 0.1)
      this.scene.add(c)
    }
  }

  buildStudio() {
    const { w, h, d } = BOX
    const green = new THREE.MeshStandardMaterial({ color: CHROMA, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })
    this.greenMat = green
    const R = 2.4
    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, d - R), green)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, 0.005, -(d - R) / 2)
    // seamless cove into the back wall
    const cove = new THREE.Mesh(new THREE.CylinderGeometry(R, R, w - 0.1, 24, 1, true, Math.PI, Math.PI / 2), green)
    cove.rotation.z = Math.PI / 2
    cove.position.set(0, R, -(d - R))
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - R), green)
    back.position.set(0, R + (h - R) / 2, -d + 0.02)
    // side walls (inner)
    const sides = []
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(d, h), green)
      s.rotation.y = -sx * Math.PI / 2
      s.position.set(sx * (w / 2 - 0.06), h / 2, -d / 2)
      sides.push(s)
    }
    // dark ceiling with truss and fluorescent panels
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, side: THREE.DoubleSide }))
    ceil.rotation.x = Math.PI / 2
    ceil.position.set(0, h - 0.02, -d / 2)
    const truss = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.6 })
    const g = new THREE.Group()
    g.add(floor, cove, back, ...sides, ceil)
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.12, 0.12), truss)
      bar.position.set(0, h - 0.6, -1.5 - i * 3.5)
      g.add(bar)
    }
    this.panelMat = new THREE.MeshBasicMaterial({ color: 0xeefaf2 })
    for (let i = 0; i < 4; i++) {
      for (let j = -2; j <= 2; j++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.35), this.panelMat)
        p.position.set(j * 3, h - 0.75, -1.5 - i * 3.5)
        g.add(p)
      }
    }
    this.scene.add(g)
  }

  buildBulbCloud() {
    // a cloud of light bulbs inside a wire mesh, shaped like the sky's cloud: wide, lumpy, flat underneath
    const r = rng(23)
    const C = new THREE.Vector3(0.4, 6.15, -7.6)
    const blobs = [
      [-4.4, -0.25, 0, 0.75], [-3.3, 0.0, 0.1, 1.05], [-1.9, 0.35, -0.1, 1.35], [-0.3, 0.85, 0, 1.7],
      [1.3, 1.05, 0.1, 1.55], [2.8, 0.45, -0.1, 1.25], [4.0, 0.0, 0, 0.95], [4.9, -0.2, 0.05, 0.6],
      [0.8, -0.1, 0.4, 1.2], [-1.2, -0.15, 0.3, 1.1],
    ]
    const bottom = -0.55
    const inside = (p) => blobs.some(([x, y, z, rr]) => (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 < rr * rr) && p.y > bottom
    const pts = []
    let tries = 0
    while (pts.length < 520 && tries < 60000) {
      tries++
      const [bx, by, bz, br] = blobs[(r() * blobs.length) | 0]
      // points near each blob's surface read as a shell of bulbs
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = br * (0.78 + r() * 0.22)
      const s = Math.sqrt(1 - u * u)
      const p = new THREE.Vector3(bx + rad * s * Math.cos(th), by + rad * u, bz + rad * s * Math.sin(th))
      if (!inside(p)) continue
      if (pts.some((q) => q.distanceToSquared(p) < 0.045)) continue
      pts.push(p)
    }
    this.bulbPositions = pts.map((p) => p.clone().add(C))

    const geo = new THREE.SphereGeometry(0.085, 10, 8)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const bulbs = new THREE.InstancedMesh(geo, mat, pts.length)
    const m = new THREE.Matrix4()
    this.bulbBase = []
    pts.forEach((p, i) => {
      m.makeTranslation(p.x + C.x, p.y + C.y, p.z + C.z)
      bulbs.setMatrixAt(i, m)
      const dead = r() < 0.06
      const warm = new THREE.Color().setHSL(0.11, 0.55, dead ? 0.12 : 0.82 + r() * 0.12)
      this.bulbBase.push(warm)
      bulbs.setColorAt(i, warm)
    })
    this.bulbs = bulbs
    this.scene.add(bulbs)

    // wire mesh around the bulbs
    const wires = []
    for (const [x, y, z, rr] of blobs) {
      const ico = new THREE.IcosahedronGeometry(rr * 1.06, 2)
      ico.translate(x, y, z)
      wires.push(new THREE.WireframeGeometry(ico))
    }
    const lineMat = new THREE.LineBasicMaterial({ color: 0x8c8c8c, transparent: true, opacity: 0.35 })
    const mesh = new THREE.Group()
    wires.forEach((wg) => mesh.add(new THREE.LineSegments(wg, lineMat)))
    mesh.position.copy(C)
    this.scene.add(mesh)

    // suspension wires up to the ceiling
    const hang = []
    for (const x of [-4, -1.5, 1.2, 3.8]) {
      hang.push(new THREE.Vector3(x + C.x, C.y + 1.2, C.z), new THREE.Vector3(x + C.x, BOX.h - 0.05, C.z))
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hang), new THREE.LineBasicMaterial({ color: 0x333333 })))
  }

  buildWorkers(src) {
    const r = rng(5)
    const geo = src.geometry
    const mat = src.material
    mat.side = THREE.FrontSide
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
    mat.roughness = 0.9
    mat.metalness = 0

    // find the screen's front surface by casting a ray at the middle of the monitor
    geo.computeBoundingBox()
    const probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    probe.updateMatrixWorld()
    const ray = new THREE.Raycaster(new THREE.Vector3(-0.045, 0.81, 2), new THREE.Vector3(0, 0, -1))
    const hit = ray.intersectObject(probe)[0]
    const screenZ = (hit ? hit.point.z : 0.2) + 0.006
    this.screenZ = screenZ

    const eyeTex = this.videos.eyes.map((v) => {
      const t = new THREE.VideoTexture(v)
      t.colorSpace = THREE.SRGBColorSpace
      return t
    })
    const eyeMats = eyeTex.map((t) => new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.0, 1.0, 1.0) }))
    const screenGeo = new THREE.PlaneGeometry(0.255, 0.19)

    this.workers = []
    const rows = [
      { z: -3.4, n: 7 }, { z: -5.0, n: 8 }, { z: -6.6, n: 9 }, { z: -8.2, n: 8 }, { z: -9.8, n: 9 },
    ]
    const cablePieces = []
    let idx = 0
    const lowBulbs = this.bulbPositions.slice().sort((a, b) => a.y - b.y).slice(0, 200)
    rows.forEach((row, ri) => {
      const span = 12.4
      for (let i = 0; i < row.n; i++) {
        const x = -span / 2 + (span * (i + 0.5)) / row.n + (r() - 0.5) * 0.45
        const z = row.z + (r() - 0.5) * 0.5
        const s = 0.95 + r() * 0.1
        const g = new THREE.Group()
        const body = new THREE.Mesh(geo, mat)
        body.position.y = 0.95 * s
        body.scale.setScalar(s)
        const scr = new THREE.Mesh(screenGeo, eyeMats[idx % eyeMats.length])
        scr.position.set(-0.045, 0.81, screenZ)
        body.add(scr)
        g.add(body)
        g.position.set(x, 0, z)
        g.rotation.y = (r() - 0.5) * 0.35
        this.scene.add(g)
        this.workers.push({ g, body, s, phase: r() * 6.28, nod: r() })

        // cable from the back of the monitor up to a bulb
        g.updateMatrixWorld(true)
        const start = new THREE.Vector3(-0.05, 0.86, -0.22).multiplyScalar(s).add(new THREE.Vector3(0, 0.95 * s, 0)).applyMatrix4(g.matrixWorld)
        const end = lowBulbs[(r() * lowBulbs.length) | 0]
        const mid = start.clone().lerp(end, 0.5)
        mid.y -= 0.4 + r() * 0.6
        const curve = new THREE.CatmullRomCurve3([
          start,
          start.clone().add(new THREE.Vector3(0, 0.35, -0.25)),
          mid,
          end,
        ])
        cablePieces.push(new THREE.TubeGeometry(curve, 28, 0.009, 4, false))
        idx++
      }
    })
    const cables = new THREE.Mesh(mergeGeometries(cablePieces), new THREE.MeshBasicMaterial({ color: 0x111111 }))
    this.scene.add(cables)
  }

  /* ---------- camera helpers ---------- */

  // distance at which the 16:9 curtain exactly covers the screen
  coverDistance() {
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const visH = Math.min(BOX.h, BOX.w / this.camera.aspect) * 0.97
    return visH / (2 * t)
  }
  // distance at which the curtain fills about 70% of the screen
  pullEndDistance() {
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const visH = Math.max(BOX.h / 0.7, (BOX.w / 0.84) / this.camera.aspect)
    return visH / (2 * t)
  }

  setPullCamera(p) {
    const e = p * p * (3 - 2 * p)
    const d0 = this.coverDistance()
    const d1 = this.pullEndDistance()
    const dist = d0 + (d1 - d0) * e
    const orbit = Math.sin(Math.PI * THREE.MathUtils.clamp((p - 0.12) / 0.72, 0, 1))
    this.camera.position.set(orbit * 12.5, BOX.h / 2 + orbit * 1.6, dist + orbit * 2.0)
    this.camera.lookAt(0, BOX.h / 2, 0)
  }

  studioView(zoom, parallax = { x: 0, y: 0 }) {
    // zoom: 0 = default wide view through the opening, 1 = closest
    const e = zoom * zoom * (3 - 2 * zoom)
    const A = { p: new THREE.Vector3(0, 3.5, 7.5), t: new THREE.Vector3(0, 3.7, -7) }
    const B = { p: new THREE.Vector3(0.6, 2.0, -0.9), t: new THREE.Vector3(-0.25, 1.85, -5.5) }
    const p = A.p.clone().lerp(B.p, e)
    const t = A.t.clone().lerp(B.t, e)
    t.x += parallax.x * 0.9
    t.y += parallax.y * 0.5
    return { p, t }
  }

  // screen-space rectangle of the curtain for the current camera (CSS pixels)
  curtainRect() {
    const { w, h } = BOX
    const W = this.size.w, H = this.size.h
    const corners = [[-w / 2, h], [w / 2, h], [-w / 2, 0], [w / 2, 0]].map(([x, y]) => {
      const v = new THREE.Vector3(x, y, 0).project(this.camera)
      return [(v.x * 0.5 + 0.5) * W, (1 - (v.y * 0.5 + 0.5)) * H]
    })
    const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1])
    const x0 = Math.min(...xs), y0 = Math.min(...ys)
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }
  }

  /* ---------- frame ---------- */

  resize() {
    const W = window.innerWidth, H = window.innerHeight
    const dpr = this.low ? 0.5 : Math.min(window.devicePixelRatio || 1, 2)
    this.size = { w: W, h: H, dpr }
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(W, H, false)
    this.rt.setSize(Math.round(W * dpr), Math.round(H * dpr))
    this.camera.aspect = W / H
    this.camera.updateProjectionMatrix()
    this.post.uniforms.uRes.value.set(W * dpr, H * dpr)
    this.overlayCam.right = W
    this.overlayCam.bottom = H
    this.overlayCam.updateProjectionMatrix()
  }

  update(dt, t) {
    this.curtainMat.uniforms.uTime.value = t
    this.post.uniforms.uTime.value = t
    // fluorescent hum: tiny irregular dips in the studio light
    if (Math.random() < 0.04) this.flicker = 0.9 + Math.random() * 0.08
    this.flicker += (1 - this.flicker) * Math.min(1, dt * 8)
    this.ambient.intensity = 0.55 * this.flicker
    this.hemi.intensity = 0.6 * this.flicker
    // bulbs: a few blink, a few are dead
    if (this.bulbs && Math.random() < 0.5) {
      const i = (Math.random() * this.bulbBase.length) | 0
      const c = this.bulbBase[i].clone()
      if (Math.random() < 0.5) c.multiplyScalar(0.25)
      this.bulbs.setColorAt(i, c)
      this.bulbs.instanceColor.needsUpdate = true
    }
    // workers breathe and sway slightly, and now and then lower their heads
    if (this.workers) {
      for (const wk of this.workers) {
        const b = Math.sin(t * 1.3 + wk.phase)
        wk.body.scale.set(wk.s * (1 + b * 0.004), wk.s * (1 + b * 0.007), wk.s)
        wk.body.rotation.z = Math.sin(t * 0.4 + wk.phase) * 0.012
        const nod = Math.max(0, Math.sin(t * 0.21 + wk.nod * 20)) ** 6
        wk.body.rotation.x = nod * 0.06
      }
    }
  }

  render() {
    const r = this.renderer
    r.setRenderTarget(this.rt)
    r.autoClear = true
    r.render(this.scene, this.camera)
    if (this.overlay.children.length) {
      r.autoClear = false
      r.clearDepth()
      r.render(this.overlay, this.overlayCam)
      r.autoClear = true
    }
    r.setRenderTarget(null)
    r.render(this.postScene, this.postCam)
  }
}
