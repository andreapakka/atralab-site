import {fetchJSON,arr,txt,dateRange,normalize} from './utils.js';
export async function searchICCD(place,{signal,limit,yearMax}){
 const query=place.name.replace(/["():]/g,' ').trim();const u=new URL('https://fotografia.cultura.gov.it/iccd/dsappl');
 u.search=new URLSearchParams({wt:'json',q:`(c_level_s:"item") AND (_text_:"${query}")`,rows:String(Math.min(limit,25))});
 const j=await fetchJSON(u,signal),out=[];
 for(const d of j.response?.docs||[]){
  const date=dateRange(d.c_did_unitdate_encodinganalog_dt_ss,yearMax);if(!date.ok)continue;
  const title=txt(d.c_did_unittitle_encodinganalog_unittitle_ss||d.c_did_unittitle_encodinganalog_unittitle_s||d.c_title_s||d.c_did_unittitle_ss||d.c_id_s);
  const medium=txt([d.c_daobj_typology_s,d.c_description_s,d.c_ogtd_s]);if(/dipinto|disegno|incisione|litografia|pittura/i.test(medium))continue;
  const manifest=arr(d.c_daogrp_daoloc_type_manifest_auto_href_ss)[0];if(typeof manifest!=='string'||!manifest.startsWith('https://'))continue;
  // Le immagini IIIF si risolvono in modo mirato solo per i record che hanno superato il controllo della data.
  try{const m=await fetchJSON(manifest,signal);const canvas=m.sequences?.[0]?.canvases?.[0];const service=canvas?.images?.[0]?.resource?.service;const base=typeof service==='string'?service:service?.['@id'];if(!base?.startsWith('https://'))continue;
   out.push({sourceId:txt(d.c_id_s),title,date:date.display,thumbnailUrl:base.replace(/\/$/,'')+'/full/400,/0/default.jpg',imageUrl:base.replace(/\/$/,'')+'/full/1000,/0/default.jpg',sourceUrl:manifest,rights:txt(d.licenseDescr_s||d.licenseURL_s||m.license)});
  }catch(e){if(signal.aborted)throw e;}
 }
 return normalize(out,'iccd');
}
