(function(){
'use strict';
const $=id=>document.getElementById(id),f=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
let market=null,analysis=null,signature='',busy=false,cloudBackend=false,backendReady=Promise.resolve(),requestVersion=0,controller=null,autoTimer=null,priceBinding=null,authorized=null,pendingBuffer=false,pendingEntryReset=false;
const price=n=>Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
function beijingTime(value){if(value===null||value===undefined||value==='')return '时间未提供';const d=new Date(typeof value==='string'&&/^\d+$/.test(value)?Number(value):value);return Number.isNaN(d.getTime())?'时间未提供':d.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' 北京时间';}
let previousSide=window.PositionRisk.read().side;
const retention=()=>Math.min(100,Math.max(0,Number($('retain-position').value)||0));
const buffer=()=>Number($('stop-buffer').value)||.1;
const now=new Date(),ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
$('analysis-date').value=ny;$('analysis-date').max=ny;
function text(tag,t){const e=document.createElement(tag);e.textContent=t;return e;}
const ratioHelpButtons=[];
let rows=[],targetSignature='',lastAllocationProfile='',lastAllocationRetain=null,manualPercentages=false,autoRetention=true;
const manualKey='position-manual-values-v1';
const contextKey=()=>[$('stock-symbol').value.trim().toUpperCase(),window.PositionRisk.read().side].join(':');
let manual={context:'',fields:{},rows:null},previousSymbol='';
function storeManual(){try{localStorage.setItem(manualKey,JSON.stringify(manual));}catch(e){}}
function resetManual(){manual={context:contextKey(),fields:{},rows:null};manualPercentages=false;autoRetention=true;storeManual();}
function saveManualPlan(){if(manual.context!==contextKey())resetManual();manual.rows=rows.map(row=>({price:row.p.value,percent:row.percent.value}));manual.retain=retention();manual.autoRetention=autoRetention;manual.manualPercentages=manualPercentages;storeManual();}

function createTargetRow(i){
 const tr=document.createElement('tr'),p=document.createElement('input'),percent=document.createElement('input');
 p.type=percent.type='number';
 p.addEventListener('blur',()=>{if(p.value!==''&&Number.isFinite(Number(p.value)))p.value=Number(p.value).toFixed(2);savePlan();});percent.readOnly=false;p.min='0';p.step='any';percent.min='0';percent.max='100';percent.step='any';
 p.setAttribute('aria-label',`第${i+1}档止盈价格`);percent.setAttribute('aria-label',`第${i+1}档平仓比例，百分比`);p.placeholder='价格';percent.placeholder='%';
 const ratioCell=document.createElement('td'),r=text('span','—'),net=text('td','—');r.className='ratio-number';
 const label=text('div','盈亏比'),help=text('button','?');label.className='ratio-label';help.type='button';help.className='help-toggle';help.setAttribute('aria-label',`第${i+1}档盈亏比说明`);help.setAttribute('aria-expanded','false');help.setAttribute('aria-controls','ratio-help');help.setAttribute('popovertarget','ratio-help');ratioHelpButtons.push(help);label.append(help);ratioCell.append(label,r);
 net.setAttribute('data-label','本档预计净收益');for(const input of [p,percent]){const td=document.createElement('td');td.setAttribute('data-label',input===p?`第${i+1}档 · 止盈价格`:'平仓原始仓位');td.append(input);if(input===percent)td.append(text('span','%'));tr.append(td);input.addEventListener('input',()=>{
 manualPercentages=true;autoRetention=false;
 if(input===percent){const total=rows.reduce((sum,row)=>sum+Number(row.percent.value),0);if(rows.every(row=>row.percent.value!==''&&Number(row.percent.value)>=0)&&Number.isFinite(total)&&total<=100+1e-8){$('retain-position').value=String(Math.max(0,Math.round((100-total)*100)/100));$('retain-value').textContent=retention()+'%';$('retain-position').setAttribute('aria-valuetext',retention()+'%');}}
 renderPlan();renderSetupObservation();renderRetentionMode();savePlan();saveManualPlan();});}tr.append(ratioCell,net);$('take-profit-rows').append(tr);return {p,percent,r,net};
}
function savePlan(){try{localStorage.setItem('profit-plan-week-v1',JSON.stringify({rows:rows.map(x=>({price:x.p.value,percent:x.percent.value})),symbol:$('stock-symbol').value,date:$('analysis-date').value,style:$('plan-style').value,buffer:buffer(),retain:retention(),autoRetention}));}catch(e){}}
try{const saved=JSON.parse(localStorage.getItem('profit-plan-week-v1')||'null');if(saved){autoRetention=saved.autoRetention!==false;if(saved.retain!==undefined&&Number.isFinite(Number(saved.retain)))$('retain-position').value=String(Math.min(100,Math.max(0,Number(saved.retain))));if([.1,.2,.3].includes(Number(saved.buffer)))$('stop-buffer').value=String(saved.buffer);$('stock-symbol').value=saved.symbol||'NVDA';if(saved.date&&saved.date<=ny)$('analysis-date').value=saved.date;$('plan-style').value='week';}}catch(e){}
// Restore only the same instrument and direction; never carry another trade's prices.
try{const saved=JSON.parse(localStorage.getItem(manualKey)||'null');if(saved?.context===contextKey()&&saved.fields&&typeof saved.fields==='object'){
 manual=saved;
 for(const id of ['entry','stop','risk','marginLimit'])if(Object.hasOwn(saved.fields,id))$(id).value=String(saved.fields[id]);
 if(Array.isArray(saved.rows)){manualPercentages=!!saved.manualPercentages;autoRetention=saved.autoRetention!==false;if(Number.isFinite(Number(saved.retain)))$('retain-position').value=String(saved.retain);}
 refreshSizing();
}else resetManual();}catch(e){resetManual();}
previousSymbol=$('stock-symbol').value.trim().toUpperCase();
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
   $('snapshot-time').textContent=quote.time?'报价：'+beijingTime(quote.time):quote.date?'仅提供美股交易日 '+String(quote.date).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')+'，未提供报价时间':'报价时间未提供';
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
 $('market-status').textContent='等待行情授权';
 $('market-error').textContent='连接富途行情后，自动评估开仓位置与止盈空间。';
 $('plan-trade-context').textContent='等待富途授权';
 if(!$('entry').value||!$('stop').value){$('error').textContent='';$('plan-error').textContent='';}
}
function renderPlan(){
 renderSnapshot();
 if(market&&analysis)renderPriceChart(window.PositionRisk.read());
 $('plan-error').textContent='';$('plan-summary').replaceChildren();rows.forEach(x=>{x.r.textContent='—';x.net.textContent='—';});
 if(authorized===false){authorizationHint();$('plan-summary').append(text('p','授权行情后，自动匹配水平目标位。'));return;}
 try{
  const {s,r}=current();$('plan-trade-context').textContent=`${s.side==='long'?'做多':'做空'} ${price(s.entry)} / 止损 ${price(s.stop)}`;
  const raw=rows.map(x=>({price:x.p.value,percent:x.percent.value})).filter(x=>!(x.percent!==''&&Number(x.percent)===0)),active=raw.filter(x=>x.price!==''||x.percent!=='');
  if(!active.length){$('plan-summary').append(text('p',rows.length?'当前平仓比例为0%，保留全部仓位。':analysis?'暂无合适目标，等待更好的入场位置。':'输入股票与交易价格，自动生成分批计划。'));return;}
  const result=TradePlanner.profits(s,r,raw);let n=0;
  rows.forEach(x=>{if(x.percent.value!==''&&Number(x.percent.value)===0){x.r.textContent=f((s.side==='short'?-1:1)*(Number(x.p.value)-s.entry)/Math.abs(s.entry-s.stop))+'R';x.net.textContent='0 U';}else if(x.p.value!==''||x.percent.value!==''){const a=result.rows[n++];x.r.textContent=f(a.r)+'R';x.net.textContent=f(a.net)+' U';}});
  const summary=document.createElement('div');summary.className='plan-summary';
  [`计划净收益 ${f(result.net)} U · ${f(result.netR)}R`, `平仓 ${f(result.total)}% 原始仓位 · 保留 ${f(result.remaining*100)}%`].forEach(t=>summary.append(text('div',t)));
  summary.title='整体净收益盈亏比＝各档计划净收益合计÷本笔实际预计止损亏损；假设各档成交，不计预留仓位未来收益。';
  summary.append(text('div',`计划减仓数量：${result.rows.map((x,i)=>'P'+(i+1)+' '+f(x.quantity)+'单位').join('；')}。`));$('plan-summary').append(summary);
 }catch(e){$('plan-trade-context').textContent='等待有效交易价格';$('plan-error').textContent=e.message;}
}
function renderAnalysis(){
 if(!market)return;
 try{
  const {s}=current();analysis=TradePlanner.analyze(market,$('analysis-date').value,s.entry,s.stop,s.side);
  const maxATR=Number($('max-target-atr').value),week=TradePlanner.weekTargets(analysis,maxATR);analysis.targets=week.targets;analysis.weekReason=week.reason;
  analysis.setup=TradePlanner.setupAssessment(market,$('analysis-date').value,analysis,maxATR);renderSetupObservation();
  signature=JSON.stringify([s.entry,s.stop,s.side,$('analysis-date').value]);
  $('market-results').hidden=false;
  $('zones-list').replaceChildren(...analysis.zones.slice(0,12).map(z=>{const div=document.createElement('div');div.className='zone-row';div.append(text('div',`${price(z.low)}${z.high>z.low?'～'+price(z.high):''} · ${f(z.r)}:1 · ${f(z.atrDistance)} ATR`),text('small',z.labels.join('；')));return div;}));

  $('target-candidates').replaceChildren(...(analysis.targets.length?analysis.targets.map((z,i)=>{const div=document.createElement('div');div.className='zone-row';div.append(text('strong',`候选${i+1}：${price(z.target)} · 盈亏比 ${f(z.r)}:1 · ${f(z.atrDistance)} ATR`),text('small',z.labels.join('；')));return div;}):[text('p','暂无符合条件的水平候选。可以查看全部水平区。')]));
  adoptTargets();
  $('market-meta').replaceChildren(text('span',`数据：${market.symbol} / ${market.currency}；最后采用 ${analysis.lastDate}（美股交易日），${analysis.count}根日线。获取时间 ${beijingTime(market.fetchedAt)}。${market.quote?' 报价时间：'+(market.quote.time?beijingTime(market.quote.time):'仅提供美股交易日 '+(market.quote.date||'未提供'))+'；'+market.quote.session:''}`));
  if(market.sourceUrl){const a=document.createElement('a');a.textContent=' 查看行情来源';a.href=market.sourceUrl.startsWith('https://')?market.sourceUrl:'https://finance.yahoo.com/';a.target='_blank';a.rel='noopener noreferrer';$('market-meta').append(a);}
  const gap=(Date.parse($('analysis-date').value)-Date.parse(analysis.lastDate))/86400000;
  const near=analysis.zones[0],dir=s.side==='short'?-1:1,risk=Math.abs(s.entry-s.stop);
  const recent=market.bars.filter(b=>b.date<$('analysis-date').value).slice(-10);
  const base=dir===1?Math.min(...recent.map(b=>b.low)):Math.max(...recent.map(b=>b.high));
  const eligible=analysis.targets.length>0;
  const level=s.side==='long'?'压力':'支撑';
  $('market-status').textContent=eligible?'空间达标 · 入场需另行确认':!near?'参考不足 · 缺少水平目标':near.r<1.5?'空间偏小 · 低于筛选门槛':'目标偏远 · 超出距离筛选';
  $('market-status').parentElement?.setAttribute('data-state',eligible?'ready':'wait');
  $('market-error').textContent=eligible?`最近${level}位盈亏比 ${f(near.r)}R，达到1.5R筛选门槛；不代表止跌或入场信号。`:!near?`当前价前方没有已确认的水平${level}区，暂不生成水平止盈参考。`:near.r<1.5?`到最近${level}位盈亏比仅 ${f(near.r)}R，低于 1.5R 门槛。仅提示空间偏小，不代表必须放弃交易。`:`最近${level}位距离偏远，超过当前距离筛选上限，未纳入当前水平目标参考。`;
  const sources=near?near.labels.map(label=>({type:label.split(' · ').at(-1).replace(/\s*\d{4}-\d{2}-\d{2}.*$/,''),date:label.match(/\d{4}-\d{2}-\d{2}/)?.[0]||'未提供'})):[];
  const evidence=[
   [dir===1?'潜在压力价格':'潜在支撑价格',near?`${price(near.low)}${near.high>near.low?' ～ '+price(near.high):''}`:'暂无'],
   ['来源类型',near?near.quality+' · '+[...new Set(sources.map(x=>x.type))].slice(0,2).join('、'):'暂无'],
   ['最近形成日',sources.length?sources.map(x=>x.date).sort().at(-1):'暂无']
  ];
  $('zone-explanation').textContent=near?`最近水平区盈亏比 ${f(near.r)}R，筛选门槛为1.5R；达到该盈亏比的价格为 ${price(s.entry+dir*1.5*risk)}。止损距离 ${price(risk)} 美元。水平区聚合了 ${near.labels.length} 个历史价位。历史范围 ${analysis.historyFrom} 起，最多252个交易日，实际${analysis.historyCount}日。本区${near.touches}次独立接触、${near.reactions}次至少0.5 ATR的离区反应；${near.consolidation?'含5日整理区':'未匹配整理区'}。最近接触 ${near.lastTouch||'未提供'}；${near.validity}。已排除${analysis.excludedZones.length}个连续收盘越过的旧水平区。`:'当前价前方未找到已确认的历史水平区，不生成固定目标。';
  renderPriceChart(s);
  $('atr-distances').replaceChildren(text('p',`止损距离 ${f(risk/analysis.atr)} ATR；距近期${dir===1?'低':'高'}点 ${f(Math.abs(s.entry-base)/analysis.atr)} ATR；目标最远 ${f(maxATR)} ATR。`),...analysis.targets.map((z,i)=>text('p',`第${i+1}档目标距离 ${f(z.atrDistance)} ATR`)));
  $('decision-evidence').replaceChildren(...evidence.map(([label,value])=>{const row=text('div','');row.className='evidence-row';row.append(text('span',label),text('strong',value));return row;}));
  $('target-table').hidden=!eligible;$('profit-note').hidden=!eligible;
  if(gap>5)$('market-error').textContent+=' 日线数据距分析日超过5天，请核对数据日期。';

 }catch(e){analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;$('market-error').textContent=e.message;}
}
function renderSetupObservation(){
 const setup=analysis?.setup;$('setup-observation').hidden=!setup;
 if(!setup)return;
 $('setup-heading').textContent='止盈比例参考';
 const values=[setup.extent,setup.progress,setup.space];
 $('setup-signals').replaceChildren(...setup.names.map((name,i)=>{const item=text('div','');item.append(text('span',name),text('strong',values[i]));return item;}));
 const percentages=TradePlanner.setupPercentages(analysis.targets.length,retention(),setup.profile);
 $('setup-allocation').textContent=setup.metrics?.crossed?'部分目标已越过，请核对成交并更新目标。':analysis.targets.length?`${manualPercentages?'手动比例优先；参考：':''}${setup.profileLabel} · ${percentages.map(p=>f(p)+'%').join(' / ')}`:'等待合适目标，不生成比例。';
 $('setup-reason').textContent=setup.reason;
 $('setup-facts').replaceChildren(...setup.facts.map(fact=>text('p',fact)));
 $('setup-data-date').textContent=`历史背景截至 ${setup.lastDate}（美股交易日）；位置参考：${setup.referenceLabel||'缺少报价'}${setup.referenceTime?' · '+beijingTime(setup.referenceTime):''}。`;
}
function renderPriceChart(s){
 if(![s.entry,s.stop].every(v=>Number.isFinite(v)&&v>0)){$('price-chart').replaceChildren();return;}
 const bars=market.bars.filter(b=>b.date<$('analysis-date').value).sort((a,b)=>a.date.localeCompare(b.date)).slice(-90);
 if(bars.length<2){$('price-chart').replaceChildren();$('chart-legend').replaceChildren();return;}
 const targets=analysis.targets,zones=targets.length?targets:analysis.zones.slice(0,3),short=s.side==='short',role=short?'支撑':'压力';
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let results=[],allocationValid=true;
 try{const position=window.PositionRisk.calculate(s),active=rows.filter(row=>Number(row.percent.value)!==0);results=TradePlanner.profits(s,position,active.map(row=>({price:row.p.value,percent:row.percent.value}))).rows;}catch(e){allocationValid=false;}
 let resultIndex=0;
 const annotations=[{value:s.entry,color:'#588ae8',title:`开仓 ${price(s.entry)} · ${short?'做空':'做多'}`,detail:'蓝色虚线：本次计划开仓价',source:'',index:-1},
 {value:s.stop,color:'#d65c65',title:`止损 ${price(s.stop)}`,detail:`计划亏损预算 ${f(s.risk)} U`,source:'红色虚线：计划失效退出位置',index:-1},
 ...zones.map((z,i)=>{const row=rows[i],percentage=targets.length?Number(row?.percent.value):null,edited=targets.length?Number(row?.p.value):z.target;
  const result=targets.length&&percentage!==0?results[resultIndex++]:null;
  return {value:edited>0?edited:z.target,color:targets.length?'#c6922e':'#a78b58',title:targets.length?`第${i+1}档 ${price(edited)} · 平仓 ${f(percentage)}%`:`候选${role} ${price(z.target)}（未通过筛选）`,detail:targets.length?`本档净收益 ${allocationValid?f(result?.net||0)+' U':'比例待修正'} · ${f((short?-1:1)*(edited-s.entry)/Math.abs(s.entry-s.stop))}R`:'仅作观察，不代表建议开仓',source:(z.quality?z.quality+' · ':'')+z.labels.map(label=>label.split(' · ').at(-1)).join('；'),index:i};})];
 const values=[...bars.flatMap(bar=>[bar.high,bar.low]),...annotations.map(a=>a.value)],low=Math.min(...values),high=Math.max(...values),padding=Math.max((high-low)*.08,.01),min=low-padding,max=high+padding;
 const height=Math.max(440,annotations.length*76+60),top=30,bottom=height-45,left=55,right=670;
 const y=value=>+(bottom-(value-min)/(max-min)*(bottom-top)).toFixed(2),x=i=>+(left+i/(bars.length-1)*(right-left)).toFixed(2),safeDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'';
 let svg=`<svg viewBox="0 0 1080 ${height}" role="group" aria-label="日线K线、开仓止损及各档平仓价格比例与收益"><title>交易计划图解</title><text x="55" y="18" font-size="13" fill="currentColor">${escape(market.symbol)} · USD · 最近${bars.length}根完整日线</text>`;
 for(let i=0;i<5;i++){const value=min+(max-min)*i/4,yy=y(value);svg+=`<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="currentColor" opacity=".1"/><text x="48" y="${yy+4}" text-anchor="end" font-size="11" fill="currentColor">${value.toFixed(2)}</text>`;}
 zones.forEach(z=>{svg+=`<rect x="${left}" y="${y(z.high)}" width="${right-left}" height="${Math.max(2,y(z.low)-y(z.high))}" fill="#c6922e" opacity=".16"/>`;});
 bars.forEach((bar,i)=>{const xx=x(i),color=bar.close>=bar.open?'#6295f2':'#df6a75';svg+=`<g><title>${safeDate(bar.date)} 开 ${bar.open.toFixed(2)} 高 ${bar.high.toFixed(2)} 低 ${bar.low.toFixed(2)} 收 ${bar.close.toFixed(2)}</title><line x1="${xx}" x2="${xx}" y1="${y(bar.high)}" y2="${y(bar.low)}" stroke="${color}"/><rect x="${xx-2}" y="${Math.min(y(bar.open),y(bar.close))}" width="4" height="${Math.max(1,Math.abs(y(bar.open)-y(bar.close)))}" fill="${color}"/></g>`;});
 svg+=`<polyline points="${bars.map((bar,i)=>x(i)+','+y(bar.close)).join(' ')}" fill="none" stroke="#609ada" stroke-width="1" opacity=".5"/>`;
 annotations.sort((a,b)=>b.value-a.value).forEach((a,i)=>{const yy=y(a.value),cardY=30+i*(height-75)/annotations.length;
 svg+=`<g role="button" tabindex="0" data-zone="${a.index}" aria-label="${escape(a.title)}"><title>${escape(a.source||a.detail)}</title><line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="${a.color}" stroke-dasharray="6 3"/><path d="M ${right} ${yy} L 703 ${cardY+24} L 716 ${cardY+24}" fill="none" stroke="${a.color}"/><circle cx="${right}" cy="${yy}" r="3" fill="${a.color}"/><rect x="716" y="${cardY}" width="350" height="65" rx="7" fill="var(--panel)" stroke="${a.color}"/><text x="726" y="${cardY+19}" font-size="14" font-weight="600" fill="${a.color}">${escape(a.title)}</text><text x="726" y="${cardY+38}" font-size="12" fill="currentColor">${escape(a.detail)}</text><text x="726" y="${cardY+55}" font-size="11" fill="currentColor">${escape(a.source.length>32?a.source.slice(0,32)+'…':a.source)}</text></g>`;
 });
 for(const index of [0,Math.floor((bars.length-1)/2),bars.length-1])svg+=`<text x="${x(index)}" y="${height-15}" text-anchor="middle" font-size="11" fill="currentColor">${safeDate(bars[index].date)}</text>`;
 svg+='</svg>';
 // A separate narrow chart keeps axes readable; full trade details sit below it.
 const mobileBars=bars.slice(-40),mw=360,mh=300,ml=54,mr=348,mt=30,mb=270;
 const mobileValues=[...mobileBars.flatMap(b=>[b.high,b.low]),...annotations.map(a=>a.value)],mlo=Math.min(...mobileValues),mhi=Math.max(...mobileValues),mpad=Math.max((mhi-mlo)*.08,.01);
 const my=value=>+(mb-(value-mlo+mpad)/(mhi-mlo+2*mpad)*(mb-mt)).toFixed(2),mx=i=>+(ml+i/(mobileBars.length-1)*(mr-ml)).toFixed(2);
 let mobile=`<svg viewBox="0 0 ${mw} ${mh}" role="group" aria-label="手机交易图：最近${mobileBars.length}根日线与开仓止损止盈水平"><text x="${ml}" y="18" font-size="12" fill="currentColor">${escape(market.symbol)} · USD · ${mobileBars.length}根日线</text>`;
 for(let i=0;i<5;i++){const value=mlo-mpad+(mhi-mlo+2*mpad)*i/4,yy=my(value);mobile+=`<line x1="${ml}" x2="${mr}" y1="${yy}" y2="${yy}" stroke="currentColor" opacity=".12"/><text x="48" y="${yy+4}" text-anchor="end" font-size="11" fill="currentColor">${value.toFixed(2)}</text>`;}
 zones.forEach(z=>{mobile+=`<rect x="${ml}" y="${my(z.high)}" width="${mr-ml}" height="${Math.max(2,my(z.low)-my(z.high))}" fill="#c6922e" opacity=".2"/>`;});
 mobileBars.forEach((b,i)=>{const xx=mx(i),color=b.close>=b.open?'#6295f2':'#df6a75';mobile+=`<line x1="${xx}" x2="${xx}" y1="${my(b.high)}" y2="${my(b.low)}" stroke="${color}"/><rect x="${xx-2}" y="${Math.min(my(b.open),my(b.close))}" width="4" height="${Math.max(1,Math.abs(my(b.open)-my(b.close)))}" fill="${color}"/>`;});
 annotations.forEach(a=>{const label=a.index>=0?(targets.length?'P':'候选')+(a.index+1):a.value===s.entry?'开仓':'止损';mobile+=`<line x1="${ml}" x2="${mr}" y1="${my(a.value)}" y2="${my(a.value)}" stroke="${a.color}" stroke-dasharray="5 3"/><text x="${mr-3}" y="${my(a.value)-4}" text-anchor="end" font-size="10" font-weight="600" fill="${a.color}" stroke="var(--field)" stroke-width="3" paint-order="stroke">${label}</text>`;});
 // Transparent touch strips expose OHLC without relying on desktop hover tooltips.
 mobileBars.forEach((b,i)=>{mobile+=`<rect x="${mx(i)-4}" y="${mt}" width="8" height="${mb-mt}" fill="transparent" role="button" tabindex="0" data-bar="${bars.length-mobileBars.length+i}" aria-label="查看${b.date}日线"/>`;});
 for(const i of [0,mobileBars.length-1])mobile+=`<text x="${mx(i)}" y="292" text-anchor="${i?'end':'start'}" font-size="11" fill="currentColor">${mobileBars[i].date.slice(5)}</text>`;
 mobile+='</svg>';
 const cards=[...annotations].sort((a,b)=>a.index-b.index||b.value-a.value).map(a=>`<button type="button" class="mobile-level" data-zone="${a.index}" style="--level-color:${a.color}"><strong>${escape(a.title)}</strong><span>${escape(a.detail)}</span><small>${escape(a.source||'当前交易参数')}</small></button>`).join('');
 $('price-chart').innerHTML=`<div class="desktop-chart">${svg}</div><div class="mobile-chart">${mobile}<p class="chart-note">轻点K线查看当日价格；轻点下方价位查看完整依据。</p><div class="mobile-levels">${cards}</div></div>`;
 $('chart-focus').textContent='点击价位查看依据；手机可轻点K线查看开高低收。';
 $('chart-legend').replaceChildren(text('div','蓝色K线：收盘高于开盘；红色K线：收盘低于开盘。黄色带：历史候选压力／支撑区。电脑端右侧标签连接价位；手机端下方卡片列出各档信息。'),text('div','净收益按填写费用计算，假设该档成交，未计滑点；历史价位不保证有效。修改平仓比例后，图中收益同步更新。'));
 const retained=100-rows.reduce((sum,row)=>sum+Number(row.percent.value),0);if(Number.isFinite(retained)&&retained>0)$('chart-legend').append(text('div',`预留 ${f(retained)}%：移出固定止盈档继续持有，仍沿用本笔止损参考，余仓后续收益未计入本图。`));
 if(analysis.setup)$('chart-legend').append(text('div',`${analysis.side==='short'?'回落':'反弹'}观察：${analysis.setup.extent} · ${analysis.setup.progress} · ${analysis.setup.space}；${analysis.setup.profileLabel}，仅按 ${analysis.setup.lastDate} 及之前完整日线判断。`));
}
function inspectChart(event){
 if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
 const candle=event.target.closest?.('[data-bar]');
 if(candle){const bars=market?.bars.filter(b=>b.date<$('analysis-date').value).sort((a,b)=>a.date.localeCompare(b.date)).slice(-90),bar=bars?.[Number(candle.getAttribute('data-bar'))];if(bar)$('chart-focus').textContent=`${bar.date}（美股交易日）· 开 ${price(bar.open)} / 高 ${price(bar.high)} / 低 ${price(bar.low)} / 收 ${price(bar.close)}`;return;}
 const marker=event.target.closest?.('[data-zone]');if(!marker)return;
 const index=Number(marker.getAttribute('data-zone')),zones=analysis?.targets.length?analysis.targets:analysis?.zones.slice(0,3),zone=zones?.[index];
 $('chart-focus').textContent=zone?`${window.PositionRisk.read().side==='short'?'潜在支撑':'潜在压力'} ${price(zone.low)}${zone.high>zone.low?' ～ '+price(zone.high):''} · 距开仓 ${f(zone.atrDistance)} ATR · 来源：${zone.labels.join('；')}`:'开仓和止损是当前交易参数，可在左侧修改；本图只展示计划，不执行交易。';
}
$('price-chart').addEventListener('click',inspectChart);$('price-chart').addEventListener('keydown',inspectChart);
function refreshSizing(){ $('entry').dispatchEvent(new Event('input',{bubbles:true})); }
async function loadStock(options={}){
 clearTimeout(autoTimer);
 if(busy)return;
 await backendReady;
 if(authorized!==true){authorizationHint();renderPlan();return;}
 const autoPrices=options.autoPrices===true||!$('entry').value||!$('stop').value||priceBinding!==$('stock-symbol').value.trim().toUpperCase();
 const requestId=++requestVersion;controller=new AbortController();
 busy=true;$('restore-market').disabled=true;$('market-error').textContent='';$('market-status').textContent=autoPrices?'正在获取新股票报价与近期低点…':'正在读取日线…';market=null;analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;
 const symbol=$('stock-symbol').value.trim().toUpperCase(),entryBefore=$('entry').value,stopBefore=$('stop').value,sideBefore=window.PositionRisk.read().side;
 try{
  await backendReady;
  if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol))throw Error('请输入有效美股代码。');$('stock-symbol').value=symbol;
  if(autoPrices)$('analysis-date').value=ny;
  const requestedDate=$('analysis-date').value;
  if(!cloudBackend&&location.origin!=='http://localhost:8768')throw Error('请通过“打开富途线上看板”链接进入授权行情入口。');
  const response=await fetch('/api/futu/bars?'+new URLSearchParams({symbol,date:requestedDate,quote:'1'}),{signal:controller.signal});const j=await response.json();
  if(requestId!==requestVersion)return;
  if(!response.ok){if(j.needsAuth)await futuStatus();throw Error(j.error||'富途行情读取失败');}
  if($('stock-symbol').value.trim().toUpperCase()!==symbol||$('analysis-date').value!==requestedDate)throw Error('股票或日期已改变，请重新生成。');
  const responseSide=window.PositionRisk.read().side;
  if(autoPrices||pendingEntryReset||options.restoreMarket){

   const defaults=TradePlanner.priceDefaults(j,responseSide,buffer());const keep=manual.context===contextKey()?manual.fields:{};if(!Object.hasOwn(keep,'entry'))$('entry').value=Number(defaults.entry).toFixed(2);if(!options.restoreMarket&&!Object.hasOwn(keep,'stop'))$('stop').value=defaults.stop===null?'':Number(defaults.stop).toFixed(2);priceBinding=symbol;pendingEntryReset=false;
   const qt=j.quote?.time?beijingTime(j.quote.time):'仅提供美股交易日 '+(j.quote?.date||'未提供');
   $('auto-price-note').textContent=`止损参考：近10日${responseSide==='short'?'高点＋':'低点－'}${buffer()} ATR${buffer()===.1?'（较小缓冲）':''}，可手动调整。`;$('auto-price-note').title=`报价时间 ${qt}；近期极值 ${price(defaults.base)}；区间 ${defaults.from} 至 ${defaults.to}`;
   refreshSizing();
   if(Object.hasOwn(manual.fields,'entry')||Object.hasOwn(manual.fields,'stop'))$('auto-price-note').textContent='已保留手动交易价格；行情更新不覆盖。';
   if(!options.restoreMarket&&defaults.stop===null&&!Object.hasOwn(manual.fields,'stop'))throw Error('近期极值不在正确止损方向，请根据结构手动填写止损；不会沿用旧股票价格。');
  }
  market=j;if(pendingBuffer){pendingBuffer=false;applyBuffer();}renderSnapshot();renderAnalysis();savePlan();
 }catch(e){if(requestId!==requestVersion||e.name==='AbortError')return;$('market-error').textContent=e.message;$('market-status').textContent='参考待更新 · 行情未就绪';}
 finally{if(requestId===requestVersion){busy=false;$('restore-market').disabled=authorized!==true;}}
}
function adoptTargets(){
 const savedRows=manual.context===contextKey()&&Array.isArray(manual.rows)?manual.rows.slice(0,3):null;
 if(analysis&&savedRows){
  const dir=analysis.side==='short'?-1:1,s=window.PositionRisk.read();
  analysis.targets=savedRows.map((row,i)=>{const value=Number(row.price),old=analysis.targets[i];return {...old,target:value,low:value,high:value,r:dir*(value-s.entry)/Math.abs(s.entry-s.stop),atrDistance:Math.abs(value-s.entry)/analysis.atr,labels:['手动止盈 · 用户自定价格'],quality:'手动计划'};});
 }
 if(autoRetention)$('retain-position').value=String(analysis?.setup?.suggestedRetain||0);
 const profile=analysis?.setup?.profile||'pyramid';
 const targets=analysis?.targets||[],key=JSON.stringify([market?.symbol,analysis?.side,analysis?.date,targets.map(z=>z.target.toFixed(2))]);
 if(key!==targetSignature){
  targetSignature=key;if(!savedRows)manualPercentages=false;$('take-profit-rows').replaceChildren();ratioHelpButtons.length=0;
  const percentages=TradePlanner.setupPercentages(targets.length,retention(),profile);
  rows=targets.map((z,i)=>{const row=createTargetRow(i);row.p.value=z.target.toFixed(2);
   row.percent.value=savedRows?savedRows[i].percent:String(percentages[i]);if(savedRows)row.p.value=savedRows[i].price;return row;});
 }else if(!savedRows&&(profile!==lastAllocationProfile||retention()!==lastAllocationRetain)&&!manualPercentages){const percentages=TradePlanner.setupPercentages(rows.length,retention(),profile);rows.forEach((row,i)=>{row.percent.value=String(percentages[i]);});}
 lastAllocationProfile=profile;lastAllocationRetain=retention();renderSetupObservation();renderRetentionMode();
 $('retain-value').textContent=retention()+'%';$('retain-position').setAttribute('aria-valuetext',retention()+'%');
 $('target-count').textContent=targets.length?`${targets.length}档${savedRows?'手动计划':'候选'} · 比例可调整`:'';
 renderPlan();savePlan();
}
async function futuStatus(autoSelect=false){
 const local=location.origin==='http://localhost:8768'||(location.hostname.endsWith('.workers.dev')||location.hostname==='cw-position-helper.pages.dev'||location.hostname==='cw.dcdddd.com');
 $('futu-connect').hidden=!local;$('futu-disconnect').hidden=true;
 if(!local){$('futu-status').replaceChildren(text('span','富途线上版已启用。请在 HTTPS 入口连接授权：'));const link=document.createElement('a');link.href='https://cw-futu-backend.dchan0831.workers.dev';link.textContent='打开富途线上看板';link.target='_blank';link.rel='noopener noreferrer';$('futu-status').append(link);return;}
 try{const r=await fetch('/auth/status'),j=await r.json();cloudBackend=j.cloud===true;authorized=j.connected===true;$('restore-market').disabled=!authorized;$('futu-status').textContent=j.connected?(cloudBackend?'已连接富途云端 · 只读行情':'已连接富途 · 只读行情'):'请先授权富途行情；授权后自动读取报价和生成止盈建议。';$('futu-connect').hidden=j.connected;$('futu-disconnect').hidden=!j.connected;$('futu-panel').hidden=false;renderPlan();authorizationHint();return j.connected;}catch(e){$('futu-status').textContent='本机授权服务暂不可用。';}
}

