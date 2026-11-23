const FUTU='https://webapi.futunn.com';
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const un64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export function validScope(t){const s=new Set((t.scope||'').split(' '));if(!s.has('quote:read')||[...s].some(x=>x.startsWith('trade:')||x==='quote:write'))throw Error('请仅授权读取行情。');}
async function cipherKey(env){return crypto.subtle.importKey('raw',un64(env.TOKEN_ENCRYPTION_KEY),'AES-GCM',false,['encrypt','decrypt']);}
async function seal(env,obj){const iv=crypto.getRandomValues(new Uint8Array(12));return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipherKey(env),enc.encode(JSON.stringify(obj))));}
async function open(env,s){const [iv,data]=s.split('.');return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv)},await cipherKey(env),un64(data))));}
async function put(env,key,obj,ttl){await env.SESSIONS.put(key,await seal(env,obj),{expirationTtl:ttl});}
async function get(env,key){const s=await env.SESSIONS.get(key);return s?open(env,s):null;}
async function upstream(path,body,token){const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']=path.endsWith('/register')?'application/json':'application/x-www-form-urlencoded';const r=await fetch(FUTU+path,{method:body?'POST':'GET',headers,body:body?(path.endsWith('/register')?JSON.stringify(body):new URLSearchParams(body)):undefined,signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('富途接口暂不可用，请重新授权或稍后重试。');const j=await r.json();if(j.error||j.ret_code&&j.ret_code!==0)throw Error('富途拒绝请求，请确认行情权限、额度和授权有效期。');return j;}
function json(obj,status=200,extra={}){return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...extra}});}
function cookie(sid,age=1209600){return `cw_session=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;}
export function normalize(j,symbol,date){const bars=(j.data?.kline_list||[]).map(b=>{let d=String(b.date||'');if(/^\d{8}$/.test(d))d=d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6);else d=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(b.time_key));const row={date:d};for(const k of ['open','high','low','close']){row[k]=Number(b[k]);if(!Number.isFinite(row[k])||row[k]<=0)throw Error('行情价格无效。');}row.volume=Number(b.volume||0);return row;}).filter(b=>b.date<date).sort((a,b)=>a.date.localeCompare(b.date));if(!bars.length)throw Error('该股票或日期没有可用日线。');return {symbol,currency:'USD',source:'Futu OpenAPI / 前复权日线',sourceUrl:'https://open.futunn.com/api/quote/basic-data/history-kline',fetchedAt:new Date().toISOString(),bars};}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/auth/')&&!path.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(!env.TOKEN_ENCRYPTION_KEY)return json({error:'后台尚未完成配置。'},503);
 const sid=(request.headers.get('Cookie')||'').match(/(?:^|; )cw_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
 try{
  if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'请求来源不匹配。'},403);
  if(path==='/auth/status'&&request.method==='GET')return json({connected:!!(sid&&await get(env,'session:'+sid)),cloud:true});
  if(path==='/auth/disconnect'&&request.method==='POST'){if(sid)await env.SESSIONS.delete('session:'+sid);return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
  if(path==='/auth/start'&&request.method==='POST'){
   const redirect=url.origin+'/auth/callback';let client=await env.SESSIONS.get('oauth-client');
   if(!client){const j=await upstream('/oauth2/register',{redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],client_name:'CW 在线仓位看板（只读行情）',scope:'quote:read'});client=j.client_id;await env.SESSIONS.put('oauth-client',client);}
   const state=random(),verifier=random(),browser=random();await put(env,'pending:'+state,{client,verifier,browser},600);
   const challenge=b64(await crypto.subtle.digest('SHA-256',enc.encode(verifier)));
   return json({url:FUTU+'/oauth2/authorize/confirm?'+new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'quote:read',state,code_challenge:challenge,code_challenge_method:'S256'})},200,{'Set-Cookie':`cw_oauth=${browser}; Path=/auth/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`});
  }
  if(path==='/auth/callback'&&request.method==='GET'){
   const state=url.searchParams.get('state');if(!/^[A-Za-z0-9_-]{43}$/.test(state||''))throw Error('授权会话无效，请重新连接。');
   const p=await get(env,'pending:'+state),browser=(request.headers.get('Cookie')||'').match(/(?:^|; )cw_oauth=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
   if(!p||!browser||browser!==p.browser)throw Error('授权会话已过期或浏览器不匹配，请重新连接。');
   await env.SESSIONS.delete('pending:'+state);const code=url.searchParams.get('code');if(!code)throw Error('授权未完成。');
   const token=await upstream('/oauth2/token',{grant_type:'authorization_code',code,client_id:p.client,redirect_uri:url.origin+'/auth/callback',code_verifier:p.verifier});validScope(token);
   const id=random();await put(env,'session:'+id,{client:p.client,token,expires:Date.now()+(token.expires_in||7200)*1000-60000},1209600);
   if(sid)await env.SESSIONS.delete('session:'+sid);
   return new Response(null,{status:303,headers:{Location:'/?futu=connected','Set-Cookie':cookie(id),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  if(path==='/api/futu/bars'&&request.method==='GET'){
   const session=sid&&await get(env,'session:'+sid);if(!session)return json({error:'请先连接富途授权读取行情。'},401);
   const symbol=(url.searchParams.get('symbol')||'').toUpperCase(),date=url.searchParams.get('date')||'';
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today)throw Error('请输入有效美股代码与历史交易日期。');
   // Per-session request throttle, never share one user's Futu credentials with other visitors.
   const last=await env.SESSIONS.get('throttle:'+sid);if(last&&Date.now()-Number(last)<5000)return json({error:'请间隔5秒再查询。'},429);await env.SESSIONS.put('throttle:'+sid,String(Date.now()),{expirationTtl:60});
   if(Date.now()>=session.expires){const t=await upstream('/oauth2/token',{grant_type:'refresh_token',client_id:session.client,refresh_token:session.token.refresh_token});validScope(t);t.refresh_token||=session.token.refresh_token;session.token=t;session.expires=Date.now()+(t.expires_in||7200)*1000-60000;await put(env,'session:'+sid,session,1209600);}
   const end=new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
   const data=await upstream('/api/v1.0/quote/US.'+symbol+'/history-kline?'+new URLSearchParams({end,ktype:'2',autype:'1',num:'370',extended_time:'0'}),null,session.token.access_token);
   return json(normalize(data,symbol,date));
  }
  return json({error:'Not found'},404);
 }catch(e){return json({error:e.message||'后台请求失败，请重新连接。'},400);}
}};
