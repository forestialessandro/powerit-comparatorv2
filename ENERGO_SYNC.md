# Aggiorna da Energo — da iPhone

Il pulsante «Aggiorna da Energo» della Dashboard rent chiedeva un browser loggato su
`pit.energo.top` sulla stessa macchina: da iPhone non poteva funzionare. Qui il token di
sessione viene passato **una volta** al server, e da quel momento l'aggiornamento lo fa il
server — quindi funziona da qualunque dispositivo.

```
iPhone ──▶ /api/energo-sync ──▶ pit.energo.top/api  (token salvato lato server)
```

## Endpoint

| Rotta | Cosa fa |
|---|---|
| `POST /api/energo-token` | salva il token di sessione (`{token, oid}`) |
| `GET /api/energo-token` | stato: collegato, oid, scadenza |
| `DELETE /api/energo-token` | scollega |
| `GET`/`POST` `/api/energo-setup` | stato / rivendicazione della chiave alla prima apertura |
| `GET /api/energo-sync` | dati freschi: `{cabs, ords, fetchedAt, meta}` (stessa forma di `sk_energo.json`) |
| `GET /api/energo-sync?raw=1` | un cabinet e un ordine grezzi, per verificare i nomi dei campi |
| `GET /api/energo-sync?live=1` | solo dati freschi: errore invece della fotografia vecchia |
| `POST /api/energo-data` | il Mac carica la fotografia che già scarica ogni 15 minuti |
| `GET /api/energo-data` | età dell'ultima fotografia salvata |

Tutte richiedono la chiave: header `x-pit-key` o `?k=…`.

## Configurazione

Nessuna, di norma. Alla **prima apertura** di `/energo.html` il browser genera una
chiave privata e la rivendica con `POST /api/energo-setup`: da quel momento è l'unica
valida e la pagina la conserva in `localStorage`. Il link personale
(`/energo.html?k=…`) la porta sugli altri dispositivi.

Env var opzionali su Netlify:

| Variabile | Note |
|---|---|
| `PIT_KEY` | chiave fissa: se presente vince sulla rivendicazione |
| `ENERGO_OID` | oid di default (8938) se il bookmarklet non lo trova |
| `ENERGO_API_BASE` | default `https://pit.energo.top/api,https://backend.energo.vip/api`, provate in ordine |
| `ENERGO_TOKEN` | token incollato a mano: fallback se Netlify Blobs non è attivo |

## Uso

1. Apri `/energo.html` dal Mac: si inizializza da sola.
2. Trascina «⚡ Collega Energo» nella barra dei preferiti di Chrome; su una scheda
   `pit.energo.top` loggata, cliccalo. Il token arriva al server.
   In alternativa la pagina genera il messaggio pronto per Claude sul Mac.
3. «Copia il mio link» → aprilo sull'iPhone. Da lì in poi il pulsante basta e avanza.

## Quando Energo chiude la sessione

Non è una scadenza a tempo: il backend tiene **una sola sessione per account** e
la chiude appena si entra da un'altra parte (osservate durate da 9 minuti a 7 ore,
indipendenti dall'uso — il JWT non porta `exp`). Di conseguenza:

- `/api/energo-sync` **non fallisce**: se il token è morto restituisce l'ultima
  fotografia riuscita con `stale: true` e la sua data. Il telefono mostra sempre
  qualcosa, datato. `?live=1` per volere invece l'errore.
- Il Mac, che tiene la sessione viva, ripubblica il token a ogni giro di
  keep-alive e carica la fotografia su `/api/energo-data`: così il dato resta
  fresco anche mentre il token è morto.
- Loggarsi a Energo dall'iPhone **espelle il Mac**: farlo solo come ripiego.
- `/energo.html` porta il comando pronto per il Comando Rapido iOS: con quello si
  ricollega dal telefono in mezzo minuto, senza Mac, il giorno che la sessione cade.

Non esiste modo di rendere la sessione permanente senza il token API che Energo
vende a parte: è il loro progetto, non un difetto aggirabile. Quello che si può
fare — ed è quello che fa questo codice — è non restare mai senza dati e potersi
ricollegare in pochi secondi da qualsiasi dispositivo.

## Aggancio nella Dashboard rent

```html
<script src="https://<sito>.netlify.app/energo-client.js"></script>
<button onclick="PIT.aggiornaDaEnergo(this)">🔄 Aggiorna da Energo</button>
```

`PIT.sync()` restituisce i dati grezzi se la dashboard preferisce gestirli da sé.
