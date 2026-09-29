/* Top Gun: Maverick — Movie Night Invite
 * Vanilla JS: Chilean clock + event status, screen canvas, parallax, simulated 5.1 audio, RSVP helpers.
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Event configuration (edit here — see README)
  // ---------------------------------------------------------------------------
  const EVENT = {
    timeZone: "America/Santiago",
    date: { y: 2026, m: 9, d: 30 },
    start: { h: 7, min: 30 },
    end: { h: 22, min: 0 },
    title: "Noche de cine: Top Gun: Maverick",
    rsvpText: "¡Confirmo misil! Voy a la noche de cine de Top Gun: Maverick el miércoles 30 de septiembre (07:30–22:00) 🛩️",
  };

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pad = (n) => String(n).padStart(2, "0");

  // ---------------------------------------------------------------------------
  // Time zone helpers (no libraries): read wall-clock parts in America/Santiago
  // and convert a Santiago wall-clock time to an absolute epoch, DST-aware.
  // ---------------------------------------------------------------------------
  const partsFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT.timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  function zonedParts(date) {
    const p = {};
    for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value;
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, s: +p.second };
  }

  function tzOffsetMs(date) {
    const p = zonedParts(date);
    const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    return asUTC - Math.floor(date.getTime() / 1000) * 1000;
  }

  function zonedToEpoch(y, m, d, h, min) {
    const guess = Date.UTC(y, m - 1, d, h, min);
    let t = guess - tzOffsetMs(new Date(guess));
    t = guess - tzOffsetMs(new Date(t)); // second pass settles DST edges
    return t;
  }

  const E = EVENT.date;
  const START = zonedToEpoch(E.y, E.m, E.d, EVENT.start.h, EVENT.start.min);
  const END = zonedToEpoch(E.y, E.m, E.d, EVENT.end.h, EVENT.end.min);

  // Allow previewing states: ?now=2026-09-30T20:00:00-03:00
  let simOffset = 0;
  try {
    const q = new URLSearchParams(location.search).get("now");
    if (q && !Number.isNaN(Date.parse(q))) simOffset = Date.parse(q) - Date.now();
  } catch (_) { /* ignore */ }
  const now = () => new Date(Date.now() + simOffset);

  // ---------------------------------------------------------------------------
  // Clock + status
  // ---------------------------------------------------------------------------
  const el = {
    clock: $("clock"), badge: $("status-badge"), line: $("status-line"),
    countdown: $("countdown"), d: $("cd-d"), h: $("cd-h"), m: $("cd-m"), s: $("cd-s"),
    tNow: $("timeline-now"), tNowLabel: $("timeline-now-label"), hour: $("status-hour"),
    plan: $("plan"),
  };
  const planItems = el.plan ? [...el.plan.querySelectorAll("li")] : [];
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

  const dayFmt = new Intl.DateTimeFormat("es-CL", { timeZone: EVENT.timeZone, weekday: "long", day: "numeric", month: "long" });

  let lastState = "";
  let lastHourKey = "";

  function setCountdown(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    el.d.textContent = pad(Math.floor(t / 86400));
    el.h.textContent = pad(Math.floor((t % 86400) / 3600));
    el.m.textContent = pad(Math.floor((t % 3600) / 60));
    el.s.textContent = pad(t % 60);
  }

  function humanDuration(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    const out = [];
    if (d) out.push(`${d} ${d === 1 ? "día" : "días"}`);
    if (h) out.push(`${h} ${h === 1 ? "hora" : "horas"}`);
    if (!d && m) out.push(`${m} min`);
    return out.join(" y ") || "menos de un minuto";
  }

  function tick() {
    const n = now();
    const t = n.getTime();
    const p = zonedParts(n);

    el.clock.textContent = `${pad(p.h)}:${pad(p.min)}:${pad(p.s)}`;
    el.clock.setAttribute("datetime", n.toISOString());

    // timeline marker (position in the Chilean day)
    const dayMin = p.h * 60 + p.min + p.s / 60;
    el.tNow.style.left = `${(dayMin / 1440) * 100}%`;
    el.tNowLabel.textContent = `${pad(p.h)}:${pad(p.min)}`;

    let state;
    if (t < START) state = (p.y === E.y && p.m === E.m && p.d === E.d) ? "today" : "soon";
    else if (t < END) state = "live";
    else state = "done";

    if (state === "live") setCountdown(END - t);
    else if (state === "done") setCountdown(0);
    else setCountdown(START - t);

    // Text status refreshes when the state changes and on every hour boundary in Chile.
    const hourKey = `${state}|${p.y}-${p.m}-${p.d} ${p.h}`;
    if (hourKey !== lastHourKey) {
      lastHourKey = hourKey;
      updateStatusText(state, t, p);
    }
    if (state !== lastState) {
      lastState = state;
      el.badge.dataset.state = state;
      el.countdown.classList.toggle("is-live", state === "live");
    }
  }

  function updateStatusText(state, t, p) {
    const labels = { soon: "EN ESPERA", today: "HOY · PRE-VUELO", live: "EN VUELO", done: "MISIÓN CUMPLIDA" };
    el.badge.textContent = labels[state];
    const today = dayFmt.format(new Date(t));
    let html;
    switch (state) {
      case "soon":
        html = `Despegue el <strong>miércoles 30 de septiembre a las 07:30</strong>. Faltan ${humanDuration(START - t)}.`;
        el.countdown.setAttribute("aria-label", "Cuenta regresiva para el inicio");
        break;
      case "today":
        html = `¡Es hoy! La base abre a las <strong>07:30</strong> y cierra a las <strong>22:00</strong>. Faltan ${humanDuration(START - t)}.`;
        el.countdown.setAttribute("aria-label", "Cuenta regresiva para la apertura de hoy");
        break;
      case "live":
        html = `<strong>Estamos en el aire.</strong> La experiencia está abierta hasta las 22:00 — quedan ${humanDuration(END - t)}. Llega cuando puedas.`;
        el.countdown.setAttribute("aria-label", "Tiempo restante del evento");
        break;
      default:
        html = `La noche de cine fue el miércoles 30 de septiembre, de 07:30 a 22:00. Gracias por volar con nosotros. <span class="sr-only">Hoy es ${today}.</span>`;
        el.countdown.setAttribute("aria-label", "Evento finalizado");
    }
    el.line.innerHTML = html;

    const nextHour = (p.h + 1) % 24;
    el.hour.textContent = `Hora de Chile: ${today} · actualizado ${pad(p.h)}:00 · próximo pulso horario ${pad(nextHour)}:00`;

    // Highlight the current flight-plan block (only on event day)
    const isEventDay = p.y === E.y && p.m === E.m && p.d === E.d;
    const cur = p.h * 60 + p.min;
    for (const li of planItems) {
      const a = toMin(li.dataset.start), b = toMin(li.dataset.end);
      const on = state === "live" && isEventDay && cur >= a && cur < b;
      li.classList.toggle("is-now", on);
      li.classList.toggle("is-past", (isEventDay && cur >= b) || state === "done");
      if (on) li.setAttribute("aria-current", "time"); else li.removeAttribute("aria-current");
    }
  }

  // Align ticks to the wall-clock second.
  function startClock() {
    tick();
    setTimeout(() => { tick(); setInterval(tick, 1000); }, 1000 - (Date.now() % 1000) + 5);
  }
  startClock();

  // ---------------------------------------------------------------------------
  // Screen canvas: warp starfield + perspective radar floor + clouds
  // ---------------------------------------------------------------------------
  const canvas = $("screen-canvas");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  const stars = [];
  const STAR_COUNT = 220;

  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!running) drawFrame(0);
  }

  function resetStar(s, far) {
    s.x = (Math.random() - .5) * 2;
    s.y = (Math.random() - .5) * 1.2 - .25;
    s.z = far ? 1 : Math.random() * .9 + .1;
    s.pz = s.z;
    s.warm = Math.random() < .12;
  }
  for (let i = 0; i < STAR_COUNT; i++) { const s = {}; resetStar(s, false); stars.push(s); }

  let t0 = performance.now();
  let running = false;
  let visible = true;

  function drawFrame(time) {
    const t = time / 1000;
    const cx = W / 2, horizon = H * .56;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#02040b");
    sky.addColorStop(.45, "#071633");
    sky.addColorStop(.56, "#1b3c73");
    sky.addColorStop(.565, "#ff9f3a");
    sky.addColorStop(.6, "#1a0f10");
    sky.addColorStop(1, "#03050a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // sun bloom on horizon
    const sun = ctx.createRadialGradient(cx, horizon, 0, cx, horizon, W * .45);
    sun.addColorStop(0, "rgba(255,190,110,.55)");
    sun.addColorStop(.25, "rgba(255,140,50,.18)");
    sun.addColorStop(1, "rgba(255,140,50,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);

    // warp stars
    const speed = .0065;
    ctx.lineCap = "round";
    for (const s of stars) {
      s.pz = s.z;
      s.z -= speed;
      if (s.z <= .02) { resetStar(s, true); continue; }
      const sx = cx + (s.x / s.z) * W * .25, sy = horizon * .6 + (s.y / s.z) * H * .35;
      const px = cx + (s.x / s.pz) * W * .25, py = horizon * .6 + (s.y / s.pz) * H * .35;
      if (sy > horizon - 2) continue;
      const a = Math.min(1, (1 - s.z) * 1.4);
      ctx.strokeStyle = s.warm ? `rgba(255,200,130,${a})` : `rgba(190,225,255,${a})`;
      ctx.lineWidth = (1 - s.z) * 2.2 + .3;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
    }

    // perspective radar floor
    ctx.save();
    ctx.beginPath(); ctx.rect(0, horizon, W, H - horizon); ctx.clip();
    const floor = ctx.createLinearGradient(0, horizon, 0, H);
    floor.addColorStop(0, "rgba(62,166,255,.0)");
    floor.addColorStop(1, "rgba(62,166,255,.18)");
    ctx.fillStyle = floor; ctx.fillRect(0, horizon, W, H - horizon);
    ctx.strokeStyle = "rgba(90,175,255,.55)";
    ctx.lineWidth = 1;
    const lines = 26;
    for (let i = -lines; i <= lines; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 4, horizon);
      ctx.lineTo(cx + i * W * .12, H);
      ctx.stroke();
    }
    const scroll = (t * 1.4) % 1;
    for (let i = 0; i < 16; i++) {
      const z = (i + 1 - scroll) / 16;
      const y = horizon + (H - horizon) * Math.pow(z, 2.4);
      ctx.globalAlpha = Math.min(1, z * 1.6);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // radar sweep arc on the floor
    const ang = (t * .9) % (Math.PI * 2);
    ctx.save();
    ctx.translate(cx, H * 1.05);
    ctx.scale(1, .32);
    const R = W * .7;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, "rgba(255,181,71,.0)");
    g.addColorStop(1, "rgba(255,181,71,.22)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, Math.PI + ang % Math.PI - .35, Math.PI + ang % Math.PI); ctx.closePath(); ctx.fill();
    ctx.restore();

    // drifting cloud bands
    for (let i = 0; i < 3; i++) {
      const y = horizon - H * (.06 + i * .07);
      const x = ((t * (18 + i * 14) + i * 300) % (W + 600)) - 300;
      const cg = ctx.createRadialGradient(W - x, y, 0, W - x, y, W * .25);
      cg.addColorStop(0, `rgba(160,190,230,${.10 - i * .025})`);
      cg.addColorStop(1, "rgba(160,190,230,0)");
      ctx.fillStyle = cg;
      ctx.fillRect(0, y - H * .2, W, H * .4);
    }
  }

  function loop(time) {
    if (!running) return;
    drawFrame(time - t0);
    hudTick(time);
    requestAnimationFrame(loop);
  }

  function setRunning(on) {
    const want = on && visible && !reduceMotion.matches && !document.hidden;
    if (want === running) return;
    running = want;
    if (running) requestAnimationFrame(loop);
    else drawFrame(performance.now() - t0);
  }

  // HUD readouts wobble slightly while animating
  const hudAlt = $("hud-alt"), hudSpd = $("hud-spd"), hudHdg = $("hud-hdg");
  let lastHud = 0;
  function hudTick(time) {
    if (time - lastHud < 180) return;
    lastHud = time;
    const s = time / 1000;
    hudAlt.textContent = String(Math.round(12500 + Math.sin(s * .7) * 900)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    hudSpd.textContent = `M ${(1.2 + Math.sin(s * .5) * .25).toFixed(2)}`;
    hudHdg.textContent = String(Math.round(270 + Math.sin(s * .3) * 12)).padStart(3, "0");
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(true); }).observe(canvas);
  }
  document.addEventListener("visibilitychange", () => setRunning(true));
  reduceMotion.addEventListener?.("change", () => setRunning(true));
  setRunning(true);

  // ---------------------------------------------------------------------------
  // Parallax + tasteful shake timed with the hero jet punch-out
  // ---------------------------------------------------------------------------
  const theater = $("theater");
  const root = document.documentElement;
  const finePointer = window.matchMedia("(pointer: fine)");
  let raf = 0;
  window.addEventListener("pointermove", (e) => {
    if (reduceMotion.matches || !finePointer.matches) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      root.style.setProperty("--mx", ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--my", ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
    });
  }, { passive: true });

  let boomTimer = 0;
  const heroJet = document.querySelector(".jet--hero");
  if (heroJet) {
    heroJet.addEventListener("animationiteration", () => scheduleBoom());
    scheduleBoom();
  }
  function scheduleBoom() {
    clearTimeout(boomTimer);
    if (reduceMotion.matches) return;
    boomTimer = setTimeout(() => {
      theater.classList.remove("is-boom");
      void theater.offsetWidth;
      theater.classList.add("is-boom");
      audio.flyby(); // sync a whoosh if sound is on
    }, 9000 * .70);
  }

  // ---------------------------------------------------------------------------
  // Simulated 5.1 surround — synthesized with the Web Audio API (no samples)
  // Channels are placed in virtual space with HRTF panners (L, C, R, SL, SR)
  // plus a low-passed LFE bus. It is a binaural/stereo simulation, not true 5.1.
  // ---------------------------------------------------------------------------
  const audio = (() => {
    const btn = $("audio-toggle"), btnLabel = $("audio-toggle-label"), muteBtn = $("audio-mute");
    const vol = $("audio-volume"), volOut = $("audio-volume-out"), state = $("audio-state");
    const surround = document.querySelector(".surround");
    const spk = [...document.querySelectorAll(".spk")];
    const AC = window.AudioContext || window.webkitAudioContext;

    let ac = null, master = null, on = false, muted = false;
    let chans = [], analysers = [], meterRaf = 0, flybyTimer = 0;

    const POS = [ // x, y, z  (listener at origin facing -z)
      [-1.2, 0, -1.6], [0, 0, -2], [1.2, 0, -1.6], [-1.8, 0, 1.0], [1.8, 0, 1.0],
    ];

    function volumeValue() { return (+vol.value / 100) ** 1.6 * .9; }

    function noiseBuffer(ctx, seconds = 3) {
      const len = ctx.sampleRate * seconds;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { // soft pink-ish noise
        const w = Math.random() * 2 - 1;
        b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * .1848) * .18;
      }
      return buf;
    }

    function build() {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      master.connect(comp).connect(ac.destination);

      // channel buses
      chans = POS.map((p) => {
        const g = ac.createGain();
        const pan = ac.createPanner();
        pan.panningModel = "HRTF"; pan.distanceModel = "inverse"; pan.refDistance = 1;
        if (pan.positionX) { pan.positionX.value = p[0]; pan.positionY.value = p[1]; pan.positionZ.value = p[2]; }
        else pan.setPosition(p[0], p[1], p[2]);
        const an = ac.createAnalyser(); an.fftSize = 256;
        g.connect(an); g.connect(pan).connect(master);
        return { g, pan, an };
      });
      const lfe = ac.createGain();
      const lfeLP = ac.createBiquadFilter(); lfeLP.type = "lowpass"; lfeLP.frequency.value = 110;
      const lfeAn = ac.createAnalyser(); lfeAn.fftSize = 256;
      lfe.connect(lfeLP); lfeLP.connect(lfeAn); lfeLP.connect(master);
      chans.push({ g: lfe, an: lfeAn });
      analysers = chans.map((c) => c.an);

      const noise = noiseBuffer(ac);

      // 1) Engine drone bed: detuned saws → lowpass, gently breathing, into front L/R + LFE
      const droneLP = ac.createBiquadFilter(); droneLP.type = "lowpass"; droneLP.frequency.value = 240; droneLP.Q.value = .7;
      const droneG = ac.createGain(); droneG.gain.value = .16;
      [55, 55.6, 82.4, 110.3].forEach((f, i) => {
        const o = ac.createOscillator(); o.type = i < 2 ? "sawtooth" : "triangle"; o.frequency.value = f;
        const og = ac.createGain(); og.gain.value = i < 2 ? .5 : .25;
        o.connect(og).connect(droneLP); o.start();
      });
      const lfo = ac.createOscillator(); lfo.frequency.value = .07;
      const lfoG = ac.createGain(); lfoG.gain.value = 90;
      lfo.connect(lfoG).connect(droneLP.frequency); lfo.start();
      droneLP.connect(droneG);
      droneG.connect(chans[0].g); droneG.connect(chans[2].g); droneG.connect(lfe);

      // 2) High-altitude wind: band-passed noise, slowly moving, into surrounds + center
      const wind = ac.createBufferSource(); wind.buffer = noise; wind.loop = true;
      const windBP = ac.createBiquadFilter(); windBP.type = "bandpass"; windBP.frequency.value = 700; windBP.Q.value = .6;
      const windG = ac.createGain(); windG.gain.value = .35;
      const wlfo = ac.createOscillator(); wlfo.frequency.value = .11;
      const wlfoG = ac.createGain(); wlfoG.gain.value = 380;
      wlfo.connect(wlfoG).connect(windBP.frequency); wlfo.start();
      wind.connect(windBP).connect(windG);
      windG.connect(chans[3].g); windG.connect(chans[4].g);
      const windC = ac.createGain(); windC.gain.value = .25; windG.connect(windC).connect(chans[1].g);
      wind.start();

      // 3) Cockpit pad: soft chord in the center (Dsus2 → A), amber warmth
      const padG = ac.createGain(); padG.gain.value = .045;
      const padLP = ac.createBiquadFilter(); padLP.type = "lowpass"; padLP.frequency.value = 1400;
      [146.8, 220, 329.6, 440].forEach((f, i) => {
        const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f; o.detune.value = (i - 1.5) * 4;
        o.connect(padLP); o.start();
      });
      padLP.connect(padG).connect(chans[1].g);
      const padSwell = ac.createOscillator(); padSwell.frequency.value = .05;
      const padSwellG = ac.createGain(); padSwellG.gain.value = .025;
      padSwell.connect(padSwellG).connect(padG.gain); padSwell.start();

      // 4) Radar ping every few seconds, bouncing between surrounds
      let pingSide = 3;
      const ping = () => {
        if (!on) return;
        const t = ac.currentTime;
        const o = ac.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(1320, t);
        const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.06, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 1.4);
        o.connect(g).connect(chans[pingSide].g); o.start(t); o.stop(t + 1.5);
        pingSide = pingSide === 3 ? 4 : 3;
      };
      setInterval(ping, 4500);

      audioNoise = noise;
    }
    let audioNoise = null;

    // Jet fly-by: noise sweep + falling tone, panned from front-center to rear sides
    function flyby() {
      if (!on || !ac || muted) return;
      const t = ac.currentTime, dur = 2.6;
      const src = ac.createBufferSource(); src.buffer = audioNoise; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2600, t + dur * .55); bp.frequency.exponentialRampToValueAtTime(300, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.9, t + dur * .55); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      const tone = ac.createOscillator(); tone.type = "sawtooth";
      tone.frequency.setValueAtTime(420, t); tone.frequency.exponentialRampToValueAtTime(140, t + dur);
      const toneLP = ac.createBiquadFilter(); toneLP.type = "lowpass"; toneLP.frequency.value = 900;
      const toneG = ac.createGain(); toneG.gain.value = .08;
      const pan = ac.createPanner(); pan.panningModel = "HRTF"; pan.distanceModel = "inverse"; pan.refDistance = .6;
      const setPos = (x, z, at) => {
        if (pan.positionX) { pan.positionX.linearRampToValueAtTime(x, at); pan.positionZ.linearRampToValueAtTime(z, at); }
      };
      if (pan.positionX) { pan.positionX.setValueAtTime(0.2, t); pan.positionZ.setValueAtTime(-6, t); }
      setPos(0.8, -0.6, t + dur * .55); setPos(3, 4, t + dur);
      src.connect(bp).connect(g);
      tone.connect(toneLP).connect(toneG).connect(g);
      g.connect(pan).connect(master);
      const sub = ac.createGain(); sub.gain.value = .5; g.connect(sub).connect(chans[5].g);
      src.start(t); src.stop(t + dur + .1); tone.start(t); tone.stop(t + dur + .1);
    }

    function meter() {
      const buf = new Uint8Array(128);
      analysers.forEach((an, i) => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (let j = 0; j < buf.length; j++) peak = Math.max(peak, Math.abs(buf[j] - 128));
        const lvl = on && !muted ? Math.min(1, peak / 40) : 0;
        spk[i]?.style.setProperty("--lvl", lvl.toFixed(2));
      });
      if (on) meterRaf = requestAnimationFrame(meter);
      else spk.forEach((s) => s.style.setProperty("--lvl", 0));
    }

    function applyGain(ramp = .4) {
      if (!ac) return;
      const target = on && !muted ? volumeValue() : 0;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(target, ac.currentTime, ramp / 3);
    }

    function render() {
      btn.setAttribute("aria-pressed", String(on));
      btnLabel.textContent = on ? "Desactivar sonido envolvente" : "Activar sonido envolvente 5.1 (simulado)";
      muteBtn.disabled = !on;
      muteBtn.setAttribute("aria-pressed", String(muted));
      muteBtn.textContent = muted ? "Reactivar audio" : "Silenciar";
      surround.classList.toggle("is-on", on && !muted);
      state.textContent = !on ? "Sonido: apagado"
        : muted ? "Sonido: silenciado"
        : `Sonido: activo · mezcla 5.1 simulada (binaural) · ${vol.value}%`;
    }

    async function toggle() {
      if (!AC) { state.textContent = "Tu navegador no soporta Web Audio."; return; }
      if (!ac) build();
      on = !on;
      if (on) {
        await ac.resume();
        applyGain(1.2);
        cancelAnimationFrame(meterRaf); meter();
        clearTimeout(flybyTimer);
        flybyTimer = setTimeout(flyby, 600);
      } else {
        applyGain(.3);
        setTimeout(() => { if (!on) ac.suspend(); }, 600);
      }
      render();
    }

    btn.addEventListener("click", toggle);
    muteBtn.addEventListener("click", () => { muted = !muted; applyGain(.2); render(); });
    const onVol = () => {
      volOut.textContent = `${vol.value}%`;
      vol.setAttribute("aria-valuetext", `${vol.value} por ciento`);
      vol.style.setProperty("--p", `${vol.value}%`);
      applyGain(.1);
      if (on) render();
    };
    vol.addEventListener("input", onVol);
    onVol();
    document.addEventListener("visibilitychange", () => {
      if (!ac || !on) return;
      if (document.hidden) ac.suspend(); else ac.resume();
    });
    render();
    return { flyby };
  })();

  // ---------------------------------------------------------------------------
  // RSVP helpers — nothing is collected or sent by this site.
  // ---------------------------------------------------------------------------
  const fb = $("rsvp-feedback");
  const say = (msg) => { fb.textContent = msg; clearTimeout(say.t); say.t = setTimeout(() => { fb.textContent = ""; }, 5000); };

  $("rsvp-whatsapp").href = `https://wa.me/?text=${encodeURIComponent(EVENT.rsvpText)}`;
  $("rsvp-whatsapp").addEventListener("click", () => say("Abriendo WhatsApp… elige el chat y envía tu confirmación. ▲"));

  $("rsvp-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(EVENT.rsvpText);
      say("Mensaje copiado. Pégalo donde quieras.");
    } catch (_) {
      say(EVENT.rsvpText);
    }
  });

  $("rsvp-ics").addEventListener("click", () => {
    const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//movie-night//top-gun-maverick-invite//ES", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:tgm-${START}@movie-night`,
      `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(START)}`,
      `DTEND:${stamp(END)}`,
      `SUMMARY:${EVENT.title}`,
      "DESCRIPTION:Noche de cine para ver Top Gun: Maverick. Experiencia de 07:30 a 22:00 (hora de Chile).",
      `URL:${location.href.split("?")[0]}`,
      "END:VEVENT", "END:VCALENDAR", "",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "top-gun-maverick-noche-de-cine.ics" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say("Evento descargado (.ics). Ábrelo para agregarlo a tu calendario.");
  });
})();
