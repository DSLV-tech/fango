// Fango — i comandi: fino a 4 telefoni (PeerJS), 2 giocatori da tastiera e i
// gamepad collegati alla TV. Ogni sorgente occupa uno dei 4 posti; i posti
// liberi li guida il computer.
//
// Protocollo (JSON sul canale dati, telefono → TV):
//   { hello: pid, name }      all'apertura: pid è fisso per telefono, così chi
//                             si ricollega a metà gara ritrova la sua auto
//   { s, g, r, n, k }         sterzo da -1 a 1, avanti, retromarcia, nitro, start (0/1)
// TV → telefono:
//   { you: { slot, name, color } }   il posto assegnato (slot = auto e pilota)
//   { hud: "testo", phase, nitro }   posizione, giro e bombolette, ogni 250 ms
//   { v: ms }                        vibrazione
//
// Il server pubblico di PeerJS serve solo a presentare i dispositivi: poi i
// comandi viaggiano diretti tra telefono e TV.
(() => {
  "use strict";
  const PREFIX = "fango-tv-";
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // niente 0/O e 1/I
  const STORE = "fango.code";
  const STALE_MS = 1500;                               // il telefono manda lo stato ogni 150 ms
  const COLORS = ["#e8443a", "#3a86ef", "#f2c230", "#3fbf5a"];
  // ogni posto è un'auto col suo pilota (i ritratti in img/piloti.webp, nello stesso ordine)
  const NAMES = ["Rocco", "Nina", "Bruno", "Tina"];

  const slots = COLORS.map((color, i) => ({ i, color, name: NAMES[i], src: null }));
  const sources = new Map();         // id → { id, kind, slot, s, g, n, k, kPrev, live, last, conn }
  let peer = null, code = null, status = "loading", phase = "lobby", retry = 0;
  let listeners = [];
  const changed = () => listeners.forEach((f) => f());

  const stored = () => { try { return localStorage.getItem(STORE); } catch { return null; } };
  const remember = (v) => { try { localStorage.setItem(STORE, v); } catch { /* modalità privata */ } };
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (n) => ALPHA[n % ALPHA.length]).join("");

  function source(id, kind) {
    let s = sources.get(id);
    if (!s) sources.set(id, (s = { id, kind, slot: null, s: 0, g: 0, r: 0, n: 0, k: 0, kPrev: 0, live: true, last: performance.now(), conn: null, name: "" }));
    return s;
  }
  function claim(src) {
    if (src.slot !== null) return true;
    const free = slots.find((sl) => !sl.src);
    if (!free) return false;
    free.src = src.id; src.slot = free.i;
    free.name = src.name || (src.kind === "phone" ? NAMES[free.i] : src.kind === "kb" ? "Tastiera " + src.id.slice(2) : "Pad " + (+src.id.slice(2) + 1));
    tell(src); changed();
    return true;
  }
  function release(src) {
    if (src.slot === null) return;
    const sl = slots[src.slot];
    if (sl.src === src.id) { sl.src = null; sl.name = NAMES[sl.i]; }
    src.slot = null; changed();
  }
  function tell(src) {
    if (src.conn?.open && src.slot !== null) { const sl = slots[src.slot]; src.conn.send({ you: { slot: sl.i, name: sl.name, color: sl.color } }); }
  }

  // ------------------------------------------------------------ telefoni
  function start() {
    if (!window.Peer || !window.RTCPeerConnection) { status = "unsupported"; changed(); return; }
    code = code || stored() || newCode();
    status = "loading"; changed();
    const p = peer = new window.Peer(PREFIX + code, { debug: 0 });
    p.on("open", () => { remember(code); status = "ready"; changed(); });
    p.on("connection", (c) => {
      let src = null;
      c.on("data", (d) => {
        if (!d || typeof d !== "object") return;
        if (typeof d.hello === "string") {
          if (!/^[a-z0-9]{6,16}$/.test(d.hello)) return c.close();
          src = source("ph" + d.hello, "phone");
          if (src.conn && src.conn !== c) src.conn.close();
          src.conn = c; src.live = true; src.last = performance.now();
          const name = typeof d.name === "string" ? d.name.replace(/[^\p{L}\p{N} ._'-]/gu, "").trim().slice(0, 12) : "";
          if (name) { src.name = name; if (src.slot !== null) slots[src.slot].name = name; }
          if (!claim(src)) c.send({ full: true });
          else tell(src);
          changed();
          return;
        }
        if (!src || src.conn !== c || !Number.isFinite(d.s)) return;
        src.s = Math.max(-1, Math.min(1, d.s)); src.g = d.g ? 1 : 0; src.r = d.r ? 1 : 0; src.n = d.n ? 1 : 0; src.k = d.k ? 1 : 0;
        src.last = performance.now(); src.live = true;
      });
      c.on("close", () => {
        if (!src || src.conn !== c) return;
        src.conn = null; src.live = false; src.s = src.g = src.r = src.n = src.k = 0;
        if (phase === "lobby") release(src);   // in gara l'auto resta sua: la guida il computer finché non torna
        changed();
      });
      c.on("error", () => {});
    });
    p.on("disconnected", () => setTimeout(() => { if (peer === p && !p.destroyed) p.reconnect(); }, 2000));
    p.on("error", (e) => {
      if (peer !== p) return;
      if (e.type === "unavailable-id") {                // codice ancora occupato dalla pagina di prima
        p.destroy(); peer = null;
        start.tries = (start.tries || 0) + 1;
        if (start.tries > 4) { start.tries = 0; code = newCode(); }
        retry = setTimeout(start, 3000);
      } else if (["network", "server-error", "socket-error", "socket-closed"].includes(e.type)) {
        status = "offline"; changed();
        p.destroy(); peer = null; clearTimeout(retry); retry = setTimeout(start, 5000);
      } else if (e.type === "browser-incompatible") { status = "unsupported"; changed(); }
    });
  }

  // ------------------------------------------------------------ tastiera
  const keys = new Set();
  const KB = {
    kb1: { l: ["ArrowLeft"], r: ["ArrowRight"], g: ["ArrowUp"], b: ["ArrowDown"], n: ["ShiftRight", "Slash", "Period"] },
    kb2: { l: ["KeyA"], r: ["KeyD"], g: ["KeyW"], b: ["KeyS"], n: ["ShiftLeft", "KeyQ"] },
  };
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    for (const [id, m] of Object.entries(KB))
      if (Object.values(m).some((list) => list.includes(e.code))) { const s = source(id, "kb"); s.live = true; claim(s); }
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());
  const any = (list) => list.some((k) => keys.has(k));

  // ------------------------------------------------------------ poll a ogni frame
  let startEdge = false, enterPrev = false;
  function poll() {
    const now = performance.now();
    for (const [id, m] of Object.entries(KB)) {
      const s = sources.get(id);
      if (!s) continue;
      s.s = (any(m.r) ? 1 : 0) - (any(m.l) ? 1 : 0); s.g = any(m.g) ? 1 : 0; s.r = any(m.b) ? 1 : 0; s.n = any(m.n) ? 1 : 0;
    }
    for (const gp of navigator.getGamepads?.() || []) {
      if (!gp) continue;
      const b = (i) => (gp.buttons[i] ? gp.buttons[i].value > 0.3 : false);
      const ax = Math.abs(gp.axes[0] || 0) > 0.18 ? gp.axes[0] : 0;
      const pressed = gp.buttons.some((x) => x.pressed);
      const id = "gp" + gp.index;
      if (!sources.has(id) && !pressed) continue;
      const s = source(id, "pad");
      s.live = true; s.last = now;
      if (pressed) claim(s);
      s.s = b(15) ? 1 : b(14) ? -1 : ax; s.g = b(0) || b(7) ? 1 : 0; s.r = b(1) || b(6) ? 1 : 0; s.n = b(2) || b(5) ? 1 : 0; s.k = b(9) ? 1 : 0;
    }
    startEdge = false;
    for (const s of sources.values()) {
      if (s.kind === "phone" && s.live && now - s.last > STALE_MS) { s.s = s.g = s.r = s.n = s.k = 0; }
      if (s.slot !== null && s.k && !s.kPrev) startEdge = true;
      s.kPrev = s.k;
    }
    const enter = keys.has("Enter") || keys.has("NumpadEnter") || keys.has("Space");
    if (enter && !enterPrev) startEdge = true;
    enterPrev = enter;
  }

  function bySlot(i) { const id = slots[i].src; return id ? sources.get(id) : null; }

  function padUrl() { return new URL("pad.html", location.href).href; }
  const local = location.protocol === "file:" || /^(localhost|127\.|\[::1\])/.test(location.hostname);

  window.FangoNet = {
    slots,
    pilots: NAMES,
    get code() { return code; },
    get status() { return status; },
    get local() { return local; },
    padUrl,
    poll,
    get start() { return startEdge; },
    // null quando il posto è libero o il telefono è sparito: guida il computer
    input(i) { const s = bySlot(i); return s && s.live ? s : null; },
    human(i) { return !!slots[i].src; },
    kind(i) { return bySlot(i)?.kind || "cpu"; },
    setPhase(p) {
      phase = p;
      if (p === "lobby") for (const s of sources.values()) if (!s.live) release(s);
    },
    hud(i, text, nitro) { const s = bySlot(i); if (s?.conn?.open) s.conn.send({ hud: text, phase, nitro }); },
    rumble(i, ms) { const s = bySlot(i); if (s?.conn?.open) s.conn.send({ v: ms }); },
    onChange(f) { listeners.push(f); },
  };
  start();
})();
