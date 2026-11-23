const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),code=fs.readFileSync('planner-ui.js','utf8').replace('backendReady.then(connected=>{if(connected&&!busy)loadStock({autoPrices:true});});','');
const fixture={...require('../tests/fixtures/nvda-history.json'),quote:{price:130,time:1795450000000,session:'fixture'}};
class Element{constructor(){this.value='';this.children=[];this.listeners={};}append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}setAttribute(){}dispatchEvent(e){this.listeners[e.type]?.(e);}addEventListener(n,f){this.listeners[n]=f;}}
const storage=new Map([['profit-plan-week-v1',JSON.stringify({symbol:'NVDA',date:'2020-01-01'})]]);
function boot(){
 const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(x=>[x[1],new Element()]));
 for(const m of html.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*>/g))elements[m[1]].value=m[0].match(/value="([^"]*)"/)?.[1]||'';
 elements['max-target-atr'].value='4';elements['stop-buffer'].value='.1';
 const events={},state={side:'long'};
 const read=()=>({...state,entry:Number(elements.entry.value),stop:Number(elements.stop.value),risk:Number(elements.risk.value),marginLimit:Number(elements.marginLimit.value),cap:100,feeIn:.05,feeOut:.05,slip:0,reserve:0,step:0,platformMax:20});
 const context={document:{getElementById:id=>elements[id],createElement:()=>new Element()},window:{PositionRisk:{read,calculate:require('../app')},addEventListener:(n,f)=>events[n]=f},TradePlanner:require('../planner'),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{origin:'https://test.workers.dev',hostname:'test.workers.dev'},URL,URLSearchParams,Intl,Date,Event,AbortController,setTimeout,clearTimeout,fetch:async p=>({ok:true,json:async()=>p==='/auth/status'?{connected:true,cloud:true}:fixture})};
 vm.runInNewContext(code,context);return {elements,events,state};
}
(async()=>{
 let b=boot(),e=b.elements;assert.notEqual(e['analysis-date'].value,'2020-01-01');assert(html.includes('id="analysis-date" type="hidden"'));await new Promise(r=>setImmediate(r));e['analysis-date'].value='2026-11-23';await e['analysis-date'].listeners.change();
 for(const [id,value]of Object.entries({entry:'131.25',stop:'123.75',risk:'400',marginLimit:'2500'})){e[id].value=value;e[id].listeners.input({isTrusted:true});}b.events['trade-input-change']();
 let row=e['take-profit-rows'].children[0];row.children[0].children[0].value='144.25';row.children[0].children[0].listeners.input();row.children[1].children[0].value='35';row.children[1].children[0].listeners.input();
 const saved=JSON.parse(storage.get('position-manual-values-v1'));assert.equal(saved.fields.entry,'131.25');assert.equal(saved.rows[0].price,'144.25');
 b=boot();e=b.elements;await new Promise(r=>setImmediate(r));assert.equal(e.entry.value,'131.25');assert.equal(e.stop.value,'123.75');assert.equal(e.risk.value,'400');assert.equal(e.marginLimit.value,'2500');
 await e['analysis-date'].listeners.change();assert.equal(e.entry.value,'131.25');assert.equal(e.stop.value,'123.75');assert.equal(e['take-profit-rows'].children[0].children[0].children[0].value,'144.25');assert.equal(e['take-profit-rows'].children[0].children[1].children[0].value,'35');
 await e['restore-market'].listeners.click();assert.equal(e.entry.value,'130.00');assert.equal(e.stop.value,'123.75');assert.equal(e.risk.value,'400');assert.equal(e['take-profit-rows'].children[0].children[0].children[0].value,'144.25');
 // A failed quote must not remove the saved manual entry.
 e.entry.value='132.25';e.entry.listeners.input({isTrusted:true});fixture.quote.price=0;
 await e['restore-market'].listeners.click();assert.equal(JSON.parse(storage.get('position-manual-values-v1')).fields.entry,'132.25');assert.equal(e.entry.value,'132.25');fixture.quote.price=130;
 b=boot();e=b.elements;await new Promise(r=>setImmediate(r));assert.equal(e.entry.value,'132.25');e['analysis-date'].value='2026-11-23';await e['analysis-date'].listeners.change();
 // Manual exits remain editable but cannot turn a failing horizontal-space screen into a pass.
 e.entry.value='140';e.entry.listeners.input({isTrusted:true});e.stop.value='130';e.stop.listeners.input({isTrusted:true});b.events['trade-input-change']();assert.match(e['market-status'].textContent,/空间偏小/);assert.equal(e['target-table'].hidden,false,'manual plan stays visible when automatic space screen fails');assert.match(e['market-error'].textContent,/0.37R/);assert(!e['market-error'].textContent.includes('达到1.5R'));assert.equal(e['take-profit-rows'].children[0].children[0].children[0].value,'144.25');
 b.state.side='short';b.events['trade-input-change']();assert(!Object.hasOwn(JSON.parse(storage.get('position-manual-values-v1')).fields,'stop'));
 console.log('PASS: manual prices/budgets/targets persist through reload and analysis; restore market updates entry only; direction clears overrides');
})();
