/**
 * Persistência local compatível + Supabase REST.
 * Mantém load()/save() síncronos para não quebrar as rotas existentes.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const STORAGE_DIR = process.env.STORAGE_DIR || __dirname;
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);
const TABLE_URL = USE_SUPABASE ? SUPABASE_URL + '/rest/v1/school_roku_state' : '';
const DEFAULT_DB = {
 meta:{version:1,createdAt:new Date().toISOString()}, users:[],devices:[],groups:[],contents:[],playlists:[],
 publications:[],priorityAlerts:[],pairingCodes:[],auditLog:[],
 settings:{pollIntervalSeconds:20,offlineGraceSeconds:90,pairingCodeTtlSeconds:900,defaultContentId:null,organizationName:'Escola'},
 fairDemo:{enabled:true,isDemo:true,teamsParticipating:12,teamsCompleted:3,activityStatus:'not_started',
 messages:[{id:'demo-1',text:'[DEMO] Caça ao tesouro começa às 14h no pátio.',createdAt:new Date().toISOString()}]}
};
let state=null, writeQueue=Promise.resolve(), lastError=null;
function ensureDir(dir){if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});}
function localLoad(){
 ensureDir(DATA_DIR);
 if(!fs.existsSync(DB_FILE)){const initial=structuredClone(DEFAULT_DB);localSave(initial);return initial;}
 return JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
}
function localSave(value){
 ensureDir(DATA_DIR);const tmp=DB_FILE+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(value,null,2),'utf8');fs.renameSync(tmp,DB_FILE);
}
async function request(pathname,options={}){
 const response=await fetch(pathname,{...options,headers:{
  apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json',
  ...(options.headers||{})
 }});
 if(!response.ok) throw new Error('Supabase '+response.status+': '+(await response.text()).slice(0,500));
 return response.status===204?null:response.json();
}
async function persist(snapshot){
 if(!USE_SUPABASE)return;
 await request(TABLE_URL+'?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:'main',data:snapshot,updated_at:new Date().toISOString()})});
}
async function initialize(){
 ensureDir(DATA_DIR);
 if(USE_SUPABASE){
  try{
   const rows=await request(TABLE_URL+'?id=eq.main&select=data');
   if(rows&&rows.length&&rows[0].data){state=rows[0].data;localSave(state);console.log('[db] Estado carregado do Supabase.');return;}
   state=localLoad();
   await persist(state);
   console.log('[db] Estado local inicial migrado para Supabase.');
   return;
  }catch(error){
   console.error('[db] Falha ao conectar no Supabase:',error.message);
   throw error; // não inicia vazio e não sobrescreve dados remotos.
  }
 }
 state=localLoad();
}
function load(){if(!state)throw new Error('Banco ainda não inicializado');return state;}
function save(value){
 state=value;
 const snapshot=JSON.parse(JSON.stringify(value));
 localSave(snapshot);
 writeQueue=writeQueue.then(()=>persist(snapshot)).catch(error=>{
  lastError=error;console.error('[db] Falha ao salvar no Supabase:',error.message);
 });
 return writeQueue;
}
async function flush(){await writeQueue;if(lastError)throw lastError;}
function id(prefix=''){return prefix+crypto.randomBytes(8).toString('hex');}
function now(){return new Date().toISOString();}
module.exports={load,save,id,now,initialize,flush,STORAGE_DIR,DATA_DIR,DB_FILE};
