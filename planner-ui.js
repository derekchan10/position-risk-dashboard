(function(){
'use strict';
const $=id=>document.getElementById(id),f=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
let market=null,analysis=null,known=[],signature='',busy=false,listReady=Promise.resolve(),cloudBackend=false;
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
try{const saved=JSON.parse(localStorage.getItem('profit-plan-week-v1')||'null');if(saved){saved.rows?.slice(0,2).forEach((x,i)=>{rows[i].p.value=x.price;rows[i].percent.value=x.percent;});$('stock-symbol').value=saved.symbol||'NVDA';if(saved.date&&saved.date<=ny)$('analysis-date').value=saved.date;$('plan-style').value='week';}}catch(e){}
function current(){const s=window.PositionRisk.read();return {s,r:window.PositionRisk.calculate(s)};}
function renderPlan(){
 $('plan-error').textContent='';$('plan-summary').replaceChildren();rows.forEach(x=>{x.r.textContent='—';x.net.textContent='—';});
 try{
  const {s,r}=current();$('plan-trade-context').textContent=`${s.side==='long'?'做多':'做空'} ${f(s.entry)} / 止损 ${f(s.stop)}`;
  const raw=rows.map(x=>({price:x.p.value,percent:x.percent.value})),active=raw.filter(x=>x.price!==''||x.percent!=='');
  if(!active.length){$('plan-summary').append(text('p','先分析股票，再采用候选价位；也可以自行填写。'));return;}
  const result=TradePlanner.profits(s,r,raw);let n=0;
  rows.forEach(x=>{if(x.p.value!==''||x.percent.value!==''){const a=result.rows[n++];x.r.textContent=f(a.r)+':1'+(analysis&&analysis.atr>0?' / '+f(Math.abs(a.price-s.entry)/analysis.atr)+' ATR':'');x.net.textContent=f(a.net)+' U';}});
  const summary=document.createElement('div');summary.className='plan-summary';
  [`各档均成交后，计划兑现 ${f(result.total)}% 原始仓位`, `累计预计净收益 ${f(result.net)} U（${f(result.netR)}倍本笔总风险预算）`, `剩余 ${f(result.remaining*100)}% 仓位，约 ${f(result.remainingQuantity)} 基础资产单位`, `若各档成交后余仓仍在原止损退出：整笔预计净结果 ${f(result.netIfStop)} U`].forEach(t=>summary.append(text('div',t)));
  summary.append(text('div',`计划减仓数量：${result.rows.map((x,i)=>'P'+(i+1)+' '+f(x.quantity)+'单位').join('；')}。各档减仓后按比例释放初始保证金，实际以交易所为准。`));$('plan-summary').append(summary);
 }catch(e){$('plan-error').textContent=e.message;}
}
function renderAnalysis(){
 if(!market)return;
 try{
  const {s}=current();analysis=TradePlanner.analyze(market,$('analysis-date').value,s.entry,s.stop,s.side);
  const maxATR=Number($('max-target-atr').value),week=TradePlanner.weekTargets(analysis,maxATR);analysis.targets=week.targets;analysis.weekReason=week.reason;
  signature=JSON.stringify([s.entry,s.stop,s.side,$('analysis-date').value]);
  $('market-results').hidden=false;$('apply-targets').disabled=!analysis.targets.length;
  $('ma-values').replaceChildren(...analysis.mas.map(m=>{const div=document.createElement('div');div.className='ma-item';div.append(text('span','MA'+m.n+'（SMA）'),text('strong',m.value===null?'数据不足':f(m.value)));return div;}));
  $('zones-list').replaceChildren(...analysis.zones.slice(0,12).map(z=>{const div=document.createElement('div');div.className='zone-row';div.append(text('div',`${f(z.low)}${z.high>z.low?'～'+f(z.high):''} · ${f(z.r)}:1 · ${f(z.atrDistance)} ATR${z.confluence?' · 均线与水平区重合':''}`),text('small',z.labels.join('；')));return div;}));
  $('atr-value').textContent=`ATR(14) ${f(analysis.atr)} 美元／股 · 开仓前日线波动快照，不预测涨跌。`;
  $('target-candidates').replaceChildren(...(analysis.targets.length?analysis.targets.map((z,i)=>{const div=document.createElement('div');div.className='zone-row';div.append(text('strong',`候选${i+1}：${f(z.target)} · 盈亏比 ${f(z.r)}:1 · ${f(z.atrDistance)} ATR`),text('small',z.labels.join('；')));return div;}):[text('p','暂无符合条件的水平候选。可以查看全部水平区；不会用远处均线补齐。')]));
  renderPlan();renderTrailing();
  $('market-meta').replaceChildren(text('span',`数据：${market.symbol} / ${market.currency}；最后采用 ${analysis.lastDate}，${analysis.count}根日线。获取时间 ${market.fetchedAt||'导入文件未提供'}。`));
  if(market.sourceUrl){const a=document.createElement('a');a.textContent=' 查看行情来源';a.href=market.sourceUrl.startsWith('https://')?market.sourceUrl:'https://finance.yahoo.com/';a.target='_blank';a.rel='noopener noreferrer';$('market-meta').append(a);}
  const gap=(Date.parse($('analysis-date').value)-Date.parse(analysis.lastDate))/86400000;
  $('market-status').textContent=`${market.symbol}：找到 ${analysis.targets.length}档至少1.5R、${f(maxATR)} ATR以内的水平候选${s.side==='long'?'压力':'支撑'}区。`+(gap>5?' 注意：数据距分析日期超过5天，请刷新或导入较新数据。':'')+(analysis.targets[0]?.r>4?' 最近候选距离超过4R，可能不适合短期反弹；不要为凑目标延长持仓。':'');
  $('market-error').textContent=analysis.weekReason;
 }catch(e){analysis=null;renderTrailing();$('market-results').hidden=true;$('apply-targets').disabled=true;$('market-error').textContent=e.message;}
}
function renderWeek(){
 try{
 const {s,r}=current();
 const day=Number($('week-day').value),close=Number($('week-close').value),touched=$('week-p1-touched').checked,dir=s.side==='short'?-1:1;
 $('week-time').textContent=day>=5?'第5个交易日收盘前：按规则退出全部余仓，不顺延。':day>=2&&!touched&&$('week-close').value&&close>0&&dir*(close-s.entry)<=0?'第2天收盘未触P1且价格未向预期方向推进：按规则退出余仓。':day>=2&&!touched&&!$('week-close').value?'请填写第2天收盘价并复核是否触及P1。':'未触发时间退出复核条件，结构止损仍有效。';
 const fills=[];for(let i=1;i<=2;i++)if($('settle-p'+i).checked)fills.push({price:Number($('settle-price'+i).value),fraction:i===1?.4:.3});
 const rest=$('settle-rest').value?Number($('settle-rest').value):null,result=TradePlanner.settlement(s,r,fills,rest,Number($('settle-extra').value));
 $('week-settlement').textContent=`${rest===null?'已成交部分净结果':'整笔结算净结果'} ${f(result.net)} U / ${f(result.r)}R；剩余 ${f(result.remaining*100)}%（${f(result.quantity)}单位）；预计累计释放初始保证金 ${result.freed===null?'无法计算':f(result.freed)+' U'}。${rest===null?'未成交仓位的开仓手续费尚未分摊到已实现结果。':''}`;
 }catch(e){$('week-settlement').textContent=e.message;}
}
function renderTrailing(){
 const output=$('trail-result');
 try{const {s}=current();const stop=TradePlanner.structureStop(s.side,s.stop,$('trail-current').value?Number($('trail-current').value):s.stop,Number($('trail-previous').value),Number($('trail-extreme').value),Number($('trail-atr').value),$('trail-confirmed').checked);output.textContent=`60分钟结构保护参考 ${f(stop)}。缓冲 ${f(Number($('trail-atr').value)*.25)}；只收紧。请确认当前行情尚未触发此价，否则应复核退出，不能补挂成未来保护。`;}catch(e){output.textContent=e.message;}
 renderWeek();
}
for(const id of ['trail-extreme','trail-current','trail-previous','trail-atr','trail-confirmed'])$(id).addEventListener('input',renderTrailing);
for(const id of ['week-day','week-close','week-p1-touched','settle-p1','settle-p2','settle-price1','settle-price2','settle-rest','settle-extra'])$(id).addEventListener('input',renderWeek);
async function loadStock(){
 if(busy)return;busy=true;$('analyze-stock').disabled=true;$('market-error').textContent='';$('market-status').textContent='正在读取日线…';market=null;analysis=null;renderTrailing();$('market-results').hidden=true;$('apply-targets').disabled=true;
 try{
  await listReady;
  const symbol=$('stock-symbol').value.trim().toUpperCase();if(!/^[A-Z0-9.^=-]{1,16}$/.test(symbol))throw Error('请输入有效股票代码。');$('stock-symbol').value=symbol;
  const key=$('market-api-key').value.trim(),requestedSource=$('market-source').value,requestedDate=$('analysis-date').value;
  if($('market-source').value==='futu'){
   if(!cloudBackend&&location.origin!=='http://localhost:8768')throw Error('富途需要本机授权服务。请在电脑运行 scripts/futu_bridge.py，再打开 http://localhost:8768。');
   const response=await fetch('/api/futu/bars?'+new URLSearchParams({symbol,date:$('analysis-date').value}));const j=await response.json();if(!response.ok)throw Error(j.error||'富途行情读取失败');market=j;
  }else if(key){
   if(location.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(location.hostname))throw Error('自有密钥模式仅可在HTTPS连接下使用；当前请使用缓存股票或导入数据。');
   const url=new URL('https://api.twelvedata.com/time_series');Object.entries({symbol,interval:'1day',outputsize:'500',apikey:key,order:'asc'}).forEach(([k,v])=>url.searchParams.set(k,v));
   const response=await fetch(url,{referrerPolicy:'no-referrer'});const j=await response.json();if(j.status==='error'||!Array.isArray(j.values))throw Error(j.message||'行情服务未返回数据。');
   const bars=j.values.map(b=>({date:b.datetime.slice(0,10),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume||0)})).filter(b=>b.date<ny);
   market={symbol,currency:j.meta?.currency||'USD',source:'Twelve Data',sourceUrl:'https://twelvedata.com/',fetchedAt:new Date().toISOString(),bars};
  }else{
   if(!known.includes(symbol))throw Error('该代码尚无免密钥缓存。可在“其他股票／自有数据”填写 Twelve Data 密钥或导入日线。当前支持：'+known.join('、'));
   const response=await fetch('data/'+encodeURIComponent(symbol)+'.json',{cache:'no-store'});if(!response.ok)throw Error('行情读取失败，请稍后重试。');market=await response.json();
  }
  if($('stock-symbol').value.trim().toUpperCase()!==symbol||$('market-source').value!==requestedSource||$('analysis-date').value!==requestedDate){market=null;throw Error('代码、来源或日期已改变，请重新分析。');}
  renderAnalysis();savePlan();
 }catch(e){$('market-error').textContent=e.message;$('market-status').textContent='未生成新建议；不会用旧结果替代。';}
 finally{busy=false;$('analyze-stock').disabled=false;}
}
$('apply-targets').addEventListener('click',()=>{
 try{const {s}=current();if(!analysis||signature!==JSON.stringify([s.entry,s.stop,s.side,$('analysis-date').value]))throw Error('交易参数已变化，请重新分析。');const weights=[40,30];rows.forEach((x,i)=>{x.p.value=analysis.targets[i]?analysis.targets[i].target.toFixed(2):'';x.percent.value=analysis.targets[i]?weights[i]:'';});renderPlan();savePlan();}catch(e){$('plan-error').textContent=e.message;}
});
async function futuStatus(autoSelect=false){
 const local=location.origin==='http://localhost:8768'||location.hostname.endsWith('.workers.dev');
 $('futu-connect').hidden=!local;$('futu-disconnect').hidden=true;
 if(!local){$('futu-status').replaceChildren(text('span','富途线上版已启用。请在 HTTPS 入口连接授权：'));const link=document.createElement('a');link.href='https://cw-futu-backend.dchan0831.workers.dev';link.textContent='打开富途线上看板';link.target='_blank';link.rel='noopener noreferrer';$('futu-status').append(link);return;}
 try{const r=await fetch('/auth/status'),j=await r.json();cloudBackend=j.cloud===true;$('futu-status').textContent=j.connected?(cloudBackend?'已连接富途云端 · 只读行情':'已连接富途 · 只读行情'):'尚未连接，点击下方按钮前往富途官方页面授权。';$('futu-connect').hidden=j.connected;$('futu-disconnect').hidden=!j.connected;if(j.connected&&(autoSelect||$('market-source').value==='futu')){$('market-source').value='futu';$('futu-panel').hidden=false;}}catch(e){$('futu-status').textContent='本机授权服务暂不可用。';}
}
$('market-source').addEventListener('change',()=>{market=null;analysis=null;renderTrailing();$('market-results').hidden=true;$('apply-targets').disabled=true;$('futu-panel').hidden=$('market-source').value!=='futu';futuStatus();});
$('futu-connect').addEventListener('click',async()=>{try{$('futu-connect').disabled=true;const r=await fetch('/auth/start',{method:'POST'}),j=await r.json();if(!r.ok)throw Error(j.error);const url=new URL(j.url);if(url.origin!=='https://webapi.futunn.com')throw Error('授权地址无效');location.assign(url.href);}catch(e){$('futu-status').textContent=e.message;$('futu-connect').disabled=false;}});
$('futu-disconnect').addEventListener('click',async()=>{const r=await fetch('/auth/disconnect',{method:'POST'});if(r.ok){market=null;analysis=null;renderTrailing();$('market-results').hidden=true;$('apply-targets').disabled=true;await futuStatus();}});
futuStatus(true);
$('analyze-stock').addEventListener('click',loadStock);
$('stock-symbol').addEventListener('input',()=>{market=null;analysis=null;renderTrailing();$('market-results').hidden=true;$('apply-targets').disabled=true;$('market-status').textContent='代码已更改，请点击分析。';});
$('max-target-atr').addEventListener('change',renderAnalysis);
$('analysis-date').addEventListener('change',()=>{renderAnalysis();savePlan();});
window.addEventListener('trade-input-change',()=>{renderPlan();renderAnalysis();renderTrailing();});
$('market-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2e6)throw Error('文件请小于2MB。');const j=JSON.parse(await file.text());if(!Array.isArray(j.bars)||!j.symbol)throw Error('需要包含symbol及bars字段。');market=j;$('stock-symbol').value=j.symbol;renderAnalysis();}catch(e){market=null;analysis=null;renderTrailing();$('market-results').hidden=true;$('apply-targets').disabled=true;$('market-error').textContent=e.message;}});
listReady=fetch('data/symbols.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(list=>{known=list;$('stock-list').replaceChildren(...list.map(s=>{const o=document.createElement('option');o.value=s;return o;}));}).catch(()=>{$('market-status').textContent='股票缓存列表暂不可用，可使用自有行情入口。';});
renderPlan();renderTrailing();
})();
