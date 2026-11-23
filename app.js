(function(){
'use strict';
function calculate(s){
 const keys=['equity','risk','entry','stop','leverage','available','cap','feeIn','feeOut','slip','reserve','step'];
 if(keys.some(k=>!Number.isFinite(s[k])))throw Error('请完整填写必填数值。');
 if(['equity','risk','entry','stop','available'].some(k=>s[k]<=0)||s.leverage<1)throw Error('资金与价格必须大于0，杠杆至少1倍。');
 if(s.risk>s.equity||s.available>s.equity)throw Error('亏损预算和可用保证金不能超过账户总资金。');
 if(['feeIn','feeOut','slip','reserve','step'].some(k=>s[k]<0)||s.slip>=100||s.cap<=0||s.cap>=100)throw Error('费用和步长不能为负；滑点小于100%，损失比例上限须大于0且小于100%。');
 if(s.reserve>=s.risk)throw Error('其他费用预留必须小于亏损预算。');
 if(s.side==='long'?s.stop>=s.entry:s.stop<=s.entry)throw Error(s.side==='long'?'做多时，止损价必须低于开仓价。':'做空时，止损价必须高于开仓价。');
 const exit=s.stop*(1+(s.side==='long'?-1:1)*s.slip/100);
 const unit=Math.abs(s.entry-exit)+s.entry*s.feeIn/100+exit*s.feeOut/100;
 let quantity=(s.risk-s.reserve)/unit;
 if(s.step>0)quantity=Math.floor(quantity/s.step)*s.step;
 if(quantity<=0)throw Error('按当前数量步长无法开仓，请重新设置预算或步长。');
 const notional=quantity*s.entry,loss=quantity*unit+s.reserve,margin=notional/s.leverage;
 return {quantity,notional,loss,margin,exit,minLeverage:Math.max(1,notional/s.available),maxLeverage:s.cap/100*notional/loss};
}
if(typeof module!=='undefined'&&module.exports){module.exports=calculate;return;}
const ids=['equity','risk','entry','stop','side','leverage','available','cap','feeIn','feeOut','slip','reserve','step','liquidation'];
const el=id=>document.getElementById(id),fmt=n=>n.toLocaleString('zh-CN',{maximumFractionDigits:2}),pct=n=>fmt(n*100)+'%';
function read(){const s={};for(const id of ids){const v=el(id).value;s[id]=id==='side'?v:v===''?null:Number(v);}if(s.available===null)s.available=s.equity;return s;}
function update(save){
 try{
  const s=read();const r=calculate(s);
  if(s.liquidation!==null&&(!Number.isFinite(s.liquidation)||s.liquidation<=0))throw Error('预估强平价必须大于0。');
  el('error').textContent='';el('output').hidden=false;
  el('notional').textContent=fmt(r.notional)+' U';el('margin-label').textContent=fmt(s.leverage)+'倍杠杆需要的保证金';el('margin').textContent=fmt(r.margin)+' U';el('loss').textContent=fmt(r.loss)+' U';
  el('risk-note').textContent='占账户资金 '+pct(r.loss/s.equity)+(s.feeIn||s.feeOut||s.slip||s.reserve?'；已包含填写的费用及滑点假设':'；未计费用与滑点');
  const warnings=[];if(r.margin>s.available)warnings.push('当前杠杆下保证金不够，这个仓位无法按预算开出。减少仓位可降低资金需求。');
  if(r.loss/r.margin>s.cap/100)warnings.push('止损损失超过你设置的保证金损失比例上限。');
  if(r.loss/s.equity>=0.1)warnings.push('这笔亏损预算达到或超过账户的10%；多笔持仓的风险还需合计。');
  el('warning').textContent=warnings.join(' ');
  el('simple-note').textContent='同样的持仓总额，更换杠杆不会改变价格波动带来的盈亏，只会改变所需保证金和强平缓冲。';
  el('advanced-note').textContent='等效数量 '+fmt(r.quantity)+'；止损距离 '+pct(Math.abs(s.entry-s.stop)/s.entry)+'；假设止损成交价 '+fmt(r.exit)+'。保证金预算要求杠杆至少 '+fmt(r.minLeverage)+'倍；损失比例约束的理论上限 '+fmt(r.maxLeverage)+'倍（非推荐值）。'+(r.minLeverage>r.maxLeverage?' 当前两项约束无法同时满足。':'');
  el('rows').replaceChildren(...[...new Set([1,2,3,5,10,15,20,s.leverage])].sort((a,b)=>a-b).map(l=>{
   const tr=document.createElement('tr'),m=r.notional/l,checks=[];
   if(m>s.available)checks.push('保证金不足');if(r.loss/m>s.cap/100)checks.push('超过损失比例上限');
   [fmt(l)+'倍',fmt(m)+' U',pct(r.loss/m),checks.join('；')||'通过预算，未核验强平'].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td);});return tr;
  }));
  el('liq-note').textContent=s.liquidation===null?'未填写强平价，无法检查是否可能先强平。':(s.side==='long'?s.liquidation<r.exit:s.liquidation>r.exit)?'所填强平价在假设止损成交价之外；仍需核实标记价格与跳空、滑点下的缓冲。':'强平价已到达或越过假设止损成交价，可能先强平。';
 }catch(e){el('error').textContent=e.message;el('output').hidden=true;el('advanced-note').textContent='请先修正输入。';el('rows').replaceChildren();el('liq-note').textContent='';}
 if(save){try{localStorage.setItem('position-calculator-simple-v1',JSON.stringify(Object.fromEntries(ids.map(id=>[id,el(id).value]))));}catch(e){}}
}
try{const saved=JSON.parse(localStorage.getItem('position-calculator-simple-v1')||'null');if(saved)for(const id of ids)if(Object.hasOwn(saved,id))el(id).value=saved[id];}catch(e){}
ids.forEach(id=>el(id).addEventListener('input',()=>update(true)));update(false);
})();
