import {fetchJSON,clean,dateRange,normalize} from './utils.js';
export async function searchCommons(place,{signal,limit,yearMax}){
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:`"${place.name.replace(/"/g,'')}" historical photograph`,gsrnamespace:'6',gsrlimit:String(Math.min(limit,30)),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'420',format:'json',origin:'*'});
 const data=await fetchJSON(url,signal);
 const out=[];
 for(const page of Object.values(data.query?.pages||{})){
  const ii=page.imageinfo?.[0],meta=ii?.extmetadata||{};if(!ii?.thumburl)continue;
  const title=page.title.replace(/^File:/,'');if(/\.(?:svg|pdf|djvu|tif)$/i.test(title))continue;
  const genre=clean([title,meta.Categories?.value,meta.ImageDescription?.value].filter(Boolean).join(' '));
  if(/engraving|etching|painting|drawing|lithograph|incisione|dipinto|acquaforte|mappa|map of /i.test(genre))continue;
  const date=dateRange(meta.DateTimeOriginal?.value||meta.DateTime?.value,yearMax);if(!date.ok)continue;
  out.push({sourceId:page.pageid,title:clean(meta.ObjectName?.value)||title,date:date.display,author:clean(meta.Artist?.value),thumbnailUrl:ii.thumburl,imageUrl:ii.url,sourceUrl:ii.descriptionurl||`https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,'_'))}`,rights:clean(meta.LicenseShortName?.value)||'Vedere licenza Commons'});
 }
 return normalize(out,'commons');
}
