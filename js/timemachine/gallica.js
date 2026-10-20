import {fetchText,txt,dateRange,normalize} from './utils.js';
function fields(record,tag,code){return [...record.getElementsByTagName('*')].filter(x=>x.localName==='datafield'&&x.getAttribute('tag')===tag).flatMap(d=>[...d.children].filter(c=>c.localName==='subfield'&&c.getAttribute('code')===code).map(c=>c.textContent?.trim()||''));}
export async function searchGallica(place,{signal,limit,yearMax}){
 const u=new URL('https://catalogue.bnf.fr/api/SRU');u.search=new URLSearchParams({version:'1.2',operation:'searchRetrieve',query:`bib.anywhere all "${place.name.replace(/"/g,'')}"`,maximumRecords:String(Math.min(limit,20))});
 const xml=new DOMParser().parseFromString(await fetchText(u,signal),'application/xml');if(xml.querySelector('parsererror'))throw Error('XML non valido');
 const records=[...xml.getElementsByTagName('*')].filter(n=>n.localName==='record'&&n.parentElement?.localName==='records');const out=[];
 for(const r of records){
  const title=fields(r,'200','a').join(' '),format=fields(r,'200','b').join(' ');
  const date=dateRange([...fields(r,'210','d'),...fields(r,'214','d')],yearMax);if(!date.ok)continue;
  const evidence=[title,format,...fields(r,'330','a')].join(' ');
  if(/gravure|estampe|dessin|lithograph|peinture|incision/i.test(evidence))continue;
  // L'SRU contiene molti libri e stampe. Richiediamo una descrizione fotografica esplicita.
  if(!/photograph|photographi|fotografi|photo |phototypie/i.test(evidence))continue;
  const allText=r.textContent||'';const ark=(allText.match(/(?:ark:\/12148\/|ark:NL48-)(btv\w+)/i)||[])[1];if(!ark)continue;
  out.push({sourceId:ark,title,date:date.display,author:fields(r,'700','a').join(' '),thumbnailUrl:`https://gallica.bnf.fr/ark:/12148/${ark}/f1.thumbnail`,imageUrl:`https://gallica.bnf.fr/ark:/12148/${ark}/f1.highres`,sourceUrl:`https://gallica.bnf.fr/ark:/12148/${ark}`,rights:'Controllare condizioni Gallica'});
 }
 return normalize(out,'gallica');
}
