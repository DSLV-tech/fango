// Fango — la TV: disegno, suoni, interfaccia e flusso della coppa. La gara (piste,
// fisica, IA, giri e record) è in sim.js; qui si ricavano dai suoi eventi suoni,
// vibrazioni e particelle.
// Coordinate logiche 640×360, disegnate S volte più grandi: da 1280×720 a 1920×1080,
// secondo i pixel veri dello schermo (vedi fit).
(() => {
  "use strict";
  const Net = window.FangoNet, Sim = window.FangoSim;
  const { TRACKS, LAPS, STEP, locate, rng } = Sim;
  const W = 640, H = 360;
  const $ = (s) => document.querySelector(s);
  const cv = $("#game"), ctx = cv.getContext("2d");

  // risoluzione: il canvas segue i pixel veri dello schermo (grandezza a video ×
  // devicePixelRatio), così una TV Full HD non vede un 1280×720 ingrandito. Mai sotto
  // 1280×720 (S = 2) e mai sopra 1920×1080 (S = 3): più su le TV lente non tengono i 60 fps.
  // S va a quarti, così le misure restano intere e un pixel in più non ridisegna tutto.
  const S_MIN = 2, S_MAX = 3;
  let S = 0;
  function fit() {
    const px = cv.getBoundingClientRect().width * (window.devicePixelRatio || 1);
    const s = Math.max(S_MIN, Math.min(S_MAX, Math.round(px / W * 4) / 4));
    if (s === S) return false;
    S = s; cv.width = W * S; cv.height = H * S;
    return true;
  }
  fit();
  // finestra ridimensionata o spostata su un altro schermo: pista ridisegnata, segni delle gomme riscalati
  let refit = 0;
  addEventListener("resize", () => {
    clearTimeout(refit);
    refit = setTimeout(() => {
      if (!fit() || !T) return;
      bg = paintTrack(T);
      const old = skid;
      newSkid(); skidG.drawImage(old, 0, 0, W, H);
    }, 200);
  });

  // una coppa sì e una no le piste si corrono al contrario (vedi newCup)
  let rev = false;
  const trackTitle = (no) => TRACKS[no].name + (rev ? " al contrario" : "");

  // ------------------------------------------------------------ disegno della pista (una volta)
  // La grafica viene da Gemini (design/ sono i bozzetti, img/ gli asset scontornati):
  // texture di terreno e strada ripetute, oggetti di contorno a fogli 4×2 da 160 px.
  const ART = {};
  const ART_FILES = ["auto", "nitro", "cava-terreno", "cava-strada", "cava-oggetti", "palude-terreno", "palude-strada", "palude-oggetti", "dune-terreno", "dune-strada", "dune-oggetti", "fango", "pozzanghere", "schizzi", "spruzzi"];
  const loadArt = () => Promise.all(ART_FILES.map((n) => new Promise((ok) => {
    const im = new Image();
    im.onload = () => { ART[n] = im; ok(); };
    im.onerror = () => ok();            // senza un'immagine si disegna a tinta unita
    im.src = `img/${n}.webp`;
  })));
  const CELL = 160;

  function paintTrack(T) {
    const c = document.createElement("canvas"); c.width = W * S; c.height = H * S;
    const g = c.getContext("2d"); g.scale(S, S);
    const R = rng(T.N * 7 + 3), def = T.def;
    const tex = (name, color) => {
      const im = ART[`${def.art}-${name}`];
      if (!im) return color;
      // grandezza scelta a 1280×720: la stessa a ogni risoluzione
      const p = g.createPattern(im, "repeat"); p.setTransform(new DOMMatrix().scale(1 / S_MIN)); return p;
    };
    g.fillStyle = tex("terreno", def.ground[0]); g.fillRect(0, 0, W, H);

    const path = () => { g.beginPath(); g.moveTo(T.x[0], T.y[0]); for (let i = 1; i < T.N; i++) g.lineTo(T.x[i], T.y[i]); g.closePath(); };
    const across = (i, f) => { const o = T.hw * f; return [T.x[i] - T.ty[i] * o, T.y[i] + T.tx[i] * o]; };
    const line = (f) => { g.beginPath(); for (let i = 0; i <= T.N; i++) g.lineTo(...across(i % T.N, f)); };
    g.lineJoin = "round"; g.lineCap = "round";
    path(); g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = def.w + 18; g.stroke();      // ombra del terrapieno
    path(); g.strokeStyle = "#3b2618"; g.lineWidth = def.w + 10; g.stroke();
    path(); g.strokeStyle = "#8a6440"; g.lineWidth = def.w + 4; g.stroke();
    path(); g.strokeStyle = tex("strada", def.dirt); g.lineWidth = def.w; g.stroke();
    // solchi lasciati dalle gomme
    g.lineWidth = 1.2;
    for (const f of [-0.55, -0.3, 0.3, 0.55]) { line(f); g.strokeStyle = "rgba(40,20,5,.12)"; g.stroke(); }

    // fango e acqua su un foglio a parte, ritagliato sulla forma della pista
    const pc = document.createElement("canvas"); pc.width = W * S; pc.height = H * S;
    const pg = pc.getContext("2d"); pg.scale(S, S);
    // pozze di fango (1) e d'acqua (2) disegnate da Gemini: fango.webp e pozzanghere.webp,
    // 6 celle da 200 px ciascuno. Se un foglio manca, chiazze tonde disegnate qui.
    const POOLS = { 1: ART.fango, 2: ART.pozzanghere }, blobs = [];
    for (let i = 0; i < T.N; i++) {
      const s = T.surf[i];
      if ((s === 1 || s === 2) && !POOLS[s]) for (let k = 0; k < 3; k++) blobs.push({ s, p: across(i, (R() * 2 - 1) * 0.7), r: T.hw * (0.35 + R() * 0.3) });
    }
    // prima il bordo scuro, poi la pozza: si legge come un avvallamento
    for (const b of blobs) { pg.fillStyle = b.s === 1 ? "#2e1b0c" : "#24506f"; pg.beginPath(); pg.arc(...b.p, b.r + 1.6, 0, 7); pg.fill(); }
    for (const b of blobs) {
      pg.fillStyle = b.s === 1 ? (R() < 0.6 ? "#5a3a1e" : "#4a2e17") : (R() < 0.7 ? "#3d78a8" : "#5a9ac8");
      pg.beginPath(); pg.arc(...b.p, b.r, 0, 7); pg.fill();
    }
    for (const b of blobs) if (R() < 0.35) {      // riflessi
      pg.fillStyle = b.s === 1 ? "rgba(255,225,190,.16)" : "rgba(255,255,255,.35)";
      pg.beginPath(); pg.ellipse(b.p[0] - b.r * 0.3, b.p[1] - b.r * 0.35, b.r * 0.35, b.r * 0.15, -0.4, 0, 7); pg.fill();
    }
    // Ogni tratto di fango o d'acqua ha alcune pozze in fila, col lato lungo nel verso della
    // strada, una dopo l'altra senza sovrapporsi (i bordi non si coprono), allungate quanto
    // basta a coprire tutto il tratto in cui la superficie frena.
    for (let a = 0; a < T.N; a++) {
      const sf = T.surf[a], pools = POOLS[sf];
      if (!pools || sf === T.surf[(a - 1 + T.N) % T.N]) continue;
      let n = 0; while (n < T.N && T.surf[(a + n) % T.N] === sf) n++;
      // il fango invece si sovrappone bene (bordo di fango su fango): pozze fitte che
      // seguono anche le curve strette
      const mud = sf === 1, len = n * T.step, k = Math.max(1, Math.round(len / (T.hw * (mud ? 1 : 2.6))));
      const along = mud ? T.hw * 2.1 : len / k + 2, wide = Math.min(T.hw * (mud ? 2.1 : 2.6), along);
      for (let j = 0; j < k; j++) {
        const i = (a + Math.floor((j + 0.5) * n / k)) % T.N, cell = (R() * 6) | 0;
        pg.save(); pg.translate(...across(i, (R() * 2 - 1) * 0.15)); pg.rotate(Math.atan2(T.ty[i], T.tx[i]) + (R() - 0.5) * 0.2);
        pg.drawImage(pools, (cell % 3) * 200, (cell / 3 | 0) * 200, 200, 200, -along / 2, -wide / 2, along, wide);
        pg.restore();
      }
    }
    pg.globalCompositeOperation = "destination-in";
    pg.beginPath(); pg.moveTo(T.x[0], T.y[0]); for (let i = 1; i < T.N; i++) pg.lineTo(T.x[i], T.y[i]); pg.closePath();
    pg.lineJoin = "round"; pg.lineWidth = def.w + 2; pg.strokeStyle = "#000"; pg.stroke();
    g.drawImage(pc, 0, 0, W, H);
    for (let i = 0; i < T.N; i++) {
      if (T.surf[i] === 2 && !POOLS[2] && R() < 0.25) { const [px, py] = across(i, (R() * 2 - 1) * 0.6); g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(px, py, 3 + R() * 4, 1); }
      if (T.surf[i] === 3 && i % 3 === 0) {
        const a = across(i, -0.95), b = across(i, 0.95);
        g.strokeStyle = (i / 3) & 1 ? "rgba(0,0,0,.22)" : "rgba(255,255,255,.18)"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      }
      if (T.jump[i] && !T.jump[(i - 1 + T.N) % T.N]) {
        // rampa: chiara in salita, ombra dopo il ciglio, frecce gialle come nei bozzetti
        for (let k = -4; k < 4; k++) {
          const j = (i + k + T.N) % T.N, a = across(j, -1), b = across(j, 1);
          g.strokeStyle = k < 2 ? `rgba(255,240,200,${0.12 + (k + 4) * 0.06})` : "rgba(0,0,0,.4)"; g.lineWidth = STEP + 0.5;
          g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
        }
        for (const f of [-0.5, 0, 0.5]) {
          const [px, py] = across((i - 3 + T.N) % T.N, f), ang = Math.atan2(T.ty[i], T.tx[i]);
          g.save(); g.translate(px, py); g.rotate(ang);
          g.beginPath(); g.moveTo(-3, -4); g.lineTo(2, 0); g.lineTo(-3, 4); g.lineTo(-5, 4); g.lineTo(0, 0); g.lineTo(-5, -4); g.closePath();
          g.fillStyle = "#ffd04a"; g.strokeStyle = "#5a2a10"; g.lineWidth = 0.8; g.fill(); g.stroke(); g.restore();
        }
      }
    }
    // cordoli bianchi e rossi lungo il bordo, dove la pista curva (un po' prima e dopo).
    // Un punto vale solo se cade fuori dalla carreggiata: nei tornanti stretti il bordo
    // interno si ripiega su sé stesso e finirebbe in mezzo alla strada, o su un altro tratto.
    const curve = new Uint8Array(T.N);
    for (let i = 0; i < T.N; i++) {
      const a = (i - 6 + T.N) % T.N, b = (i + 6) % T.N;
      if (Math.abs(T.tx[a] * T.ty[b] - T.ty[a] * T.tx[b]) >= 0.2) for (let k = -4; k <= 4; k++) curve[(i + k + T.N) % T.N] = 1;
    }
    const CURB = 1 + 1.5 / T.hw;
    for (const side of [-1, 1]) {
      const ok = new Uint8Array(T.N);
      for (let i = 0; i < T.N; i++) {
        if (!curve[i]) continue;
        const [px, py] = across(i, side * CURB);
        ok[i] = Math.abs(locate(T, px, py, i, true).lat) > T.hw - 0.5 ? 1 : 0;
      }
      // tratti continui: si parte da un punto senza cordolo, così nessun tratto è spezzato a metà
      const from = ok.indexOf(0);
      if (from < 0) continue;
      const runs = [];
      let run = null;
      for (let k = 1; k <= T.N; k++) {
        const i = (from + k) % T.N;
        if (!ok[i]) { run = null; continue; }
        if (!run) runs.push((run = []));
        run.push(across(i, side * CURB));
      }
      g.lineJoin = "round"; g.lineCap = "butt";
      for (const r of runs) {
        if (r.length < 3) continue;
        g.beginPath(); g.moveTo(...r[0]); for (const p of r) g.lineTo(...p);
        g.setLineDash([]); g.lineWidth = 4.4; g.strokeStyle = "#2a170c"; g.stroke();
        g.lineWidth = 3; g.strokeStyle = "#ece4d4"; g.stroke();
        g.setLineDash([4.5, 4.5]); g.strokeStyle = "#c8322a"; g.stroke();
      }
      g.setLineDash([]);
    }
    g.lineCap = "round";
    // traguardo a scacchi
    for (let k = -6; k < 6; k++) for (let r = 0; r < 2; r++) {
      const o = (k + 0.5) * (def.w / 12), a = r * 4 - 4;
      const px = T.x[0] - T.ty[0] * o + T.tx[0] * a, py = T.y[0] + T.tx[0] * o + T.ty[0] * a;
      g.fillStyle = (k + r) & 1 ? "#111" : "#f4f4f4";
      g.save(); g.translate(px, py); g.rotate(Math.atan2(T.ty[0], T.tx[0])); g.fillRect(0, -def.w / 24, 4, def.w / 12 + 0.3); g.restore();
    }
    // oggetti di contorno, lontano dalla pista e senza sovrapporsi
    const props = ART[`${def.art}-oggetti`], placed = [];
    if (props) {
      g.shadowColor = "rgba(0,0,0,.5)"; g.shadowOffsetX = 3; g.shadowOffsetY = 4; g.shadowBlur = 4;
      for (let k = 0; k < 400 && placed.length < 42; k++) {
        const size = 15 + R() * 13, px = 8 + R() * (W - 16), py = 8 + R() * (H - 16);
        let d = Infinity;
        for (let i = 0; i < T.N; i += 2) d = Math.min(d, Math.hypot(px - T.x[i], py - T.y[i]));
        if (d < T.hw + 9 + size / 2) continue;
        if (placed.some((q) => Math.hypot(q[0] - px, q[1] - py) < (q[2] + size) * 0.5)) continue;
        placed.push([px, py, size]);
        const n = (R() * 8) | 0;
        g.save(); g.translate(px, py); if (R() < 0.5) g.scale(-1, 1);
        g.drawImage(props, (n % 4) * CELL, (n >> 2) * CELL, CELL, CELL, -size / 2, -size / 2, size, size);
        g.restore();
      }
      g.shadowColor = "transparent";
    }
    // bordi scuri come nei bozzetti delle piste
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(20,10,4,.55)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    return c;
  }

  // ------------------------------------------------------------ gara
  let race = null, T = null, cars = [], bg = null, skid = null, skidG = null;
  let parts = [], trackNo = 0;
  // coppa: le 3 piste in fila, punti per piazzamento sommati per posto (auto)
  const POINTS = [10, 6, 3, 1];
  let cupPts = [0, 0, 0, 0], cupGain = [0, 0, 0, 0];
  const lastRound = () => trackNo === TRACKS.length - 1;
  let phase = "lobby", clock = 0, countdown = 0, resultsTimer = 0;

  // record del giro per pista e verso, salvati sulla TV. Chi può batterlo lo decide
  // sim.js (solo chi guida davvero); qui si tiene l'archivio col nome.
  const REC = "fango.records";
  const records = {};
  try {
    const r = JSON.parse(localStorage.getItem(REC) || "{}");
    for (const [k, v] of Object.entries(r && typeof r === "object" ? r : {}))
      if (v && Number.isFinite(v.t) && v.t > 0 && typeof v.name === "string") records[k] = { t: v.t, name: v.name.slice(0, 12) };
  } catch { /* niente archivio: i record valgono finché resta aperta la pagina */ }
  const recKey = (no) => TRACKS[no].name + (rev ? " ↺" : "");
  let newRecord = null, recFlash = 0;     // il record battuto in questa gara

  function setupRace() {
    // un seme nuovo a ogni gara: il computer non guida mai due volte uguale
    race = Sim.race({ track: trackNo, rev, seed: (Math.random() * 4294967296) >>> 0, best: records[recKey(trackNo)]?.t ?? Infinity });
    T = race.T; cars = race.cars;
    newRecord = null; recFlash = 0;
    bg = paintTrack(T);
    newSkid();
    parts = []; splashes = [];
    mud = [0, 0, 0, 0];
    dirt = cars.map((c) => dirtOf(race.seed + c.i * 7919));
  }

  // il foglio dei segni delle gomme, grande quanto il canvas
  function newSkid() {
    skid = document.createElement("canvas"); skid.width = W * S; skid.height = H * S;
    skidG = skid.getContext("2d"); skidG.scale(S, S);
  }

  // dagli eventi della gara: suoni, vibrazioni, particelle e l'archivio dei record
  const FX = {
    nitro: (e) => { sfx("nitro"); Net.rumble(e.i, 60); },
    land: (e) => { burst(e.x, e.y, 10, T.def.dirt, 60); Net.rumble(e.i, 50); sfx("land"); },
    enter: (e) => { if (e.s === 2) splash(e); sfx(["", "ciaff", "splash", "ghiaia"][e.s], e.v); },
    wall: (e) => { Net.rumble(e.i, Math.min(120, e.v)); sfx("hit", e.v); burst(e.x, e.y, 6, "#e8e0d0", 40); },
    bump: (e) => { sfx("bump", e.v); Net.rumble(e.i, 40); Net.rumble(e.j, 40); },
    spin: (e) => { Net.rumble(e.i, 120); burst(e.x, e.y, 8, "#e8e0d0", 50); sfx("sgommata"); },
    pick: (e) => { sfx("pick"); Net.rumble(e.i, 25); burst(e.x, e.y, 8, "#7fe0ff", 50); },
    unstick: (e) => { burst(e.x, e.y, 10, T.def.dirt, 50); Net.rumble(e.i, 80); },
    lap: (e) => { if (e.n < LAPS) Net.rumble(e.i, 30); },        // l'ultimo giro vibra col traguardo
    record: (e) => {
      records[recKey(trackNo)] = newRecord = { t: e.t, name: nameOf(e.i) };
      try { localStorage.setItem(REC, JSON.stringify(records)); } catch { /* modalità privata */ }
      recFlash = 3; sfx("record"); Net.rumble(e.i, 150);
    },
    finish: (e) => { sfx("finish"); Net.rumble(e.i, 200); },
  };

  // segni delle gomme, polvere, fiamma del nitro e fango sulla carrozzeria: solo disegno,
  // ricavati dallo stato dell'auto
  function trail(c, dt) {
    if (c.z > 0.5) return;
    const fx = Math.cos(c.a), fy = Math.sin(c.a), s = T.surf[c.idx];
    const lat = -c.vx * fy + c.vy * fx, speed = Math.hypot(c.vx, c.vy);
    const moving = Math.min(1, speed / 40);
    if (s === 1) mud[c.i] = Math.min(1, mud[c.i] + MUD_GAIN * moving * dt);
    else if (s === 2) mud[c.i] *= Math.exp(-MUD_WASH * moving * dt);
    if (Math.abs(lat) > 28 || c.boost > 0 || s === 1) {
      skidG.fillStyle = s === 1 ? "rgba(40,22,8,.35)" : "rgba(50,30,15,.16)";
      for (const side of [-1, 1]) skidG.fillRect(c.x - fx * 5 - fy * 3.5 * side - 1, c.y - fy * 5 + fx * 3.5 * side - 1, 2, 2);
    }
    if (speed > 30 && Math.random() < dt * (s === 0 ? 10 : 25)) {
      const col = s === 1 ? "#4a2e17" : s === 2 ? "#a8d8f0" : T.def.dirt;
      part(c.x - fx * 8, c.y - fy * 8, -c.vx * 0.2 + rnd(25), -c.vy * 0.2 + rnd(25), col, 0.5 + Math.random() * 0.4, 1.5 + Math.random() * 2);
    }
    if (c.boost > 0) part(c.x - fx * 9, c.y - fy * 9, -fx * 60 + rnd(10), -fy * 60 + rnd(10), Math.random() < 0.5 ? "#ffd04a" : "#ff6a2a", 0.25, 2);
  }

  // ------------------------------------------------------------ particelle (solo disegno: Math.random va bene)
  const rnd = (m) => (Math.random() * 2 - 1) * m;
  function part(x, y, vx, vy, col, life, size) { if (parts.length < 500) parts.push({ x, y, vx, vy, col, life, max: life, size }); }
  function burst(x, y, n, col, sp) { for (let k = 0; k < n; k++) part(x, y, rnd(sp), rnd(sp), col, 0.4 + Math.random() * 0.4, 1.5 + Math.random() * 2); }
  function updateParts(dt) {
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k];
      p.life -= dt; if (p.life <= 0) { parts.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt);
    }
  }

  // ------------------------------------------------------------ fango sulle auto
  // Ogni secondo passato nel fango sporca l'auto, l'acqua ne lava via una parte; ogni gara
  // si riparte puliti. Lo sporco sono gli schizzi di Gemini (schizzi.webp, 8 celle da 160 px)
  // appoggiati sullo sprite dell'auto e ritagliati sulla sua sagoma: compaiono uno alla volta,
  // prima su fiancate vicino alle ruote, paraurti e retro, poi anche su cofano e tetto, e
  // l'acqua toglie per primi gli ultimi arrivati.
  const MUD_GAIN = 0.35, MUD_WASH = 0.8, SPOTS = 16;
  const STREAKS = [1, 4, 5, 7];              // gli schizzi a colata, disegnati in diagonale
  let mud = [0, 0, 0, 0], dirt = [];

  // in coordinate della cella di auto.webp: auto larga ~104 px e lunga ~149, muso in basso
  function dirtOf(seed) {
    const R = rng(seed), spots = [];
    for (let k = 0; k < SPOTS; k++) {
      let x, y;
      if (k < SPOTS * 0.6) {
        const side = R() < 0.5 ? -1 : 1;
        if (R() < 0.7) { x = 80 + side * (32 + R() * 14); y = R() < 0.5 ? 22 + R() * 38 : 100 + R() * 45; }   // ruote
        else { x = 48 + R() * 64; y = R() < 0.5 ? 6 + R() * 14 : 138 + R() * 14; }                          // paraurti
      } else { x = 44 + R() * 72; y = 20 + R() * 120; }                                                     // ovunque
      const n = (R() * 8) | 0;
      // le colate vanno all'indietro, come il fango tirato su dalle ruote
      const a = STREAKS.includes(n) ? -0.87 + (R() - 0.5) * 0.6 : R() * Math.PI * 2;
      spots.push({ n, x, y, a, size: 30 + R() * 22 });
    }
    const cv = document.createElement("canvas"); cv.width = cv.height = CELL;
    return { cv, g: cv.getContext("2d"), spots, shown: 0 };
  }

  // l'auto con i suoi schizzi, ridisegnata solo quando ne cambia il numero; null se pulita
  function dirtyCar(c) {
    const d = dirt[c.i], n = Math.min(SPOTS, Math.floor(mud[c.i] * SPOTS));
    if (!ART.schizzi || !d || n === 0) return null;
    if (n !== d.shown) {
      const g = d.g;
      d.shown = n;
      g.clearRect(0, 0, CELL, CELL);
      g.drawImage(ART.auto, c.i * CELL, 0, CELL, CELL, 0, 0, CELL, CELL);
      g.globalCompositeOperation = "source-atop";
      for (const sp of d.spots.slice(0, n)) {
        g.save(); g.translate(sp.x, sp.y); g.rotate(sp.a);
        g.drawImage(ART.schizzi, (sp.n % 4) * CELL, (sp.n >> 2) * CELL, CELL, CELL, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
        g.restore();
      }
      g.globalCompositeOperation = "source-over";
    }
    return d.cv;
  }

  // ------------------------------------------------------------ spruzzi d'acqua
  // spruzzi.webp di Gemini, 8 celle da 160 px: 0-1 anello d'onda, 2-3 ventaglio rivolto a
  // destra (la punta sul bordo sinistro della cella), 4-5 corona, 6-7 gocce sparse.
  // Entrando in una pozza: un anello che si allarga sotto l'auto, una corona, due ventagli
  // ai lati e qualche goccia, tanto più grandi quanto più l'auto è veloce. Durano meno di
  // un secondo; l'anello resta sotto le auto, il resto sopra.
  let splashes = [];
  function splash(e) {
    if (!ART.spruzzi) return;
    const k = Math.min(1.5, e.v / 110), any = (first) => first + ((Math.random() * 2) | 0);
    const add = (cell, x, y, ang, from, to, life, over, tip = false) => splashes.push({ cell, x, y, ang, from, to, life, over, tip, t: 0 });
    add(any(0), e.x, e.y, Math.random() * 7, 6, 16 + 16 * k, 0.7, false);
    add(any(4), e.x, e.y, Math.random() * 7, 8, 12 + 12 * k, 0.4, true);
    add(any(6), e.x, e.y, Math.random() * 7, 6, 12 + 10 * k, 0.5, true);
    for (const side of [-1, 1]) {
      // verso l'esterno e un po' all'indietro, dal fianco dell'auto
      const n = e.a + side * Math.PI / 2, ang = n + side * 0.35;
      add(any(2), e.x + Math.cos(n) * 4, e.y + Math.sin(n) * 4, ang, 5, 10 + 12 * k, 0.45, true, true);
    }
  }
  function updateSplashes(dt) {
    for (let k = splashes.length - 1; k >= 0; k--) if ((splashes[k].t += dt) >= splashes[k].life) splashes.splice(k, 1);
  }
  function drawSplashes(over) {
    for (const p of splashes) {
      if (p.over !== over) continue;
      const u = p.t / p.life, size = p.from + (p.to - p.from) * (1 - (1 - u) * (1 - u));   // si apre in fretta, poi rallenta
      ctx.globalAlpha = 0.9 * Math.min(1, 2.2 * (1 - u));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
      ctx.drawImage(ART.spruzzi, (p.cell % 4) * CELL, (p.cell >> 2) * CELL, CELL, CELL, p.tip ? -size * 0.03 : -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ disegno
  // auto.webp: 4 celle da 160 px, l'auto vista dall'alto col muso in basso; lunga ~20 px di gioco
  const CAR_SIZE = 21.5;
  function drawCar(c) {
    const lift = c.z;
    if (c.ghost > 0) ctx.globalAlpha = Math.sin(c.ghost * 25) > 0 ? 0.35 : 0.8;   // appena rimessa in pista
    // ombra
    ctx.save(); ctx.translate(c.x + 2 + lift * 0.35, c.y + 3 + lift * 0.5); ctx.rotate(c.a);
    ctx.fillStyle = `rgba(0,0,0,${0.4 - Math.min(0.25, lift / 120)})`;
    ctx.beginPath(); ctx.roundRect(-9.5, -6, 19, 12, 3); ctx.fill(); ctx.restore();

    ctx.save(); ctx.translate(c.x, c.y - lift * 0.6); ctx.rotate(c.a);
    const k = 1 + lift / 90; ctx.scale(k, k);
    if (c.boost > 0) {             // fiammata del nitro, sotto l'auto
      const L = 9 + Math.random() * 6;
      ctx.fillStyle = "#ff6a2a"; ctx.beginPath(); ctx.moveTo(-8, -3.5); ctx.lineTo(-8 - L, 0); ctx.lineTo(-8, 3.5); ctx.fill();
      ctx.fillStyle = "#ffd04a"; ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-8 - L * 0.6, 0); ctx.lineTo(-8, 2); ctx.fill();
    }
    if (ART.auto) {
      ctx.rotate(-Math.PI / 2);
      const dirty = dirtyCar(c);
      if (dirty) ctx.drawImage(dirty, -CAR_SIZE / 2, -CAR_SIZE / 2, CAR_SIZE, CAR_SIZE);
      else ctx.drawImage(ART.auto, c.i * CELL, 0, CELL, CELL, -CAR_SIZE / 2, -CAR_SIZE / 2, CAR_SIZE, CAR_SIZE);
    } else { ctx.fillStyle = colorOf(c.i); ctx.fillRect(-9, -5.5, 18, 11); }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!bg) { ctx.fillStyle = "#1a120c"; ctx.fillRect(0, 0, cv.width, cv.height); return; }
    ctx.drawImage(bg, 0, 0); ctx.drawImage(skid, 0, 0);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    drawSplashes(false);
    for (const p of race.pickups) {
      const bob = Math.sin(p.t * 6) * 1.2, glow = 0.35 + 0.2 * Math.sin(p.t * 8);
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, 4, 2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(127,224,255,${glow})`; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 7, 0, 7); ctx.fill();
      if (ART.nitro) ctx.drawImage(ART.nitro, p.x - 7, p.y - 7 + bob, 14, 14);
      else { ctx.fillStyle = "#1a6aa8"; ctx.fillRect(p.x - 3, p.y - 4 + bob, 6, 8); }
    }
    for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    for (const c of [...cars].sort((a, b) => a.z - b.z)) drawCar(c);
    drawSplashes(true);
  }

  // ------------------------------------------------------------ audio (sintetizzato)
  let ac = null, engines = null, grit = null, noiseBuf = null;
  function audioOn() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    ac.master = master;
    // 2 s di rumore bianco, uno solo per tutti i suoni fatti di rumore
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    engines = [0, 1, 2, 3].map(() => {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = "sawtooth"; o.frequency.value = 40; f.type = "lowpass"; f.frequency.value = 400; g.gain.value = 0;
      o.connect(f).connect(g).connect(master); o.start();
      return { o, g };
    });
    // il fondo sotto le ruote di ogni auto: rumore in loop, filtrato secondo la superficie
    grit = [0, 1, 2, 3].map(() => {
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noiseBuf; src.loop = true; g.gain.value = 0;
      src.connect(f).connect(g).connect(master); src.start(0, Math.random() * 2);
      return { f, g, s: -1 };
    });
  }
  addEventListener("keydown", audioOn); addEventListener("pointerdown", audioOn);
  function tone(freq, dur, type = "square", vol = 0.15, slide = 0) {
    if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.master); o.start(t); o.stop(t + dur);
  }
  // un colpo di rumore filtrato: la frequenza del filtro può scivolare da freq a `to`
  function noise(dur, vol, freq, { type = "bandpass", q = 1, to = 0 } = {}) {
    if (!ac) return;
    const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.002, vol), t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(ac.master); src.start(t, Math.random() * (2 - dur)); src.stop(t + dur);
  }
  // sgommata: due seghe stonate che scendono, filtrate stretto e fatte tremare, più un sibilo
  function screech(dur, vol) {
    const t = ac.currentTime, f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain();
    f.type = "bandpass"; f.frequency.value = 1600; f.Q.value = 4;
    lfo.frequency.value = 22; depth.gain.value = 60; lfo.connect(depth);
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    for (const base of [1150, 1230]) {
      const o = ac.createOscillator();
      o.type = "sawtooth"; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 0.7, t + dur);
      depth.connect(o.frequency); o.connect(f); o.start(t); o.stop(t + dur);
    }
    f.connect(g).connect(ac.master); lfo.start(t); lfo.stop(t + dur);
    noise(dur * 0.8, vol * 0.6, 3500, { type: "highpass", q: 0.7 });
  }
  // suoni che non si sovrappongono a se stessi: al più uno ogni tanti secondi
  const GAP = { hit: 0.08, bump: 0.08, ciaff: 0.06, splash: 0.06, ghiaia: 0.06, squelch: 0.1, sgommata: 0.25 }, lastAt = {};
  function sfx(name, v = 0) {
    if (!ac) return;
    if (GAP[name]) { if (clock - (lastAt[name] ?? -1) < GAP[name]) return; lastAt[name] = clock; }
    const k = Math.max(0.35, Math.min(1, v / 150));      // ingressi più forti quanto più si arriva veloci
    ({
      beep: () => tone(440, 0.18, "square", 0.12),
      go: () => tone(880, 0.4, "square", 0.14),
      nitro: () => noise(0.6, 0.25, 900),
      pick: () => { tone(660, 0.08, "square", 0.08); setTimeout(() => tone(990, 0.1, "square", 0.08), 70); },
      hit: () => noise(0.12, Math.min(0.3, v / 300), 300),
      bump: () => noise(0.1, Math.min(0.25, v / 300), 500),
      land: () => noise(0.15, 0.2, 200),
      // superfici: ciaff nel fango, splash nell'acqua, ghiaia sui dossi, sgommata nel testacoda
      ciaff: () => { noise(0.22, 0.2 * k, 900, { q: 1.6, to: 220 }); tone(170, 0.12, "sine", 0.08 * k, -110); },
      squelch: () => noise(0.12, 0.2, 700, { q: 2, to: 260 }),
      splash: () => { noise(0.45, 0.16 * k, 2600, { q: 0.8, to: 700 }); noise(0.3, 0.14 * k, 500, { type: "lowpass", q: 0.7 }); },
      ghiaia: () => noise(0.14, 0.12 * k, 3200, { q: 1.2, to: 1800 }),
      sgommata: () => screech(0.55, 0.07),
      record: () => [784, 988, 1175, 1568].forEach((f, k) => setTimeout(() => tone(f, 0.12, "square", 0.09), k * 70)),
      finish: () => [523, 659, 784, 1046].forEach((f, k) => setTimeout(() => tone(f, 0.18, "square", 0.1), k * 110)),
    })[name]?.();
  }
  function engineSound() {
    if (!engines) return;
    for (let i = 0; i < 4; i++) {
      const c = cars[i], e = engines[i];
      const on = c && phase !== "lobby" && phase !== "pause" && Net.human(i);
      const sp = c ? Math.hypot(c.vx, c.vy) : 0;
      e.g.gain.setTargetAtTime(on ? 0.035 + (c.boost > 0 ? 0.03 : 0) : 0, ac.currentTime, 0.1);
      e.o.frequency.setTargetAtTime(38 + sp * 0.55 + (c && c.z > 0 ? 25 : 0) + i * 3, ac.currentTime, 0.05);
    }
  }
  // il fondo sotto le ruote di chi guida (come i motori, il computer resta muto): ghiaia che
  // crepita sui dossi, fango che risucchia con qualche ciaff, acqua che fruscia
  // ref: la velocità a cui il fondo suona pieno (nel fango si va piano)
  const GRIT = [null,
    { type: "lowpass", freq: 320, q: 0.7, vol: 0.15, ref: 60 },      // fango
    { type: "bandpass", freq: 1100, q: 0.6, vol: 0.09, ref: 120 },   // acqua
    { type: "bandpass", freq: 2600, q: 0.9, vol: 0.07, ref: 120 }];  // dossi
  function surfaceSound(dt) {
    if (!grit) return;
    const t = ac.currentTime;
    for (let i = 0; i < 4; i++) {
      const c = cars[i], gr = grit[i];
      const s = c && c.z <= 0.5 ? T.surf[c.idx] : 0, p = GRIT[s];
      const k = c && p ? Math.min(1, Math.hypot(c.vx, c.vy) / p.ref) : 0;
      if (!p || phase !== "race" || !Net.human(i) || k < 0.1) { gr.g.gain.setTargetAtTime(0, t, 0.05); continue; }
      if (gr.s !== s) { gr.s = s; gr.f.type = p.type; gr.f.frequency.setTargetAtTime(p.freq, t, 0.03); gr.f.Q.value = p.q; }
      // la ghiaia crepita: volume a scatti rapidi; fango e acqua scorrono
      const crackle = s === 3 ? 0.3 + Math.random() * 0.9 : 1;
      gr.g.gain.setTargetAtTime(p.vol * k * crackle, t, s === 3 ? 0.008 : 0.06);
      if (s === 1 && Math.random() < dt * 3 * k) sfx("squelch");
    }
  }

  // ------------------------------------------------------------ interfaccia (DOM)
  const ui = { lobby: $("#lobby"), hud: $("#hud"), rec: $("#rec"), count: $("#count"), pause: $("#pause"), results: $("#results") };
  const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, "0")}`; };
  const ord = (n) => n + "°";

  function renderLobby() {
    $("#tname").textContent = trackTitle(trackNo);
    $("#tnum").textContent = TRACKS.length;
    $("#recs").innerHTML = (rev ? "Record del giro, al contrario: " : "Record del giro: ") + TRACKS.map((t, no) => {
      const r = records[recKey(no)];
      return `${escape(t.name)} <b>${r ? `${fmt(r.t)} ${escape(r.name)}` : "—"}</b>`;
    }).join(" · ");
    $("#code").textContent = Net.code || "····";
    const url = Net.padUrl();
    $("#url").textContent = url.replace(/^https?:\/\//, "") + (Net.code ? "#" + Net.code : "");
    $("#netstate").textContent = {
      loading: "Preparo il collegamento…", ready: "", offline: "Nessuna connessione a Internet: riprovo…",
      unsupported: "Questo browser non permette di collegare i telefoni: usa tastiera o gamepad.",
    }[Net.status] || "";
    $("#localwarn").hidden = !Net.local;
    const qr = $("#qr");
    if (Net.code && window.qrcode && qr.dataset.code !== Net.code + url) {
      const q = window.qrcode(0, "M"); q.addData(`${url}#${Net.code}`); q.make();
      qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      qr.dataset.code = Net.code + url;
    }
    $("#slots").innerHTML = "";
    for (const sl of Net.slots) {
      const el = document.createElement("div");
      el.className = "slot" + (sl.src ? " on" : "");
      el.style.setProperty("--c", sl.color); el.style.setProperty("--p", sl.i);
      const kind = Net.kind(sl.i), pilot = Net.pilots[sl.i];
      el.innerHTML = `<i class="face"></i><b></b><small></small>`;
      el.querySelector("b").textContent = sl.name;
      el.querySelector("small").textContent = !sl.src ? "guida il computer"
        : (sl.name === pilot ? "" : pilot + " · ") + { phone: "col telefono", kb: "da tastiera", pad: "col gamepad" }[kind] + (Net.input(sl.i) ? "" : " · scollegato");
      $("#slots").appendChild(el);
    }
  }
  Net.onChange(() => { if (phase === "lobby") renderLobby(); });

  // senza giocatore il posto ha il nome del suo pilota (net.js); il colore è dell'auto
  const nameOf = (i) => Net.slots[i].name;
  const colorOf = (i) => Net.slots[i].color;

  let hudKey = "";
  function renderHud() {
    const rows = cars.map((c) => {
      const lap = Math.max(1, Math.min(LAPS, c.lap + 1));
      const bar = Array.from({ length: Math.max(5, c.nitro) }, (_, k) => `<i${k < c.nitro ? ' class="on"' : ""}></i>`).join("");
      return `<div class="p" style="--c:${colorOf(c.i)}"><b>${ord(c.place)}</b><span>${escape(nameOf(c.i))}</span>`
        + `<small>${c.done ? fmt(c.time) : `giro ${lap}/${LAPS}`}</small><em>nitro <u>${bar}</u></em></div>`;
    }).join("");
    if (rows !== hudKey) { ui.hud.innerHTML = rows; hudKey = rows; }
    const r = records[recKey(trackNo)];
    const rec = r ? `${recFlash > 0 ? "Nuovo record del giro!" : "Record del giro"} <b>${fmt(r.t)}</b> ${escape(r.name)}` : "Nessun record su questa pista: fai tu il primo";
    if (rec !== recHtml) { ui.rec.innerHTML = rec; recHtml = rec; ui.rec.classList.toggle("new", recFlash > 0); }
  }
  let recHtml = "";
  const escape = (s) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

  // classifica della coppa: punti, a pari punti conta l'ultima gara
  function standings() { return [...cars].sort((a, b) => cupPts[b.i] - cupPts[a.i] || a.place - b.place); }

  function renderResults() {
    const order = standings();
    const top = lastRound() ? order[0] : cars.find((c) => c.place === 1);
    $("#rround").textContent = lastRound() ? `Coppa finita · ${TRACKS.length} piste` : `Gara ${trackNo + 1} di ${TRACKS.length} · ${trackTitle(trackNo)}`;
    $("#rtitle").textContent = lastRound() ? `${nameOf(top.i)} vince la coppa!` : `Vince ${nameOf(top.i)}!`;
    $("#rwin").style.setProperty("--p", top.i); $("#rwin").style.setProperty("--c", colorOf(top.i));
    $("#rlist").innerHTML = order.map((c, k) =>
      `<li style="--c:${colorOf(c.i)};--p:${c.i}"><b>${ord(k + 1)}</b><i class="face"></i><span>${escape(nameOf(c.i))}</span>`
      + `<small>${ord(c.place)} in gara · ${c.done ? fmt(c.time) : "non arrivato"}${c.best < Infinity ? ` · giro ${fmt(c.best)}` : ""}</small>`
      + `<strong>${cupPts[c.i]} pt<em>+${cupGain[c.i]}</em></strong></li>`).join("");
    $("#rrec").hidden = !newRecord;
    if (newRecord) $("#rrec").textContent = `Nuovo record del giro su ${trackTitle(trackNo)}: ${newRecord.name}, ${fmt(newRecord.t)}`;
  }

  function show(name) {
    const onTrack = ["race", "count", "pause"].includes(name);
    for (const [k, el] of Object.entries(ui)) el.hidden = !(k === name || (onTrack && (k === "hud" || k === "rec")));
  }

  // ------------------------------------------------------------ flusso
  // una coppa sì e una no le piste si corrono al contrario
  let cups = 0;
  function newCup() { trackNo = 0; cupPts = [0, 0, 0, 0]; cupGain = [0, 0, 0, 0]; rev = cups++ % 2 === 1; }
  function toLobby() {
    phase = "lobby"; Net.setPhase("lobby");
    newCup(); setupRace();
    show("lobby"); renderLobby();
  }
  function toCount() {
    phase = "count"; Net.setPhase("race");
    setupRace(); countdown = 3.999;
    show("count"); sfx("beep");
  }
  function toResults() {
    phase = "results"; Net.setPhase("results");
    resultsTimer = 20;
    // punti a tutti per piazzamento, anche a chi la gara chiusa ha lasciato per strada
    for (const c of cars) { cupGain[c.i] = POINTS[c.place - 1] || 0; cupPts[c.i] += cupGain[c.i]; }
    renderResults(); show("results");
  }

  // distacco in secondi: quando l'auto davanti è passata dal punto dove ora è quella dietro
  function gap(ahead, back) {
    const d = ahead.prog - back.prog;
    if (d >= T.L) { const n = Math.floor(d / T.L); return n === 1 ? "1 giro" : `${n} giri`; }
    const t = race.time - ahead.passT[back.idx];
    return t >= 0 ? `${t.toFixed(1)} s` : "";
  }
  function gapText(c) {
    if (c.done) return `arrivato · ${fmt(c.time)}`;
    const byPlace = [...cars].sort((a, b) => a.place - b.place);
    if (c.place === 1) { const g = byPlace[1] && gap(c, byPlace[1]); return g ? `davanti di ${g}` : ""; }
    const a = byPlace[c.place - 2], g = gap(a, c);
    return g ? `a ${g} da ${nameOf(a.i)}` : "";
  }

  let hudTimer = 0;
  function phoneHud(dt) {
    hudTimer -= dt;
    if (hudTimer > 0) return;
    hudTimer = 0.25;
    for (const c of cars) {
      if (!Net.human(c.i)) continue;
      const lap = `giro ${Math.max(1, Math.min(LAPS, c.lap + 1))}/${LAPS}`;
      const text = phase === "lobby" ? `${trackTitle(trackNo)} · premi START per partire`
        : phase === "results" ? `${ord(c.place)} in gara · coppa ${ord(standings().indexOf(c) + 1)}, ${cupPts[c.i]} pt · START ${lastRound() ? "nuova coppa" : "prossima pista"}`
        : phase === "pause" ? "Pausa · START per riprendere"
        : c.done ? `Arrivato ${ord(c.place)} · ${fmt(c.time)}`
        : `${ord(c.place)} · ${lap}`;
      // in gara il telefono mostra in grande posizione e distacco
      const big = phase === "race" || phase === "pause" ? { pos: ord(c.place), gap: gapText(c), lap: c.done ? "" : lap } : null;
      Net.hud(c.i, text, c.nitro, big);
    }
  }

  // pausa: START da chi guida (o Invio) e Esc sulla TV
  let escEdge = false;
  addEventListener("keydown", (e) => { if (e.code === "Escape" && !e.repeat) escEdge = true; });
  function togglePause() {
    phase = phase === "race" ? "pause" : "race";
    Net.setPhase(phase === "pause" ? "pause" : "race");
    show(phase); sfx("beep");
  }

  function tick(dt) {
    Net.poll();
    clock += dt;
    const esc = escEdge; escEdge = false;
    if ((phase === "race" || phase === "pause") && (Net.start || esc)) togglePause();
    if (phase === "pause") {
      // fermo tutto: niente fisica, niente cronometro
    } else if (phase === "lobby") {
      if (Net.start) toCount();
    } else if (phase === "count") {
      const before = Math.ceil(countdown);
      countdown -= dt;
      const now = Math.ceil(countdown);
      if (now !== before && now > 0) sfx("beep");
      ui.count.textContent = countdown > 0 ? String(now) : "VIA!";
      if (countdown <= 0) { phase = "race"; sfx("go"); setTimeout(() => { if (phase === "race") ui.count.hidden = true; }, 700); }
      for (const c of cars) if (Net.input(c.i)?.g) part(c.x + rnd(4), c.y + rnd(4), rnd(20), rnd(20), "rgba(200,200,200,.6)", 0.4, 2);
      renderHud();
    } else if (phase === "race") {
      recFlash = Math.max(0, recFlash - dt);
      const inputs = Net.slots.map((sl) => Net.input(sl.i)), humans = Net.slots.map((sl) => Net.human(sl.i));
      for (const e of race.step(inputs, humans, dt)) FX[e.type](e);
      for (const c of cars) trail(c, dt);
      renderHud();
      if (race.over) toResults();
    } else if (phase === "results") {
      resultsTimer -= dt;
      const wait = `tra ${Math.ceil(resultsTimer)} s si torna alla sala d'attesa`;
      $("#rnext").textContent = lastRound() ? `START per una nuova coppa, o ${wait}`
        : `Prossima pista: ${TRACKS[trackNo + 1].name}${rev ? " al contrario" : ""} — START per partire, o ${wait} (e la coppa ricomincia)`;
      if (Net.start) { if (lastRound()) newCup(); else trackNo++; toCount(); }
      else if (resultsTimer <= 0) toLobby();
    }
    if (phase !== "pause") { updateParts(dt); updateSplashes(dt); }     // in pausa si ferma anche la polvere
    phoneHud(dt);
    engineSound(); surfaceSound(dt);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // passi fissi: la fisica non cambia col refresh della TV
    let left = dt;
    while (left > 1e-6) { const h = Math.min(1 / 120, left); tick(h); left -= h; }
    draw();
    requestAnimationFrame(frame);
  }

  // per i test dal browser
  window.Fango = { Sim, get S() { return S; }, get race() { return race; }, get cars() { return cars; }, get mud() { return mud; }, get phase() { return phase; }, get track() { return T; }, records,
    get rev() { return rev; }, set rev(v) { rev = !!v; }, setupRace, start: () => toCount() };

  loadArt().then(() => { toLobby(); requestAnimationFrame(frame); });
})();
