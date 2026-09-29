/* Top Gun: Maverick — Movie Night
 * Chilean clock + event status, radar screen, simulated 5.1 sound system, RSVP helpers.
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Event configuration (see README)
  // ---------------------------------------------------------------------------
  const EVENT = {
    timeZone: "America/Santiago",
    date: { y: 2026, m: 9, d: 30 },
    start: { h: 7, min: 30 },
    end: { h: 22, min: 0 },
    title: "Noche de cine: Top Gun: Maverick",
    rsvpText: "¡Voy! Noche de cine Top Gun: Maverick — miércoles 30 SEP, 07:30–22:00.",
  };

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------------------------------------------------------------------
  // Time zone helpers: wall-clock parts in America/Santiago and the reverse
  // conversion (Santiago wall time → epoch), DST-aware, no libraries.
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
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
  }

  function zonedToEpoch(y, m, d, h, min) {
    const guess = Date.UTC(y, m - 1, d, h, min);
    const first = guess - tzOffsetMs(new Date(guess));
    return guess - tzOffsetMs(new Date(first)); // second pass settles DST edges
  }

  const E = EVENT.date;
  const START = zonedToEpoch(E.y, E.m, E.d, EVENT.start.h, EVENT.start.min);
  const END = zonedToEpoch(E.y, E.m, E.d, EVENT.end.h, EVENT.end.min);

  // Preview other states: ?now=2026-09-30T20:00:00-03:00
  let simOffset = 0;
  const q = new URLSearchParams(location.search).get("now");
  if (q && !Number.isNaN(Date.parse(q))) simOffset = Date.parse(q) - Date.now();
  const now = () => new Date(Date.now() + simOffset);

  // ---------------------------------------------------------------------------
  // Status: small clock + countdown; screen-reader text refreshes each hour.
  // ---------------------------------------------------------------------------
  const clockEl = $("clock"), labelEl = $("status-label"), dotEl = $("status-dot");
  const cdEl = $("countdown"), srEl = $("status-sr");

  function hms(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(t / 86400);
    const rest = `${pad(Math.floor((t % 86400) / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
    return d ? `${d}D ${rest}` : rest;
  }

  function spoken(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    const out = [];
    if (d) out.push(`${d} ${d === 1 ? "día" : "días"}`);
    if (h) out.push(`${h} ${h === 1 ? "hora" : "horas"}`);
    if (!d && m) out.push(`${m} minutos`);
    return out.join(" y ") || "menos de un minuto";
  }

  let lastKey = "";
  function tick() {
    const n = now(), t = n.getTime(), p = zonedParts(n);
    clockEl.textContent = `${pad(p.h)}:${pad(p.min)}:${pad(p.s)}`;
    clockEl.setAttribute("datetime", n.toISOString());

    const isDay = p.y === E.y && p.m === E.m && p.d === E.d;
    const state = t < START ? (isDay ? "today" : "soon") : t < END ? "live" : "done";

    cdEl.textContent =
      state === "soon" ? `T− ${hms(START - t)}` :
      state === "today" ? `Abre en ${hms(START - t)}` :
      state === "live" ? `Cierra en ${hms(END - t)}` : "Gracias por venir";

    const key = `${state}|${p.d}|${p.h}`;
    if (key === lastKey) return;
    lastKey = key;
    labelEl.textContent = { soon: "Próximamente", today: "Hoy", live: "En curso", done: "Finalizado" }[state];
    dotEl.dataset.state = state;
    srEl.textContent = {
      soon: `Faltan ${spoken(START - t)} para el inicio.`,
      today: `Es hoy. Abre a las 07:30, en ${spoken(START - t)}.`,
      live: `El evento está en curso hasta las 22:00. Quedan ${spoken(END - t)}.`,
      done: "El evento terminó.",
    }[state];
  }

  tick();
  setTimeout(() => { tick(); setInterval(tick, 1000); }, 1005 - (Date.now() % 1000));

  // ---------------------------------------------------------------------------
  // Radar screen: flattened rings, one sweep line, two blips. Nothing else.
  // ---------------------------------------------------------------------------
  const canvas = $("radar");
  const ctx = canvas.getContext("2d");
  const ACCENT = [61, 123, 255];
  const BLIPS = [{ a: 2.1, r: .55 }, { a: 5.0, r: .78 }, { a: 3.9, r: .32 }];
  let W = 1, H = 1, running = false, visible = true;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) draw(0);
  }

  function draw(ms) {
    const cx = W / 2, cy = H * .56, R = W * .62, squash = .38;
    const sweep = (ms / 1000) * 0.7 % (Math.PI * 2);
    ctx.clearRect(0, 0, W, H);

    // horizon line
    ctx.strokeStyle = "rgba(241,239,234,.08)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy + .5); ctx.lineTo(W, cy + .5); ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, squash);

    // rings
    for (let i = 1; i <= 5; i++) {
      ctx.strokeStyle = `rgba(241,239,234,${i === 5 ? .12 : .06})`;
      ctx.lineWidth = 1 / squash * .7;
      ctx.beginPath(); ctx.arc(0, 0, (R / 5) * i, 0, Math.PI * 2); ctx.stroke();
    }
    // bearing ticks
    ctx.strokeStyle = "rgba(241,239,234,.05)";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * .2, Math.sin(a) * R * .2); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke();
    }
    // sweep with a short fading tail of lines (no gradients)
    for (let k = 0; k < 18; k++) {
      const a = sweep - k * 0.025;
      ctx.strokeStyle = `rgba(${ACCENT},${k === 0 ? .9 : .16 * (1 - k / 18)})`;
      ctx.lineWidth = (k === 0 ? 1.4 : 1) / squash;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke();
    }
    // blips light up as the sweep passes, then fade
    for (const b of BLIPS) {
      const since = ((sweep - b.a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const alpha = Math.max(0, 1 - since / 2.2);
      if (!alpha && running) continue;
      ctx.fillStyle = `rgba(241,239,234,${running ? alpha * .9 : .5})`;
      ctx.beginPath();
      ctx.ellipse(Math.cos(b.a) * R * b.r, Math.sin(b.a) * R * b.r, 2.4, 2.4 / squash, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // centre mark
    ctx.fillStyle = `rgb(${ACCENT})`;
    ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  }

  function loop(ms) {
    if (!running) return;
    draw(ms);
    requestAnimationFrame(loop);
  }

  function sync() {
    const want = visible && !document.hidden && !reduceMotion.matches;
    if (want === running) return;
    running = want;
    if (running) requestAnimationFrame(loop); else draw(0);
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(canvas);
  document.addEventListener("visibilitychange", sync);
  reduceMotion.addEventListener?.("change", sync);
  resize();
  sync();

  // ---------------------------------------------------------------------------
  // Sound system: simulated 5.1, synthesized with Web Audio (no samples).
  // Five HRTF-panned beds (L C R SL SR) plus a low-passed LFE bus.
  // A binaural/stereo simulation — not discrete 5.1. Starts only on user click.
  // ---------------------------------------------------------------------------
  const sound = (() => {
    const dialog = $("sound");
    const openers = [$("sound-open"), $("immersive-open")];
    const toggleBtn = $("audio-toggle"), toggleLabel = $("audio-toggle-label");
    const muteBtn = $("audio-mute"), vol = $("audio-volume"), volOut = $("audio-volume-out");
    const stateEl = $("audio-state"), shortEl = $("sound-state-short"), headerBtn = $("sound-open");
    const speakers = [...document.querySelectorAll(".spk")];
    const AC = window.AudioContext || window.webkitAudioContext;

    const POS = [[-1.2, 0, -1.6], [0, 0, -2], [1.2, 0, -1.6], [-1.8, 0, 1], [1.8, 0, 1]];
    let ac = null, master, chans = [], noise, on = false, muted = false, meterRaf = 0, pingTimer = 0;

    const level = () => (+vol.value / 100) ** 1.6 * .9;

    function makeNoise(seconds = 3) {
      const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * .1848) * .18;
      }
      return buf;
    }

    function place(panner, [x, y, z]) {
      panner.panningModel = "HRTF"; panner.distanceModel = "inverse"; panner.refDistance = 1;
      if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
      else panner.setPosition(x, y, z);
    }

    function build() {
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      master.connect(comp).connect(ac.destination);

      chans = POS.map((pos) => {
        const g = ac.createGain(), pan = ac.createPanner(), an = ac.createAnalyser();
        place(pan, pos); an.fftSize = 256;
        g.connect(an); g.connect(pan).connect(master);
        return { g, an };
      });
      const lfe = ac.createGain(), lfeLP = ac.createBiquadFilter(), lfeAn = ac.createAnalyser();
      lfeLP.type = "lowpass"; lfeLP.frequency.value = 110; lfeAn.fftSize = 256;
      lfe.connect(lfeLP); lfeLP.connect(lfeAn); lfeLP.connect(master);
      chans.push({ g: lfe, an: lfeAn });
      noise = makeNoise();

      // Engine bed: detuned low oscillators, slowly breathing filter → L, R, LFE
      const droneLP = ac.createBiquadFilter(); droneLP.type = "lowpass"; droneLP.frequency.value = 240;
      const droneG = ac.createGain(); droneG.gain.value = .16;
      [55, 55.6, 82.4, 110.3].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = i < 2 ? "sawtooth" : "triangle"; o.frequency.value = f; g.gain.value = i < 2 ? .5 : .25;
        o.connect(g).connect(droneLP); o.start();
      });
      const lfo = ac.createOscillator(), lfoG = ac.createGain();
      lfo.frequency.value = .07; lfoG.gain.value = 90; lfo.connect(lfoG).connect(droneLP.frequency); lfo.start();
      droneLP.connect(droneG);
      [chans[0].g, chans[2].g, lfe].forEach((c) => droneG.connect(c));

      // High-altitude wind: moving band-passed noise → surrounds + a little centre
      const wind = ac.createBufferSource(); wind.buffer = noise; wind.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = .6;
      const windG = ac.createGain(); windG.gain.value = .32;
      const wl = ac.createOscillator(), wlG = ac.createGain();
      wl.frequency.value = .11; wlG.gain.value = 380; wl.connect(wlG).connect(bp.frequency); wl.start();
      wind.connect(bp).connect(windG);
      windG.connect(chans[3].g); windG.connect(chans[4].g);
      const windC = ac.createGain(); windC.gain.value = .25; windG.connect(windC).connect(chans[1].g);
      wind.start();

      // Soft centre pad
      const padLP = ac.createBiquadFilter(); padLP.type = "lowpass"; padLP.frequency.value = 1400;
      const padG = ac.createGain(); padG.gain.value = .04;
      [146.8, 220, 329.6, 440].forEach((f, i) => {
        const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f; o.detune.value = (i - 1.5) * 4;
        o.connect(padLP); o.start();
      });
      padLP.connect(padG).connect(chans[1].g);
    }

    // Radar ping alternating between the rear speakers
    let side = 3;
    function ping() {
      if (!on) return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 1320;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 1.4);
      o.connect(g).connect(chans[side].g); o.start(t); o.stop(t + 1.5);
      side = side === 3 ? 4 : 3;
    }

    // Jet pass: from behind the listener toward the screen, matching the visual
    function flyby() {
      if (!on || muted || !ac) return;
      const t = ac.currentTime, dur = 4.2;
      const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(350, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.9, t + .5); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      const tone = ac.createOscillator(); tone.type = "sawtooth";
      tone.frequency.setValueAtTime(380, t); tone.frequency.exponentialRampToValueAtTime(120, t + dur);
      const toneLP = ac.createBiquadFilter(); toneLP.type = "lowpass"; toneLP.frequency.value = 800;
      const toneG = ac.createGain(); toneG.gain.value = .07;
      const pan = ac.createPanner(); place(pan, [1.5, 0, 2]); pan.refDistance = .6;
      if (pan.positionX) {
        pan.positionX.setValueAtTime(1.5, t); pan.positionZ.setValueAtTime(2, t);
        pan.positionX.linearRampToValueAtTime(0, t + dur); pan.positionZ.linearRampToValueAtTime(-10, t + dur);
      }
      src.connect(bp).connect(g);
      tone.connect(toneLP).connect(toneG).connect(g);
      g.connect(pan).connect(master);
      const sub = ac.createGain(); sub.gain.value = .5; g.connect(sub).connect(chans[5].g);
      src.start(t); src.stop(t + dur + .1); tone.start(t); tone.stop(t + dur + .1);
    }

    function meter() {
      const buf = new Uint8Array(128);
      chans.forEach((c, i) => {
        c.an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        speakers[i]?.classList.toggle("is-hot", on && !muted && peak > 6);
      });
      if (on && dialog.open) meterRaf = requestAnimationFrame(meter);
    }
    function startMeter() {
      cancelAnimationFrame(meterRaf);
      if (on && dialog.open) meter(); else speakers.forEach((s) => s.classList.remove("is-hot"));
    }

    function applyGain(ramp = .4) {
      if (!ac) return;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(on && !muted ? level() : 0, ac.currentTime, ramp / 3);
    }

    function render() {
      toggleBtn.setAttribute("aria-pressed", String(on));
      toggleLabel.textContent = on ? "Sonido activado" : "Activar sonido";
      muteBtn.disabled = !on;
      muteBtn.setAttribute("aria-pressed", String(muted));
      muteBtn.textContent = muted ? "Reactivar" : "Silenciar";
      headerBtn.dataset.on = String(on && !muted);
      shortEl.textContent = !on ? "Off" : muted ? "Mute" : "On";
      stateEl.textContent = !on ? "Apagado" : muted ? "Silenciado" : `Activo · 5.1 simulado · ${vol.value}%`;
    }

    async function toggle() {
      if (!AC) { stateEl.textContent = "Web Audio no disponible en este navegador"; return; }
      if (!ac) build();
      on = !on;
      clearInterval(pingTimer);
      if (on) {
        await ac.resume();
        applyGain(1.2);
        pingTimer = setInterval(ping, 4500);
        setTimeout(flyby, 400);
      } else {
        applyGain(.3);
        setTimeout(() => { if (!on) ac.suspend(); }, 500);
      }
      render();
      startMeter();
    }

    // Dialog wiring (native <dialog>: focus trap + Esc handled by the browser)
    let opener = null;
    openers.forEach((b) => b.addEventListener("click", () => { opener = b; dialog.showModal(); startMeter(); }));
    $("sound-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { startMeter(); opener?.focus(); });

    toggleBtn.addEventListener("click", toggle);
    muteBtn.addEventListener("click", () => { muted = !muted; applyGain(.2); render(); });
    const onVol = () => {
      volOut.textContent = vol.value;
      vol.setAttribute("aria-valuetext", `${vol.value} por ciento`);
      vol.style.setProperty("--p", `${vol.value}%`);
      applyGain(.1);
      render();
    };
    vol.addEventListener("input", onVol);
    onVol();
    document.addEventListener("visibilitychange", () => {
      if (ac && on) document.hidden ? ac.suspend() : ac.resume();
    });

    return { flyby };
  })();

  // Sync the jet sound with each visual pass
  document.querySelector(".jet")?.addEventListener("animationiteration", () => sound.flyby());

  // ---------------------------------------------------------------------------
  // RSVP + calendar — nothing is collected or sent by this site.
  // ---------------------------------------------------------------------------
  const toast = $("toast");
  const say = (msg) => { toast.textContent = msg; clearTimeout(say.t); say.t = setTimeout(() => { toast.textContent = ""; }, 5000); };

  const rsvp = $("rsvp");
  rsvp.href = `https://wa.me/?text=${encodeURIComponent(EVENT.rsvpText)}`;
  rsvp.addEventListener("click", () => say("Abriendo WhatsApp — elige el chat y envía."));

  $("ics").addEventListener("click", () => {
    const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//movie-night//top-gun-maverick-invite//ES", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:tgm-${START}@movie-night`,
      `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(START)}`,
      `DTEND:${stamp(END)}`,
      `SUMMARY:${EVENT.title}`,
      "DESCRIPTION:Noche de cine: Top Gun: Maverick. 07:30–22:00\\, hora de Chile.",
      `URL:${location.href.split("?")[0]}`,
      "END:VEVENT", "END:VCALENDAR", "",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "top-gun-maverick.ics" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say("Evento descargado (.ics).");
  });
})();
