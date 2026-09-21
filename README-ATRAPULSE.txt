ATRAPULSE — FILE DA CARICARE SU GITHUB
=========================================

Contenuto del pacchetto:

/pulse/index.html
/css/pulse.css
/js/pulse.js

La pagina finale sarà:

https://atralab.it/pulse/


COME FUNZIONA
-------------

AtraPulse interroga GDELT direttamente dal browser.

Le categorie vengono caricate una alla volta:
- prima categoria
- attesa 6,2 secondi
- seconda categoria
- attesa 6,2 secondi
- terza categoria

Questo rispetta il limite indicato da GDELT di una richiesta ogni 5 secondi.

I risultati vengono salvati nel localStorage per 30 minuti.
Se la pagina viene ricaricata entro quei 30 minuti, non viene fatta
una nuova richiesta per quella categoria.


DOVE MODIFICARE LE CATEGORIE
----------------------------

Apri:

/js/pulse.js

e modifica il blocco NEWS_CATEGORIES in cima al file.

Per ogni categoria puoi cambiare:

id
label
icon
cards
days
keywords
sources

Esempio:

{
  id: "space",
  label: "Spazio",
  icon: "🚀",
  cards: 3,
  days: 5,
  keywords: [...],
  sources: [...]
}

Il codice limita comunque la ricerca a massimo 5 giorni.


LINK
----

Per ora entrambi i link usano target="_self", come richiesto:

Cerca su Google
Fonte


EDGE FUNCTION
-------------

Non eliminare ancora pulse-feed.

Prima prova AtraPulse dal sito.
Se le chiamate dirette a GDELT funzionano correttamente dal browser,
pulse-feed potrà essere eliminata in seguito.


SIDEBAR
-------

Questo pacchetto NON sovrascrive components/sidebar.html per evitare
di cancellare le modifiche già presenti nel tuo sito.

Quando vuoi aggiungere AtraPulse alla sidebar, puoi usare:

<a class="sidebar-link" href="/pulse/">
  AtraPulse
</a>


HOME
----

Card opzionale da aggiungere alla home:

<div class="card">
  <span class="card-label">News</span>
  <h2>AtraPulse</h2>
  <p>
    Poche cose interessanti che stanno succedendo
    tra scienza spazio e sport
  </p>
  <p><a href="/pulse/">Apri AtraPulse →</a></p>
</div>
