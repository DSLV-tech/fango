# Fango — possibili migliorie

Elenco ricavato dal codice attuale (commit `4cd2d29`). Ogni voce ha una stima:
**impatto** (quanto si nota giocando) e **sforzo** (S = qualche ora, M = una giornata, L = di più).
Per la grafica vale la regola del progetto: gli asset nuovi li disegna Gemini, il codice li segue.

---

## 1. Estetica — in pista

### Auto
- **Ombra vera dell'auto.** Oggi è un rettangolo arrotondato (`drawCar` in game.js). Un'ombra
  ricavata dallo sprite (silhouette scurita e sfocata, calcolata una volta) è molto più credibile,
  soprattutto nei salti. *Medio · S*
- **Rollio e beccheggio finti.** Leggera deformazione dello sprite in curva e in frenata
  (scala 0,97 sull'asse laterale, spostamento di 1 px): dà peso alle auto. *Medio · S*
- **Fiamma del nitro disegnata da Gemini.** Oggi sono due triangoli in codice. Un foglio di 3–4
  frame animati. *Medio · S (+ asset)*
- **Testacoda leggibile.** Durante lo `spin` aggiungere stelline o un cerchio di polvere attorno
  all'auto e un suono di sgommata: oggi si vede solo l'auto che ruota. *Medio · S*
- **Ripartenza con un gancio.** Quando un'auto incastrata viene rimessa in pista (`unstick`),
  un'animazione breve (gru, elicottero o una mano dall'alto, da Gemini) invece del lampeggio. *Basso · M*

### Superfici ed effetti
- **Particelle tonde o a sprite.** Ora sono quadratini (`fillRect`). Gocce per l'acqua, zolle per
  il fango, sbuffi morbidi per la polvere. *Medio · S*
- **Segni delle gomme che sbiadiscono.** Il foglio `skid` accumula per sempre: dopo tre giri il
  fango è tutto nero. Dissolvenza lenta (un rettangolo semitrasparente del colore della strada ogni
  pochi secondi) oppure un limite di segni. *Medio · S*
- **Atterraggi più forti.** Dopo un salto: breve scossa dello schermo (2–3 px, disattivata con
  `prefers-reduced-motion`) e anello di polvere. *Medio · S*
- **Bombolette che compaiono.** Oggi spuntano già piene; un'apparizione con scala da 0 e un lampo.
  *Basso · S*
- **Luce e atmosfera per pista.** Velo caldo sulla Cava, nebbiolina che scorre sulla Palude, vento
  di sabbia sulle Dune: uno strato animato sopra lo sfondo. *Medio · M*
- **Meteo e ora del giorno.** Pioggia (meno aderenza, pozze più larghe) o notte coi fari: varianti
  che moltiplicano le piste senza ridisegnarle. *Alto · L*

### Piste
- **Ostacoli che cambiano a ogni giro** (rimasto dalla lista precedente): pozze che si allargano,
  un tronco che cade nella palude, una duna che si sposta. *Alto · M*
- **Più piste.** Il formato `TRACKS` rende facile aggiungerne: servono i punti della linea centrale,
  le zone e i tre fogli di Gemini (terreno, strada, oggetti). *Alto · M per pista*
- **Anteprima della pista nella sala d'attesa**, con l'indicazione del verso (dritto / al contrario).
  *Medio · S*

---

## 2. Estetica — interfaccia TV

- **Semaforo di partenza** disegnato da Gemini al posto del 3-2-1 di solo testo. *Medio · S*
- **«ULTIMO GIRO!»** a tutto schermo per un secondo quando il primo entra nell'ultimo giro. *Alto · S*
- **Cambi di posizione.** Freccia verde o rossa per un attimo sul riquadro del giocatore che
  sorpassa o viene sorpassato. *Medio · S*
- **Avviso «contromano»** quando un'auto va nel verso sbagliato per più di un secondo (utile ora che
  ci sono le piste al contrario). *Medio · S*
- **Podio nei risultati.** Le tre auto sul podio, coriandoli, la coppa disegnata da Gemini a fine
  coppa. *Alto · M*
- **Transizioni tra le schermate.** Oggi `show()` accende e spegne di colpo; una dissolvenza di
  200 ms (no motion se `prefers-reduced-motion`). *Basso · S*
- **Classifica dei record più ricca.** I primi 3 tempi per pista invece del solo migliore, così
  anche chi non batte il record entra in classifica. *Medio · S*
- **Daltonismo.** Rosso e verde (Rocco e Tina) si confondono. Aggiungere il numero o il ritratto del
  pilota sopra l'auto, o un disegno diverso sul tetto. *Medio · S*

## 3. Estetica — telefono

- **Bozzetto di Gemini per la schermata di gara.** La colonna centrale con posizione e distacco è
  solo tipografica: farla ridisegnare e seguirla. *Medio · S*
