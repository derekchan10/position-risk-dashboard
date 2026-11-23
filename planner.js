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
function analyze(data,date,entry,stop,side){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('请选择开仓日期。');
 if(!(entry>0&&stop>0)||entry===stop)throw Error('请先填写有效的开仓价与止损价。');
 const dir=side==='short'?-1:1;
 if(dir*(entry-stop)<=0)throw Error('止损价与交易方向不匹配。');
 const bars=data.bars.filter(b=>b.date<date).sort((a,b)=>a.date.localeCompare(b.date));
 if(bars.length<20)throw Error('该日期之前不足20根日线，无法生成分析。');
 const valid=bars.every(b=>['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0));
 if(!valid)throw Error('行情包含无效价格。');
 const last=bars.at(-1),risk=Math.abs(entry-stop),mas=[20,50,100,200].map(n=>({n,value:bars.length>=n?bars.slice(-n).reduce((a,b)=>a+b.close,0)/n:null}));
 const atr=wilderATR(bars);
 const role=dir===1?'潜在压力':'潜在支撑';
 const raw=[];const add=(p,source)=>{if(dir*(p-entry)>0)raw.push({price:p,label:role+' · '+source});};
 // Moving averages are auxiliary only; never enter horizontal target clustering.
 add(last.high,'前一交易日高点 '+last.date);add(last.low,'前一交易日低点 '+last.date);
 const start=Math.max(2,bars.length-90);
 for(let i=start;i<bars.length-2;i++){
  const b=bars[i],around=[bars[i-2],bars[i-1],bars[i+1],bars[i+2]];
  if(around.every(x=>b.high>=x.high)&&around.some(x=>b.high>x.high))add(b.high,'历史局部高点 '+b.date);
  if(around.every(x=>b.low<=x.low)&&around.some(x=>b.low<x.low))add(b.low,'历史局部低点 '+b.date);
 }
 const distance=Math.max(entry*.003,Math.min(atr*.2,entry*.01));
 raw.sort((a,b)=>a.price-b.price);const zones=[];
 for(const point of raw){let z=zones.at(-1);if(!z||point.price-z.low>distance){z={low:point.price,high:point.price,labels:[]};zones.push(z);}z.high=point.price;z.labels.push(point.label);}
 zones.forEach(z=>{z.labels=[...new Set(z.labels)];z.target=dir===1?z.low:z.high;z.r=dir*(z.target-entry)/risk;z.atrDistance=atr>0?Math.abs(z.target-entry)/atr:null;z.confluence=mas.some(m=>m.value!==null&&m.value>=z.low-distance&&m.value<=z.high+distance);});
 zones.sort((a,b)=>dir*(a.target-b.target));
 return {date,lastDate:last.date,lastClose:last.close,count:bars.length,atr,mas,zones,targets:zones.filter(z=>z.r>=1&&z.atrDistance!==null&&z.atrDistance<=4),side};
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
 const bars=data.bars.slice().sort((a,b)=>a.date.localeCompare(b.date));if(bars.length<14)throw Error('日线不足14根，无法生成止损参考。');
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
const api={pyramidPercentages,wilderATR,analyze,profits,trailing,weekTargets,structureStop,settlement,priceDefaults};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TradePlanner=api;
})(typeof window==='undefined'?{}:window);
