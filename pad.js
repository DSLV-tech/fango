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
  // nc e kc contano le pressioni di NITRO e START (protocollo e canali in net.js)
  const st = { s: 0, g: 0, r: 0, n: 0, k: 0, nc: 0, kc: 0 };
  let sent = "", seq = 0;
  // il canale veloce per lo stato dei comandi: senza ordine né ritrasmissioni, uguale in net.js
  const FAST = { negotiated: true, id: 100, ordered: false, maxRetransmits: 0 };
  let fast = null, useFast = false;

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
    const c = peer.connect(PREFIX + code, { serialization: "json", reliable: true });
    c.on("open", () => {
      conn = c; sent = ""; useFast = false;
      try { fast = c.peerConnection.createDataChannel("comandi", FAST); } catch { fast = null; }
      c.send({ hello: pid, name });
      say("Collegato", true);
      send(true); awake();
    });
    c.on("data", (d) => {
      if (!d || typeof d !== "object") return;
      if (d.you && typeof d.you.color === "string" && /^#[0-9a-f]{6}$/i.test(d.you.color)) {
        document.documentElement.style.setProperty("--c", d.you.color);
        if (Number.isInteger(d.you.slot) && d.you.slot >= 0 && d.you.slot < 4) document.documentElement.style.setProperty("--p", d.you.slot);   // il ritratto del pilota
        $("#me").textContent = String(d.you.name || "").slice(0, 12);
        useFast = d.you.fast === 1;               // una TV con la pagina vecchia legge solo il canale di PeerJS
      }
      if (d.full) say("La gara è piena (4 piloti).");
      if (typeof d.hud === "string") {
        $("#hud").textContent = d.hud.slice(0, 80);
        // in gara START mette in pausa
        $("#startb").textContent = d.phase === "race" ? "PAUSA" : d.phase === "pause" ? "RIPRENDI" : "START";
        showBig(d.big);
      }
      if (Number.isInteger(d.nitro)) showNitro(Math.max(0, Math.min(9, d.nitro)));
      if (Number.isFinite(d.v) && canVibrate) navigator.vibrate(Math.min(300, d.v));
    });
    c.on("close", () => {
      if (conn === c || !conn) { conn = null; fast?.close(); fast = null; useFast = false; say("TV scollegata: riprovo…"); again(); }
    });
    c.on("error", () => {});
  }

  // in gara, dietro ai comandi: posizione e distacco in grande
  const big = $("#big"), str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  function showBig(b) {
    big.hidden = !b || typeof b !== "object";
    if (big.hidden) return;
    big.querySelector("b").textContent = str(b.pos, 3);
    big.querySelector("span").textContent = str(b.gap, 40);
    big.querySelector("small").textContent = str(b.lap, 12);
  }

  // le bombolette rimaste, come tacche sul tasto NITRO
  let nitroShown = -1;
  function showNitro(n) {
    if (n === nitroShown) return;
    nitroShown = n;
    const bar = $("#nbar"); bar.textContent = "";
    for (let k = 0; k < Math.max(3, n); k++) { const i = document.createElement("i"); if (k < n) i.className = "on"; bar.appendChild(i); }
    $("#nitro").classList.toggle("empty", n === 0);
  }
  showNitro(3);

  function send(force) {
    if (!conn || !conn.open) return;
    const key = `${st.s},${st.g},${st.r},${st.n},${st.k},${st.nc},${st.kc}`;
    if (!force && key === sent) return;
    sent = key;
    const msg = { ...st, q: ++seq };
    if (useFast && fast?.readyState === "open") fast.send(JSON.stringify(msg));
    else conn.send(msg);
  }
  setInterval(() => send(true), 150);

  let lock = null;
  async function awake() {
    if (lock || !navigator.wakeLock) return;
    try { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); } catch { /* non concesso */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { st.s = st.g = st.r = st.n = st.k = 0; send(); }
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
  hold($("#rev"), () => (st.r = 1), () => (st.r = 0));
  hold($("#nitro"), () => { st.n = 1; st.nc++; }, () => (st.n = 0));
  hold($("#startb"), () => { st.k = 1; st.kc++; }, () => (st.k = 0));

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
    steerId = null; st.s = tilt ? tiltS : 0; L.classList.remove("on"); R.classList.remove("on"); send();
  });
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // sterzo inclinando il telefono come un volante. Quando lo si accende si
  // prende il "su" della gravità nel piano dello schermo (quello è il dritto:
  // spegni e riaccendi per rifarlo); da lì l'asse di lato è il su ruotato di 90°.
  // Lo sterzo è l'angolo vero di rollio, asin(gravità di lato / gravità intera):
  // non cambia con quanto il telefono è reclinato verso di sé (atan2 nel piano
  // dello schermo invece si amplificava fino a impazzire col telefono quasi piatto).
  // Verso, dai conti: ruotando il telefono in senso orario la gravità nel piano
  // gira in senso antiorario, quindi su (0,1) → lato (-1,0) dà il positivo = destra.
  // Vale anche su iOS e in landscape: iOS ribalta tutto il vettore e il landscape
  // ruota il su, ma l'asse di lato si ricava dal su e segue entrambi.
  const TILT_MAX = 0.45;                                 // ≈ 26° di rollio per sterzare tutto
  const DEAD = 0.06;                                     // zona morta, poi si riparte da 0 senza scalino
  let tilt = false, side = null, angle = 0, tiltS = 0;
  const wheel = $("#wheel"), tiltb = $("#tiltb");
  function onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    const gz = g.z || 0, all = Math.hypot(g.x, g.y, gz);
    if (all < 3) return;                                  // in caduta o sensore assurdo
    if (side === null) {
      const inPlane = Math.hypot(g.x, g.y);
      if (inPlane < 3) return;                            // piatto: non si sa dov'è il dritto, si aspetta
      side = { x: -g.y / inPlane, y: g.x / inPlane };     // il su ruotato di 90° in senso antiorario
    }
    const roll = Math.asin(Math.max(-1, Math.min(1, (g.x * side.x + g.y * side.y) / all)));
    angle += (roll - angle) * 0.5;                        // smorza il tremolio
    const v = Math.max(-1, Math.min(1, angle / TILT_MAX));
    const s = Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD);
    tiltS = Math.round(s * 20) / 20;
    // il disegno gira quanto il rollio (1:1), non tre volte tanto
    wheel.style.rotate = `${v * TILT_MAX * 180 / Math.PI}deg`;
    if (steerId === null) {                               // un dito sui tasti ha la precedenza
      st.s = tiltS;
      L.classList.toggle("on", st.s < -0.15); R.classList.toggle("on", st.s > 0.15);
      send();
    }
  }
  async function setTilt(on) {
    if (on && typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      try { if (await DeviceMotionEvent.requestPermission() !== "granted") on = false; } catch { on = false; }   // iPhone: chiede il permesso
      if (!on) say("Sensori non concessi: si sterza coi tasti.");
    }
    if (on && typeof DeviceMotionEvent === "undefined") { on = false; say("Questo telefono non ha i sensori di movimento."); }
    if (on && conn) say("Collegato · tieni il telefono dritto: quello è il centro", true);
    tilt = on; side = null; angle = 0;
    tiltb.classList.toggle("on", on); zone.classList.toggle("tilt", on);
    store.set("fango.tilt", on ? "1" : "");
    if (on) addEventListener("devicemotion", onMotion);
    else { removeEventListener("devicemotion", onMotion); if (steerId === null) { st.s = 0; L.classList.remove("on"); R.classList.remove("on"); send(); } }
  }
  tiltb.addEventListener("click", () => { fullscreen(); setTilt(!tilt); });

  function fullscreen() {
    const d = document.documentElement;
    if (document.fullscreenElement || !d.requestFullscreen) return;
    d.requestFullscreen().then(() => screen.orientation?.lock?.("landscape")).catch(() => {});
  }

  // ------------------------------------------------------------ avvio
  // l'iPhone vuole un tocco per dare il permesso: lì si riaccende a mano
  if (store.get("fango.tilt") && typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission !== "function") setTilt(true);
  $("#namein").value = store.get("fango.name");
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (fromHash) $("#codein").value = fromHash.toUpperCase();
  $("#join form").addEventListener("submit", (e) => { e.preventDefault(); begin($("#codein").value, $("#namein").value); });
  if (!window.Peer || !window.RTCPeerConnection) $("#joinmsg").textContent = "Questo browser non permette il collegamento.";
  else if (fromHash && store.get("fango.name")) begin(fromHash, store.get("fango.name"));
  else (fromHash ? $("#namein") : $("#codein")).focus();
})();
