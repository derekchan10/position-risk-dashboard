import assert from 'node:assert/strict';
import worker,{normalize,validScope} from '../worker/index.mjs';
const data=new Map();const env={TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64url'),SESSIONS:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)},ASSETS:{fetch:async()=>new Response('static')}};
const origin='https://cw-test.workers.dev';const req=(path,method='GET',headers={})=>new Request(origin+path,{method,headers});
let r=await worker.fetch(req('/api/futu/bars?symbol=NVDA&date=2026-11-20'),env);assert.equal(r.status,401);
r=await worker.fetch(req('/auth/start','POST',{Origin:'https://evil.example'}),env);assert.equal(r.status,403);
r=await worker.fetch(req('/auth/callback?state=wrong&code=bad'),env);assert.equal(r.status,400);
const original=globalThis.fetch;globalThis.fetch=async(url,opts)=>{
 if(url.endsWith('/register')){assert.equal(JSON.parse(opts.body).scope,'quote:read');return Response.json({client_id:'test-client'});}
 if(url.endsWith('/token'))return Response.json({access_token:'not-a-real-token',refresh_token:'test-refresh',scope:'quote:read',expires_in:7200});
 throw Error('Unexpected upstream');
};
r=await worker.fetch(req('/auth/start','POST',{Origin:origin}),env);assert.equal(r.status,200);
const auth=new URL((await r.json()).url),state=auth.searchParams.get('state');assert.equal(auth.searchParams.get('scope'),'quote:read');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
const browserCookie=r.headers.get('Set-Cookie').split(';')[0];
r=await worker.fetch(req('/auth/callback?state='+state+'&code=test'),env);assert.equal(r.status,400,'browser binding required');
r=await worker.fetch(req('/auth/callback?state='+state+'&code=test','GET',{Cookie:browserCookie}),env);assert.equal(r.status,303);const sessionCookie=r.headers.get('Set-Cookie').split(';')[0];
assert.ok([...data.values()].every(v=>!v.includes('not-a-real-token')),'tokens encrypted at rest');
r=await worker.fetch(req('/auth/status','GET',{Cookie:sessionCookie}),env);assert.equal((await r.json()).connected,true);
r=await worker.fetch(req('/auth/status'),env);assert.equal((await r.json()).connected,false,'visitor cannot use another session');
r=await worker.fetch(req('/auth/disconnect','POST',{Cookie:sessionCookie,Origin:origin}),env);assert.equal(r.status,200);
r=await worker.fetch(req('/auth/status','GET',{Cookie:sessionCookie}),env);assert.equal((await r.json()).connected,false);
for(const scope of ['','quote:read trade:read','quote:read trade:write','quote:read quote:write'])assert.throws(()=>validScope({scope}));
const bars=normalize({data:{kline_list:[{date:20261120,open:1,high:2,low:1,close:2},{date:20261123,open:2,high:3,low:1,close:2}]}},'NVDA','2026-11-23').bars;assert.equal(bars.length,1);
globalThis.fetch=original;console.log('PASS: PKCE, state/browser binding, encrypted sessions, visitor isolation, disconnect, scope, date cutoff');
