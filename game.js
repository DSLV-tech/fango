// Fango — corse fuoristrada viste dall'alto, una pista per schermata, 4 pick-up.
// Coordinate logiche 640×360, disegnate a 1280×720 (S = 2).
(() => {
  "use strict";
  const Net = window.FangoNet;
  const W = 640, H = 360, S = 2;
  const LAPS = 3;
  const STEP = 4;                        // passo della linea centrale ricampionata, in px
  const $ = (s) => document.querySelector(s);
  const cv = $("#game"), ctx = cv.getContext("2d");
  cv.width = W * S; cv.height = H * S;

  // ------------------------------------------------------------ piste
  // pts: punti di controllo della linea centrale (chiusa, Catmull-Rom); w: larghezza.
  // Le zone sono frazioni della lunghezza del giro (0 = traguardo).
  const TRACKS = [
    {
      name: "Cava Rossa", art: "cava", w: 50, ground: ["#6b3f26", "#7a4a2c", "#5c3520"], dirt: "#c58a52",
      pts: [[90, 285], [80, 110], [160, 52], [262, 80], [300, 175], [362, 95], [470, 52], [572, 88], [585, 185], [505, 225], [565, 292], [455, 322], [320, 300], [200, 322]],
      zones: [{ t: "jump", f: 0.13 }, { t: "mud", a: 0.30, b: 0.36 }, { t: "bumps", a: 0.52, b: 0.58 }, { t: "jump", f: 0.70 }, { t: "water", a: 0.86, b: 0.91 }],
    },
    {
      name: "Palude Vecchia", art: "palude", w: 52, ground: ["#2f4a2a", "#3a5a30", "#263d22"], dirt: "#9a7a4a",
      pts: [[95, 190], [112, 72], [250, 50], [330, 122], [402, 60], [540, 60], [585, 152], [540, 236], [430, 215], [380, 290], [250, 325], [150, 312]],
      zones: [{ t: "mud", a: 0.06, b: 0.12 }, { t: "water", a: 0.24, b: 0.29 }, { t: "jump", f: 0.40 }, { t: "mud", a: 0.58, b: 0.66 }, { t: "water", a: 0.78, b: 0.82 }, { t: "bumps", a: 0.88, b: 0.94 }],
    },
    {
      name: "Dune Alte", art: "dune", w: 48, ground: ["#c9a46a", "#d4b078", "#b8915a"], dirt: "#e6c690",
      pts: [[72, 205], [92, 82], [200, 58], [232, 160], [322, 196], [360, 92], [470, 58], [580, 100], [572, 222], [500, 265], [380, 322], [252, 282], [132, 322]],
      zones: [{ t: "jump", f: 0.08 }, { t: "bumps", a: 0.20, b: 0.27 }, { t: "jump", f: 0.42 }, { t: "mud", a: 0.55, b: 0.60 }, { t: "jump", f: 0.74 }, { t: "bumps", a: 0.84, b: 0.92 }],
    },
  ];

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
  }
  function buildTrack(def) {
    const P = def.pts, n = P.length, dense = [];
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 30; k++) dense.push(catmull(P[(i - 1 + n) % n], P[i], P[(i + 1) % n], P[(i + 2) % n], k / 30));
    // ricampionata a passo costante
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const total = cum[cum.length - 1], N = Math.floor(total / STEP);
    const x = new Float32Array(N), y = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const d = i * total / N;
      while (cum[j + 1] < d) j++;
      const u = (d - cum[j]) / (cum[j + 1] - cum[j] || 1), a = dense[j], b = dense[(j + 1) % dense.length];
      x[i] = a[0] + (b[0] - a[0]) * u; y[i] = a[1] + (b[1] - a[1]) * u;
    }
    const tx = new Float32Array(N), ty = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N, dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
      tx[i] = dx / l; ty[i] = dy / l;
    }
    const step = total / N;
    const surf = new Uint8Array(N), jump = new Uint8Array(N);   // 0 terra, 1 fango, 2 acqua, 3 dossi
    const SURF = { mud: 1, water: 2, bumps: 3 };
    for (const z of def.zones) {
      if (z.t === "jump") { const i = Math.round(z.f * N); for (let k = 0; k < 3; k++) jump[(i + k) % N] = 1; continue; }
      for (let i = Math.round(z.a * N); i < Math.round(z.b * N); i++) surf[i % N] = SURF[z.t];
    }
    return { def, N, x, y, tx, ty, L: total, step, surf, jump, hw: def.w / 2 };
  }

  // punto della linea centrale più vicino: cerca attorno all'indice di prima
  function locate(T, px, py, hint, wide) {
    let best = -1, bd = Infinity;
    const R = wide ? T.N : 24;
    for (let o = -R; o <= R; o++) {
      const i = ((hint + o) % T.N + T.N) % T.N, dx = px - T.x[i], dy = py - T.y[i], d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
      if (wide && o === R - 1) break;
    }
    const dx = px - T.x[best], dy = py - T.y[best];
    return { i: best, along: dx * T.tx[best] + dy * T.ty[best], lat: dx * -T.ty[best] + dy * T.tx[best] };
  }

  // ------------------------------------------------------------ disegno della pista (una volta)
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // La grafica viene da Gemini (design/ sono i bozzetti, img/ gli asset scontornati):
  // texture di terreno e strada ripetute, oggetti di contorno a fogli 4×2 da 160 px.
  const ART = {};
  const ART_FILES = ["auto", "nitro", "cava-terreno", "cava-strada", "cava-oggetti", "palude-terreno", "palude-strada", "palude-oggetti", "dune-terreno", "dune-strada", "dune-oggetti", "fango", "pozzanghere"];
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
    // un pixel della texture = un pixel della tela
    const tex = (name, color) => {
      const im = ART[`${def.art}-${name}`];
      if (!im) return color;
      const p = g.createPattern(im, "repeat"); p.setTransform(new DOMMatrix().scale(1 / S)); return p;
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

  // ------------------------------------------------------------ auto
  const P = { accel: 310, drag: 1.65, nitroAccel: 380, nitroTime: 1.3, turn: 4.2, grip: 9, r: 6.5, reverse: 70 };
  const SURFACE = [
    { acc: 1, drag: 1, grip: 1 },            // terra
    { acc: 0.5, drag: 2.4, grip: 0.55 },     // fango
    { acc: 0.65, drag: 2.0, grip: 0.7 },     // acqua
    { acc: 0.9, drag: 1.2, grip: 0.8 },      // dossi
  ];

  let T = null, bg = null, skid = null, skidG = null;
  let cars = [], parts = [], pickups = [], trackNo = 0;
  let phase = "lobby", clock = 0, raceTime = 0, countdown = 0, finishedAt = 0, pickupTimer = 0, resultsTimer = 0;

  function setupRace() {
    T = buildTrack(TRACKS[trackNo]);
    bg = paintTrack(T);
    skid = document.createElement("canvas"); skid.width = W * S; skid.height = H * S;
    skidG = skid.getContext("2d"); skidG.scale(S, S);
    parts = []; pickups = []; pickupTimer = 2;
    cars = Net.slots.map((sl, i) => {
      // griglia 2×2 dietro al traguardo
      const back = 3 + (i >> 1) * 6, j = (T.N - back) % T.N, o = (i & 1 ? 1 : -1) * T.hw * 0.42;
      const x = T.x[j] - T.ty[j] * o, y = T.y[j] + T.tx[j] * o;
      return {
        i, x, y, a: Math.atan2(T.ty[j], T.tx[j]), vx: 0, vy: 0, z: 0, vz: 0,
        idx: j, lap: -1, prog: 0, nitro: 3, boost: 0, nPrev: 0, done: false, time: 0, place: i + 1,
        ai: { off: (Math.random() * 2 - 1) * 0.4, skill: 0.86 + i * 0.03 + Math.random() * 0.04, look: 12 + (i % 2) * 3 },
        bump: 0, color: sl.color,
      };
    });
    for (const c of cars) { c.prog = progress(c); }
  }

  function progress(c) { return (c.lap) * T.L + c.idx * T.step; }

  function aiInput(c) {
    const look = (c.idx + c.ai.look) % T.N;
    const o = c.ai.off * T.hw;
    const tx = T.x[look] - T.ty[look] * o, ty = T.y[look] + T.tx[look] * o;
    let da = Math.atan2(ty - c.y, tx - c.x) - c.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const speed = Math.hypot(c.vx, c.vy);
    // curva stretta più avanti: si alza il piede
    const far = (c.idx + 28) % T.N, bend = Math.abs(Math.atan2(T.tx[c.idx] * T.ty[far] - T.ty[c.idx] * T.tx[far], T.tx[c.idx] * T.tx[far] + T.ty[c.idx] * T.ty[far]));
    const limit = (190 - bend * 75) * c.ai.skill;
    const straight = bend < 0.25 && Math.abs(da) < 0.2;
    // incastrata contro il bordo: un po' di retromarcia sterzando al contrario
    if (speed < 8) c.ai.stuck = (c.ai.stuck || 0) + 1 / 120; else if (speed > 25) c.ai.stuck = 0;
    if (c.ai.stuck > 0.8) { c.ai.back = 0.7; c.ai.stuck = 0; }
    if (c.ai.back > 0) { c.ai.back -= 1 / 120; return { s: -Math.sign(da) || 1, g: 0, r: 1, n: 0 }; }
    return { s: Math.max(-1, Math.min(1, da * 3)), g: speed < limit && Math.abs(da) < 1.2 ? 1 : 0, r: 0, n: straight && speed > 80 && c.nitro > 0 && Math.random() < 0.01 ? 1 : 0 };
  }

  function updateCar(c, inp, dt) {
    if (c.done) inp = { s: 0, g: 0, r: 0, n: 0 };
    const sf = SURFACE[T.surf[c.idx]];
    const air = c.z > 0.5;
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    let fwd = c.vx * fx + c.vy * fy, lat = -c.vx * fy + c.vy * fx;
    const speed = Math.hypot(c.vx, c.vy);

    // nitro: un colpo per pressione
    if (inp.n && !c.nPrev && c.nitro > 0 && c.boost <= 0 && !c.done) { c.nitro--; c.boost = P.nitroTime; sfx("nitro"); Net.rumble(c.i, 60); }
    c.nPrev = inp.n;
    c.boost = Math.max(0, c.boost - dt);

    const turnScale = Math.min(1, 0.4 + Math.abs(fwd) / 80) * (air ? 0.35 : 1);
    c.a += inp.s * P.turn * turnScale * dt * (fwd < -5 ? -1 : 1);

    if (!air) {
      let acc = inp.g ? P.accel * sf.acc : 0;
      // retromarcia: prima frena, poi va indietro piano
      if (inp.r && !inp.g) acc = fwd > 10 ? -P.accel * 1.6 : fwd > -P.reverse ? -P.accel * 0.55 * sf.acc : 0;
      if (c.boost > 0) acc += P.nitroAccel;
      if (!inp.g && !inp.r && c.boost <= 0) fwd *= Math.exp(-1.2 * dt);   // freno motore
      fwd += acc * dt;
      fwd *= Math.exp(-P.drag * sf.drag * dt);
      lat *= Math.exp(-P.grip * sf.grip * dt);
      const nx = Math.cos(c.a), ny = Math.sin(c.a);
      c.vx = nx * fwd - ny * lat; c.vy = ny * fwd + nx * lat;
    } else {
      c.vx *= Math.exp(-0.15 * dt); c.vy *= Math.exp(-0.15 * dt);
    }

    c.x += c.vx * dt; c.y += c.vy * dt;

    // salti e dossi
    const prevIdx = c.idx;
    const loc = locate(T, c.x, c.y, c.idx, false);
    c.idx = loc.i;
    if (!air && T.jump[c.idx] && !T.jump[prevIdx] && fwd > 40) { c.vz = Math.min(110, fwd * 0.55); c.z = 0.6; }
    if (!air && T.surf[c.idx] === 3 && speed > 50 && Math.random() < dt * 6) { c.vz = 20 + Math.random() * 15; c.z = 0.6; }
    if (c.z > 0 || c.vz > 0) {
      c.vz -= 380 * dt; c.z += c.vz * dt;
      if (c.z <= 0) {
        if (c.vz < -90) { burst(c.x, c.y, 10, T.def.dirt, 60); Net.rumble(c.i, 50); sfx("land"); }
        c.z = 0; c.vz = 0;
      }
    }

    // bordi della pista
    const lim = T.hw - P.r + 1;
    if (Math.abs(loc.lat) > lim) {
      const side = Math.sign(loc.lat), nx = -T.ty[c.idx] * side, ny = T.tx[c.idx] * side;
      const over = Math.abs(loc.lat) - lim;
      c.x -= nx * over; c.y -= ny * over;
      const vn = c.vx * nx + c.vy * ny;
      if (vn > 0) {
        c.vx -= 1.35 * vn * nx; c.vy -= 1.35 * vn * ny;
        // perde velocità in proporzione all'urto: strisciare lungo il bordo
        // (vn piccolo, a ogni passo) non deve frenare l'auto fino a fermarla
        const k = Math.max(0.6, 1 - vn / 250);
        c.vx *= k; c.vy *= k;
        if (vn > 45) { Net.rumble(c.i, Math.min(120, vn)); sfx("hit", vn); burst(c.x + nx * P.r, c.y + ny * P.r, 6, "#e8e0d0", 40); }
      }
    }

    // giri: il traguardo è l'indice 0
    const half = T.N / 2;
    if (prevIdx > half && c.idx < half && prevIdx - c.idx > half) {
      c.lap++;
      if (c.lap >= LAPS && !c.done) { c.done = true; c.time = raceTime; sfx("finish"); Net.rumble(c.i, 200); if (!finishedAt) finishedAt = raceTime; }
      else if (c.lap > 0) Net.rumble(c.i, 30);
    } else if (c.idx > half && prevIdx < half && c.idx - prevIdx > half) c.lap--;
    c.prog = progress(c);

    // segni e polvere
    if (!air) {
      const s = T.surf[c.idx];
      const slip = Math.abs(lat) > 28 || c.boost > 0 || s === 1;
      if (slip) mark(c, s === 1 ? "rgba(40,22,8,.35)" : "rgba(50,30,15,.16)");
      if (speed > 30 && Math.random() < dt * (s === 0 ? 10 : 25)) {
        const col = s === 1 ? "#4a2e17" : s === 2 ? "#a8d8f0" : T.def.dirt;
        part(c.x - fx * 8, c.y - fy * 8, -c.vx * 0.2 + rnd(25), -c.vy * 0.2 + rnd(25), col, 0.5 + Math.random() * 0.4, 1.5 + Math.random() * 2);
      }
      if (c.boost > 0) part(c.x - fx * 9, c.y - fy * 9, -fx * 60 + rnd(10), -fy * 60 + rnd(10), Math.random() < 0.5 ? "#ffd04a" : "#ff6a2a", 0.25, 2);
    }
  }

  function mark(c, col) {
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    skidG.fillStyle = col;
    for (const side of [-1, 1]) skidG.fillRect(c.x - fx * 5 - fy * 3.5 * side - 1, c.y - fy * 5 + fx * 3.5 * side - 1, 2, 2);
  }

  function collide() {
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a], B = cars[b];
      if (Math.abs(A.z - B.z) > 8) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), min = P.r * 2;
      if (d >= min || d === 0) continue;
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
      const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rel < 0) {
        const j = -rel * 0.8;
        A.vx -= nx * j; A.vy -= ny * j; B.vx += nx * j; B.vy += ny * j;
        if (-rel > 40) { sfx("bump", -rel); Net.rumble(A.i, 40); Net.rumble(B.i, 40); }
      }
    }
  }

  // ------------------------------------------------------------ nitro sulla pista
  function updatePickups(dt) {
    pickupTimer -= dt;
    if (pickupTimer <= 0 && pickups.length < 3) {
      pickupTimer = 4 + Math.random() * 4;
      for (let tries = 0; tries < 10; tries++) {
        const i = (Math.random() * T.N) | 0;
        if (T.surf[i] || T.jump[i] || i < 10 || i > T.N - 10) continue;
        const o = (Math.random() * 2 - 1) * T.hw * 0.6;
        pickups.push({ x: T.x[i] - T.ty[i] * o, y: T.y[i] + T.tx[i] * o, t: 0 });
        break;
      }
    }
    for (const p of pickups) p.t += dt;
    for (const c of cars) {
      if (c.z > 6) continue;
      for (let k = pickups.length - 1; k >= 0; k--) {
        const p = pickups[k];
        if (Math.hypot(p.x - c.x, p.y - c.y) < 10) { pickups.splice(k, 1); c.nitro = Math.min(9, c.nitro + 1); sfx("pick"); Net.rumble(c.i, 25); burst(p.x, p.y, 8, "#7fe0ff", 50); }
      }
    }
  }

  // ------------------------------------------------------------ particelle
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

  // ------------------------------------------------------------ disegno
  // auto.webp: 4 celle da 160 px, l'auto vista dall'alto col muso in basso; lunga ~20 px di gioco
  const CAR_SIZE = 21.5;
  function drawCar(c) {
    const lift = c.z;
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
      ctx.drawImage(ART.auto, c.i * CELL, 0, CELL, CELL, -CAR_SIZE / 2, -CAR_SIZE / 2, CAR_SIZE, CAR_SIZE);
    } else { ctx.fillStyle = c.color; ctx.fillRect(-9, -5.5, 18, 11); }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!bg) { ctx.fillStyle = "#1a120c"; ctx.fillRect(0, 0, cv.width, cv.height); return; }
    ctx.drawImage(bg, 0, 0); ctx.drawImage(skid, 0, 0);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    for (const p of pickups) {
      const bob = Math.sin(p.t * 6) * 1.2, glow = 0.35 + 0.2 * Math.sin(p.t * 8);
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, 4, 2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(127,224,255,${glow})`; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 7, 0, 7); ctx.fill();
      if (ART.nitro) ctx.drawImage(ART.nitro, p.x - 7, p.y - 7 + bob, 14, 14);
      else { ctx.fillStyle = "#1a6aa8"; ctx.fillRect(p.x - 3, p.y - 4 + bob, 6, 8); }
    }
    for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    for (const c of [...cars].sort((a, b) => a.z - b.z)) drawCar(c);
  }

  // ------------------------------------------------------------ audio (sintetizzato)
  let ac = null, engines = null;
  function audioOn() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    ac.master = master;
    engines = [0, 1, 2, 3].map(() => {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = "sawtooth"; o.frequency.value = 40; f.type = "lowpass"; f.frequency.value = 400; g.gain.value = 0;
      o.connect(f).connect(g).connect(master); o.start();
      return { o, g };
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
  function noise(dur, vol, freq) {
    if (!ac) return;
    const t = ac.currentTime, b = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = b; f.type = "bandpass"; f.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(ac.master); s.start(t);
  }
  let lastHit = 0;
  function sfx(name, v = 0) {
    if (!ac) return;
    if ((name === "hit" || name === "bump") && clock - lastHit < 0.08) return;
    if (name === "hit" || name === "bump") lastHit = clock;
    ({
      beep: () => tone(440, 0.18, "square", 0.12),
      go: () => tone(880, 0.4, "square", 0.14),
      nitro: () => noise(0.6, 0.25, 900),
      pick: () => { tone(660, 0.08, "square", 0.08); setTimeout(() => tone(990, 0.1, "square", 0.08), 70); },
      hit: () => noise(0.12, Math.min(0.3, v / 300), 300),
      bump: () => noise(0.1, Math.min(0.25, v / 300), 500),
      land: () => noise(0.15, 0.2, 200),
      finish: () => [523, 659, 784, 1046].forEach((f, k) => setTimeout(() => tone(f, 0.18, "square", 0.1), k * 110)),
    })[name]?.();
  }
  function engineSound() {
    if (!engines) return;
    for (let i = 0; i < 4; i++) {
      const c = cars[i], e = engines[i];
      const on = c && phase !== "lobby" && Net.human(i);
      const sp = c ? Math.hypot(c.vx, c.vy) : 0;
      e.g.gain.setTargetAtTime(on ? 0.035 + (c.boost > 0 ? 0.03 : 0) : 0, ac.currentTime, 0.1);
      e.o.frequency.setTargetAtTime(38 + sp * 0.55 + (c && c.z > 0 ? 25 : 0) + i * 3, ac.currentTime, 0.05);
    }
  }

  // ------------------------------------------------------------ interfaccia (DOM)
  const ui = { lobby: $("#lobby"), hud: $("#hud"), count: $("#count"), results: $("#results") };
  const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, "0")}`; };
  const ord = (n) => n + "°";

  function renderLobby() {
    $("#tname").textContent = TRACKS[trackNo].name;
    $("#tnum").textContent = `${trackNo + 1}/${TRACKS.length}`;
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

  // senza giocatore il posto ha il nome del suo pilota (net.js)
  const nameOf = (i) => Net.slots[i].name;

  let hudKey = "";
  function renderHud() {
    const rows = cars.map((c) => {
      const lap = Math.max(1, Math.min(LAPS, c.lap + 1));
      const bar = Array.from({ length: Math.max(5, c.nitro) }, (_, k) => `<i${k < c.nitro ? ' class="on"' : ""}></i>`).join("");
      return `<div class="p" style="--c:${c.color}"><b>${ord(c.place)}</b><span>${escape(nameOf(c.i))}</span>`
        + `<small>${c.done ? fmt(c.time) : `giro ${lap}/${LAPS}`}</small><em>nitro <u>${bar}</u></em></div>`;
    }).join("");
    if (rows !== hudKey) { ui.hud.innerHTML = rows; hudKey = rows; }
  }
  const escape = (s) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

  function renderResults() {
    const order = [...cars].sort((a, b) => a.place - b.place);
    const best = order[0];
    $("#rtitle").textContent = `Vince ${nameOf(best.i)}!`;
    $("#rwin").style.setProperty("--p", best.i); $("#rwin").style.setProperty("--c", best.color);
    $("#rlist").innerHTML = order.map((c) =>
      `<li style="--c:${c.color};--p:${c.i}"><b>${ord(c.place)}</b><i class="face"></i><span>${escape(nameOf(c.i))}</span><small>${c.done ? fmt(c.time) : "non arrivato"}</small></li>`).join("");
  }

  function show(name) {
    for (const [k, el] of Object.entries(ui)) el.hidden = !(k === name || (name === "race" && k === "hud") || (name === "count" && k === "hud"));
  }

  // ------------------------------------------------------------ flusso
  function toLobby() {
    phase = "lobby"; Net.setPhase("lobby");
    setupRace();
    show("lobby"); renderLobby();
  }
  function toCount() {
    phase = "count"; Net.setPhase("race");
    setupRace(); countdown = 3.999; raceTime = 0; finishedAt = 0;
    show("count"); sfx("beep");
  }
  function toResults() {
    phase = "results"; Net.setPhase("results");
    resultsTimer = 12;
    renderResults(); show("results");
  }

  function rank() {
    const order = [...cars].sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : a.done ? a.time - b.time : b.prog - a.prog));
    order.forEach((c, k) => (c.place = k + 1));
  }

  let hudTimer = 0;
  function phoneHud(dt) {
    hudTimer -= dt;
    if (hudTimer > 0) return;
    hudTimer = 0.25;
    for (const c of cars) {
      if (!Net.human(c.i)) continue;
      const text = phase === "lobby" ? `${TRACKS[trackNo].name} · premi START per partire`
        : phase === "results" ? `Arrivato ${ord(c.place)} · START per la prossima pista`
        : c.done ? `Arrivato ${ord(c.place)} · ${fmt(c.time)}`
        : `${ord(c.place)} · giro ${Math.max(1, c.lap + 1)}/${LAPS}`;
      Net.hud(c.i, text, c.nitro);
    }
  }

  function tick(dt) {
    Net.poll();
    clock += dt;
    if (phase === "lobby") {
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
      raceTime += dt;
      for (const c of cars) updateCar(c, Net.input(c.i) || aiInput(c), dt);
      collide();
      updatePickups(dt);
      rank();
      renderHud();
      const humans = cars.filter((c) => Net.human(c.i));
      const allDone = cars.every((c) => c.done) || (humans.length > 0 && humans.every((c) => c.done) && raceTime - finishedAt > 3);
      if (allDone || (finishedAt && raceTime - finishedAt > 15)) toResults();
    } else if (phase === "results") {
      resultsTimer -= dt;
      $("#rnext").textContent = `Prossima pista: ${TRACKS[(trackNo + 1) % TRACKS.length].name} — START per partire, o tra ${Math.ceil(resultsTimer)} s si torna alla sala d'attesa`;
      if (Net.start) { trackNo = (trackNo + 1) % TRACKS.length; toCount(); }
      else if (resultsTimer <= 0) { trackNo = (trackNo + 1) % TRACKS.length; toLobby(); }
    }
    updateParts(dt);
    phoneHud(dt);
    engineSound();
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
  window.Fango = { TRACKS, buildTrack, get cars() { return cars; }, get phase() { return phase; }, get track() { return T; }, start: () => toCount() };

  loadArt().then(() => { toLobby(); requestAnimationFrame(frame); });
})();
