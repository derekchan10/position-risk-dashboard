(function(root){
'use strict';
// Wilder ATR: seed with the first 14 true ranges, then smooth all subsequent bars.
function wilderATR(bars,period=14){
 if(bars.length<period)throw Error('日线不足，无法计算ATR。');
 const trs=bars.map((b,i)=>{const prev=bars[i-1]?.close??b.close;return Math.max(b.high-b.low,Math.abs(b.high-prev),Math.abs(b.low-prev));});
 let value=trs.slice(0,period).reduce((sum,tr)=>sum+tr,0)/period;
 for(let i=period;i<trs.length;i++)value=(value*(period-1)+trs[i])/period;
 return value;
}
// Same-day bars require server confirmation of a finished regular session.
function completedBars(data,date){
 const includeToday=data.analysisDate===date&&data.completedThrough===date;
 return data.bars.filter(b=>b.date<date||(includeToday&&b.date===date)).sort((a,b)=>a.date.localeCompare(b.date));
}
function analyze(data,date,entry,stop,side){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('请选择开仓日期。');
 if(!(entry>0&&stop>0)||entry===stop)throw Error('请先填写有效的开仓价与止损价。');
 const dir=side==='short'?-1:1;
 if(dir*(entry-stop)<=0)throw Error('止损价与交易方向不匹配。');
 const bars=completedBars(data,date);
 if(bars.length<20)throw Error('该日期之前不足20根日线，无法生成分析。');
 const valid=bars.every(b=>['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0));
 if(!valid)throw Error('行情包含无效价格。');
 const last=bars.at(-1),risk=Math.abs(entry-stop),mas=[20,50,100,200].map(n=>({n,value:bars.length>=n?bars.slice(-n).reduce((a,b)=>a+b.close,0)/n:null}));
 const atr=wilderATR(bars);
 const role=dir===1?'潜在压力':'潜在支撑',history=bars.slice(-252),offset=bars.length-history.length;
 const distance=Math.max(entry*.003,Math.min(atr*.2,entry*.01));
 const raw=[];const add=(p,source,index)=>{if(dir*(p-entry)>0)raw.push({price:p,label:role+' · '+source,index});};
 add(last.high,'最近完整交易日高点 '+last.date,bars.length-1);add(last.low,'最近完整交易日低点 '+last.date,bars.length-1);
 for(let i=Math.max(2,offset);i<bars.length-2;i++){
  const b=bars[i],around=[bars[i-2],bars[i-1],bars[i+1],bars[i+2]];
  if(around.every(x=>b.high>=x.high)&&around.some(x=>b.high>x.high))add(b.high,'历史局部高点 '+b.date,i);
  if(around.every(x=>b.low<=x.low)&&around.some(x=>b.low<x.low))add(b.low,'历史局部低点 '+b.date,i);
 }
 // Consolidation is a compact five-session range, not a volume-profile estimate.
 for(let i=Math.max(4,offset+4);i<bars.length;i++){
  const window=bars.slice(i-4,i+1),hi=Math.max(...window.map(b=>b.high)),lo=Math.min(...window.map(b=>b.low));
  if(hi-lo<=atr&&Math.max(...window.map(b=>b.close))-Math.min(...window.map(b=>b.close))<=atr*.5){
   add(hi,'整理区上沿 '+bars[i].date,i);add(lo,'整理区下沿 '+bars[i].date,i);
  }
 }
 raw.sort((a,b)=>a.price-b.price);const allZones=[];
 for(const point of raw){let z=allZones.at(-1);if(!z||point.price-z.low>distance){z={low:point.price,high:point.price,labels:[],indices:[]};allZones.push(z);}z.high=point.price;z.labels.push(point.label);z.indices.push(point.index);}
 allZones.forEach(z=>{
  z.labels=[...new Set(z.labels)];z.target=dir===1?z.low:z.high;z.r=dir*(z.target-entry)/risk;z.atrDistance=atr>0?Math.abs(z.target-entry)/atr:null;z.confluence=mas.some(m=>m.value!==null&&m.value>=z.low-distance&&m.value<=z.high+distance);
  // A new contact requires three intervening non-contact sessions. Adjacent candles are one visit.
  const visits=[];let previous=-Infinity;
  for(let i=offset;i<bars.length;i++){
   const b=bars[i],contact=b.high>=z.low-distance&&b.low<=z.high+distance;
   if(contact){if(i-previous>=4)visits.push(i);previous=i;}
  }
  const reactions=visits.filter(i=>bars.slice(i+1,i+6).some(b=>dir===1?b.close<=z.low-atr*.5:b.close>=z.high+atr*.5));
  z.touches=visits.length;z.reactions=reactions.length;z.consolidation=z.labels.some(l=>l.includes('整理区'));
  z.lastTouch=visits.length?bars[visits.at(-1)].date:null;
  z.broken=bars.slice(-2).every(b=>dir===1?b.close>z.high+atr*.2:b.close<z.low-atr*.2);
  z.quality=z.reactions>=2&&z.consolidation?'多次反应＋整理区':z.reactions>=2?'多次独立反应':z.consolidation?'整理区参考':'单点参考';
  z.validity=z.broken?'最近两日已越过，暂不作目标':'未见连续收盘突破';
  delete z.indices;
 });
 allZones.sort((a,b)=>dir*(a.target-b.target));
 const zones=allZones.filter(z=>!z.broken);
 return {date,entry,stop,lastDate:last.date,lastClose:last.close,count:bars.length,historyCount:history.length,historyFrom:history[0].date,atr,mas,zones,excludedZones:allZones.filter(z=>z.broken),targets:zones.filter(z=>z.r>=1&&z.atrDistance!==null&&z.atrDistance<=4).slice(0,3),side};
}
function rsiSeries(bars,period=14){
 const result=Array(bars.length).fill(null);if(bars.length<=period)return result;
 let gain=0,loss=0;
 for(let i=1;i<=period;i++){const delta=bars[i].close-bars[i-1].close;gain+=Math.max(0,delta)/period;loss+=Math.max(0,-delta)/period;}
 const value=()=>loss===0?(gain===0?50:100):100-100/(1+gain/loss);
 result[period]=value();
 for(let i=period+1;i<bars.length;i++){const delta=bars[i].close-bars[i-1].close;gain=(gain*(period-1)+Math.max(0,delta))/period;loss=(loss*(period-1)+Math.max(0,-delta))/period;result[i]=value();}
 return result;
}
function setupAssessment(data,date,analysis,maxATR=4){
 const bars=completedBars(data,date),short=analysis.side==='short',dir=short?-1:1;
 const names=short?['超涨背景','已回落','剩余空间']:['超跌背景','已反弹','剩余空间'];
 const fallback={names,extent:'数据不足',progress:'待更新',space:'待确认',profile:'observe',profileLabel:'仅作预案',reason:'不足24根完整日线，保留原分配方式；不影响开仓筛选。',facts:[],lastDate:bars.at(-1)?.date||'',applicable:false,suggestedRetain:0};
 if(bars.length<24)return fallback;
 const last=bars.at(-1),atr=wilderATR(bars),rsis=rsiSeries(bars),rsi=rsis.at(-1),extremeRSI=(short?Math.max:Math.min)(...rsis.slice(-10).filter(Number.isFinite));
 let quoteDate=String(data.quote?.date||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
 if(data.quote?.time&&Number.isFinite(Number(data.quote.time))){const time=new Date(Number(data.quote.time));if(!Number.isNaN(time.getTime()))quoteDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);}
 const quote=Number(data.quote?.price),useQuote=quoteDate===date&&Number.isFinite(quote)&&quote>0;
 const reference=useQuote?quote:Number.isFinite(analysis.entry)&&analysis.entry>0?analysis.entry:last.close,referenceLabel=useQuote?'同日行情报价':Number.isFinite(analysis.entry)&&analysis.entry>0?'计划开仓价':'最近完整日收盘价';
 const recent=bars.slice(-20),anchor=short?Math.min(...recent.map(b=>b.low)):Math.max(...recent.map(b=>b.high)),extreme=short?Math.max(...bars.slice(-10).map(b=>b.high)):Math.min(...bars.slice(-10).map(b=>b.low));
 const displacement=Math.max(0,short?last.close-anchor:anchor-last.close),excursionATR=atr>0?displacement/atr:0,change5=(last.close/bars.at(-6).close-1)*100;
 const stretchSignals=Number(short?extremeRSI>=70:extremeRSI<=30)+Number((short?change5:-change5)>=5)+Number(excursionATR>=3),extent=stretchSignals>=2?'历史明显':stretchSignals===1?'历史有迹象':'不明显';
 const recoveryDistance=dir*(reference-extreme),recoveryATR=atr>0?Math.max(0,recoveryDistance)/atr:null,recoveryPercent=recoveryDistance/extreme*100;
 const near=analysis.zones[0],eligible=!!near&&near.r>=1.5&&near.atrDistance!==null&&near.atrDistance<=maxATR&&analysis.targets.length>0;
 const crossed=analysis.targets.some(z=>dir*(z.target-reference)<=0),forward=analysis.targets.find(z=>dir*(z.target-reference)>0),remainingDistance=forward?dir*(forward.target-reference):null,remainingATR=remainingDistance!==null&&atr>0?remainingDistance/atr:null;
 const stale=(Date.parse(date)-Date.parse(last.date))/86400000>5;
 const space=!near?'缺少目标':!eligible?(near.r<1.5?'空间不足':'目标偏远'):crossed?'目标已越过':remainingDistance!==null?(remainingDistance/reference*100).toFixed(2)+'%':'缺少目标';
 let profile='pyramid',profileLabel='金字塔兑现',reason='超跌／超涨背景与前方空间并不同时突出，采用先多后少的基础分配。';
 if(stale||!eligible||crossed){profile='observe';profileLabel='仅作预案';reason=stale?'日线背景较旧，暂停自动比例判断；不影响开仓筛选。':crossed?'部分计划目标已被报价越过，先核对实际成交并更新目标；不会假定这些档位已经成交。':'目标空间未通过原有筛选，不生成止盈目标。';}
 else if(stretchSignals>=2&&near.r>=2&&recoveryDistance>=0&&recoveryATR!==null&&recoveryATR<=1&&remainingATR!==null&&remainingATR>=1){profile='balanced';profileLabel='均衡兑现';reason='前期超跌／超涨较明显，尚未远离近期极值，前方目标也有空间，参考均衡分配；不据此预测反弹强度。';}
 else if(recoveryDistance<0||stretchSignals===0||recoveryATR!==null&&recoveryATR>=2||remainingATR!==null&&remainingATR<1){profile='defensive';profileLabel='偏早兑现';reason=recoveryDistance<0?'报价已越过此前极值，历史背景可能继续变化，比例只参考偏早兑现，不作止跌判断。':recoveryATR!==null&&recoveryATR>=2?'已经反弹／回落至少2个日线ATR，优先兑现近处目标，避免把前期超跌当成尚未兑现的空间。':remainingATR!==null&&remainingATR<1?'距最近目标不足1个日线ATR，参考近处多平、远处少平。':'超跌／超涨背景不明显，比例参考偏早兑现，不额外押注远处目标。';}
 const n=value=>Number.isFinite(value)?Number(value.toFixed(2)):null;
 const suggestedRetain=!stale&&eligible&&!crossed&&stretchSignals>=2&&recoveryDistance>=0&&recoveryATR!==null&&recoveryATR<2&&remainingATR!==null&&remainingATR>=1?20:0;
 return {names,suggestedRetain,extent:stale?'数据较旧':extent,progress:stale?'待更新':recoveryDistance<0?(short?'尚未回落':'尚未反弹'):n(recoveryPercent)+'%',space,profile,profileLabel,reason,lastDate:last.date,referenceLabel,referenceTime:useQuote?Number(data.quote.time)||null:null,applicable:!stale&&eligible&&!crossed,
 metrics:{rsi:n(rsi),extremeRSI:n(extremeRSI),change5:n(change5),excursionATR:n(excursionATR),stretchSignals,reference:n(reference),recoveryATR:n(recoveryATR),recoveryPercent:n(recoveryPercent),remainingATR:n(remainingATR),crossed,useQuote},
 facts:[`历史日线截至 ${last.date}：RSI(14) ${n(rsi)}，近10日${short?'最高':'最低'}RSI ${n(extremeRSI)}；这是历史背景，不是当前盘中确认。`,`此前5日收盘涨跌 ${n(change5)}%；距20日${short?'低':'高'}点 ${n(excursionATR)} ATR。`,`${referenceLabel} ${reference.toFixed(2)}；相对近10日${short?'高':'低'}点 ${extreme.toFixed(2)}，已${short?'回落':'反弹'} ${n(recoveryPercent)}%（${n(recoveryATR)} ATR）。`,useQuote?'行情报价仅用于衡量已反弹／回落的位置，没有伪造当天完整日线或RSI。':'没有同分析日的有效报价，使用计划价／完整日收盘价；未使用未来日期报价。',forward?`到前方计划目标 ${forward.target.toFixed(2)} 剩余 ${remainingDistance.toFixed(2)} 美元（${n(remainingATR)} ATR）。`:'没有尚未越过的计划目标。','止跌／滞涨形态、突破确认和成交量不参与本模块的比例选择，也不改变开仓判断。']};
}
function setupPercentages(count,retain=0,profile='pyramid'){
 if(profile==='pyramid'||profile==='observe'||count>3)return pyramidPercentages(count,retain);
 if(!Number.isInteger(count)||count<0||!Number.isFinite(retain)||retain<0||retain>100)throw Error('档数或预留比例无效。');
 if(!count)return [];
 const weights=profile==='balanced'?Array(count).fill(1):count===3?[6,3,1]:count===2?[2,1]:[1];
 const total=Math.round((100-retain)*100),sum=weights.reduce((a,b)=>a+b,0),parts=weights.map((weight,i)=>{const exact=total*weight/sum;return {i,cents:Math.floor(exact),fraction:exact%1};});
 let remainder=total-parts.reduce((sum,part)=>sum+part.cents,0);
 for(const part of [...parts].sort((a,b)=>b.fraction-a.fraction||a.i-b.i)){if(remainder--<=0)break;part.cents++;}
 return parts.map(part=>part.cents/100);
}
function trailing(side,entry,initialStop,atr,extreme,currentStop,multiple){
 const dir=side==='short'?-1:1;
 if(![entry,initialStop,atr,extreme,currentStop,multiple].every(Number.isFinite)||atr<=0||multiple<=0||dir*(entry-initialStop)<=0||dir*(extreme-entry)<0||dir*(extreme-currentStop)<=0)throw Error('请填写有效的持仓后极值与当前保护价；做多极值不低于开仓价，做空反之，保护价不能越过极值。');
 const raw=extreme-dir*multiple*atr;
 const reference=dir===1?Math.max(initialStop,currentStop,raw):Math.min(initialStop,currentStop,raw);
 return {reference,raw,distance:multiple*atr};
}
function priceDefaults(data,side,buffer=.1){
 if(![.1,.2,.3].includes(buffer))throw Error('请选择有效的ATR缓冲。');
 const entry=Number(data.quote?.price);if(!Number.isFinite(entry)||entry<=0)throw Error('缺少有效最新报价。');
 const bars=data.analysisDate?completedBars(data,data.analysisDate):data.bars.slice().sort((a,b)=>a.date.localeCompare(b.date));if(bars.length<14)throw Error('日线不足14根，无法生成止损参考。');
 const recent=bars.slice(-10),dir=side==='short'?-1:1;
 const base=dir===1?Math.min(...recent.map(b=>b.low)):Math.max(...recent.map(b=>b.high));
 const atr=wilderATR(bars),stop=Math.round((base-dir*buffer*atr)*100)/100;
 return {entry,stop:stop>0&&dir*(entry-stop)>0?stop:null,base,atr,from:recent[0].date,to:recent.at(-1).date};
}
function pyramidPercentages(count,retain=0){
 if(!Number.isInteger(count)||count<0||!Number.isFinite(retain)||retain<0||retain>100)throw Error('档数或预留比例无效。');
 if(!count)return [];
 const total=Math.round((100-retain)*100),weight=count*(count+1)/2;
 const parts=Array.from({length:count},(_,i)=>{const exact=total*(count-i)/weight;return {i,cents:Math.floor(exact),fraction:exact-Math.floor(exact)};});
 let remainder=total-parts.reduce((sum,part)=>sum+part.cents,0);
 for(const part of [...parts].sort((a,b)=>b.fraction-a.fraction||a.i-b.i)){if(remainder--<=0)break;part.cents++;}
 return parts.map(part=>part.cents/100);
}
function weekTargets(analysis,maxATR){
 const near=analysis.zones[0];if(!near)return {targets:[],reason:'暂无前方水平区，不生成固定止盈。'};
 if(near.r<1.5)return {targets:[],reason:'最近水平区不足1.5R，按一周规则放弃这次开仓；不跳过近处压力寻找远目标。'};
 const targets=analysis.zones.filter(z=>z.atrDistance!==null&&z.atrDistance<=maxATR).slice(0,3);
 return {targets,reason:targets.length?'':'最近水平区超出距离筛选，暂无候选。'};
}
function structureStop(side,initial,current,previous,level,atr,confirmed){
 const dir=side==='short'?-1:1;
 if(!confirmed)throw Error('先确认P1成交和两根完整60分钟K线。');
 if(![initial,current,previous,level,atr].every(x=>Number.isFinite(x)&&x>0)||dir*(level-previous)<=0)throw Error('填写正数结构价和60分钟ATR；新结构必须向盈利方向推进。');
 const raw=level-dir*.25*atr;
 return dir===1?Math.max(initial,current,raw):Math.min(initial,current,raw);
}
function settlement(s,position,fills,rest,extra){
 if(!Number.isFinite(extra))throw Error('请填写有效其他费用。');
 let fraction=0,net=0;const dir=s.side==='short'?-1:1;
 const exit=(price,f)=>{if(!Number.isFinite(price)||price<=0||!Number.isFinite(f)||f<=0)throw Error('请填写实际成交均价。');net+=position.quantity*f*(dir*(price-s.entry)-s.entry*s.feeIn/100-price*s.feeOut/100);};
 for(const fill of fills){fraction+=fill.fraction;if(fraction>1+1e-8)throw Error('成交比例超过原仓。');exit(fill.price,fill.fraction);}
 let remaining=Math.max(0,1-fraction);if(rest!==null){exit(rest,remaining);fraction=1;remaining=0;}
 return {net:net-extra,remaining,quantity:position.quantity*remaining,freed:position.margin===null?null:position.margin*fraction,r:(net-extra)/position.loss};
}
function profits(s,position,rows){
 let total=0,cumulative=0;const dir=s.side==='short'?-1:1,risk=Math.abs(s.entry-s.stop);
 const active=rows.filter(x=>x.price!==''||x.percent!=='');
 const parsed=active.map((row,i)=>{
  const price=Number(row.price),percent=Number(row.percent);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(percent)||percent<=0||percent>100)throw Error('每档价格须大于0，比例须大于0且不超过100%。');
  if(dir*(price-s.entry)<=0)throw Error('做多止盈价须高于开仓价；做空须低于开仓价。');
  if(i&&dir*(price-Number(active[i-1].price))<=0)throw Error('各档价格须按依次触发的顺序填写。');
  total+=percent;if(total>100+1e-8)throw Error('平仓比例按原始仓位计算，合计不能超过100%。');
  const f=percent/100,q=position.quantity*f;
  const gross=q*dir*(price-s.entry),net=gross-q*(s.entry*s.feeIn/100+price*s.feeOut/100)-s.reserve*f;
  cumulative+=net;return {price,percent,quantity:q,gross,net,cumulative,r:dir*(price-s.entry)/risk};
 });
 const remaining=Math.max(0,1-total/100),remainingLoss=position.loss*remaining;
 return {rows:parsed,total,net:cumulative,remaining,remainingQuantity:position.quantity*remaining,netIfStop:cumulative-remainingLoss,netR:cumulative/position.loss};
}
const api={completedBars,rsiSeries,setupAssessment,setupPercentages,pyramidPercentages,wilderATR,analyze,profits,trailing,weekTargets,structureStop,settlement,priceDefaults};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TradePlanner=api;
})(typeof window==='undefined'?{}:window);