$('futu-connect').addEventListener('click',async()=>{try{$('futu-connect').disabled=true;const r=await fetch('/auth/start',{method:'POST'}),j=await r.json();if(!r.ok)throw Error(j.error);const url=new URL(j.url);if(url.origin!=='https://webapi.futunn.com')throw Error('授权地址无效');location.assign(url.href);}catch(e){$('futu-status').textContent=e.message;$('futu-connect').disabled=false;}});
$('futu-disconnect').addEventListener('click',async()=>{const r=await fetch('/auth/disconnect',{method:'POST'});if(r.ok){market=null;analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;await futuStatus();}});
backendReady=futuStatus(true);
backendReady.then(connected=>{if(connected&&!busy)loadStock({autoPrices:true});});

$('stock-symbol').addEventListener('input',()=>{
 const symbol=$('stock-symbol').value.trim().toUpperCase();if(symbol===previousSymbol)return;previousSymbol=symbol;resetManual();
 clearTimeout(autoTimer);requestVersion++;controller?.abort();busy=false;priceBinding=null;market=null;analysis=null;adoptTargets();$('market-results').hidden=true;$('target-table').hidden=true;$('profit-note').hidden=true;
 $('entry').value='';$('stop').value='';refreshSizing();$('error').textContent='';$('plan-error').textContent='';$('plan-trade-context').textContent='等待新股票报价';$('auto-price-note').textContent='切换股票后自动获取新报价及止损参考，亏损预算保持不变。';$('market-status').textContent='等待股票代码输入完成…';$('market-error').textContent='';
 if(/^[A-Z][A-Z0-9.-]{0,14}$/.test($('stock-symbol').value.trim().toUpperCase()))autoTimer=setTimeout(()=>loadStock({autoPrices:true}),900);
});
$('restore-market').addEventListener('click',()=>{if(busy)return;delete manual.fields.entry;storeManual();return loadStock({restoreMarket:true});});
$('stock-symbol').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(autoTimer);loadStock({autoPrices:true});}});
for(const id of ['entry','stop','risk','marginLimit']){
 const field=$(id);
 const format=()=>{if(field.value!==''&&Number.isFinite(Number(field.value)))field.value=Number(field.value).toFixed(2);};
 if(id==='entry'||id==='stop'){format();field.addEventListener('blur',format);}
 field.addEventListener('input',event=>{if(event?.isTrusted===false)return;if(manual.context!==contextKey())resetManual();manual.fields[id]=field.value;storeManual();if(id==='entry'||id==='stop')priceBinding=$('stock-symbol').value.trim().toUpperCase();});
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
function renderRetentionMode(){$('retain-auto').textContent=autoRetention?'自动':'恢复自动';$('retain-auto').disabled=autoRetention;$('retain-auto').setAttribute('aria-pressed',String(autoRetention));}
$('retain-auto').addEventListener('click',()=>{manual.rows=null;delete manual.retain;manual.manualPercentages=false;manual.autoRetention=true;storeManual();autoRetention=true;manualPercentages=false;lastAllocationProfile='';adoptTargets();});
$('retain-position').addEventListener('input',()=>{
 autoRetention=false;
 $('retain-value').textContent=retention()+'%';$('retain-position').setAttribute('aria-valuetext',retention()+'%');
 const percentages=TradePlanner.setupPercentages(rows.length,retention(),analysis?.setup?.profile||'pyramid');
 rows.forEach((row,i)=>{row.percent.value=String(percentages[i]);});manualPercentages=false;
 renderPlan();renderSetupObservation();renderRetentionMode();savePlan();saveManualPlan();
});
$('stop-buffer').addEventListener('change',()=>{delete manual.fields.stop;storeManual();savePlan();applyBuffer();});
$('max-target-atr').addEventListener('change',renderAnalysis);
$('analysis-date').addEventListener('change',()=>{savePlan();return loadStock();});
window.addEventListener('trade-input-change',()=>{
 const side=window.PositionRisk.read().side;
 if(side!==previousSide){
  previousSide=side;resetManual();
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
$('retain-value').textContent=retention()+'%';renderRetentionMode();
renderPlan();
})();