- **Colore dell'auto più presente.** Sfondo del telefono tinto col colore del pilota, così ognuno
  riconosce il suo telefono sul divano. *Basso · S*
- **Vibrazioni con un carattere.** Schemi diversi per urto, atterraggio, nitro, record (oggi cambia
  solo la durata). *Medio · S*
- **Schermata dei risultati sul telefono**: piazzamento, punti della coppa e giro migliore in grande,
  invece della riga di testo. *Medio · S*

## 4. Audio

- **Motore campionato** al posto dell'oscillatore a dente di sega, con un suono diverso per ogni
  auto. *Alto · M*
- **Musica** per sala d'attesa e gara, con volume regolabile. *Medio · M*
- **Motori del computer udibili piano.** Ora suonano solo le auto dei giocatori (`engineSound`),
  quindi in solitario la pista è muta. *Basso · S*

---

## 5. Gioco

- **Fantasma del record.** L'auto trasparente che rifà il giro del record: è l'obiettivo più chiaro
  possibile per chi arriva ultimo. Richiede di registrare posizione e angolo a ogni passo del giro
  migliore (≈ 2400 campioni per 20 s, piccoli). *Alto · M*
- **Griglia di partenza a rotazione.** I posti 0 e 1 partono sempre in prima fila
  (game.js:315). Dalla seconda gara della coppa, schierare al contrario rispetto alla classifica.
  *Medio · S*
- **I record e la rimonta.** La rimonta dà fino al 14% di accelerazione: un record fatto da ultimo
  è aiutato. Si può spegnerla nel giro in corso per chi è vicino al record, oppure segnare il record
  come «assistito». *Basso · S*
- **Impostazioni nella sala d'attesa** scelte dal telefono: numero di giri, bravura del computer,
  rimonta sì/no, verso della pista. *Medio · M*
