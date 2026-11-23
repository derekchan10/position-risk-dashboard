(function(){
'use strict';
const $=id=>document.getElementById(id),f=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
let market=null,analysis=null,signature='',busy=false,cloudBackend=false,backendReady=Promise.resolve(),requestVersion=0,controller=null,autoTimer=null,priceBinding=null,authorized=null;
const price=n=>Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const now=new Date(),ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
$('analysis-date').value=ny;$('analysis-date').max=ny;
function text(tag,t){const e=document.createElement(tag);e.textContent=t;return e;}
const rows=[0,1].map((_,i)=>{
 const tr=document.createElement('tr'),p=document.createElement('input'),percent=document.createElement('input');
 p.type=percent.type='number';
 p.addEventListener('blur',()=>{if(p.value!==''&&Number.isFinite(Number(p.value)))p.value=Number(p.value).toFixed(2);savePlan();});percent.readOnly=true;p.min='0';p.step='any';percent.min='0';percent.max='100';percent.step='any';
 p.setAttribute('aria-label',`第${i+1}档止盈价格`);percent.setAttribute('aria-label',`第${i+1}档卖出比例，百分比`);p.placeholder='价格';percent.placeholder='%';
 const r=text('td','—'),net=text('td','—');for(const input of [p,percent]){const td=document.createElement('td');td.append(input);tr.append(td);input.addEventListener('input',()=>{if(input===p)percent.value=p.value?([40,30][i]):'';renderPlan();savePlan();});}tr.append(r,net);$('take-profit-rows').append(tr);return {p,percent,r,net};
});
function savePlan(){try{localStorage.setItem('profit-plan-week-v1',JSON.stringify({rows:rows.map(x=>({price:x.p.value,percent:x.percent.value})),symbol:$('stock-symbol').value,date:$('analysis-date').value,style:$('plan-style').value}));}catch(e){}}
try{const saved=JSON.parse(localStorage.getItem('profit-plan-week-v1')||'null');if(saved){$('stock-symbol').value=saved.symbol||'NVDA';if(saved.date&&saved.date<=ny)$('analysis-date').value=saved.date;$('plan-style').value='week';}}catch(e){}
function current(){const s=window.PositionRisk.read();return {s,r:window.PositionRisk.calculate(s)};}
function renderSnapshot(){
 const s=window.PositionRisk.read(),short=s.side==='short';
 $('snapshot-extreme-label').textContent=short?'近10日高点':'近10日低点';
 $('snapshot-price').textContent='—';$('snapshot-extreme').textContent='—';$('atr-value').textContent='日线 ATR(14)：等待行情';
 $('snapshot-time').textContent=authorized===false?'请先授权富途行情':'等待股票行情';
 const valid=Number.isFinite(s.entry)&&s.entry>0&&Number.isFinite(s.stop)&&s.stop>0;
 let distance=valid?f(Math.abs(s.entry-s.stop)/s.entry*100)+'%':'—';
 if(market){
  const quote=market.quote;
  if(quote&&Number.isFinite(Number(quote.price))&&Number(quote.price)>0){
   $('snapshot-price').textContent=price(Number(quote.price))+' USD';
   const time=quote.time?new Date(quote.time):null;
   $('snapshot-time').textContent=time&&!Number.isNaN(time.getTime())?'报价：'+time.toLocaleString('zh-CN',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' 美东':quote.date?'报价日期：'+quote.date+'（美东），具体时间未提供':'报价时间未提供';
  }else $('snapshot-time').textContent='本次未提供当前报价';
  const bars=market.bars.filter(b=>b.date<$('analysis-date').value).sort((a,b)=>a.date.localeCompare(b.date));
  if(bars.length){
   const extreme=bars.slice(-10).reduce((a,b)=>short?(b.high>=a.high?b:a):(b.low<=a.low?b:a));
   $('snapshot-extreme').textContent=price(short?extreme.high:extreme.low)+' · '+extreme.date;
   if(bars.length>=14){const atr=TradePlanner.wilderATR(bars);$('atr-value').textContent=`日线 ATR(14) ${price(atr)} USD · 截至 ${bars.at(-1).date} · Wilder`;if(valid&&atr>0)distance+=' / '+f(Math.abs(s.entry-s.stop)/atr)+' ATR';}
  }
 }
 $('snapshot-distance').textContent=distance;
}
function authorizationHint(){
 if(authorized!==false)return;
 $('target-table').hidden=true;$('profit-note').hidden=true;
 $('market-status').textContent='先授权，再判断';
 $('market-error').textContent='连接富途行情后，自动评估开仓位置与止盈空间。';
 $('plan-trade-context').textContent='等待富途授权';
 if(!$('entry').value||!$('stop').value){$('error').textContent='';$('plan-error').textContent='';}
}
function renderPlan(){
 renderSnapshot();
 $('plan-error').textContent='';$('plan-summary').replaceChildren();rows.forEach(x=>{x.r.textContent='—';x.net.textContent='—';});
 if(authorized===false){authorizationHint();$('plan-summary').append(text('p','请先授权富途行情，系统将自动生成止盈建议。'));return;}
 try{
  const {s,r}=current();$('plan-trade-context').textContent=`${s.side==='long'?'做多':'做空'} ${price(s.entry)} / 止损 ${price(s.stop)}`;
  const raw=rows.map(x=>({price:x.p.value,percent:x.percent.value})),active=raw.filter(x=>x.price!==''||x.percent!=='');
  if(!active.length){$('plan-summary').append(text('p',analysis?'当前不生成止盈计划，等待更合适的入场位置。':'填写参数后自动分析。'));return;}
  const result=TradePlanner.profits(s,r,raw);let n=0;
  rows.forEach(x=>{if(x.p.value!==''||x.percent.value!==''){const a=result.rows[n++];x.r.textContent=f(a.r)+':1'+(analysis&&analysis.atr>0?' / '+f(Math.abs(a.price-s.entry)/analysis.atr)+' ATR':'');x.net.textContent=f(a.net)+' U';}});
  const summary=document.createElement('div');summary.className='plan-summary';
  [`两档预计净收益 ${f(result.net)} U · ${f(result.netR)}R`, `兑现 ${f(result.total)}% · 剩余 ${f(result.remaining*100)}%（${f(result.remainingQuantity)}单位）`].forEach(t=>summary.append(text('div',t)));
  summary.append(text('div',`计划减仓数量：${result.rows.map((x,i)=>'P'+(i+1)+' '+f(x.quantity)+'单位').join('；')}。`));$('plan-summary').append(summary);
 }catch(e){$('plan-trade-context').textContent='等待有效交易价格';$('plan-error').textContent=e.message;}
}
function renderAnalysis(){
 if(!market)return;
 try{
  const {s}=current();analysis=TradePlanner.analyze(market,$('analysis-date').value,s.entry,s.stop,s.side);
  const maxATR=Number($('max-target-atr').value),week=TradePlanner.weekTargets(analysis,maxATR);analysis.targets=week.targets;analysis.weekReason=week.reason;
  signature=JSON.stringify([s.entry,s.stop,s.side,$('analysis-date').value]);
  $('market-results').hidden=false;
  $('zones-list').replaceChildren(...analysis.zones.slice(0,12).map(z=>{const div=document.createElement('div');div.className='zone-row';div.append(text('div',`${price(z.low)}${z.high>z.low?'～'+price(z.high):''} · ${f(z.r)}:1 · ${f(z.atrDistance)} ATR`),text('small',z.labels.join('；')));return div;}));

  $('target-candidates').replaceChildren(...(analysis.targets.length?analysis.targets.map((z,i)=>{const div=document.createElement('div');div.className='zone-row';div.append(text('strong',`候选${i+1}：${price(z.target)} · 盈亏比 ${f(z.r)}:1 · ${f(z.atrDistance)} ATR`),text('small',z.labels.join('；')));return div;}):[text('p','暂无符合条件的水平候选。可以查看全部水平区。')]));
  adoptTargets();
  $('market-meta').replaceChildren(text('span',`数据：${market.symbol} / ${market.currency}；最后采用 ${analysis.lastDate}，${analysis.count}根日线。获取时间 ${market.fetchedAt||'未提供'}。${market.quote?' 报价时间：'+(market.quote.time?new Date(market.quote.time).toISOString():market.quote.date||'未提供')+'；'+market.quote.session:''}`));
  if(market.sourceUrl){const a=document.createElement('a');a.textContent=' 查看行情来源';a.href=market.sourceUrl.startsWith('https://')?market.sourceUrl:'https://finance.yahoo.com/';a.target='_blank';a.rel='noopener noreferrer';$('market-meta').append(a);}
  const gap=(Date.parse($('analysis-date').value)-Date.parse(analysis.lastDate))/86400000;
  const near=analysis.zones[0],dir=s.side==='short'?-1:1,risk=Math.abs(s.entry-s.stop);
  const recent=market.bars.filter(b=>b.date<$('analysis-date').value).slice(-10);
  const base=dir===1?Math.min(...recent.map(b=>b.low)):Math.max(...recent.map(b=>b.high));
  const eligible=analysis.targets.length>0;
  const level=s.side==='long'?'压力':'支撑';
  $('market-status').textContent=eligible?'空间达标 · 可纳入计划':!near?'先观望 · 缺少有效目标':near.r<1.5?'暂不开仓 · 收益空间不足':'先等待 · 目标距离偏远';
  $('market-status').parentElement?.setAttribute('data-state',eligible?'ready':'wait');
  $('market-error').textContent=eligible?`最近${level}位提供 ${f(near.r)}R 空间，达到 ≥1.5R 门槛；可按右侧计划分批止盈，仍需自行确认入场信号。`:!near?`当前价前方没有已确认的水平${level}区，暂不生成开仓计划。`:near.r<1.5?`到最近${level}位仅有 ${f(near.r)}R，低于 1.5R 门槛。等待更合适的位置，不跳过近处${level}寻找远目标。`:`最近${level}位距开仓价 ${f(near.atrDistance)} ATR，超过 ${f(maxATR)} ATR 筛选上限，暂不纳入一周交易计划。`;
  const evidence=[
   ['止损距离',`${price(risk)} 美元 · ${f(risk/analysis.atr)} ATR`],
   [dir===1?'距近10日低点':'距近10日高点',`${price(Math.abs(s.entry-base))} 美元 · ${f(Math.abs(s.entry-base)/analysis.atr)} ATR`],
   [dir===1?'最近压力区':'最近支撑区',near?`${price(near.low)}${near.high>near.low?' ～ '+price(near.high):''}`:'暂无已确认水平区'],
   ['水平区依据',near?near.labels.slice(0,2).join('；'):'数据不足'],
   ['最近水平区盈亏比',near?`${f(near.r)}R / 要求 ≥ 1.5R`:'无法计算'],
   ['1.5R所需价格',price(s.entry+dir*1.5*risk)]
  ];
  $('decision-evidence').replaceChildren(...evidence.map(([label,value])=>{const row=text('div','');row.className='evidence-row';row.append(text('span',label),text('strong',value));return row;}));
  $('target-table').hidden=!eligible;$('profit-note').hidden=!eligible;
  if(gap>5)$('market-error').textContent+=' 日线数据距分析日超过5天，请核对数据日期。';

 }catch(e){analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;$('market-error').textContent=e.message;}
}
function refreshSizing(){ $('entry').dispatchEvent(new Event('input',{bubbles:true})); }
async function loadStock(options={}){
 clearTimeout(autoTimer);
 if(busy)return;
 await backendReady;
 if(authorized!==true){authorizationHint();renderPlan();return;}
 const autoPrices=options.autoPrices===true||!$('entry').value||!$('stop').value||priceBinding!==$('stock-symbol').value.trim().toUpperCase();
 const requestId=++requestVersion;controller=new AbortController();
 busy=true;$('market-error').textContent='';$('market-status').textContent=autoPrices?'正在获取新股票报价与近期低点…':'正在读取日线…';market=null;analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;
 const symbol=$('stock-symbol').value.trim().toUpperCase(),entryBefore=$('entry').value,stopBefore=$('stop').value,sideBefore=window.PositionRisk.read().side;
 try{
  if(!autoPrices)current();await backendReady;
  if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol))throw Error('请输入有效美股代码。');$('stock-symbol').value=symbol;
  if(autoPrices)$('analysis-date').value=ny;
  const requestedDate=$('analysis-date').value;
  if(!cloudBackend&&location.origin!=='http://localhost:8768')throw Error('请通过“打开富途线上看板”链接进入授权行情入口。');
  const response=await fetch('/api/futu/bars?'+new URLSearchParams({symbol,date:requestedDate,quote:'1'}),{signal:controller.signal});const j=await response.json();
  if(requestId!==requestVersion)return;
  if(!response.ok){if(j.needsAuth)await futuStatus();throw Error(j.error||'富途行情读取失败');}
  if($('stock-symbol').value.trim().toUpperCase()!==symbol||$('analysis-date').value!==requestedDate||window.PositionRisk.read().side!==sideBefore)throw Error('股票、方向或日期已改变，请重新生成。');
  if(autoPrices){
   if($('entry').value!==entryBefore||$('stop').value!==stopBefore)throw Error('你已手动修改价格，本次自动填价已取消，请重新生成。');
   const defaults=TradePlanner.priceDefaults(j,sideBefore);$('entry').value=Number(defaults.entry).toFixed(2);$('stop').value=defaults.stop===null?'':Number(defaults.stop).toFixed(2);priceBinding=symbol;
   const qt=j.quote?.time?new Date(j.quote.time).toLocaleString('zh-CN',{timeZone:'America/New_York'})+' 美东':j.quote?.date||'时间未提供';
   $('auto-price-note').textContent=`止损参考：近10日${sideBefore==='short'?'高点＋':'低点－'}0.1 ATR，可手动调整。`;$('auto-price-note').title=`报价时间 ${qt}；近期极值 ${price(defaults.base)}；区间 ${defaults.from} 至 ${defaults.to}`;
   refreshSizing();
   if(defaults.stop===null)throw Error('近期极值不在正确止损方向，请根据结构手动填写止损；不会沿用旧股票价格。');
  }
  market=j;renderSnapshot();renderAnalysis();savePlan();
 }catch(e){if(requestId!==requestVersion||e.name==='AbortError')return;$('market-error').textContent=e.message;$('market-status').textContent='暂无法判断 · 行情未就绪';}
 finally{if(requestId===requestVersion){busy=false;}}
}
function adoptTargets(){
 const weights=[40,30];rows.forEach((x,i)=>{x.p.value=analysis?.targets[i]?analysis.targets[i].target.toFixed(2):'';x.percent.value=analysis?.targets[i]?weights[i]:'';});renderPlan();savePlan();
}
async function futuStatus(autoSelect=false){
 const local=location.origin==='http://localhost:8768'||(location.hostname.endsWith('.workers.dev')||location.hostname==='cw-position-helper.pages.dev'||location.hostname==='cw.dcdddd.com');
 $('futu-connect').hidden=!local;$('futu-disconnect').hidden=true;
 if(!local){$('futu-status').replaceChildren(text('span','富途线上版已启用。请在 HTTPS 入口连接授权：'));const link=document.createElement('a');link.href='https://cw-futu-backend.dchan0831.workers.dev';link.textContent='打开富途线上看板';link.target='_blank';link.rel='noopener noreferrer';$('futu-status').append(link);return;}
 try{const r=await fetch('/auth/status'),j=await r.json();cloudBackend=j.cloud===true;authorized=j.connected===true;$('futu-status').textContent=j.connected?(cloudBackend?'已连接富途云端 · 只读行情':'已连接富途 · 只读行情'):'请先授权富途行情；授权后自动读取报价和生成止盈建议。';$('futu-connect').hidden=j.connected;$('futu-disconnect').hidden=!j.connected;$('futu-panel').hidden=false;renderPlan();authorizationHint();return j.connected;}catch(e){$('futu-status').textContent='本机授权服务暂不可用。';}
}

$('futu-connect').addEventListener('click',async()=>{try{$('futu-connect').disabled=true;const r=await fetch('/auth/start',{method:'POST'}),j=await r.json();if(!r.ok)throw Error(j.error);const url=new URL(j.url);if(url.origin!=='https://webapi.futunn.com')throw Error('授权地址无效');location.assign(url.href);}catch(e){$('futu-status').textContent=e.message;$('futu-connect').disabled=false;}});
$('futu-disconnect').addEventListener('click',async()=>{const r=await fetch('/auth/disconnect',{method:'POST'});if(r.ok){market=null;analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;await futuStatus();}});
backendReady=futuStatus(true);
backendReady.then(connected=>{if(connected&&!busy)loadStock({autoPrices:true});});

$('stock-symbol').addEventListener('input',()=>{
 clearTimeout(autoTimer);requestVersion++;controller?.abort();busy=false;priceBinding=null;market=null;analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;
 $('entry').value='';$('stop').value='';refreshSizing();$('error').textContent='';$('plan-error').textContent='';$('plan-trade-context').textContent='等待新股票报价';$('auto-price-note').textContent='切换股票后自动获取新报价及止损参考，亏损预算保持不变。';$('market-status').textContent='等待股票代码输入完成…';$('market-error').textContent='';
 if(/^[A-Z][A-Z0-9.-]{0,14}$/.test($('stock-symbol').value.trim().toUpperCase()))autoTimer=setTimeout(()=>loadStock({autoPrices:true}),900);
});
$('stock-symbol').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(autoTimer);loadStock({autoPrices:true});}});
for(const id of ['entry','stop','liquidation']){
 const field=$(id);
 const format=()=>{if(field.value!==''&&Number.isFinite(Number(field.value)))field.value=Number(field.value).toFixed(2);};
 format();field.addEventListener('blur',format);
 if(id!=='liquidation')field.addEventListener('input',()=>{priceBinding=$('stock-symbol').value.trim().toUpperCase();});
}

$('max-target-atr').addEventListener('change',renderAnalysis);
$('analysis-date').addEventListener('change',()=>{savePlan();return loadStock();});
window.addEventListener('trade-input-change',()=>{
 renderPlan();authorizationHint();
 if(market){renderAnalysis();return;}
 if(!busy&&$('entry').value&&$('stop').value){clearTimeout(autoTimer);autoTimer=setTimeout(()=>loadStock(),600);}
});


renderPlan();
})();
