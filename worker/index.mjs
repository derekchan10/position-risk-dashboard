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
export function apiFailure(http,j={}){
 const code=Number(j.ret_code??j.code),kind=typeof j.error==='object'?j.error?.code:typeof j.error==='string'?j.error:'';
 const safeKind=/^[a-zA-Z0-9_-]{1,64}$/.test(kind||'')?kind:'';
 const expired=http===401||code===-12102||['invalid_token','token_expired','invalid_grant'].includes(safeKind);
 let message=expired?'富途授权已失效，需要刷新或重新连接。':http===429||code===-11||code===-12011?'富途请求过快，请稍后重试。':code===-12?'富途历史K线标的额度已用完，请等待额度释放。':code===-9||safeKind==='permission_denied'?'富途拒绝行情权限，请检查账号的美股API行情权限。':code===-3?'富途请求参数不被接受。':code===-8?'富途暂不支持该标的或数据类型。':code===-13?'富途额度服务暂不可用，请稍后重试。':http===439||code===-12009?'富途安全策略拦截了请求。':'富途行情服务返回错误。';
 const detail=[`HTTP ${http}`,Number.isFinite(code)?`code ${code}`:'',safeKind].filter(Boolean).join(' / ');
 const e=new Error(message+'（'+detail+'）');e.authExpired=expired;e.http=http;e.upstreamCode=Number.isFinite(code)?code:null;e.upstreamKind=safeKind;return e;
}
async function upstream(path,body,token){
 const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']=(path.endsWith('/register')||path.startsWith('/api/'))?'application/json':'application/x-www-form-urlencoded';
 const r=await fetch(FUTU+path,{method:body?'POST':'GET',headers,body:body?((path.endsWith('/register')||path.startsWith('/api/'))?JSON.stringify(body):new URLSearchParams(body)):undefined,signal:AbortSignal.timeout(25000)});
 let j;try{j=await r.json();}catch{throw apiFailure(r.status);}
 if(!r.ok||j.error||(j.ret_code!==undefined&&Number(j.ret_code)!==0))throw apiFailure(r.status,j);return j;
}
async function refreshSession(env,sid,session){
 try{const t=await upstream('/oauth2/token',{grant_type:'refresh_token',client_id:session.client,refresh_token:session.token.refresh_token});validScope(t);t.refresh_token||=session.token.refresh_token;session.token=t;session.expires=Date.now()+(t.expires_in||7200)*1000-60000;await put(env,'session:'+sid,session,1209600);}
 catch(e){if(e.authExpired){await env.SESSIONS.delete('session:'+sid);e.needsAuth=true;}throw e;}
}

function json(obj,status=200,extra={}){return new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive, nosnippet',...extra}});}
function cookie(sid,age=1209600){return `cw_session=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;}
const previousDate=date=>new Date(Date.parse(date)-86400000).toISOString().slice(0,10);
export function completedThrough(date,state,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const today=parts.year+'-'+parts.month+'-'+parts.day,hour=Number(parts.hour);
 if(date===today&&((['AFTER_HOURS_BEGIN','AFTER_HOURS_END'].includes(state)&&hour>=12)||(state==='CLOSED'&&hour>=16)))return date;
 return previousDate(date);
}
export function normalize(j,symbol,date,through=previousDate(date)){const bars=(j.data?.kline_list||[]).map(b=>{let d=String(b.date||'');if(/^\d{8}$/.test(d))d=d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6);else d=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(b.time_key));const row={date:d};for(const k of ['open','high','low','close']){row[k]=Number(b[k]);if(!Number.isFinite(row[k])||row[k]<=0)throw Error('行情价格无效。');}row.volume=Number(b.volume||0);return row;}).filter(b=>b.date<=through&&b.date<=date).sort((a,b)=>a.date.localeCompare(b.date));if(!bars.length)throw Error('该股票或日期没有可用日线。');return {symbol,analysisDate:date,completedThrough:through,currency:'USD',source:'Futu OpenAPI / 前复权日线',sourceUrl:'https://open.futunn.com/api/quote/basic-data/history-kline',fetchedAt:new Date().toISOString(),bars};}
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
   const redirect=url.origin+'/auth/callback',clientKey='oauth-client:'+url.origin;let client=await env.SESSIONS.get(clientKey);
   if(!client&&url.hostname==='cw-futu-backend.dchan0831.workers.dev')client=await env.SESSIONS.get('oauth-client');
   if(!client){const j=await upstream('/oauth2/register',{redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],client_name:'CW 在线仓位看板（只读行情）',scope:'quote:read'});client=j.client_id;await env.SESSIONS.put(clientKey,client);}
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
   const last=await env.SESSIONS.get('throttle:'+sid+':'+symbol);if(last&&Date.now()-Number(last)<5000)return json({error:'请间隔5秒再查询。'},429);await env.SESSIONS.put('throttle:'+sid+':'+symbol,String(Date.now()),{expirationTtl:60});
   if(Date.now()>=session.expires)await refreshSession(env,sid,session);
   let state='UNKNOWN';
   if(date===today){
    try{let status;try{status=await upstream('/api/v1.0/quote/market-state',{code_list:['US.'+symbol]},session.token.access_token);}catch(e){if(!e.authExpired)throw e;await refreshSession(env,sid,session);status=await upstream('/api/v1.0/quote/market-state',{code_list:['US.'+symbol]},session.token.access_token);}
     state=status.data?.market_state_list?.find(x=>x.code==='US.'+symbol)?.market_state||'UNKNOWN';
    }catch(e){if(e.needsAuth)throw e;}
   }
   const end=completedThrough(date,state);
   const resource='/api/v1.0/quote/US.'+symbol+'/history-kline?'+new URLSearchParams({end,ktype:'2',autype:'1',num:'370',extended_time:'0'});
   let data;try{data=await upstream(resource,null,session.token.access_token);}catch(e){if(!e.authExpired)throw e;await refreshSession(env,sid,session);data=await upstream(resource,null,session.token.access_token);}
   const result=normalize(data,symbol,date,end);result.marketState=state;result.sessionNote=date===today&&state==='UNKNOWN'?'收盘状态暂未确认，保守排除当天日线。':'';
   if(url.searchParams.get('quote')==='1'){
    const resource='/api/v1.0/quote/stock-quote';let quote;
    try{quote=await upstream(resource,{code_list:['US.'+symbol]},session.token.access_token);}catch(e){if(!e.authExpired)throw e;await refreshSession(env,sid,session);quote=await upstream(resource,{code_list:['US.'+symbol]},session.token.access_token);}
    const item=quote.data?.quote_list?.find(x=>x.code==='US.'+symbol);
    if(!item||!Number.isFinite(Number(item.last_price))||Number(item.last_price)<=0)throw Error('富途未返回有效最新成交价，请手动填写价格。');
    result.quote={price:Number(item.last_price),time:Number(item.data_time)||null,date:item.data_date||null,session:'常规时段最新成交价',fetchedAt:new Date().toISOString()};
   }
   return json(result);
  }
  return json({error:'Not found'},404);
 }catch(e){return json({error:e.message||'后台请求失败，请重新连接。',needsAuth:!!e.needsAuth,upstreamCode:e.upstreamCode??null,upstreamKind:e.upstreamKind||null},e.needsAuth?401:400);}
}};
