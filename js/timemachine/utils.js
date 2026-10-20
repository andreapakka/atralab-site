export const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];
export function strings(v) { if(v==null)return []; if(typeof v!=='object')return [String(v)]; if(Array.isArray(v))return v.flatMap(strings); if('#text' in v)return strings(v['#text']); return Object.values(v).flatMap(strings); }
export const txt=v=>strings(v).join(' | ');
export const clean=v=>String(v||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
export const years=v=>[...new Set((txt(v).match(/\b(?:1[5-9]\d{2}|20\d{2})\b/g)||[]).map(Number))];
export function dateRange(v,maxYear) { const ys=years(v); if(!ys.length)return {ok:false,display:'Data non verificata'}; if(Math.min(...ys)>maxYear || Math.max(...ys)>maxYear || Math.min(...ys)<1826) return {ok:false,display:ys.join('–')}; return {ok:true,display:ys.length>1?`${Math.min(...ys)}–${Math.max(...ys)}`:String(ys[0])}; }
export async function fetchText(url,signal) { const r=await fetch(url,{signal,headers:{Accept:'application/json, application/xml, text/xml;q=0.8'}}); if(!r.ok)throw Error('HTTP '+r.status);return r.text(); }
export async function fetchJSON(url,signal) {const r=await fetch(url,{signal});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
export const link=v=>typeof v==='string'&&/^https:\/\//i.test(v)?v:'';
export function normalize(items,source){return items.filter(x=>x&&x.thumbnailUrl&&x.sourceUrl).map(x=>({source,sourceId:String(x.sourceId||x.sourceUrl),title:String(x.title||'Fotografia storica'),date:String(x.date||'Data incerta'),author:String(x.author||''),thumbnailUrl:link(x.thumbnailUrl),imageUrl:link(x.imageUrl)||link(x.thumbnailUrl),sourceUrl:link(x.sourceUrl),rights:String(x.rights||'Condizioni da verificare'),kind:x.kind||'photo'})).filter(x=>x.thumbnailUrl&&x.sourceUrl);}
export function placeQueries(place){const names=[place.name,...(place.names||[])].filter(Boolean);return [...new Set(names)].slice(0,2);}
