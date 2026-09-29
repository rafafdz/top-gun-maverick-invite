/* Top Gun: Maverick — Movie Night
 * Three.js scene: one real 3D aircraft (GLB) that accelerates out of the TV,
 * and drives a single reactive light colour onto the TV frame and halo.
 *
 * World units are CSS pixels of the WebGL canvas, origin at its centre, and the
 * TV glass is the plane z = 0. The camera maps z = 0 1:1 onto the page, so we can
 * render in two passes:
 *   1. the part of the scene behind the glass (z < 0), scissored to the screen rect;
 *   2. the part in front of the glass (z > 0), unclipped — it can overlap the frame.
 * Parallax uses an off-axis (view-offset) projection so the glass stays locked to the DOM.
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const CONFIG = {
  model: "assets/models/jet.glb",
  cycle: 9,          // s, one loop (flight + pause)
  flight: 6.8,       // s, time the jet is visible
  accel: 2.8,        // exponential acceleration; end speed ≈ e^accel × start speed
  ghosts: 3,         // afterimages at high speed (2 on small screens)
  trailSamples: 28,  // points per wingtip contrail
  trailLength: .16,  // contrail length as a fraction of the path, at full speed
  spill: {
    canopy: 0x3d7bff,  // cockpit light (from the recoloured canopy material)
    engine: 0xf4e7d3,  // warm-white engine light
    max: .85,          // peak spill opacity
  },
};

const canvas = document.getElementById("gl");
const screenEl = document.querySelector(".tv__screen");
const fallback = document.getElementById("gl-fallback");
const stage = document.getElementById("stage");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const small = matchMedia("(max-width: 700px)");
const finePointer = matchMedia("(pointer: fine)");

const MATERIALS = { // original material name → minimal palette
  "455A64": { color: 0xd9d6cf },                  // main skin → off-white
  "78909C": { color: 0x8e8c87 },                  // secondary skin → warm grey
  "1A1A1A": { color: 0x17181a },                  // intakes/nozzles → graphite
  "80DEEA": { color: CONFIG.spill.canopy, emissive: CONFIG.spill.canopy, emissiveIntensity: .7, metalness: .1, roughness: .2 },
};

function showFallback(reason) {
  canvas.hidden = true;
  fallback.hidden = false;
  stage.dataset.gl = "fallback";
  console.warn("[tgm] 3D scene unavailable:", reason);
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

async function init() {
  if (!webglAvailable()) return showFallback("WebGL not supported");

  let THREE, GLTFLoader;
  try {
    THREE = await import("three");
    ({ GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js"));
  } catch (e) {
    return showFallback(e);
  }
  const { clamp, smoothstep, lerp } = THREE.MathUtils;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);

  scene.add(new THREE.HemisphereLight(0xf1efea, 0x0a0a0b, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(.6, 1, .8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(CONFIG.spill.canopy, .7);
  rim.position.set(-.4, -.2, -1);
  scene.add(rim);

  // ---- Model ---------------------------------------------------------------
  let gltf;
  try {
    gltf = await Promise.race([
      new GLTFLoader().loadAsync(CONFIG.model),
      new Promise((_, rej) => setTimeout(() => rej(new Error("model load timeout")), 15000)),
    ]);
  } catch (e) {
    renderer.dispose();
    return showFallback(e);
  }

  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    o.material = new THREE.MeshStandardMaterial({
      name: src.name, flatShading: true, metalness: .35, roughness: .55, ...(MATERIALS[src.name] || { color: 0xd9d6cf }),
    });
    src.dispose();
  });

  // Normalise: centre, length 1 unit along Z, nose +Z.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const unit = new THREE.Group();
  unit.add(model);
  unit.scale.setScalar(1 / size.z);
  const span = size.x / size.z; // wingspan relative to length

  const jet = new THREE.Group();
  jet.add(unit);
  scene.add(jet);

  // Local light sources on the aircraft (positions in normalised model space).
  const CANOPY = new THREE.Vector3(0, .1, .22);
  const NOZZLE = new THREE.Vector3(0, .02, -.5);
  const canopyLight = new THREE.PointLight(CONFIG.spill.canopy, 0, 0, 0);
  canopyLight.position.copy(CANOPY);
  const engineLight = new THREE.PointLight(CONFIG.spill.engine, 0, 0, 0);
  engineLight.position.copy(NOZZLE).setZ(-.62);
  jet.add(canopyLight, engineLight);

  // Engine glow: a small additive sprite at the nozzles, grows with throttle.
  const glowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.35, "rgba(255,240,220,.55)"); r.addColorStop(1, "rgba(255,240,220,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: CONFIG.spill.engine, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  engineGlow.position.copy(NOZZLE);
  jet.add(engineGlow);

  // Afterimages: translucent copies trailing along the path at high speed.
  const ghosts = [];
  for (let i = 0; i < CONFIG.ghosts; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xd9d6cf, transparent: true, opacity: 0, depthWrite: false });
    const g = new THREE.Group();
    const copy = unit.clone();
    copy.traverse((o) => { if (o.isMesh) o.material = mat; });
    g.add(copy);
    g.userData.mat = mat;
    scene.add(g);
    ghosts.push(g);
  }

  // Wingtip contrails: two thin fading lines sampled from the path.
  const N = CONFIG.trailSamples;
  function makeTrail() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 4), 4));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    line.frustumCulled = false;
    scene.add(line);
    return line;
  }
  const trails = [makeTrail(), makeTrail()];

  // Clipping planes at the glass
  const behindGlass = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)]; // keeps z <= 0
  const inFront = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];      // keeps z >= 0

  // ---- Layout ----------------------------------------------------------------
  let W = 1, H = 1, D = 1, S = 1, jetLen = 1;
  const scr = { x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 };
  let path = null, glassS = .75;

  function layout() {
    const c = canvas.getBoundingClientRect();
    const s = screenEl.getBoundingClientRect();
    if (!c.width || !s.width) return;
    W = c.width; H = c.height;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small.matches ? 1.5 : 2));
    renderer.setSize(W, H, false);

    camera.aspect = W / H;
    D = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.near = D * .05; camera.far = D * 12;
    camera.updateProjectionMatrix();

    scr.x = s.left - c.left; scr.y = c.bottom - s.bottom; scr.w = s.width; scr.h = s.height;
    scr.cx = s.left + s.width / 2 - (c.left + W / 2);
    scr.cy = -(s.top + s.height * .56 - (c.top + H / 2)); // radar centre sits at 56% of the screen
    S = s.width;

    jetLen = S * (small.matches ? .34 : .3);
    jet.scale.setScalar(jetLen);
    ghosts.forEach((g) => g.scale.setScalar(jetLen));

    // Path: cruise inside the screen → dive through the glass → past the viewer, lower right.
    const P = (x, y, z) => new THREE.Vector3(scr.cx + x * S, scr.cy + y * S, z * S);
    const dS = D / S;
    path = new THREE.CatmullRomCurve3([
      P(-.06, .03, -3.4),
      P(.07, .02, -2.2),
      P(-.02, -.02, -1.3),
      P(.12, -.08, -.2),
      P(.34, -.22, dS * .28),
      P(.8, -.62, dS * .72),
    ], false, "centripetal");
    path.arcLengthDivisions = 400;
    path.updateArcLengths();
    // Arc-length fraction at which the path crosses the glass (for audio sync + still frame).
    glassS = .75;
    for (let i = 0; i <= 200; i++) { if (path.getPointAt(i / 200).z >= 0) { glassS = i / 200; break; } }

    if (!running) render(Number.isNaN(freeze) ? staticTime() : freeze);
  }

  // ---- Motion ----------------------------------------------------------------
  const K = CONFIG.accel, EK = Math.exp(K) - 1;
  const ease = (u) => (Math.exp(K * u) - 1) / EK;       // distance along path, 0..1
  const speedAt = (u) => Math.exp(K * (u - 1));          // normalised speed, e^-K .. 1
  const uForS = (s) => Math.log(1 + s * EK) / K;         // inverse of ease

  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", (e) => {
    if (!finePointer.matches) return;
    par.tx = (e.clientX / innerWidth - .5) * 2;
    par.ty = (e.clientY / innerHeight - .5) * 2;
  }, { passive: true });

  function placeCamera(t) {
    if (!finePointer.matches && !reduceMotion.matches) {
      par.tx = Math.sin(t * .23) * .6; par.ty = Math.sin(t * .17) * .4;
    }
    par.x += (par.tx - par.x) * .06;
    par.y += (par.ty - par.y) * .06;
    const dx = reduceMotion.matches ? 0 : par.x * S * .12;
    const dy = reduceMotion.matches ? 0 : -par.y * S * .08;
    camera.position.set(dx, dy, D);
    camera.lookAt(dx, dy, 0);
    camera.setViewOffset(W, H, -dx, dy, W, H); // keeps the z = 0 plane locked to the page
    camera.updateMatrixWorld();
  }

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function orient(obj, s, roll) {
    path.getPointAt(s, obj.position);
    path.getPointAt(Math.min(1, s + .003), tmp);
    if (tmp.distanceToSquared(obj.position) < 1e-6) tmp.z += 1;
    obj.lookAt(tmp);
    obj.rotateZ(roll);
  }
  // Gentle weave while cruising, committed right bank as it breaks out.
  const rollAt = (s) => Math.sin(s * Math.PI * 3) * .18 * (1 - s) + smoothstep(s, .6, .95) * -1.05;

  // ---- Reactive light → CSS --------------------------------------------------
  const cCanopy = new THREE.Color(CONFIG.spill.canopy), cEngine = new THREE.Color(CONFIG.spill.engine);
  const spillColor = new THREE.Color();
  const fwd = new THREE.Vector3(), toCam = new THREE.Vector3(), ndc = new THREE.Vector3();
  const style = stage.style;
  let lastSpill = "";

  function spill(visible, v) {
    let a = 0, x = 0, y = 0, rgb = "61 123 255";
    if (visible) {
      // Where is the jet on the page, relative to the TV centre?
      ndc.copy(jet.position).project(camera);
      const px = (ndc.x + 1) / 2 * W, py = (1 - ndc.y) / 2 * H;
      const tvX = scr.x + scr.w / 2, tvY = H - (scr.y + scr.h / 2);
      x = clamp(px - tvX, -scr.w * .75, scr.w * .75);
      y = clamp(py - tvY, -scr.h * .9, scr.h * .9);

      // Colour: cockpit blue when the nose faces us, warm engine light when the tail does.
      fwd.set(0, 0, 1).applyQuaternion(jet.quaternion);
      toCam.subVectors(camera.position, jet.position).normalize();
      const tail = clamp((1 - fwd.dot(toCam)) / 2 + v * .12, 0, 1);
      // …plus afterburner warmth at full throttle, so the flyby flashes toward white.
      spillColor.copy(cCanopy).lerp(cEngine, Math.max(smoothstep(tail, .35, .9), v * v * .5));
      const hex = spillColor.getHex(); // sRGB
      rgb = `${hex >> 16 & 255} ${hex >> 8 & 255} ${hex & 255}`;

      // Intensity: builds as it approaches the glass, peaks crossing it, decays as it leaves.
      const approach = smoothstep(jet.position.z / S, -3.4, .15);
      const off = Math.hypot(x / (scr.w / 2), y / (scr.h / 2));
      const leave = 1 - smoothstep(off, .9, 1.9) * smoothstep(jet.position.z / S, 0, .6);
      a = CONFIG.spill.max * Math.pow(approach, 1.6) * leave * (.35 + .65 * v);
    }
    const key = `${rgb}|${a.toFixed(3)}|${x | 0}|${y | 0}`;
    if (key === lastSpill) return;
    lastSpill = key;
    style.setProperty("--spill-rgb", rgb);
    style.setProperty("--spill-a", a.toFixed(3));
    style.setProperty("--spill-x", `${x.toFixed(1)}px`);
    style.setProperty("--spill-y", `${y.toFixed(1)}px`);
  }

  // ---- Frame -----------------------------------------------------------------
  function render(t) {
    if (!path) return;
    const local = t % CONFIG.cycle;
    const flying = local < CONFIG.flight;
    const u = clamp(local / CONFIG.flight, 0, 1);
    const s = ease(u), v = speedAt(u);

    jet.visible = flying;
    if (flying) orient(jet, s, rollAt(s));

    // On-aircraft lights and engine glow follow throttle.
    canopyLight.intensity = lerp(.4, 2.2, v);
    engineLight.intensity = lerp(.2, 2.6, v);
    engineGlow.material.opacity = lerp(.2, .75, v);
    engineGlow.scale.setScalar(lerp(.05, .16, v));

    // Afterimages: only once it is really moving.
    const ghostK = small.matches ? 2 : ghosts.length;
    ghosts.forEach((g, i) => {
      const on = flying && i < ghostK && v > .18 && !reduceMotion.matches;
      g.visible = on;
      if (!on) return;
      const gs = Math.max(0, s - (i + 1) * .012 * v);
      orient(g, gs, rollAt(gs));
      g.userData.mat.opacity = (.13 / (i + 1)) * smoothstep(v, .18, .6);
    });

    // Contrails from both wingtips; length and opacity scale with speed.
    trails.forEach((line, side) => {
      line.visible = flying && v > .08 && !reduceMotion.matches;
      if (!line.visible) return;
      const pos = line.geometry.attributes.position, col = line.geometry.attributes.color;
      const len = CONFIG.trailLength * v;
      tmp2.set((side ? 1 : -1) * span * .47, 0, -.1).multiplyScalar(jetLen).applyQuaternion(jet.quaternion);
      for (let i = 0; i < N; i++) {
        const f = i / (N - 1);
        path.getPointAt(Math.max(0, s - f * len), tmp).add(tmp2);
        pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
        col.setXYZW(i, .95, .94, .92, (1 - f) * (1 - f) * .55 * smoothstep(v, .08, .5));
      }
      pos.needsUpdate = col.needsUpdate = true;
    });

    placeCamera(t);
    spill(flying, v);

    renderer.clear();
    renderer.clippingPlanes = behindGlass;
    renderer.setScissorTest(true);
    renderer.setScissor(scr.x, scr.y, scr.w, scr.h);
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.clippingPlanes = inFront;
    renderer.render(scene, camera);
  }

  // Reduced motion: one still frame, just breaking through the glass.
  const staticTime = () => CONFIG.flight * uForS(Math.min(1, glassS + .06));

  // ---- Loop control ------------------------------------------------------------
  const freeze = parseFloat(new URLSearchParams(location.search).get("jet"));
  let running = false, visible = true, raf = 0, t0 = performance.now(), lastCycle = -1;
  function frame(now) {
    const t = Math.max(0, now - t0) / 1000;
    const cycle = Math.floor(t / CONFIG.cycle);
    if (cycle !== lastCycle) { lastCycle = cycle; window.TGM?.flyby?.(CONFIG.flight, uForS(glassS)); }
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    if (!Number.isNaN(freeze)) { running = false; return render(freeze); }
    const want = visible && !document.hidden && !reduceMotion.matches;
    if (want === running) return;
    running = want;
    cancelAnimationFrame(raf);
    if (running) { t0 = performance.now(); lastCycle = -1; raf = requestAnimationFrame(frame); }
    else render(staticTime());
  }

  new ResizeObserver(layout).observe(screenEl);
  addEventListener("resize", layout);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(stage);
  document.addEventListener("visibilitychange", sync);
  reduceMotion.addEventListener?.("change", sync);
  small.addEventListener?.("change", layout);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); cancelAnimationFrame(raf); running = false; showFallback("context lost"); });

  layout();
  sync();
  stage.dataset.gl = "ready";
  window.TGM = Object.assign(window.TGM || {}, { scene: { renderer, config: CONFIG, glassAt: () => CONFIG.flight * uForS(glassS) } });
}

init().catch(showFallback);
