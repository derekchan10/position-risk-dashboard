(function(){
'use strict';
const $=id=>document.getElementById(id),f=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
let market=null,analysis=null,known=[],signature='',busy=false,listReady=Promise.resolve(),cloudBackend=false;
const now=new Date(),ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
$('analysis-date').value=ny;$('analysis-date').max=ny;
function text(tag,t){const e=document.createElement(tag);e.textContent=t;return e;}
const rows=[0,1,2].map((_,i)=>{
 const tr=document.createElement('tr'),p=document.createElement('input'),percent=document.createElement('input');
 p.type=percent.type='number';p.min='0';p.step='any';percent.min='0';percent.max='100';percent.step='any';
 p.setAttribute('aria-label',`第${i+1}档止盈价格`);percent.setAttribute('aria-label',`第${i+1}档卖出比例，百分比`);p.placeholder='价格';percent.placeholder='%';
 const r=text('td','—'),net=text('td','—');for(const input of [p,percent]){const td=document.createElement('td');td.append(input);tr.append(td);input.addEventListener('input',()=>{renderPlan();savePlan();});}tr.append(r,net);$('take-profit-rows').append(tr);return {p,percent,r,net};
});
function savePlan(){try{localStorage.setItem('profit-plan-v1',JSON.stringify({rows:rows.map(x=>({price:x.p.value,percent:x.percent.value})),symbol:$('stock-symbol').value,date:$('analysis-date').value,style:$('plan-style').value}));}catch(e){}}
try{const saved=JSON.parse(localStorage.getItem('profit-plan-v1')||'null');if(saved){saved.rows?.slice(0,3).forEach((x,i)=>{rows[i].p.value=x.price;rows[i].percent.value=x.percent;});$('stock-symbol').value=saved.symbol||'NVDA';if(saved.date&&saved.date<=ny)$('analysis-date').value=saved.date;$('plan-style').value=saved.style||'balanced';}}catch(e){}
function current(){const s=window.PositionRisk.read();return {s,r:window.PositionRisk.calculate(s)};}
function renderPlan(){
 $('plan-error').textContent='';$('plan-summary').replaceChildren();rows.forEach(x=>{x.r.textContent='—';x.net.textContent='—';});
 try{
  const {s,r}=current();$('plan-trade-context').textContent=`${s.side==='long'?'做多':'做空'} ${f(s.entry)} / 止损 ${f(s.stop)}`;
  const raw=rows.map(x=>({price:x.p.value,percent:x.percent.value})),active=raw.filter(x=>x.price!==''||x.percent!=='');
  if(!active.length){$('plan-summary').append(text('p','先分析股票，再采用候选价位；也可以自行填写。'));return;}
  const result=TradePlanner.profits(s,r,raw);let n=0;
  rows.forEach(x=>{if(x.p.value!==''||x.percent.value!==''){const a=result.rows[n++];x.r.textContent=f(a.r)+'R';x.net.textContent=f(a.net)+' U';}});
  const summary=document.createElement('div');summary.className='plan-summary';
  [`各档均成交后，计划兑现 ${f(result.total)}% 原始仓位`, `累计预计净收益 ${f(result.net)} U（${f(result.netR)}倍本笔总风险预算）`, `剩余 ${f(result.remaining*100)}% 仓位，约 ${f(result.remainingQuantity)} 基础资产单位`, `若各档成交后余仓仍在原止损退出：整笔预计净结果 ${f(result.netIfStop)} U`].forEach(t=>summary.append(text('div',t)));
  $('plan-summary').append(summary);
 }catch(e){$('plan-error').textContent=e.message;}
}
function renderAnalysis(){
 if(!market)return;
 try{
  const {s}=current();analysis=TradePlanner.analyze(market,$('analysis-date').value,s.entry,s.stop,s.side);
  const basis=$('target-basis').value;analysis.targets=analysis.zones.filter(z=>z.r>=1&&(basis==='combined'||(basis==='ma'?z.labels.some(x=>x.startsWith('MA')):z.labels.some(x=>!x.startsWith('MA'))))).slice(0,3);
  signature=JSON.stringify([s.entry,s.stop,s.side,$('analysis-date').value]);
  $('market-results').hidden=false;$('apply-targets').disabled=!analysis.targets.length;
  $('ma-values').replaceChildren(...analysis.mas.map(m=>{const div=document.createElement('div');div.className='ma-item';div.append(text('span','MA'+m.n+'（SMA）'),text('strong',m.value===null?'数据不足':f(m.value)));return div;}));
  $('zones-list').replaceChildren(...analysis.zones.slice(0,12).map(z=>{const div=document.createElement('div');div.className='zone-row';div.append(text('div',`${f(z.low)}${z.high>z.low?'～'+f(z.high):''} · ${f(z.r)}R${z.confluence?' · 均线与水平区重合':''}`),text('small',z.labels.join('；')));return div;}));
  $('market-meta').replaceChildren(text('span',`数据：${market.symbol} / ${market.currency}；最后采用 ${analysis.lastDate}，${analysis.count}根日线。获取时间 ${market.fetchedAt||'导入文件未提供'}。`));
  if(market.sourceUrl){const a=document.createElement('a');a.textContent=' 查看行情来源';a.href=market.sourceUrl.startsWith('https://')?market.sourceUrl:'https://finance.yahoo.com/';a.target='_blank';a.rel='noopener noreferrer';$('market-meta').append(a);}
  const gap=(Date.parse($('analysis-date').value)-Date.parse(analysis.lastDate))/86400000;
  $('market-status').textContent=`${market.symbol}：找到 ${analysis.targets.length}档至少1R的候选${s.side==='long'?'压力':'支撑'}区。`+(gap>5?' 注意：数据距分析日期超过5天，请刷新或导入较新数据。':'')+(analysis.targets[0]?.r>4?' 最近候选距离超过4R，可能不适合短期反弹；不要为凑目标延长持仓。':'');
  $('market-error').textContent='';
 }catch(e){analysis=null;$('market-results').hidden=true;$('apply-targets').disabled=true;$('market-error').textContent=e.message;}
}
async function loadStock(){
 if(busy)return;busy=true;$('analyze-stock').disabled=true;$('market-error').textContent='';$('market-status').textContent='正在读取日线…';market=null;analysis=null;$('market-results').hidden=true;$('apply-targets').disabled=true;
 try{
  await listReady;
  const symbol=$('stock-symbol').value.trim().toUpperCase();if(!/^[A-Z0-9.^=-]{1,16}$/.test(symbol))throw Error('请输入有效股票代码。');$('stock-symbol').value=symbol;
  const key=$('market-api-key').value.trim();
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
  if($('stock-symbol').value.trim().toUpperCase()!==symbol){market=null;throw Error('股票代码已改变，请重新分析。');}
  renderAnalysis();savePlan();
 }catch(e){$('market-error').textContent=e.message;$('market-status').textContent='未生成新建议；不会用旧结果替代。';}
 finally{busy=false;$('analyze-stock').disabled=false;}
}
$('apply-targets').addEventListener('click',()=>{
 try{const {s}=current();if(!analysis||signature!==JSON.stringify([s.entry,s.stop,s.side,$('analysis-date').value]))throw Error('交易参数已变化，请重新分析。');const weights=$('plan-style').value==='early'?[40,25,15]:[25,25,25];rows.forEach((x,i)=>{x.p.value=analysis.targets[i]?analysis.targets[i].target.toFixed(2):'';x.percent.value=analysis.targets[i]?weights[i]:'';});renderPlan();savePlan();}catch(e){$('plan-error').textContent=e.message;}
});
async function futuStatus(){
 const local=location.origin==='http://localhost:8768'||location.hostname.endsWith('.workers.dev');
 $('futu-connect').hidden=!local;$('futu-disconnect').hidden=true;
 if(!local){$('futu-status').textContent='在这台电脑运行 python3 scripts/futu_bridge.py，然后打开 http://localhost:8768 连接富途。在线版暂不承接授权。';return;}
 try{const r=await fetch('/auth/status'),j=await r.json();cloudBackend=j.cloud===true;$('futu-status').textContent=j.connected?(cloudBackend?'已连接富途云端 · 只读行情':'已连接富途 · 只读行情'):'尚未连接，点击下方按钮前往富途官方页面授权。';$('futu-connect').hidden=j.connected;$('futu-disconnect').hidden=!j.connected;if(j.connected){$('market-source').value='futu';$('futu-panel').hidden=false;}}catch(e){$('futu-status').textContent='本机授权服务暂不可用。';}
}
$('market-source').addEventListener('change',()=>{market=null;analysis=null;$('market-results').hidden=true;$('apply-targets').disabled=true;$('futu-panel').hidden=$('market-source').value!=='futu';futuStatus();});
$('futu-connect').addEventListener('click',async()=>{try{$('futu-connect').disabled=true;const r=await fetch('/auth/start',{method:'POST'}),j=await r.json();if(!r.ok)throw Error(j.error);const url=new URL(j.url);if(url.origin!=='https://webapi.futunn.com')throw Error('授权地址无效');location.assign(url.href);}catch(e){$('futu-status').textContent=e.message;$('futu-connect').disabled=false;}});
$('futu-disconnect').addEventListener('click',async()=>{const r=await fetch('/auth/disconnect',{method:'POST'});if(r.ok){market=null;analysis=null;$('market-results').hidden=true;$('apply-targets').disabled=true;await futuStatus();}});
futuStatus();
$('analyze-stock').addEventListener('click',loadStock);
$('stock-symbol').addEventListener('input',()=>{market=null;analysis=null;$('market-results').hidden=true;$('apply-targets').disabled=true;$('market-status').textContent='代码已更改，请点击分析。';});
$('target-basis').addEventListener('change',renderAnalysis);
$('analysis-date').addEventListener('change',()=>{renderAnalysis();savePlan();});
window.addEventListener('trade-input-change',()=>{renderPlan();renderAnalysis();});
$('market-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2e6)throw Error('文件请小于2MB。');const j=JSON.parse(await file.text());if(!Array.isArray(j.bars)||!j.symbol)throw Error('需要包含symbol及bars字段。');market=j;$('stock-symbol').value=j.symbol;renderAnalysis();}catch(e){market=null;analysis=null;$('market-results').hidden=true;$('apply-targets').disabled=true;$('market-error').textContent=e.message;}});
function view(planner){$('sizing-view').hidden=planner;$('planner-view').hidden=!planner;$('tab-sizing').setAttribute('aria-pressed',String(!planner));$('tab-planner').setAttribute('aria-pressed',String(planner));if(planner){renderPlan();if(!market&&!busy)loadStock();}}
$('tab-sizing').addEventListener('click',()=>view(false));$('tab-planner').addEventListener('click',()=>view(true));
listReady=fetch('data/symbols.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(list=>{known=list;$('stock-list').replaceChildren(...list.map(s=>{const o=document.createElement('option');o.value=s;return o;}));}).catch(()=>{$('market-status').textContent='股票缓存列表暂不可用，可使用自有行情入口。';});
renderPlan();
})();
