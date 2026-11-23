(function(){
'use strict';
const $=id=>document.getElementById(id),f=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
let market=null,analysis=null,signature='',busy=false,cloudBackend=false,backendReady=Promise.resolve(),requestVersion=0,controller=null,autoTimer=null,priceBinding=null,authorized=null,pendingBuffer=false,pendingEntryReset=false;
const price=n=>Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
let previousSide=window.PositionRisk.read().side;
const buffer=()=>Number($('stop-buffer').value)||.1;
const now=new Date(),ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
$('analysis-date').value=ny;$('analysis-date').max=ny;
function text(tag,t){const e=document.createElement(tag);e.textContent=t;return e;}
const ratioHelpButtons=[];
let rows=[],targetSignature='';
function createTargetRow(i){
 const tr=document.createElement('tr'),p=document.createElement('input'),percent=document.createElement('input');
 p.type=percent.type='number';
 p.addEventListener('blur',()=>{if(p.value!==''&&Number.isFinite(Number(p.value)))p.value=Number(p.value).toFixed(2);savePlan();});percent.readOnly=false;p.min='0';p.step='any';percent.min='0';percent.max='100';percent.step='any';
 p.setAttribute('aria-label',`第${i+1}档止盈价格`);percent.setAttribute('aria-label',`第${i+1}档平仓比例，百分比`);p.placeholder='价格';percent.placeholder='%';
 const ratioCell=document.createElement('td'),r=text('span','—'),net=text('td','—');r.className='ratio-number';
 const label=text('div','盈亏比'),help=text('button','?');label.className='ratio-label';help.type='button';help.className='help-toggle';help.setAttribute('aria-label',`第${i+1}档盈亏比说明`);help.setAttribute('aria-expanded','false');help.setAttribute('aria-controls','ratio-help');help.setAttribute('popovertarget','ratio-help');ratioHelpButtons.push(help);label.append(help);ratioCell.append(label,r);
 net.setAttribute('data-label','本档预计净收益');for(const input of [p,percent]){const td=document.createElement('td');td.setAttribute('data-label',input===p?`第${i+1}档 · 止盈价格`:'平仓原始仓位');td.append(input);if(input===percent)td.append(text('span','%'));tr.append(td);input.addEventListener('input',()=>{renderPlan();savePlan();});}tr.append(ratioCell,net);$('take-profit-rows').append(tr);return {p,percent,r,net};
}
function savePlan(){try{localStorage.setItem('profit-plan-week-v1',JSON.stringify({rows:rows.map(x=>({price:x.p.value,percent:x.percent.value})),symbol:$('stock-symbol').value,date:$('analysis-date').value,style:$('plan-style').value,buffer:buffer()}));}catch(e){}}
try{const saved=JSON.parse(localStorage.getItem('profit-plan-week-v1')||'null');if(saved){if([.1,.2,.3].includes(Number(saved.buffer)))$('stop-buffer').value=String(saved.buffer);$('stock-symbol').value=saved.symbol||'NVDA';if(saved.date&&saved.date<=ny)$('analysis-date').value=saved.date;$('plan-style').value='week';}}catch(e){}
function current(){const s=window.PositionRisk.read();return {s,r:window.PositionRisk.calculate(s)};}
function renderSnapshot(){
 const s=window.PositionRisk.read(),short=s.side==='short';
 $('snapshot-extreme-label').textContent=short?'近10日高点':'近10日低点';
 $('snapshot-price').textContent='—';$('snapshot-extreme').textContent='—';$('atr-value').textContent='等待行情';
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
   if(bars.length>=14){const atr=TradePlanner.wilderATR(bars);$('atr-value').textContent=`${price(atr)} 美元／股 · ${bars.at(-1).date}`;}
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
 if(authorized===false){authorizationHint();$('plan-summary').append(text('p','授权行情后，自动匹配水平目标位。'));return;}
 try{
  const {s,r}=current();$('plan-trade-context').textContent=`${s.side==='long'?'做多':'做空'} ${price(s.entry)} / 止损 ${price(s.stop)}`;
  const raw=rows.map(x=>({price:x.p.value,percent:x.percent.value})).filter(x=>!(x.percent!==''&&Number(x.percent)===0)),active=raw.filter(x=>x.price!==''||x.percent!=='');
  if(!active.length){$('plan-summary').append(text('p',rows.length?'当前平仓比例为0%，保留全部仓位。':analysis?'暂无合适目标，等待更好的入场位置。':'输入股票与交易价格，自动生成分批计划。'));return;}
  const result=TradePlanner.profits(s,r,raw);let n=0;
  rows.forEach(x=>{if(x.percent.value!==''&&Number(x.percent.value)===0){x.r.textContent=f((s.side==='short'?-1:1)*(Number(x.p.value)-s.entry)/Math.abs(s.entry-s.stop))+'R';x.net.textContent='0 U';}else if(x.p.value!==''||x.percent.value!==''){const a=result.rows[n++];x.r.textContent=f(a.r)+'R';x.net.textContent=f(a.net)+' U';}});
  const summary=document.createElement('div');summary.className='plan-summary';
  [`计划净收益 ${f(result.net)} U`, `平仓 ${f(result.total)}% 原始仓位 · 保留 ${f(result.remaining*100)}%`].forEach(t=>summary.append(text('div',t)));
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
  $('market-error').textContent=eligible?`最近${level}位盈亏比 ${f(near.r)}R，达到 1.5R 门槛；可按右侧计划分批止盈，仍需自行确认入场信号。`:!near?`当前价前方没有已确认的水平${level}区，暂不生成开仓计划。`:near.r<1.5?`到最近${level}位盈亏比仅 ${f(near.r)}R，低于 1.5R 门槛。等待更合适的位置，不跳过近处${level}寻找远目标。`:`最近${level}位距离偏远，超过当前距离筛选上限，暂不纳入一周交易计划。`;
  const sources=near?near.labels.map(label=>({type:label.split(' · ').at(-1).replace(/\s*\d{4}-\d{2}-\d{2}.*$/,''),date:label.match(/\d{4}-\d{2}-\d{2}/)?.[0]||'未提供'})):[];
  const evidence=[
   [dir===1?'潜在压力价格':'潜在支撑价格',near?`${price(near.low)}${near.high>near.low?' ～ '+price(near.high):''}`:'暂无'],
   ['来源类型',[...new Set(sources.map(x=>x.type))].join('、')||'暂无'],
   ['形成日期',[...new Set(sources.map(x=>x.date))].join('、')||'暂无']
  ];
  $('zone-explanation').textContent=near?`最近水平区盈亏比 ${f(near.r)}R，筛选门槛为1.5R；达到该盈亏比的价格为 ${price(s.entry+dir*1.5*risk)}。止损距离 ${price(risk)} 美元。水平区聚合了 ${near.labels.length} 个历史价位。`:'当前价前方未找到已确认的历史水平区，不生成固定目标。';
  renderPriceChart(s);
  $('atr-distances').replaceChildren(text('p',`止损距离 ${f(risk/analysis.atr)} ATR；距近期${dir===1?'低':'高'}点 ${f(Math.abs(s.entry-base)/analysis.atr)} ATR；目标最远 ${f(maxATR)} ATR。`),...analysis.targets.map((z,i)=>text('p',`第${i+1}档目标距离 ${f(z.atrDistance)} ATR`)));
  $('decision-evidence').replaceChildren(...evidence.map(([label,value])=>{const row=text('div','');row.className='evidence-row';row.append(text('span',label),text('strong',value));return row;}));
  $('target-table').hidden=!eligible;$('profit-note').hidden=!eligible;
  if(gap>5)$('market-error').textContent+=' 日线数据距分析日超过5天，请核对数据日期。';

 }catch(e){analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;$('market-error').textContent=e.message;}
}
function renderPriceChart(s){
 const bars=market.bars.filter(b=>b.date<$('analysis-date').value).sort((a,b)=>a.date.localeCompare(b.date)).slice(-90);
 if(bars.length<2){$('price-chart').replaceChildren();$('chart-legend').replaceChildren();return;}
 const zones=analysis.targets.length?analysis.targets:analysis.zones.slice(0,3),values=[...bars.map(b=>b.close),s.entry,s.stop,...zones.flatMap(z=>[z.low,z.high])];
 const low=Math.min(...values),high=Math.max(...values),pad=Math.max((high-low)*.1,.01),min=low-pad,max=high+pad;
 const y=value=>+(180-(value-min)/(max-min)*160).toFixed(2),x=i=>+(38+i/(bars.length-1)*342).toFixed(2);
 const safeDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'';
 let svg='<svg viewBox="0 0 440 210" role="img" aria-label="近期收盘价、候选水平区、开仓价和止损价"><title>近期价格与候选水平区</title>';
 for(let i=0;i<4;i++){const value=min+(max-min)*i/3,yy=y(value);svg+=`<line x1="38" x2="380" y1="${yy}" y2="${yy}" stroke="currentColor" opacity=".1"/><text x="435" y="${yy+4}" text-anchor="end" font-size="10" fill="currentColor">${value.toFixed(2)}</text>`;}
 zones.forEach(z=>{const top=y(z.high),bottom=y(z.low);svg+=`<rect x="38" y="${top}" width="342" height="${Math.max(2,bottom-top)}" fill="#d69a32" opacity=".2"/><line x1="38" x2="380" y1="${y(z.target)}" y2="${y(z.target)}" stroke="#bd841b" stroke-dasharray="4 3"/>`;});
 svg+=`<polyline points="${bars.map((b,i)=>x(i)+','+y(b.close)).join(' ')}" fill="none" stroke="#448bc3" stroke-width="2"/>`;
 for(const [value,color] of [[s.entry,'#14775b'],[s.stop,'#c65353']])svg+=`<line x1="38" x2="380" y1="${y(value)}" y2="${y(value)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 3"/>`;
 svg+=`<text x="38" y="201" font-size="10" fill="currentColor">${safeDate(bars[0].date)}</text><text x="380" y="201" text-anchor="end" font-size="10" fill="currentColor">${safeDate(bars.at(-1).date)}</text></svg>`;
 $('price-chart').innerHTML=svg;
 $('chart-legend').replaceChildren(text('div',`蓝线：日线收盘价 · 绿线：开仓 ${price(s.entry)} · 红线：止损 ${price(s.stop)}`),...zones.map((z,i)=>text('div',`黄色区 ${i+1}：${s.side==='short'?'潜在支撑':'潜在压力'} ${price(z.low)}${z.high>z.low?' ～ '+price(z.high):''} · ${f(z.r)}R · ${f(z.atrDistance)} ATR`)));
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
  if(!autoPrices&&!pendingBuffer)current();await backendReady;
  if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol))throw Error('请输入有效美股代码。');$('stock-symbol').value=symbol;
  if(autoPrices)$('analysis-date').value=ny;
  const requestedDate=$('analysis-date').value;
  if(!cloudBackend&&location.origin!=='http://localhost:8768')throw Error('请通过“打开富途线上看板”链接进入授权行情入口。');
  const response=await fetch('/api/futu/bars?'+new URLSearchParams({symbol,date:requestedDate,quote:'1'}),{signal:controller.signal});const j=await response.json();
  if(requestId!==requestVersion)return;
  if(!response.ok){if(j.needsAuth)await futuStatus();throw Error(j.error||'富途行情读取失败');}
  if($('stock-symbol').value.trim().toUpperCase()!==symbol||$('analysis-date').value!==requestedDate)throw Error('股票或日期已改变，请重新生成。');
  const responseSide=window.PositionRisk.read().side;
  if(autoPrices||pendingEntryReset){
   if($('entry').value!==entryBefore||$('stop').value!==stopBefore)throw Error('你已手动修改价格，本次自动填价已取消，请重新生成。');
   const defaults=TradePlanner.priceDefaults(j,responseSide,buffer());$('entry').value=Number(defaults.entry).toFixed(2);$('stop').value=defaults.stop===null?'':Number(defaults.stop).toFixed(2);priceBinding=symbol;pendingEntryReset=false;
   const qt=j.quote?.time?new Date(j.quote.time).toLocaleString('zh-CN',{timeZone:'America/New_York'})+' 美东':j.quote?.date||'时间未提供';
   $('auto-price-note').textContent=`止损参考：近10日${responseSide==='short'?'高点＋':'低点－'}${buffer()} ATR${buffer()===.1?'（较小缓冲）':''}，可手动调整。`;$('auto-price-note').title=`报价时间 ${qt}；近期极值 ${price(defaults.base)}；区间 ${defaults.from} 至 ${defaults.to}`;
   refreshSizing();
   if(defaults.stop===null)throw Error('近期极值不在正确止损方向，请根据结构手动填写止损；不会沿用旧股票价格。');
  }
  market=j;if(pendingBuffer){pendingBuffer=false;applyBuffer();}renderSnapshot();renderAnalysis();savePlan();
 }catch(e){if(requestId!==requestVersion||e.name==='AbortError')return;$('market-error').textContent=e.message;$('market-status').textContent='暂无法判断 · 行情未就绪';}
 finally{if(requestId===requestVersion){busy=false;}}
}
function adoptTargets(){
 const targets=analysis?.targets||[],key=JSON.stringify([market?.symbol,analysis?.side,analysis?.date,targets.map(z=>z.target.toFixed(2))]);
 if(key!==targetSignature){
  targetSignature=key;$('take-profit-rows').replaceChildren();ratioHelpButtons.length=0;
  rows=targets.map((z,i)=>{const row=createTargetRow(i);row.p.value=z.target.toFixed(2);
   const cents=Math.floor(7000/targets.length)+(i<7000%targets.length?1:0);row.percent.value=String(cents/100);return row;});
 }
 $('target-count').textContent=targets.length?`${targets.length}档候选 · 比例可调整`:'';
 renderPlan();savePlan();
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

function applyBuffer(){
 if(!market){pendingBuffer=true;return;}
 try{
  const s=window.PositionRisk.read(),data={...market,bars:market.bars.filter(b=>b.date<$('analysis-date').value),quote:{price:s.entry}};
  const defaults=TradePlanner.priceDefaults(data,s.side,buffer());
  $('stop').value=defaults.stop===null?'':defaults.stop.toFixed(2);
  $('auto-price-note').textContent=`止损参考：近10日${s.side==='short'?'高点＋':'低点－'}${buffer()} ATR${buffer()===.1?'（较小缓冲）':''}，可手动调整。`;
  refreshSizing();renderSnapshot();renderAnalysis();savePlan();
  if(defaults.stop===null)$('market-error').textContent='近期极值不在正确止损方向，请手动设置止损。';
 }catch(e){$('market-error').textContent=e.message;}
}
$('stop-buffer').addEventListener('change',()=>{savePlan();applyBuffer();});
$('max-target-atr').addEventListener('change',renderAnalysis);
$('analysis-date').addEventListener('change',()=>{savePlan();return loadStock();});
window.addEventListener('trade-input-change',()=>{
 const side=window.PositionRisk.read().side;
 if(side!==previousSide){
  previousSide=side;
  const quote=Number(market?.quote?.price);
  if(market&&Number.isFinite(quote)&&quote>0){
   $('entry').value=quote.toFixed(2);priceBinding=$('stock-symbol').value.trim().toUpperCase();
   pendingEntryReset=false;applyBuffer();return;
  }
  pendingEntryReset=true;pendingBuffer=true;
  if(!busy)loadStock({autoPrices:true});
  return;
 }
 renderPlan();authorizationHint();
 if(market){renderAnalysis();return;}
 if(!busy&&$('entry').value&&$('stop').value){clearTimeout(autoTimer);autoTimer=setTimeout(()=>loadStock(),600);}
});


$('ratio-help').addEventListener('toggle',event=>{
 ratioHelpButtons.forEach(button=>button.setAttribute('aria-expanded',String(event.newState==='open')));
});
$('atr-help').addEventListener('toggle',event=>{
 $('atr-help-toggle').setAttribute('aria-expanded',String(event.newState==='open'));
});
renderPlan();
})();
