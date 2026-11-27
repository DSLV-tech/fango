# Fango

Corse fuoristrada viste dall'alto, una pista per schermata, fino a 4 giocatori
sulla stessa TV. Ognuno guida col proprio telefono: nessuna app da installare,
basta inquadrare il QR. I posti vuoti li guida il computer.

- 3 piste (Cava Rossa, Palude Vecchia, Dune Alte), 3 giri ciascuna
- salti, fango, acqua e dossi che cambiano aderenza e velocità
- nitro: 3 a testa, altre bombolette compaiono sulla pista
- urti tra auto, vibrazione sul telefono a urti, atterraggi e traguardo

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
| Sterzo | ◀ ▶ (il pollice scorre tra i due) | ← → / A D | levetta o croce |
| Avanti | ▲ AVANTI | ↑ / W | A o RT |
| Retromarcia (prima frena) | ▼ RETRO | ↓ / S | B o LT |
| Nitro | NITRO | Shift destro / Q | X o RB |
| Partenza | START | Invio | Start |

Serve Internet: il server pubblico di PeerJS presenta i telefoni alla TV, poi i
comandi viaggiano diretti (WebRTC). Chi si scollega a metà gara ritrova la sua
auto ricollegandosi; nel frattempo la guida il computer.

## File

- `index.html`, `game.js` — la TV: piste, fisica, IA, disegno, gara
- `net.js` — telefoni (PeerJS), tastiera e gamepad → 4 posti; il protocollo è
  descritto in cima al file
- `pad.html`, `pad.js` — il volante sul telefono
- `vendor/` — PeerJS 1.5.5 e il generatore di QR (MIT), presi da Codalume
