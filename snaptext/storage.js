// Accesso al progetto Supabase ATRALAB esistente, con OTP e RLS: nessuna service_role nel client.
const cfg=window.SNAPTEXT_CONFIG;
function session() {
  const value=window.getAtralabSupabaseSession?.();
  if(!value?.access_token || !value?.user?.id) throw Error('Per usare SnapText accedi con OTP ATRALAB.');
  return value;
}
async function api(path,{method='GET',body,prefer}={}) {
  const s=session();
  const headers={'apikey':cfg.supabasePublicKey,'Authorization':`Bearer ${s.access_token}`};
  if(body !== undefined) headers['Content-Type']='application/json';
  if(prefer) headers['Prefer']=prefer;
  const res=await fetch(`${cfg.supabaseUrl}${path}`,{method,headers,body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store'});
  if(!res.ok) {
    const data=await res.json().catch(()=>({}));
    throw Error(data.message || data.error_description || data.error || `Supabase HTTP ${res.status}`);
  }
  if(res.status===204) return null;
  return res.json().catch(()=>null);
}
const table=`/rest/v1/${cfg.table}`;
const fields='id,owner_id,title,language,page_count,created_at,updated_at,revision_updated_at';
export const getCurrentUser=()=>session().user;
export async function isAdmin() {
  return Boolean(await api('/rest/v1/rpc/snaptext_is_admin',{method:'POST',body:{}}));
}
export async function listDocuments(onlyMine=false) {
  const owner=onlyMine ? `&owner_id=eq.${encodeURIComponent(session().user.id)}` : '';
  return await api(`${table}?select=${fields}&deleted_at=is.null${owner}&order=created_at.desc&limit=200`) || [];
}
export async function loadDocument(id) {
  const rows=await api(`${table}?select=*&id=eq.${encodeURIComponent(id)}&deleted_at=is.null&limit=1`);
  if(!rows?.length) throw Error('Documento non trovato o non autorizzato.');
  return rows[0];
}
export async function createDocument({title,language,pageCount,original,revision}) {
  const rows=await api(`${table}?select=*`,{method:'POST',prefer:'return=representation',body:{owner_id:session().user.id,title,language,page_count:pageCount,original_json:original,revision_json:revision}});
  if(!rows?.[0]) throw Error('Documento non creato.');
  return rows[0];
}
export async function saveRevision(doc, revision) {
  // Ottimistic locking: se un'altra scheda ha aggiornato il documento, non sovrascriviamo.
  const updated=encodeURIComponent(doc.updated_at);
  const rows=await api(`${table}?id=eq.${encodeURIComponent(doc.id)}&updated_at=eq.${updated}&select=*`,{method:'PATCH',prefer:'return=representation',body:{revision_json:revision}});
  if(!rows?.length) throw Error('Il documento è stato modificato altrove. Riaprilo prima di salvare.');
  return rows[0];
}
export async function softDelete(doc) {
  const rows=await api(`${table}?id=eq.${encodeURIComponent(doc.id)}&select=id`,{method:'PATCH',prefer:'return=representation',body:{deleted_at:new Date().toISOString()}});
  if(!rows?.length) throw Error('Documento non eliminato o permessi insufficienti.');
}
