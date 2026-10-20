import {fetchJSON,arr,txt,dateRange,normalize} from './utils.js';
function labeled(node,label){if(!node||typeof node!=='object')return '';if(Array.isArray(node)){for(const a of node){const r=labeled(a,label);if(r)return r;}return '';}if(String(node['@displayLabel']||'').toLowerCase()===label.toLowerCase()&&typeof node['#text']==='string')return node['#text'];for(const v of Object.values(node)){if(v&&typeof v==='object'){const r=labeled(v,label);if(r)return r;}}return '';}
function urls(node,out=[]){if(!node||typeof node!=='object')return out;if(Array.isArray(node)){node.forEach(v=>urls(v,out));return out;}if('url' in node){const u=node.url;for(const x of arr(u)){const s=typeof x==='string'?x:x?.['#text'];if(typeof s==='string'&&s.startsWith('https://'))out.push(s);}}Object.values(node).forEach(v=>{if(v&&typeof v==='object')urls(v,out);});return out;}
export async function searchHarvard(place,{signal,limit,yearMax}){
 const query=`${place.name} ${place.city||''}`.trim();const u=new URL('https://api.lib.harvard.edu/v2/items.json');u.search=new URLSearchParams({q:query,limit:String(Math.min(100,Math.max(30,limit*3)))});
 const j=await fetchJSON(u,signal),out=[];
 for(const x of arr(j.items?.mods)){
  if(!/still image/i.test(txt(x.typeOfResource)))continue;
  const genre=txt(x.genre);if(!/photograph|fotograf|albumen|salted paper/i.test(genre)||/painting|drawing|engraving|lithograph/i.test(genre))continue;
  const date=dateRange(x.originInfo?.dateCreated||x.originInfo?.dateOther,yearMax);if(!date.ok)continue;
  const thumbnailUrl=labeled(x.relatedItem,'Thumbnail');if(!thumbnailUrl)continue;
  const imageUrl=labeled(x.relatedItem,'Full Image');const links=urls([x.relatedItem,x.location]);
  const sourceUrl=links.find(x=>/id\.lib\.harvard\.edu\/images\//.test(x))||links.find(x=>/id\.lib\.harvard\.edu\//.test(x))||'';
  out.push({sourceId:txt(x.recordInfo?.recordIdentifier),title:txt(x.titleInfo?.title),date:date.display,author:txt(x.name?.namePart).slice(0,110),thumbnailUrl,imageUrl,sourceUrl,rights:txt(x.accessCondition)});
 }
 return normalize(out,'harvard').slice(0,limit);
}
