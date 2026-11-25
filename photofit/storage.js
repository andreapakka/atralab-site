const c=window.PHOTOFIT_CONFIG;
export function session(){const s=window.getAtralabSupabaseSession?.();if(!s?.access_token||!s?.user?.id)throw Error('Accedi con OTP ATRALAB.');return s;}
export const user=()=>session().user;
const table='/rest/v1/'+c.table;
const obj='/storage/v1/object';
const path=p=>p.split('/').map(encodeURIComponent).join('/');
async function request(url,{method='GET',body,headers={},raw=false}={}){
 const s=session();const h={apikey:c.supabasePublicKey,Authorization:'Bearer '+s.access_token,...headers};
 if(body!==undefined && !(body instanceof Blob)){h['Content-Type']='application/json';body=JSON.stringify(body);}
 const r=await fetch(c.supabaseUrl+url,{method,headers:h,body,cache:'no-store'});
 if(!r.ok){const t=await r.text();let e;try{e=JSON.parse(t);}catch{}throw Error(e?.message||e?.error_description||e?.error||`Supabase HTTP ${r.status}`);}
 if(raw)return r.blob(); if(r.status===204)return null;return r.json().catch(()=>null);
}
export const isAdmin=()=>request('/rest/v1/rpc/photofit_is_admin',{method:'POST',body:{}});
export async function quota(){const r=await request('/rest/v1/photofit_config?key=eq.quota_bytes&select=value');return Number(r?.[0]?.value)||c.quotaBytesFallback;}
export async function list(){const rows=[];for(let offset=0;;){const batch=await request(`${table}?select=*&order=created_at.desc,id.desc&limit=${c.pageSize}&offset=${offset}`)||[];rows.push(...batch);if(batch.length<c.pageSize)break;offset+=batch.length;}return rows;}
export async function signedUrl(row){const r=await request(`${obj}/sign/${c.bucket}/${path(row.storage_path)}`,{method:'POST',body:{expiresIn:c.signedUrlSeconds}});if(!r?.signedURL)throw Error('Anteprima non disponibile.');return c.supabaseUrl+'/storage/v1'+r.signedURL;}
export const download=row=>request(`${obj}/authenticated/${c.bucket}/${path(row.storage_path)}`,{raw:true});
async function removeRecord(row){const r=await request(`${table}?id=eq.${encodeURIComponent(row.id)}`,{method:'DELETE',headers:{Prefer:'return=representation'}});if(!r?.length)throw Error('Record non eliminato o accesso negato.');}
async function removeObject(row){await request(`${obj}/${c.bucket}`,{method:'DELETE',body:{prefixes:[row.storage_path]}});}
export async function remove(row){await removeObject(row);await removeRecord(row);}
export async function create({blob,filename,width,height,dpi,status}){
 const rows=await request(table,{method:'POST',headers:{Prefer:'return=representation'},body:{owner_id:user().id,status,filename,width_px:width,height_px:height,dpi,file_size:blob.size}});
 const row=rows?.[0];if(!row)throw Error('Registrazione fotografia non riuscita.');
 try{await request(`${obj}/${c.bucket}/${path(row.storage_path)}`,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:blob});}
 catch(e){try{await remove(row);}catch(cleanup){throw Error(`${e.message}. Pulizia incompleta: ${cleanup.message}`);}throw e;}
 return row;
}
