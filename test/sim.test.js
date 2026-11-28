// Test della gara senza disegno: node --test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../sim.js");
const { LAPS, TRACKS } = Sim;

const IDLE = { s: 0, g: 0, r: 0, n: 0 };
const EVERY_TRACK = [false, true].flatMap((rev) => TRACKS.map((_, track) => ({ track, rev })));
const label = ({ track, rev }) => TRACKS[track].name + (rev ? " al contrario" : "");

// manda avanti la gara finché finisce (o fino a limit secondi) e raccoglie gli eventi
function run(r, inputs = () => [], humans = () => undefined, limit = 300) {
  const events = [];
  while (!r.over && r.time < limit) for (const e of r.step(inputs(r), humans(r))) events.push({ ...e, at: r.time });
  return events;
}
const ofType = (events, type, i) => events.filter((e) => e.type === type && (i === undefined || e.i === i));

// mette l'auto ferma sulla linea centrale, all'indice k, e la rende attraversabile
function placeOn(r, c, k) {
  Object.assign(c, { x: r.T.x[k], y: r.T.y[k], vx: 0, vy: 0, ghost: 10 });
}

test("stesso seme, stessa gara; seme diverso, gara diversa", () => {
  const snapshot = (seed) => {
    const r = Sim.race({ track: 1, seed });
    const events = run(r);
    return { events, cars: r.cars.map(({ x, y, a, time, place, best }) => ({ x, y, a, time, place, best })) };
  };
  assert.deepEqual(snapshot(7), snapshot(7));
  assert.notDeepEqual(snapshot(7).cars, snapshot(4000000007).cars);
});

for (const where of EVERY_TRACK) {
  test(`il computer corre i ${LAPS} giri su ${label(where)}`, () => {
    const r = Sim.race({ ...where, seed: 2024 });
    const events = run(r);
    assert.ok(r.over, "la gara finisce");
    for (const c of r.cars) {
      const laps = ofType(events, "lap", c.i);
      assert.ok(c.done, `l'auto ${c.i} arriva`);
      assert.deepEqual(laps.map((e) => e.n), [1, 2, 3], `l'auto ${c.i} conta i giri in ordine`);
      assert.equal(ofType(events, "finish", c.i).length, 1);
      // i tre giri sono tutto il tempo di gara, meno la rincorsa dalla griglia al traguardo
      const sum = laps.reduce((s, e) => s + e.t, 0);
      assert.ok(sum <= c.time && sum > c.time - 1, `giri ${sum.toFixed(2)} s su ${c.time.toFixed(2)} s di gara`);
      assert.equal(c.best, Math.min(...laps.map((e) => e.t)));
    }
    const byTime = [...r.cars].sort((a, b) => a.time - b.time).map((c) => c.place);
    assert.deepEqual(byTime, [1, 2, 3, 4], "la classifica segue i tempi");
  });
}

test("tornare indietro sul traguardo e ripassarlo non regala giri", () => {
  const r = Sim.race({ track: 0, seed: 1 });
  const { N } = r.T, c = r.cars[0], events = [];
  let k = c.idx;
  const go = (steps, dir) => {
    for (let n = 0; n < steps; n++) {
      k = (k + dir + N) % N; placeOn(r, c, k);
      for (const e of r.step([IDLE])) events.push(e);
    }
  };
  go(N - k + 10, 1);                     // dalla griglia oltre il traguardo: si parte, giro 0
  assert.equal(c.lap, 0);
  go(N, 1);                              // primo giro
  assert.equal(c.lap, 1);
  go(20, -1);                            // indietro oltre il traguardo…
  assert.equal(c.lap, 0);
  go(20, 1);                             // …e di nuovo avanti: lo stesso giro, non uno nuovo
  assert.equal(c.lap, 1);
  assert.deepEqual(ofType(events, "lap", 0).map((e) => e.n), [1]);
  go(N, 1); go(N, 1);                    // secondo e terzo giro
  const laps = ofType(events, "lap", 0);
  assert.deepEqual(laps.map((e) => e.n), [1, 2, 3]);
  assert.ok(c.done && c.lap === LAPS);
  assert.equal(ofType(events, "finish", 0).length, 1);
  // il secondo giro contiene la marcia indietro: il cronometro non è ripartito al secondo passaggio
  assert.ok(laps[1].t > laps[2].t + 0.3, `secondo giro ${laps[1].t.toFixed(2)} s, terzo ${laps[2].t.toFixed(2)} s`);
});

test("un'auto ferma da 4 s torna in mezzo alla strada, più indietro e su terra buona", () => {
  const r = Sim.race({ track: 0, seed: 1 });
  const T = r.T, c = r.cars[0];
  const mud = T.surf.indexOf(1) + 6;
  assert.equal(T.surf[mud], 1, "parte nel fango");
  // nel fango, schiacciata contro il bordo, già al primo giro
  const o = T.hw * 0.8;
  Object.assign(c, { x: T.x[mud] - T.ty[mud] * o, y: T.y[mud] + T.tx[mud] * o, idx: mud, lap: 0, maxLap: 0 });
  const t0 = r.time;
  let moved = null;
  while (!moved && r.time < 6) moved = r.step([IDLE]).find((e) => e.type === "unstick" && e.i === 0);
  assert.ok(moved, "viene rimessa in pista");
  const waited = r.time - t0;
  assert.ok(waited >= 4 && waited < 4.1, `dopo ${waited.toFixed(2)} s`);
  assert.ok(c.idx <= mud && c.idx >= mud - 40, "poco più indietro, mai avanti");
  assert.equal(T.surf[c.idx], 0, "su terra");
  assert.equal(T.jump[c.idx], 0, "non su un salto");
  assert.equal(Sim.locate(T, c.x, c.y, c.idx).lat, 0, "in mezzo alla strada");
  assert.ok(c.ghost > 0, "per un attimo attraversabile");
  assert.equal(c.lap, 0, "il conto dei giri non cambia");
});

