import {fetchJSON,arr,txt,dateRange,normalize} from './utils.js';
// La chiave Europeana personale deve restare nella Edge Function; mai in GitHub Pages.
export async function searchEuropeana(place,{signal,limit,yearMax,proxyUrl}){
 if(!proxyUrl) return [];
 const endpoint=new URL(proxyUrl);
 // Il proxy deve accettare {query,limit} e restituire {items:[record-normalizzati]}.
 const r=await fetch(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({query:place.name,limit})});
 if(!r.ok)throw Error('Proxy Europeana HTTP '+r.status);
 const j=await r.json();return normalize(arr(j.items).filter(x=>dateRange(x.date,yearMax).ok).slice(0,limit),'europeana');
}
