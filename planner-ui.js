(function(){
'use strict';
const $=id=>document.getElementById(id),f=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
let market=null,analysis=null,signature='',busy=false,cloudBackend=false,backendReady=Promise.resolve();
const now=new Date(),ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
$('analysis-date').value=ny;$('analysis-date').max=ny;
function text(tag,t){const e=document.createElement(tag);e.textContent=t;return e;}
const rows=[0,1].map((_,i)=>{
 const tr=document.createElement('tr'),p=document.createElement('input'),percent=document.createElement('input');
 p.type=percent.type='number';percent.readOnly=true;p.min='0';p.step='any';percent.min='0';percent.max='100';percent.step='any';
 p.setAttribute('aria-label',`第${i+1}档止盈价格`);percent.setAttribute('aria-label',`第${i+1}档卖出比例，百分比`);p.placeholder='价格';percent.placeholder='%';
 const r=text('td','—'),net=text('td','—');for(const input of [p,percent]){const td=document.createElement('td');td.append(input);tr.append(td);input.addEventListener('input',()=>{if(input===p)percent.value=p.value?([40,30][i]):'';renderPlan();savePlan();});}tr.append(r,net);$('take-profit-rows').append(tr);return {p,percent,r,net};
});
function savePlan(){try{localStorage.setItem('profit-plan-week-v1',JSON.stringify({rows:rows.map(x=>({price:x.p.value,percent:x.percent.value})),symbol:$('stock-symbol').value,date:$('analysis-date').value,style:$('plan-style').value}));}catch(e){}}
try{const saved=JSON.parse(localStorage.getItem('profit-plan-week-v1')||'null');if(saved){$('stock-symbol').value=saved.symbol||'NVDA';if(saved.date&&saved.date<=ny)$('analysis-date').value=saved.date;$('plan-style').value='week';}}catch(e){}
function current(){const s=window.PositionRisk.read();return {s,r:window.PositionRisk.calculate(s)};}
function renderPlan(){
 $('plan-error').textContent='';$('plan-summary').replaceChildren();rows.forEach(x=>{x.r.textContent='—';x.net.textContent='—';});
 try{
  const {s,r}=current();$('plan-trade-context').textContent=`${s.side==='long'?'做多':'做空'} ${f(s.entry)} / 止损 ${f(s.stop)}`;
  const raw=rows.map(x=>({price:x.p.value,percent:x.percent.value})),active=raw.filter(x=>x.price!==''||x.percent!=='');
  if(!active.length){$('plan-summary').append(text('p','填写交易参数，点击生成即可获取止盈建议。'));return;}
  const result=TradePlanner.profits(s,r,raw);let n=0;
  rows.forEach(x=>{if(x.p.value!==''||x.percent.value!==''){const a=result.rows[n++];x.r.textContent=f(a.r)+':1'+(analysis&&analysis.atr>0?' / '+f(Math.abs(a.price-s.entry)/analysis.atr)+' ATR':'');x.net.textContent=f(a.net)+' U';}});
  const summary=document.createElement('div');summary.className='plan-summary';
  [`两档预计净收益 ${f(result.net)} U · ${f(result.netR)}R`, `兑现 ${f(result.total)}% · 剩余 ${f(result.remaining*100)}%（${f(result.remainingQuantity)}单位）`].forEach(t=>summary.append(text('div',t)));
  summary.append(text('div',`计划减仓数量：${result.rows.map((x,i)=>'P'+(i+1)+' '+f(x.quantity)+'单位').join('；')}。`));$('plan-summary').append(summary);
 }catch(e){$('plan-error').textContent=e.message;}
}
function renderAnalysis(){
 if(!market)return;
 try{
  const {s}=current();analysis=TradePlanner.analyze(market,$('analysis-date').value,s.entry,s.stop,s.side);
  const maxATR=Number($('max-target-atr').value),week=TradePlanner.weekTargets(analysis,maxATR);analysis.targets=week.targets;analysis.weekReason=week.reason;
  signature=JSON.stringify([s.entry,s.stop,s.side,$('analysis-date').value]);
  $('market-results').hidden=false;
  $('ma-values').replaceChildren(...analysis.mas.map(m=>{const div=document.createElement('div');div.className='ma-item';div.append(text('span','MA'+m.n+'（SMA）'),text('strong',m.value===null?'数据不足':f(m.value)));return div;}));
  $('zones-list').replaceChildren(...analysis.zones.slice(0,12).map(z=>{const div=document.createElement('div');div.className='zone-row';div.append(text('div',`${f(z.low)}${z.high>z.low?'～'+f(z.high):''} · ${f(z.r)}:1 · ${f(z.atrDistance)} ATR${z.confluence?' · 均线与水平区重合':''}`),text('small',z.labels.join('；')));return div;}));
  $('atr-value').textContent=`ATR(14) ${f(analysis.atr)} 美元／股 · 开仓前日线波动快照，不预测涨跌。`;
  $('target-candidates').replaceChildren(...(analysis.targets.length?analysis.targets.map((z,i)=>{const div=document.createElement('div');div.className='zone-row';div.append(text('strong',`候选${i+1}：${f(z.target)} · 盈亏比 ${f(z.r)}:1 · ${f(z.atrDistance)} ATR`),text('small',z.labels.join('；')));return div;}):[text('p','暂无符合条件的水平候选。可以查看全部水平区；不会用远处均线补齐。')]));
  adoptTargets();
  $('market-meta').replaceChildren(text('span',`数据：${market.symbol} / ${market.currency}；最后采用 ${analysis.lastDate}，${analysis.count}根日线。获取时间 ${market.fetchedAt||'导入文件未提供'}。`));
  if(market.sourceUrl){const a=document.createElement('a');a.textContent=' 查看行情来源';a.href=market.sourceUrl.startsWith('https://')?market.sourceUrl:'https://finance.yahoo.com/';a.target='_blank';a.rel='noopener noreferrer';$('market-meta').append(a);}
  const gap=(Date.parse($('analysis-date').value)-Date.parse(analysis.lastDate))/86400000;
  $('market-status').textContent=`${market.symbol}：找到 ${analysis.targets.length}档至少1.5R、${f(maxATR)} ATR以内的水平候选${s.side==='long'?'压力':'支撑'}区。`+(gap>5?' 注意：数据距分析日期超过5天，请刷新或导入较新数据。':'')+(analysis.targets[0]?.r>4?' 最近候选距离超过4R，可能不适合短期反弹；不要为凑目标延长持仓。':'');
  $('market-error').textContent=analysis.weekReason;
 }catch(e){analysis=null;adoptTargets();$('market-results').hidden=true;$('market-error').textContent=e.message;}
}
async function loadStock(){
 if(busy)return;busy=true;$('analyze-stock').disabled=true;$('market-error').textContent='';$('market-status').textContent='正在读取日线…';market=null;analysis=null;adoptTargets();$('market-results').hidden=true;
 try{
  current();
  await backendReady;
  const symbol=$('stock-symbol').value.trim().toUpperCase();if(!/^[A-Z0-9.^=-]{1,16}$/.test(symbol))throw Error('请输入有效股票代码。');$('stock-symbol').value=symbol;
  const requestedDate=$('analysis-date').value;
   if(!cloudBackend&&location.origin!=='http://localhost:8768')throw Error('请通过“打开富途线上看板”链接进入授权行情入口。');
   const response=await fetch('/api/futu/bars?'+new URLSearchParams({symbol,date:$('analysis-date').value}));const j=await response.json();if(!response.ok){if(j.needsAuth)await futuStatus();throw Error(j.error||'富途行情读取失败');}market=j;
  if($('stock-symbol').value.trim().toUpperCase()!==symbol||$('analysis-date').value!==requestedDate){market=null;throw Error('代码、来源或日期已改变，请重新分析。');}
  renderAnalysis();savePlan();
 }catch(e){$('market-error').textContent=e.message;$('market-status').textContent='未生成新建议；不会用旧结果替代。';}
 finally{busy=false;$('analyze-stock').disabled=false;}
}
function adoptTargets(){
 const weights=[40,30];rows.forEach((x,i)=>{x.p.value=analysis?.targets[i]?analysis.targets[i].target.toFixed(2):'';x.percent.value=analysis?.targets[i]?weights[i]:'';});renderPlan();savePlan();
}
async function futuStatus(autoSelect=false){
 const local=location.origin==='http://localhost:8768'||location.hostname.endsWith('.workers.dev');
 $('futu-connect').hidden=!local;$('futu-disconnect').hidden=true;
 if(!local){$('futu-status').replaceChildren(text('span','富途线上版已启用。请在 HTTPS 入口连接授权：'));const link=document.createElement('a');link.href='https://cw-futu-backend.dchan0831.workers.dev';link.textContent='打开富途线上看板';link.target='_blank';link.rel='noopener noreferrer';$('futu-status').append(link);return;}
 try{const r=await fetch('/auth/status'),j=await r.json();cloudBackend=j.cloud===true;$('futu-status').textContent=j.connected?(cloudBackend?'已连接富途云端 · 只读行情':'已连接富途 · 只读行情'):'尚未连接，点击下方按钮前往富途官方页面授权。';$('futu-connect').hidden=j.connected;$('futu-disconnect').hidden=!j.connected;$('futu-panel').hidden=false;}catch(e){$('futu-status').textContent='本机授权服务暂不可用。';}
}

$('futu-connect').addEventListener('click',async()=>{try{$('futu-connect').disabled=true;const r=await fetch('/auth/start',{method:'POST'}),j=await r.json();if(!r.ok)throw Error(j.error);const url=new URL(j.url);if(url.origin!=='https://webapi.futunn.com')throw Error('授权地址无效');location.assign(url.href);}catch(e){$('futu-status').textContent=e.message;$('futu-connect').disabled=false;}});
$('futu-disconnect').addEventListener('click',async()=>{const r=await fetch('/auth/disconnect',{method:'POST'});if(r.ok){market=null;analysis=null;adoptTargets();$('market-results').hidden=true;await futuStatus();}});
backendReady=futuStatus(true);
$('analyze-stock').addEventListener('click',loadStock);
$('stock-symbol').addEventListener('input',()=>{market=null;analysis=null;adoptTargets();$('market-results').hidden=true;$('market-status').textContent='代码已更改，请点击分析。';});
$('max-target-atr').addEventListener('change',renderAnalysis);
$('analysis-date').addEventListener('change',()=>{renderAnalysis();savePlan();});
window.addEventListener('trade-input-change',()=>{renderPlan();renderAnalysis();});


renderPlan();
})();