test("rimessa in pista subito dopo il traguardo, non torna mai dietro la linea", () => {
  const r = Sim.race({ track: 0, seed: 1 });
  const T = r.T, [c, d] = r.cars, o = T.hw * 0.8;
  // d è ferma in mezzo alla strada sul traguardo: i punti dietro a c sono tutti occupati.
  // Entrambe attraversabili, così le altre auto che partono non le spostano.
  Object.assign(d, { x: T.x[1], y: T.y[1], idx: 1, lap: 1, maxLap: 1, ghost: 10 });
  Object.assign(c, { x: T.x[3] - T.ty[3] * o, y: T.y[3] + T.tx[3] * o, idx: 3, lap: 1, maxLap: 1, ghost: 10 });
  let moved = null;
  while (!moved && r.time < 6) moved = r.step([IDLE, IDLE]).find((e) => e.type === "unstick" && e.i === 0);
  assert.ok(moved, "viene rimessa in pista");
  assert.ok(c.idx >= 0 && c.idx <= 3, `indice ${c.idx}: tra il traguardo e dov'era`);
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), "su un punto vero della pista");
  assert.equal(c.lap, 1);
});

test("l'acqua schizza quando un'auto ci entra: dentro le pozze, al più una volta per pozza a giro", () => {
  for (const [track, def] of TRACKS.entries()) {
    const r = Sim.race({ track, seed: 3 });
    const events = run(r), pools = def.zones.filter((z) => z.t === "water").length;
    for (const c of r.cars) {
      const splashes = ofType(events, "splash", c.i);
      assert.ok(splashes.length <= pools * LAPS, `${def.name}, auto ${c.i}: ${splashes.length} schizzi`);
      if (pools) assert.ok(splashes.length >= LAPS, `${def.name}, auto ${c.i}: almeno una volta a giro`);
      for (const e of splashes) {
        assert.equal(r.T.surf[Sim.locate(r.T, e.x, e.y, 0, true).i], 2, "nell'acqua");
        assert.ok(e.v > 30);
      }
    }
  }
});

test("il record del giro lo batte solo chi guida davvero", async (t) => {
  await t.test("solo computer: nessun record", () => {
    const events = run(Sim.race({ track: 2, seed: 5 }));
    assert.ok(ofType(events, "lap").length > 0);
    assert.equal(ofType(events, "record").length, 0);
  });
  await t.test("un giocatore: i record sono suoi e sempre migliori", () => {
    const r = Sim.race({ track: 2, seed: 5 });
    const events = run(r, (r) => [r.ai(0)]);     // il giocatore 0 guida come il computer
    const recs = ofType(events, "record");
    assert.ok(recs.length > 0);
    assert.ok(recs.every((e) => e.i === 0), "nessun record al computer");
    for (let k = 1; k < recs.length; k++) assert.ok(recs[k].t < recs[k - 1].t);
    assert.equal(r.best, r.cars[0].best);
  });
  await t.test("un giocatore scollegato: guida il computer, niente record", () => {
    const events = run(Sim.race({ track: 2, seed: 5 }), () => [], () => [true, false, false, false]);
    assert.equal(ofType(events, "record").length, 0);
  });
  await t.test("un record già migliore non si batte con un giro più lento", () => {
    const r = Sim.race({ track: 2, seed: 5, best: 5 });
    const events = run(r, (r) => [r.ai(0)]);
    assert.ok(ofType(events, "lap", 0).every((e) => e.t > 5));
    assert.equal(ofType(events, "record").length, 0);
    assert.equal(r.best, 5);
  });
});

for (const [no, def] of TRACKS.entries()) {
  test(`${def.name} al contrario: stessa strada, zone negli stessi punti`, () => {
    const F = Sim.buildTrack(Sim.trackDef(no, false)), R = Sim.buildTrack(Sim.trackDef(no, true));
    assert.equal(R.N, F.N);
    assert.ok(Math.abs(R.L - F.L) < 0.5, "stessa lunghezza");
    assert.deepEqual([R.x[0], R.y[0]], [F.x[0], F.y[0]], "stesso traguardo");
    assert.ok(F.tx[0] * R.tx[0] + F.ty[0] * R.ty[0] < -0.99, "verso opposto");
    const near = (i) => Sim.locate(R, F.x[i], F.y[i], 0, true);
    for (let i = 0; i < F.N; i++) {
      assert.ok(Math.abs(near(i).lat) < 0.5, `la strada passa dagli stessi punti (${i})`);
      // dentro a una zona (lontano dai suoi bordi) la superficie è la stessa nei due versi
      const s = F.surf[i];
      if ([-2, -1, 1, 2].every((d) => F.surf[(i + d + F.N) % F.N] === s)) assert.equal(R.surf[near(i).i], s, `superficie al punto ${i}`);
    }
    // le rampe dei salti: stesse, al più un paio di punti più in là
    const ramps = (T) => [...T.jump.keys()].filter((i) => T.jump[i]);
    assert.equal(ramps(R).length, ramps(F).length);
    for (const i of ramps(R)) {
      const d = Math.min(...ramps(F).map((j) => Math.hypot(R.x[i] - F.x[j], R.y[i] - F.y[j])));
      assert.ok(d <= 3 * Sim.STEP + 0.5, `salto al punto ${i}: ${d.toFixed(1)} px dal salto dritto`);
    }
  });
}
