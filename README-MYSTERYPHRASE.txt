ATRALAB — FRASE MISTERIOSA
===========================

File del gioco
--------------
/mysteryphrase/index.html
/css/mysteryphrase.css
/js/mysteryphrase.js
/components/sidebar.html

Il gioco usa già:
- header e footer condivisi di Atralab
- style.css e internal.css esistenti
- include.js esistente
- progetto Supabase atralab-ai
- Edge Function openai-proxy già creata
- limite giornaliero gestito solo da openai-proxy

Funzioni incluse
----------------
- tabellone a caselle stile frase misteriosa
- una sola lettera per volta
- blocco numeri simboli e input multipli
- lettere già provate
- animazione sulle lettere scoperte
- timer
- suono leggero sulle lettere corrette
- mini fanfara al completamento
- pulsante per disattivare i suoni
- salvataggio partita corrente in localStorage
- ripresa della partita dopo refresh
- salvataggio su Supabase solo delle frasi completate
- layout responsive per smartphone

IMPORTANTE — un ultimo setup Supabase
-------------------------------------
Per salvare i risultati senza aprire la tabella agli utenti anonimi viene usata
una seconda Edge Function dedicata, che NON chiama OpenAI.

Nome funzione:
mystery-phrase-result

Nel file:
/setup/mystery-phrase-result-index.ts

trovi il codice completo da incollare nella nuova Edge Function e fare Deploy.
Non servono nuovi secret: usa le variabili Supabase disponibili automaticamente.

Questa scelta evita che il salvataggio di un risultato consumi una chiamata AI.
Le chiamate a OpenAI restano solo quelle fatte da openai-proxy per generare una frase.

URL del gioco dopo il deploy GitHub Pages
-----------------------------------------
https://atralab.it/mysteryphrase/
