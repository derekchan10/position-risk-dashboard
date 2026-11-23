(function(root){
'use strict';
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
 const trs=bars.slice(-14).map((b,i)=>{const idx=bars.length-14+i,p=bars[idx-1]?.close??b.close;return Math.max(b.high-b.low,Math.abs(b.high-p),Math.abs(b.low-p));});
 const atr=trs.reduce((a,b)=>a+b,0)/trs.length;
 const raw=[];const add=(p,label)=>{if(dir*(p-entry)>0)raw.push({price:p,label});};
 // Moving averages are auxiliary only; never enter horizontal target clustering.
 add(last.high,'前一交易日高点 '+last.date);add(last.low,'前一交易日低点 '+last.date);
 const start=Math.max(2,bars.length-90);
 for(let i=start;i<bars.length-2;i++){
  const b=bars[i],around=[bars[i-2],bars[i-1],bars[i+1],bars[i+2]];
  if(around.every(x=>b.high>=x.high)&&around.some(x=>b.high>x.high))add(b.high,'已确认前高 '+b.date);
  if(around.every(x=>b.low<=x.low)&&around.some(x=>b.low<x.low))add(b.low,'已确认前低 '+b.date);
 }
 const distance=Math.max(entry*.003,Math.min(atr*.2,entry*.01));
 raw.sort((a,b)=>a.price-b.price);const zones=[];
 for(const point of raw){let z=zones.at(-1);if(!z||point.price-z.low>distance){z={low:point.price,high:point.price,labels:[]};zones.push(z);}z.high=point.price;z.labels.push(point.label);}
 zones.forEach(z=>{z.labels=[...new Set(z.labels)];z.target=dir===1?z.low:z.high;z.r=dir*(z.target-entry)/risk;z.atrDistance=atr>0?Math.abs(z.target-entry)/atr:null;z.confluence=mas.some(m=>m.value!==null&&m.value>=z.low-distance&&m.value<=z.high+distance);});
 zones.sort((a,b)=>dir*(a.target-b.target));
 return {date,lastDate:last.date,lastClose:last.close,count:bars.length,atr,mas,zones,targets:zones.filter(z=>z.r>=1&&z.atrDistance!==null&&z.atrDistance<=4).slice(0,3),side};
}
function trailing(side,entry,initialStop,atr,extreme,currentStop,multiple){
 const dir=side==='short'?-1:1;
 if(![entry,initialStop,atr,extreme,currentStop,multiple].every(Number.isFinite)||atr<=0||multiple<=0||dir*(entry-initialStop)<=0||dir*(extreme-entry)<0||dir*(extreme-currentStop)<=0)throw Error('请填写有效的持仓后极值与当前保护价；做多极值不低于开仓价，做空反之，保护价不能越过极值。');
 const raw=extreme-dir*multiple*atr;
 const reference=dir===1?Math.max(initialStop,currentStop,raw):Math.min(initialStop,currentStop,raw);
 return {reference,raw,distance:multiple*atr};
}
function profits(s,position,rows){
 let total=0,cumulative=0;const dir=s.side==='short'?-1:1,risk=Math.abs(s.entry-s.stop);
 const active=rows.filter(x=>x.price!==''||x.percent!=='');
 const parsed=active.map((row,i)=>{
  const price=Number(row.price),percent=Number(row.percent);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(percent)||percent<=0||percent>100)throw Error('每档价格须大于0，比例须大于0且不超过100%。');
  if(dir*(price-s.entry)<=0)throw Error('做多止盈价须高于开仓价；做空须低于开仓价。');
  if(i&&dir*(price-Number(active[i-1].price))<=0)throw Error('各档价格须按依次触发的顺序填写。');
  total+=percent;if(total>100+1e-8)throw Error('卖出比例按原始仓位计算，合计不能超过100%。');
  const f=percent/100,q=position.quantity*f;
  const gross=q*dir*(price-s.entry),net=gross-q*(s.entry*s.feeIn/100+price*s.feeOut/100)-s.reserve*f;
  cumulative+=net;return {price,percent,quantity:q,gross,net,cumulative,r:dir*(price-s.entry)/risk};
 });
 const remaining=Math.max(0,1-total/100),remainingLoss=position.loss*remaining;
 return {rows:parsed,total,net:cumulative,remaining,remainingQuantity:position.quantity*remaining,netIfStop:cumulative-remainingLoss,netR:cumulative/position.loss};
}
const api={analyze,profits,trailing};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TradePlanner=api;
})(typeof window==='undefined'?{}:window);
