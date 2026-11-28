// Fango — la gara senza disegno: piste, fisica, IA, giri e record.
// Gira uguale nel browser (window.FangoSim, caricato prima di game.js) e in Node
// (i test in test/). Il caso viene da un generatore col seme della gara: stesso
// seme, stessi comandi e stessi passi danno la stessa gara, al decimale.
// Chi la usa riceve eventi (urti, giri, record…) e ne ricava suoni, vibrazioni e
// particelle: qui dentro niente schermo, audio o rete.
(function (make) {
  if (typeof module === "object" && module.exports) module.exports = make();
  else window.FangoSim = make();
})(function () {
  "use strict";
  const LAPS = 3, CARS = 4;
  const STEP = 4;                        // passo della linea centrale ricampionata, in px
  const DT = 1 / 120;                    // passo della fisica

  // ------------------------------------------------------------ piste
  // pts: punti di controllo della linea centrale (chiusa, Catmull-Rom); w: larghezza.
  // Le zone sono frazioni della lunghezza del giro (0 = traguardo).
  // art, ground e dirt servono solo al disegno.
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

  // al contrario: stessi punti in ordine inverso (il traguardo resta su pts[0]) e zone
  // specchiate sulla lunghezza del giro. Catmull-Rom è simmetrica, la strada è la stessa.
  function trackDef(no, rev) {
    const d = TRACKS[no];
    if (!rev) return d;
    return { ...d, pts: [d.pts[0], ...d.pts.slice(1).reverse()],
      zones: d.zones.map((z) => (z.t === "jump" ? { t: z.t, f: 1 - z.f } : { t: z.t, a: 1 - z.b, b: 1 - z.a })) };
  }

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

  // generatore con seme (congruenziale lineare): numeri in [0, 1), sempre gli stessi per
  // lo stesso seme. Lo usa anche il disegno delle piste, per le decorazioni.
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // ------------------------------------------------------------ auto
  const P = { accel: 310, drag: 1.65, nitroAccel: 380, nitroTime: 1.3, turn: 4.2, grip: 9, r: 6.5, reverse: 70,
    steerIn: 8, steerOut: 14 };          // sterzo progressivo: da 0 a pieno in 1/8 s, al centro in 1/14 s
  const SURFACE = [
    { acc: 1, drag: 1, grip: 1 },            // terra
    { acc: 0.5, drag: 2.4, grip: 0.55 },     // fango
    { acc: 0.65, drag: 2.0, grip: 0.7 },     // acqua
    { acc: 0.9, drag: 1.2, grip: 0.8 },      // dossi
  ];
  const IDLE = { s: 0, g: 0, r: 0, n: 0 };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // Una gara su una pista. step(inputs, humans, dt) la manda avanti di un passo:
  //   inputs[i]  comandi { s, g, r, n } dell'auto i, oppure null → la guida il computer
  //   humans[i]  il posto è di un giocatore (anche se ora è scollegato): conta per la
  //              rimonta e per chiudere la gara; senza, vale «ha i comandi»
  // e restituisce gli eventi del passo, { type, i, … }:
  //   nitro, land {x, y}, splash {x, y, a, v} (entra in acqua: posizione, direzione, velocità),
  //   wall {x, y, v}, bump {j, v}, spin {x, y}, pick {x, y},
  //   unstick {x, y} (dove era incastrata), lap {n, t}, record {t}, finish
  // best è il record del giro da battere: lo battono solo i giri di chi guida davvero.
  function race({ track = 0, rev = false, seed = 1, best = Infinity } = {}) {
    const T = buildTrack(trackDef(track, rev)), R = rng(seed);
    let time = 0, finishedAt = 0, over = false, pickupTimer = 2;
    let ev = [], drive = [], human = [];
    const pickups = [];
    const progress = (c) => c.lap * T.L + c.idx * T.step;

    const cars = Array.from({ length: CARS }, (_, i) => {
      // griglia 2×2 dietro al traguardo
      const back = 3 + (i >> 1) * 6, j = (T.N - back) % T.N, o = (i & 1 ? 1 : -1) * T.hw * 0.42;
      const x = T.x[j] - T.ty[j] * o, y = T.y[j] + T.tx[j] * o;
      return {
        i, x, y, a: Math.atan2(T.ty[j], T.tx[j]), vx: 0, vy: 0, z: 0, vz: 0,
        idx: j, lap: -1, prog: 0, nitro: 3, boost: 0, nPrev: 0, done: false, time: 0, place: i + 1,
        ai: { off: (R() * 2 - 1) * 0.4, skill: 0.86 + i * 0.03 + R() * 0.04, look: 12 + (i % 2) * 3, ncd: 0, stuck: 0, back: 0 },
        bump: 0, steer: 0,
        maxLap: -1, lapT: 0, best: Infinity,          // giri cronometrati
        rubber: 1, behind: 0,                           // rimonta: moltiplica l'accelerazione
        spin: 0, spinV: 0, ghost: 0, chkProg: 0, chkT: 0,
        passT: new Float64Array(T.N).fill(NaN),         // quando è passata da ogni punto della pista: i distacchi
      };
    });
    for (const c of cars) c.prog = c.chkProg = progress(c);

    function aiInput(c, dt) {
      const look = (c.idx + c.ai.look) % T.N;
      const o = c.ai.off * T.hw;
      const tx = T.x[look] - T.ty[look] * o, ty = T.y[look] + T.tx[look] * o;
      let da = Math.atan2(ty - c.y, tx - c.x) - c.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const speed = Math.hypot(c.vx, c.vy);
      // curva stretta più avanti: si alza il piede
      const far = (c.idx + 28) % T.N, bend = Math.abs(Math.atan2(T.tx[c.idx] * T.ty[far] - T.ty[c.idx] * T.tx[far], T.tx[c.idx] * T.tx[far] + T.ty[c.idx] * T.ty[far]));
      const limit = (190 - bend * 75) * c.ai.skill * c.rubber;
      const straight = bend < 0.25 && Math.abs(da) < 0.2;
      // nitro con un motivo: un'auto poco davanti da passare, un distacco da recuperare,
      // o l'ultimo giro per non portarsi a casa le bombolette. Mai mentre si lascia rientrare il gruppo.
      c.ai.ncd -= dt;
      const target = cars.some((o) => o !== c && o.prog > c.prog && o.prog - c.prog < 50);
      const why = target || c.behind > 0.15 * T.L || c.lap === LAPS - 1;
      const nitro = straight && speed > 80 && c.nitro > 0 && c.boost <= 0 && c.ai.ncd <= 0 && c.rubber >= 1 && why;
      if (nitro) c.ai.ncd = 2.5;
      // incastrata contro il bordo: un po' di retromarcia sterzando al contrario
      if (speed < 8) c.ai.stuck += dt; else if (speed > 25) c.ai.stuck = 0;
      if (c.ai.stuck > 0.8) { c.ai.back = 0.7; c.ai.stuck = 0; }
      if (c.ai.back > 0) { c.ai.back -= dt; return { s: -Math.sign(da) || 1, g: 0, r: 1, n: 0 }; }
      return { s: Math.max(-1, Math.min(1, da * 3)), g: speed < limit && Math.abs(da) < 1.2 ? 1 : 0, r: 0, n: nitro ? 1 : 0 };
    }

    // rimonta soft: chi guida ed è staccato accelera fino al 14% in più; l'IA molto
    // davanti al primo dei giocatori rallenta fino al 12%. Senza giocatori, nulla cambia.
    function rubberBand() {
      const lead = Math.max(...cars.map((c) => c.prog));
      const humans = cars.filter((c) => human[c.i] && !c.done);
      const top = humans.length ? Math.max(...humans.map((c) => c.prog)) : null;
      for (const c of cars) {
        c.behind = lead - c.prog; c.rubber = 1;
        if (c.done) continue;
        if (human[c.i]) c.rubber = 1 + 0.14 * clamp01((c.behind - 0.05 * T.L) / (0.4 * T.L));
        else if (top !== null) c.rubber = 1 - 0.12 * clamp01((c.prog - top - 0.1 * T.L) / (0.4 * T.L));
      }
    }

    function lapDone(c, n, t) {
      c.best = Math.min(c.best, t);
      ev.push({ type: "lap", i: c.i, n, t });
      // record: solo chi guida davvero in questo momento, non il computer
      if (!drive[c.i] || t < 3 || t >= best) return;
      best = t;
      ev.push({ type: "record", i: c.i, t });
    }

    function updateCar(c, inp, dt) {
      c.ghost = Math.max(0, c.ghost - dt);
      // testacoda dopo un urto di fianco: l'auto gira su sé stessa e non risponde ai comandi
      const spin = c.spin > 0;
      if (spin) { c.spin -= dt; c.a += c.spinV * dt; c.spinV *= Math.exp(-2.5 * dt); }
      if (c.done || spin) inp = IDLE;
      const sf = SURFACE[T.surf[c.idx]];
      const air = c.z > 0.5;
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      let fwd = c.vx * fx + c.vy * fy, lat = -c.vx * fy + c.vy * fx;
      const speed = Math.hypot(c.vx, c.vy);

      // nitro: un colpo per pressione
      if (inp.n && !c.nPrev && c.nitro > 0 && c.boost <= 0 && !c.done) { c.nitro--; c.boost = P.nitroTime; ev.push({ type: "nitro", i: c.i }); }
      c.nPrev = inp.n;
      c.boost = Math.max(0, c.boost - dt);

      // lo sterzo segue il comando a velocità limitata: tasti e tastiera danno solo
      // -1/0/1 e senza rampa ogni tocco era uno scarto secco. Tornare verso il
      // centro è più rapido che sterzare, così le correzioni restano pronte.
      const want = inp.s, back = Math.abs(want) < Math.abs(c.steer) || want * c.steer < 0;
      const rate = (back ? P.steerOut : P.steerIn) * dt;
      c.steer += Math.max(-rate, Math.min(rate, want - c.steer));
      const turnScale = Math.min(1, 0.4 + Math.abs(fwd) / 80) * (air ? 0.35 : 1);
      c.a += c.steer * P.turn * turnScale * dt * (fwd < -5 ? -1 : 1);

      if (!air) {
        let acc = inp.g ? P.accel * sf.acc * c.rubber : 0;
        // retromarcia: prima frena, poi va indietro piano
        if (inp.r && !inp.g) acc = fwd > 10 ? -P.accel * 1.6 : fwd > -P.reverse ? -P.accel * 0.55 * sf.acc : 0;
        if (c.boost > 0) acc += P.nitroAccel;
        if (!inp.g && !inp.r && c.boost <= 0) fwd *= Math.exp(-1.2 * dt);   // freno motore
        fwd += acc * dt;
        fwd *= Math.exp(-P.drag * sf.drag * dt);
        lat *= Math.exp(-P.grip * sf.grip * (spin ? 0.15 : 1) * dt);
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
      if (!air && T.surf[c.idx] === 3 && speed > 50 && R() < dt * 6) { c.vz = 20 + R() * 15; c.z = 0.6; }
      if (c.z > 0 || c.vz > 0) {
        c.vz -= 380 * dt; c.z += c.vz * dt;
        if (c.z <= 0) {
          if (c.vz < -90) ev.push({ type: "land", i: c.i, x: c.x, y: c.y });
          c.z = 0; c.vz = 0;
        }
      }
      // l'acqua schizza quando un'auto ci entra, o ci atterra, abbastanza veloce
      if (T.surf[c.idx] === 2 && c.z <= 0 && (air || T.surf[prevIdx] !== 2) && speed > 30)
        ev.push({ type: "splash", i: c.i, x: c.x, y: c.y, a: c.a, v: speed });

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
          if (vn > 45) ev.push({ type: "wall", i: c.i, x: c.x + nx * P.r, y: c.y + ny * P.r, v: vn });
        }
      }

      // giri: il traguardo è l'indice 0
      const half = T.N / 2;
      if (prevIdx > half && c.idx < half && prevIdx - c.idx > half) {
        c.lap++;
        // un giro conta solo la prima volta: tornare indietro sul traguardo e ripassarlo no
        if (c.lap > c.maxLap) { if (c.lap > 0 && c.lap <= LAPS) lapDone(c, c.lap, time - c.lapT); c.maxLap = c.lap; c.lapT = time; }
        if (c.lap >= LAPS && !c.done) { c.done = true; c.time = time; ev.push({ type: "finish", i: c.i }); if (!finishedAt) finishedAt = time; }
      } else if (c.idx > half && prevIdx < half && c.idx - prevIdx > half) c.lap--;
      c.prog = progress(c);
      c.passT[c.idx] = time;                  // anche col nitro si fanno meno di STEP px per passo: nessun punto saltato
    }

    function collide() {
      for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
        const A = cars[a], B = cars[b];
        if (Math.abs(A.z - B.z) > 8 || A.ghost > 0 || B.ghost > 0) continue;
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), min = P.r * 2;
        if (d >= min || d === 0) continue;
        const nx = dx / d, ny = dy / d, push = (min - d) / 2;
        A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
        const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        if (rel < 0) {
          const j = -rel * 0.8;
          A.vx -= nx * j; A.vy -= ny * j; B.vx += nx * j; B.vy += ny * j;
          if (-rel > 40) ev.push({ type: "bump", i: A.i, j: B.i, v: -rel });
          // colpita forte di fianco: testacoda breve. Chi colpisce di muso non gira.
          if (-rel > 70) for (const [X, s] of [[A, 1], [B, -1]]) {
            const fx = Math.cos(X.a), fy = Math.sin(X.a), ux = nx * s, uy = ny * s;   // u: dall'auto verso l'altra
            const side = -ux * fy + uy * fx, front = ux * fx + uy * fy;
            if (Math.abs(side) < 0.75 || X.spin > 0 || X.z > 1) continue;
            X.spin = 0.55; X.spinV = (front >= 0 ? -1 : 1) * Math.sign(side) * Math.min(12, 6 + (-rel - 70) / 15);
            ev.push({ type: "spin", i: X.i, x: X.x + ux * P.r, y: X.y + uy * P.r });
          }
        }
      }
    }

    // incastrata: 4 s senza avanzare e quasi ferma → di nuovo in mezzo alla strada, un po'
    // più indietro su terra buona e libera, e per un attimo attraversabile dalle altre.
    // Non si torna mai oltre il traguardo, così il conto dei giri non cambia.
    function unstick(c) {
      if (c.done || c.z > 0) return;
      if (c.prog > c.chkProg + 24) { c.chkProg = c.prog; c.chkT = time; return; }
      if (time - c.chkT < 4 || Math.hypot(c.vx, c.vy) > 25) return;
      const busy = (j) => cars.some((o) => o !== c && Math.hypot(o.x - T.x[j], o.y - T.y[j]) < 16);
      let j = c.idx;
      for (let k = 0; k < 40 && j > 0 && (T.surf[j] || T.jump[j] || busy(j)); k++) j--;
      ev.push({ type: "unstick", i: c.i, x: c.x, y: c.y });
      Object.assign(c, { x: T.x[j], y: T.y[j], a: Math.atan2(T.ty[j], T.tx[j]), vx: 0, vy: 0, steer: 0, spin: 0, idx: j, ghost: 1.5 });
      c.prog = c.chkProg = progress(c); c.chkT = time; c.ai.stuck = c.ai.back = 0;
    }

    // nitro sulla pista: fino a 3 bombolette, una ogni 4–8 s, mai su fango, acqua, salti o traguardo
    function updatePickups(dt) {
      pickupTimer -= dt;
      if (pickupTimer <= 0 && pickups.length < 3) {
        pickupTimer = 4 + R() * 4;
        for (let tries = 0; tries < 10; tries++) {
          const i = (R() * T.N) | 0;
          if (T.surf[i] || T.jump[i] || i < 10 || i > T.N - 10) continue;
          const o = (R() * 2 - 1) * T.hw * 0.6;
          pickups.push({ x: T.x[i] - T.ty[i] * o, y: T.y[i] + T.tx[i] * o, t: 0 });
          break;
        }
      }
      for (const p of pickups) p.t += dt;
      for (const c of cars) {
        if (c.z > 6) continue;
        for (let k = pickups.length - 1; k >= 0; k--) {
          const p = pickups[k];
          if (Math.hypot(p.x - c.x, p.y - c.y) < 10) { pickups.splice(k, 1); c.nitro = Math.min(9, c.nitro + 1); ev.push({ type: "pick", i: c.i, x: p.x, y: p.y }); }
        }
      }
    }

    function rank() {
      const order = [...cars].sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : a.done ? a.time - b.time : b.prog - a.prog));
      order.forEach((c, k) => (c.place = k + 1));
    }

    function step(inputs = [], humans = cars.map((c) => !!inputs[c.i]), dt = DT) {
      ev = []; drive = inputs; human = humans;
      time += dt;
      rubberBand();
      for (const c of cars) updateCar(c, inputs[c.i] || aiInput(c, dt), dt);
      collide();
      for (const c of cars) unstick(c);
      updatePickups(dt);
      rank();
      // finita: tutti arrivati, o i giocatori arrivati da 3 s, o 15 s dopo il primo
      const hs = cars.filter((c) => human[c.i]);
      over = cars.every((c) => c.done) || (hs.length > 0 && hs.every((c) => c.done) && time - finishedAt > 3)
        || (finishedAt > 0 && time - finishedAt > 15);
      return ev;
    }

    return {
      T, track, rev, seed, cars, pickups, step,
      ai: (i, dt = DT) => aiInput(cars[i], dt),      // i comandi che darebbe il computer: per i test
      get time() { return time; },
      get over() { return over; },
      get best() { return best; },
    };
  }

  return { LAPS, CARS, STEP, DT, TRACKS, trackDef, buildTrack, locate, rng, race };
});
