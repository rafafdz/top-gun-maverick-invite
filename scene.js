/* Top Gun: Maverick — Movie Night
 * Three.js scene: one real 3D aircraft (GLB) that flies out of the TV.
 *
 * World units are CSS pixels of the WebGL canvas, origin at its centre, and the
 * TV glass is the plane z = 0. The camera is set so z = 0 maps 1:1 onto the page,
 * which lets us render in two passes:
 *   1. the part of the jet behind the glass (z < 0), scissored to the screen rect;
 *   2. the part in front of the glass (z > 0), unclipped — it can overlap the frame.
 * Parallax moves the camera with an off-axis (view-offset) projection so the glass
 * plane stays locked to the DOM while depth shifts.
 */
const canvas = document.getElementById("gl");
const screenEl = document.querySelector(".tv__screen");
const fallback = document.getElementById("gl-fallback");
const stage = document.getElementById("stage");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const small = matchMedia("(max-width: 700px)");
const finePointer = matchMedia("(pointer: fine)");

const MODEL_URL = "assets/models/jet.glb";
const CYCLE = 9;      // seconds per loop
const FLIGHT = 6.6;   // seconds the jet is on screen
const COLORS = {      // original material name → minimal palette
  "455A64": { color: 0xd9d6cf },                                   // main skin → off-white
  "78909C": { color: 0x8e8c87 },                                   // secondary skin → warm grey
  "1A1A1A": { color: 0x17181a },                                   // intakes/nozzles → graphite
  "80DEEA": { color: 0x3d7bff, emissive: 0x3d7bff, emissiveIntensity: .55, metalness: .1, roughness: .2 }, // canopy → accent
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

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);

  // Lighting: soft sky/ground fill, a crisp key from above-right, a blue rim from the screen.
  scene.add(new THREE.HemisphereLight(0xf1efea, 0x0a0a0b, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(.6, 1, .8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x3d7bff, .7);
  rim.position.set(-.4, -.2, -1);
  scene.add(rim);

  // Load the model
  let gltf;
  try {
    gltf = await Promise.race([
      new GLTFLoader().loadAsync(MODEL_URL),
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
    const spec = COLORS[src.name] || { color: 0xd9d6cf };
    o.material = new THREE.MeshStandardMaterial({
      name: src.name, flatShading: true, metalness: .35, roughness: .55, ...spec,
    });
    src.dispose();
  });

  // Normalise: centre the model and make its length 1 unit; nose points +Z.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const unit = new THREE.Group();
  unit.add(model);
  unit.scale.setScalar(1 / size.z);
  const jet = new THREE.Group();
  jet.add(unit);
  scene.add(jet);

  // Clipping planes at the glass
  const behindGlass = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)]; // keeps z <= 0
  const inFront = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];      // keeps z >= 0

  // Layout
  let W = 1, H = 1, D = 1, S = 1;
  const scr = { x: 0, y: 0, w: 1, h: 1, cx: 0, cy: 0 }; // scissor rect (CSS px, bottom-left origin) + centre in world
  let path = null;

  function layout() {
    const c = canvas.getBoundingClientRect();
    const s = screenEl.getBoundingClientRect();
    if (!c.width || !s.width) return;
    W = c.width; H = c.height;
    const dpr = Math.min(devicePixelRatio || 1, small.matches ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);

    camera.aspect = W / H;
    D = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.near = D * .05; camera.far = D * 12;
    camera.updateProjectionMatrix();

    scr.x = s.left - c.left; scr.y = c.bottom - s.bottom; scr.w = s.width; scr.h = s.height;
    scr.cx = s.left + s.width / 2 - (c.left + W / 2);
    scr.cy = -(s.top + s.height * .56 - (c.top + H / 2)); // radar centre sits at 56% of the screen
    S = s.width;

    jet.scale.setScalar(S * (small.matches ? .34 : .3));

    // Flight path: deep inside the screen → through the glass → past the viewer, off to the right.
    const P = (x, y, z) => new THREE.Vector3(scr.cx + x * S, scr.cy + y * S, z * S);
    path = new THREE.CatmullRomCurve3([
      P(.02, .01, -9),
      P(-.1, .03, -3.2),
      P(.04, -.02, -.9),
      P(.2, -.1, .25),
      P(.4, -.26, D / S * .32),
      P(.85, -.66, D / S * .7),
    ], false, "centripetal");

    if (!running) render(Number.isNaN(freeze) ? staticTime() : freeze);
  }

  // Parallax (pointer on desktop, slow drift elsewhere) via off-axis projection.
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
  }

  const tmp = new THREE.Vector3();
  function pose(u) {
    path.getPoint(u, jet.position);
    path.getPoint(Math.min(1, u + .004), tmp);
    if (tmp.distanceToSquared(jet.position) < 1e-6) tmp.z += 1;
    jet.lookAt(tmp);
    // Bank: gentle S-turn inside the screen, hard right roll as it breaks out.
    const roll = Math.sin(u * Math.PI * 2) * .25 + THREE.MathUtils.smoothstep(u, .45, .95) * -1.1;
    jet.rotateZ(roll);
  }

  function render(t) {
    if (!path) return;
    const local = t % CYCLE;
    const flying = local < FLIGHT;
    jet.visible = flying;
    if (flying) {
      const u = THREE.MathUtils.clamp(local / FLIGHT, 0, 1);
      pose(u);
    }
    placeCamera(t);

    renderer.clear();
    // Pass 1: behind the glass, only inside the screen rectangle
    renderer.clippingPlanes = behindGlass;
    renderer.setScissorTest(true);
    renderer.setScissor(scr.x, scr.y, scr.w, scr.h);
    renderer.render(scene, camera);
    // Pass 2: in front of the glass, free to overlap the frame
    renderer.setScissorTest(false);
    renderer.clippingPlanes = inFront;
    renderer.render(scene, camera);
  }

  // Reduced motion: a single still frame, aircraft just breaking through the glass.
  const staticTime = () => FLIGHT * .66;

  // Loop control
  let running = false, visible = true, raf = 0, t0 = performance.now(), lastCycle = -1;
  function frame(now) {
    const t = Math.max(0, now - t0) / 1000;
    const cycle = Math.floor(t / CYCLE);
    if (cycle !== lastCycle) { lastCycle = cycle; window.TGM?.flyby?.(); }
    render(t);
    raf = requestAnimationFrame(frame);
  }
  const freeze = parseFloat(new URLSearchParams(location.search).get("jet"));
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
  window.TGM = Object.assign(window.TGM || {}, { scene: { renderer, model: MODEL_URL, triangles: renderer.info.render.triangles } });
}

init().catch(showFallback);
