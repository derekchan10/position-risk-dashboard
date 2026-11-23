(function(){
'use strict';
function calculate(s){
 const keys=['risk','entry','stop','cap','feeIn','feeOut','slip','reserve','step'];
 if(keys.some(k=>!Number.isFinite(s[k])))throw Error('请完整填写必填数值。');
 if(['risk','entry','stop'].some(k=>s[k]<=0))throw Error('资金与价格必须大于0，杠杆至少1倍。');
 if(['feeIn','feeOut','slip','reserve','step'].some(k=>s[k]<0)||s.slip>=100||s.cap<=0||s.cap>=100)throw Error('费用和步长不能为负；滑点小于100%，损失比例上限须大于0且小于100%。');
 if(s.reserve>=s.risk)throw Error('其他费用预留必须小于亏损预算。');
 if(s.side==='long'?s.stop>=s.entry:s.stop<=s.entry)throw Error(s.side==='long'?'做多时，止损价必须低于开仓价。':'做空时，止损价必须高于开仓价。');
 const exit=s.stop*(1+(s.side==='long'?-1:1)*s.slip/100);
 const unit=Math.abs(s.entry-exit)+s.entry*s.feeIn/100+exit*s.feeOut/100;
 let quantity=(s.risk-s.reserve)/unit;
 if(s.step>0)quantity=Math.floor(quantity/s.step)*s.step;
 if(quantity<=0)throw Error('按当前数量步长无法开仓，请重新设置预算或步长。');
 const notional=quantity*s.entry,loss=quantity*unit+s.reserve;
 const minLeverage=1,maxLeverage=s.cap/100*notional/loss;
 const platformMax=s.platformMax??20;
 if(!Number.isFinite(platformMax)||platformMax<1)throw Error('平台最高杠杆至少为1倍。');
 const lower=Math.ceil(minLeverage-1e-10),upper=Math.floor(Math.min(maxLeverage,platformMax)+1e-10);
 const reference=lower<=upper?upper:null;
 const selected=reference;
 const margin=selected===null?null:notional/selected;
 return {quantity,notional,loss,margin,exit,minLeverage,maxLeverage,reference,selected,lower,upper};
}
if(typeof module!=='undefined'&&module.exports){module.exports=calculate;return;}
const ids=['risk','entry','stop','side','cap','feeIn','feeOut','slip','reserve','step','liquidation','platformMax'];
const el=id=>document.getElementById(id),value=id=>id==='side'?document.querySelector('input[name=side]:checked').value:el(id).value,fmt=n=>n.toLocaleString('zh-CN',{maximumFractionDigits:2}),pct=n=>fmt(n*100)+'%';
function read(){const s={};for(const id of ids){const v=value(id);s[id]=id==='side'?v:v===''?null:Number(v);}return s;}
function update(save){
 try{
  const s=read();el('stop-hint').textContent=s.side==='long'?'做多：跌到这个价格就退出':'做空：涨到这个价格就退出';const r=calculate(s);
  if(s.liquidation!==null&&(!Number.isFinite(s.liquidation)||s.liquidation<=0))throw Error('预估强平价必须大于0。');
  el('error').textContent='';el('output').hidden=false;
  el('notional').textContent=fmt(r.notional)+' U';el('margin-label').textContent=(r.selected===null?'所需保证金':fmt(r.selected)+'倍对应的逐仓保证金');el('margin').textContent=r.margin===null?'无法匹配':fmt(r.margin)+' U';el('leverage-value').textContent=r.selected===null?'无可用倍数':fmt(r.selected)+'倍';el('leverage-caption').textContent='逐仓杠杆预算上限';
  el('risk-note').textContent='止损预计亏 '+fmt(r.loss)+' U'+(s.feeIn||s.feeOut||s.slip||s.reserve?'；已包含填写的费用及滑点假设':'；未计费用与滑点');
  const warnings=[];if(r.selected===null)warnings.push('当前预算内没有符合条件的整数杠杆。请缩小仓位或重新评估预算，不要直接开到上限。');
  if(r.margin!==null&&r.loss/r.margin>s.cap/100+1e-10)warnings.push('止损损失超过你设置的保证金损失比例上限。');
  if(r.selected!==null&&r.selected>s.platformMax)warnings.push('所选杠杆超过填写的平台上限。');
  el('warning').textContent=warnings.join(' ');
  el('simple-note').textContent=r.reference===null?'无法给出逐仓参考杠杆；下方高级设置可查看约束。':'按止损时最多损失保证金 '+fmt(s.cap)+'%计算，理论杠杆上限为 '+fmt(r.maxLeverage)+'倍；向下取整数并限制在填写的平台上限内，得到 '+fmt(r.reference)+'倍。这是预算上限，不是安全杠杆建议。';
  el('reference-status').textContent='仅按预算计算，尚未验证强平；不是个性化投资建议。'+(r.margin===null?'':' 止损损失约占本笔保证金 '+pct(r.loss/r.margin)+'。');
  el('advanced-note').textContent='等效数量 '+fmt(r.quantity)+'；止损距离 '+pct(Math.abs(s.entry-s.stop)/s.entry)+'；假设止损成交价 '+fmt(r.exit)+'。账户本金不参与计算。按填写的损失比例，理论最低保证金 '+fmt(r.loss/(s.cap/100))+' U，理论杠杆上限 '+fmt(r.maxLeverage)+'倍；平台是否支持及强平位置需另行核实。';
  el('rows').replaceChildren(...[...new Set([1,2,3,5,10,15,20,r.reference].filter(x=>x!==null))].sort((a,b)=>a-b).map(l=>{
   const tr=document.createElement('tr'),m=r.notional/l,checks=[];if(l>s.platformMax)checks.push('超过平台上限');
   if(r.loss/m>s.cap/100)checks.push('超过损失比例上限');
   [fmt(l)+'倍',fmt(m)+' U',pct(r.loss/m),checks.join('；')||'通过预算，未核验强平'].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td);});return tr;
  }));
  el('liq-note').textContent=s.liquidation===null?'未填写强平价：参考倍数未通过强平核验，请在平台核对后再决策。':(s.side==='long'?s.liquidation<r.exit:s.liquidation>r.exit)?'所填强平价在假设止损成交价之外；仍需核实标记价格与跳空、滑点下的缓冲。':'强平价已到达或越过假设止损成交价，可能先强平。';
 }catch(e){el('error').textContent=e.message;el('output').hidden=true;el('advanced-note').textContent='请先修正输入。';el('rows').replaceChildren();el('liq-note').textContent='';}
 if(save){try{localStorage.setItem('position-calculator-fees-v5',JSON.stringify(Object.fromEntries(ids.map(id=>[id,value(id)]))));}catch(e){}}
}
try{const current=localStorage.getItem('position-calculator-fees-v5');const saved=JSON.parse(current||localStorage.getItem('position-calculator-trade-v4')||'null');if(saved&&!current){for(const key of ['feeIn','feeOut'])if(saved[key]===''||saved[key]==null||Number(saved[key])===0)saved[key]='0.05';}if(saved)for(const id of ids)if(Object.hasOwn(saved,id)){if(id==='side'){const radio=document.querySelector('input[name=side][value="'+(saved[id]==='short'?'short':'long')+'"]');radio.checked=true;}else el(id).value=saved[id];}}catch(e){}
ids.filter(id=>id!=='side').forEach(id=>el(id).addEventListener('input',()=>update(true)));document.querySelectorAll('input[name=side]').forEach(r=>r.addEventListener('change',()=>update(true)));update(false);
})();
