# Fango

Corse fuoristrada viste dall'alto, una pista per schermata, fino a 4 giocatori
sulla stessa TV. Ognuno guida col proprio telefono: nessuna app da installare,
basta inquadrare il QR. I posti vuoti li guida il computer.

- 4 piloti, ognuno con la sua auto: Rocco (rossa), Nina (blu), Bruno (gialla), Tina (verde);
  chi entra dal telefono guida l'auto del posto che gli tocca, col proprio nome
- 3 piste (Cava Rossa, Palude Vecchia, Dune Alte), 3 giri ciascuna
- coppa sulle 3 piste in fila: 10, 6, 3 e 1 punti per piazzamento, a pari punti
  conta l'ultima gara; tornando alla sala d'attesa la coppa ricomincia
- salti, fango, acqua e dossi che cambiano aderenza e velocità
- le auto si sporcano passando nel fango e l'acqua ne lava via una parte: si vede
  chi ha preso la strada peggiore
- nitro: 3 a testa, altre bombolette compaiono sulla pista
- urti tra auto, vibrazione sul telefono a urti, atterraggi e traguardo; chi viene
  colpito forte di fianco fa un breve testacoda
- una coppa sì e una no le piste si corrono al contrario
- record del giro per pista e verso, salvati sulla TV col nome di chi l'ha fatto
  (contano solo i giri di chi guida davvero, non del computer)
- rimonta soft: chi guida ed è staccato accelera un po' di più, il computer molto
  davanti al primo giocatore rallenta; il computer usa il nitro per sorpassare,
  rimontare o nell'ultimo giro
- un'auto incastrata per 4 s torna in mezzo alla pista, poco più indietro
- pausa in gara: START (sul telefono diventa PAUSA) o Esc sulla TV
- in gara il telefono mostra in grande posizione, distacco e giro

## Giocare

Online: apri **<https://dslv-tech.github.io/fango/>** sul browser della TV (o di
un computer collegato alla TV) e segui i passi 2 e 3. Per provarlo in locale:

1. Apri `index.html` sulla TV (browser della smart TV, o un computer collegato
   alla TV). I telefoni devono raggiungere quella pagina, quindi niente
   `localhost`: servila sulla rete e aprila dall'indirizzo del computer.

   ```bash
   python3 -m http.server 4410 --bind 0.0.0.0
   ```

   poi sulla TV `http://<IP del computer>:4410` (su macOS l'IP è
   `ipconfig getifaddr en0`).
2. Ogni giocatore inquadra il QR, scrive il nome e preme **Entra**.
3. **START** su un telefono (o Invio sulla TV) fa partire la gara.

| | Telefono | Tastiera TV (G1 / G2) | Gamepad |
|---|---|---|---|
| Sterzo | ◀ ▶ (il pollice scorre tra i due), o **INCLINA** e si gira il telefono come un volante | ← → / A D | levetta o croce |
| Avanti | ▲ AVANTI | ↑ / W | A o RT |
| Retromarcia (prima frena) | ▼ RETRO | ↓ / S | B o LT |
| Nitro | NITRO | Shift destro / Q | X o RB |
| Partenza / pausa | START | Invio (pausa anche Esc) | Start |

Serve Internet: il server pubblico di PeerJS presenta i telefoni alla TV, poi i
comandi viaggiano diretti (WebRTC). Chi si scollega a metà gara ritrova la sua
auto ricollegandosi; nel frattempo la guida il computer.

## File

- `index.html`, `game.js` — la TV: disegno, suoni, interfaccia e flusso della coppa
- `sim.js` — la gara senza disegno: piste, fisica, IA, giri e record. Il caso viene dal seme
  della gara, quindi stesso seme e stessi comandi danno la stessa gara
- `test/` — i test della gara, in Node (20 o più): `node --test`
- `net.js` — telefoni (PeerJS), tastiera e gamepad → 4 posti; il protocollo è
  descritto in cima al file
- `pad.html`, `pad.js` — il volante sul telefono
- `vendor/` — PeerJS 1.5.5 e il generatore di QR (MIT), presi da Codalume
- `design/` — i bozzetti di Gemini (logo, auto, piloti, piste, TV, telefono): sono il
  riferimento della grafica, il gioco li segue
- `img/` — gli asset disegnati da Gemini e scontornati: `auto.webp` e `piloti.webp`
  (4 celle, nell'ordine dei posti), `*-oggetti.webp` (8 celle da 160 px),
  `*-terreno.webp` e `*-strada.webp` (texture ripetute), `fango.webp` e
  `pozzanghere.webp` (6 celle da 200 px, nei tratti di fango e d'acqua), `schizzi.webp`
  (8 celle da 160 px, il fango che sporca le auto), `logo`, `nitro`, `volante`
