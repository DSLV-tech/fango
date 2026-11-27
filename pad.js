// Fango — il volante sul telefono (pad.html#CODICE, dal QR della TV).
// Protocollo descritto in net.js.
(() => {
  "use strict";
  const PREFIX = "fango-tv-";
  const $ = (s) => document.querySelector(s);
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* modalità privata */ } },
  };
  // identità fissa del telefono: ricollegandosi si ritrova la propria auto
  let pid = store.get("fango.pid");
  if (!/^[a-z0-9]{6,16}$/.test(pid)) { pid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => (n % 36).toString(36)).join(""); store.set("fango.pid", pid); }
  const canVibrate = typeof navigator.vibrate === "function";

  let code = "", name = "", peer = null, conn = null, retry = 0;
  const st = { s: 0, g: 0, n: 0, k: 0 };
  let sent = "";

  const stateEl = $("#state"), stateTxt = $("#state span");
  function say(t, on = false) { stateTxt.textContent = t; stateEl.classList.toggle("on", on); }

  function begin(c, n) {
    code = c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    name = n.trim().slice(0, 12);
    if (code.length !== 4) { $("#joinmsg").textContent = "Il codice ha 4 caratteri."; return; }
    store.set("fango.name", name);
    history.replaceState(null, "", "#" + code);
    $("#join").hidden = true; $("#pad").hidden = false;
    $("#me").textContent = name || "…";
    connect();
  }
  function connect() {
    clearTimeout(retry);
    say("Collegamento alla TV " + code + "…");
    if (!peer || peer.destroyed) {
      peer = new window.Peer({ debug: 0 });
      peer.on("open", dial);
      peer.on("disconnected", () => { if (!conn) setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 1500); });
      peer.on("error", (e) => {
        if (e.type === "peer-unavailable") say("La TV " + code + " non risponde: è aperta la pagina di Fango?");
        else if (e.type === "browser-incompatible") return say("Questo browser non permette il collegamento.");
        else say("Nessuna connessione: riprovo…");
        if (["network", "server-error", "socket-error", "socket-closed"].includes(e.type)) { peer.destroy(); peer = null; }
        again();
      });
    } else if (peer.open) dial();
  }
  function again() { clearTimeout(retry); retry = setTimeout(connect, 2000); }
  function dial() {
    if (conn) return;
    const c = peer.connect(PREFIX + code, { serialization: "json" });
    c.on("open", () => {
      conn = c; sent = "";
      c.send({ hello: pid, name });
      say("Collegato", true);
      send(true); awake();
    });
    c.on("data", (d) => {
      if (!d || typeof d !== "object") return;
      if (d.you && typeof d.you.color === "string" && /^#[0-9a-f]{6}$/i.test(d.you.color)) {
        document.documentElement.style.setProperty("--c", d.you.color);
        $("#me").textContent = String(d.you.name || "").slice(0, 12);
      }
      if (d.full) say("La gara è piena (4 piloti).");
      if (typeof d.hud === "string") {
        $("#hud").textContent = d.hud.slice(0, 80);
        $("#startb").hidden = d.phase === "race";
      }
      if (Number.isFinite(d.v) && canVibrate) navigator.vibrate(Math.min(300, d.v));
    });
    c.on("close", () => { if (conn === c || !conn) { conn = null; say("TV scollegata: riprovo…"); again(); } });
    c.on("error", () => {});
  }

  function send(force) {
    if (!conn || !conn.open) return;
    const key = `${st.s},${st.g},${st.n},${st.k}`;
    if (!force && key === sent) return;
    sent = key;
    conn.send({ ...st });
  }
  setInterval(() => send(true), 150);

  let lock = null;
  async function awake() {
    if (lock || !navigator.wakeLock) return;
    try { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); } catch { /* non concesso */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { st.s = st.g = st.n = st.k = 0; send(); }
    else { awake(); if (!conn && code) connect(); }
  });

  // ------------------------------------------------------------ comandi
  const grab = (el, id) => { try { el.setPointerCapture(id); } catch { /* dito già staccato */ } };
  const ups = ["pointerup", "pointercancel", "lostpointercapture"];

  // pulsanti: ognuno segue il proprio dito
  function hold(el, on, off) {
    let id = null;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); fullscreen();
      id = e.pointerId; grab(el, id); el.classList.add("on"); on(); send();
      if (canVibrate) navigator.vibrate(6);
    });
    for (const ev of ups) el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove("on"); off(); send(); });
  }
  hold($("#gas"), () => (st.g = 1), () => (st.g = 0));
  hold($("#nitro"), () => (st.n = 1), () => (st.n = 0));
  hold($("#startb"), () => (st.k = 1), () => (st.k = 0));

  // sterzo: un solo dito che scorre da ◀ a ▶ senza staccarsi
  const zone = $("#steer"), [L, R] = zone.querySelectorAll("div");
  let steerId = null;
  function steer(e) {
    const r = zone.getBoundingClientRect();
    st.s = e.clientX < r.left + r.width / 2 ? -1 : 1;
    L.classList.toggle("on", st.s < 0); R.classList.toggle("on", st.s > 0);
    send();
  }
  zone.addEventListener("pointerdown", (e) => {
    if (steerId !== null) return;
    e.preventDefault(); fullscreen();
    steerId = e.pointerId; grab(zone, steerId); steer(e);
  });
  zone.addEventListener("pointermove", (e) => { if (e.pointerId === steerId) steer(e); });
  for (const ev of ups) zone.addEventListener(ev, (e) => {
    if (e.pointerId !== steerId) return;
    steerId = null; st.s = 0; L.classList.remove("on"); R.classList.remove("on"); send();
  });
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  function fullscreen() {
    const d = document.documentElement;
    if (document.fullscreenElement || !d.requestFullscreen) return;
    d.requestFullscreen().then(() => screen.orientation?.lock?.("landscape")).catch(() => {});
  }

  // ------------------------------------------------------------ avvio
  $("#namein").value = store.get("fango.name");
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (fromHash) $("#codein").value = fromHash.toUpperCase();
  $("#join form").addEventListener("submit", (e) => { e.preventDefault(); begin($("#codein").value, $("#namein").value); });
  if (!window.Peer || !window.RTCPeerConnection) $("#joinmsg").textContent = "Questo browser non permette il collegamento.";
  else if (fromHash && store.get("fango.name")) begin(fromHash, store.get("fango.name"));
  else (fromHash ? $("#namein") : $("#codein")).focus();
})();