- **Pausa automatica** quando un telefono si scollega a metà gara. *Medio · S*
- **IA che evita le altre auto** invece di seguire solo la linea centrale con un offset fisso: un
  sorpasso vero (si sposta di lato se c'è qualcuno davanti). *Medio · M*
- **Modalità a tempo** per giocare da soli: tre giri contro il fantasma, senza avversari. *Medio · S*

---

## 6. Tecnica

### Struttura del codice
- **Dividere `game.js`** (~570 righe in un'unica funzione; la gara è già a parte in `sim.js`) in
  moduli: disegno della pista, disegno in gara, interfaccia, audio. *Medio · M*
- **Cache delle versioni automatica.** I `?v=14` negli `<script>` vanno aggiornati a mano: un hash
  calcolato da uno script, o un service worker che gestisce gli aggiornamenti. *Basso · S*
- **Pannello di debug** (tasto F3): passo della fisica, rimonta, bersaglio dell'IA, indice sulla
  pista, FPS. Avrebbe accorciato molto le verifiche. *Medio · S*

### Disegno e prestazioni
- **Interpolazione tra i passi.** La fisica va a 120 Hz fissi ma il disegno mostra l'ultimo passo:
  su TV a 50 Hz o con frame persi le auto scattano. Disegnare tra il passo precedente e l'attuale.
  *Medio · S*
- **Piste disegnate una volta sola.** `paintTrack` rifà tutto a ogni gara (cordoli con `locate`
  su tutta la pista per ogni punto). Tenere in memoria lo sfondo per pista e verso. *Medio · S*
- **Particelle senza `splice`.** Un array a dimensione fissa con riuso evita lavoro inutile del
  garbage collector sulle smart TV. *Basso · S*

### Fisica
- **Urti tra rettangoli.** Le auto sono cerchi: niente rotazione dall'urto e contatti strani sui
  fianchi. Rettangoli orientati con impulso angolare danno testacoda naturali al posto di quello
  scritto a mano. *Medio · M*
- **Bordi con attrito.** Strisciare lungo il bordo ora ha solo un rimbalzo e un calo di velocità;
  aggiungere attrito tangenziale e scintille rende chiaro il contatto. *Basso · S*

### Rete e telefoni
- **Server TURN.** Senza TURN alcuni telefoni (rete ospiti, 4G, NAT rigidi) non si collegano mai.
  *Alto · S–M (serve un servizio)*
- **Dipendenza dal server pubblico di PeerJS.** Se è giù, non si gioca. Alternativa: un piccolo
  server di segnalazione proprio, o un collegamento in locale come riserva. *Medio · M*
- **Ritardo misurato.** Mostrare nella sala d'attesa il ping di ogni telefono, così si vede subito
  chi ha una rete debole. *Basso · S*

### Compatibilità
- **Browser delle smart TV.** Il CSS usa `color-mix()` e le unità `cqw`; il canvas usa `roundRect`
  e `DOMMatrix` sui pattern. Su Tizen e webOS più vecchi possono mancare: servono un fallback per
  ognuno e una prova su una TV vera. *Alto · S*
- **Font senza Internet.** Barlow Condensed arriva da Google Fonts: senza rete si ripiega su un
  carattere di sistema molto diverso. Mettere il font nel repo. *Medio · S*
- **App installabile (PWA).** Manifest e service worker: la TV funziona anche offline (tranne il
  collegamento dei telefoni) e il volante si installa sulla home del telefono. *Medio · M*

### Dati
- **Record più robusti.** Stanno solo in `localStorage` della TV: se si cancellano i dati del
  browser spariscono. Esportarli e importarli con un codice o un file, e azzerarli dalla sala
  d'attesa. *Basso · S*
- **Versione nei dati salvati.** Aggiungere un numero di versione a `fango.records`, così un
  cambio di formato non butta via i record esistenti. *Basso · S*

### Accessibilità e lingua
- **Testi solo in italiano.** Raccogliere le stringhe in un unico oggetto apre a una traduzione.
  *Basso · M*
- **Movimento ridotto.** Rispettare `prefers-reduced-motion` anche nel canvas (scosse,
  lampeggi del ghost), non solo nel CSS. *Basso · S*

---

## Da dove partirei

1. Fantasma del record e «ULTIMO GIRO!»: obiettivi chiari per chi è indietro.
2. Interpolazione tra i passi e browser delle smart TV: da provare su una TV vera.

## Fatto

- **Canale dei comandi senza ordine e senza ritrasmissioni.** PeerJS 1.5.5 apriva il canale con
  `ordered: false` ma ritrasmetteva tutto: uno stato vecchio poteva arrivare dopo uno nuovo e
  sovrascriverlo. Ora lo stato dei comandi viaggia su un secondo canale pre-negoziato sulla stessa
  connessione (`ordered: false, maxRetransmits: 0`), con un numero d'ordine che scarta i pacchetti
  vecchi e due contatori che fanno arrivare NITRO e START anche se si perde il pacchetto col tasto
  giù. Il canale di PeerJS, ora affidabile e ordinato, resta per hello, HUD e vibrazioni; un
  telefono con la pagina vecchia funziona lo stesso. Dettagli in cima a `net.js`.
- **Risoluzione adattiva.** Il canvas segue i pixel veri dello schermo (grandezza a video ×
  `devicePixelRatio`), da 1280×720 a un tetto di 1920×1080 per le TV lente; texture della stessa
  grandezza a ogni risoluzione, pista ridisegnata se la finestra cambia.

- **Suoni delle superfici**, sintetizzati come gli altri: ciaff entrando nel fango, splash
  nell'acqua, ghiaia sui dossi (più forti quanto più si arriva veloci) e sgommata nel testacoda,
  per tutte le auto. Per chi guida, come i motori, anche il fondo sotto le ruote: risucchio con
  qualche ciaff nel fango, fruscio nell'acqua, crepitio sui dossi. `sim.js` manda l'evento
  `enter` quando un'auto entra su fango, acqua o dossi; tutti i suoni a
  rumore usano un solo buffer invece di crearne uno a ogni colpo.

- **Schizzi nell'acqua.** Gemini ha disegnato 8 spruzzi (`img/spruzzi.webp`: anelli d'onda,
  ventagli, corone, gocce). Entrando in una pozza, o atterrandoci, `sim.js` manda l'evento
  di ingresso in acqua e la TV fa partire ventagli ai lati, corona e gocce sopra l'auto e un anello che si
  allarga sotto, tanto più grandi quanto più l'auto è veloce. In pausa si fermano anche spruzzi e
  polvere.

- **Le auto si sporcano di fango.** Gemini ha ridisegnato le 4 auto pulite (`img/auto.webp`; prima
  la blu e la verde partivano già infangate) e 8 schizzi di fango (`img/schizzi.webp`). Ogni
  secondo nel fango aggiunge schizzi sulla carrozzeria, ritagliati sulla sagoma dell'auto: prima
  fiancate vicino alle ruote e paraurti, poi cofano e tetto. L'acqua ne lava via una parte, ogni
  gara si riparte puliti.

- **Simulazione deterministica.** La gara (piste, fisica, IA, giri, record) è in `sim.js`, senza
  disegno né DOM, e il caso viene da un generatore col seme della gara: stesso seme, stessi comandi
  e stessi passi danno la stessa gara. Le particelle restano in `game.js` con `Math.random`: sono
  solo disegno. La gara comunica con la TV per eventi (urti, giri, record…).
- **Test automatici** in `test/`, con `node --test`: stesso seme stessa gara, il computer chiude i
  3 giri su ogni pista nei due versi, nessun giro rubato tornando sul traguardo, auto incastrata
  rimessa in pista (su terra, più indietro, mai dietro il traguardo), record solo per chi guida
  davvero, piste al contrario con le zone negli stessi punti.
