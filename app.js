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
 const platformMax=s.platformMax??20;
 if(!Number.isFinite(platformMax)||platformMax<1)throw Error('平台最高杠杆至少为1倍。');
 const marginLimit=s.marginLimit??null;
 if(marginLimit!==null&&(!Number.isFinite(marginLimit)||marginLimit<=0))throw Error('保证金上限须大于0，或留空不限制。');
 const roundQuantity=q=>s.step>0?Math.floor(q/s.step)*s.step:q;
 let quantity=roundQuantity((s.risk-s.reserve)/unit);
 if(quantity<=0)throw Error('按当前数量步长无法开仓，请重新设置预算或步长。');
 const initialQuantity=quantity,minLeverage=1,lower=1;
 let notional=quantity*s.entry,loss=quantity*unit+s.reserve,maxLeverage=s.cap/100*notional/loss;
 let upper=Math.floor(Math.min(maxLeverage,platformMax)+1e-10),reference=upper>=lower?upper:null;
 let margin=reference===null?null:notional/reference;
 if(marginLimit!==null&&margin!==null&&margin>marginLimit+1e-8){
  let found=false;
  for(let leverage=reference;leverage>=1;leverage--){
   const q=roundQuantity(Math.min(initialQuantity,marginLimit*leverage/s.entry));
   if(q<=0)continue;
   const candidateLoss=q*unit+s.reserve,candidateMargin=q*s.entry/leverage;
   if(candidateLoss<=s.cap/100*candidateMargin+1e-8){quantity=q;reference=leverage;found=true;break;}
  }
  if(!found)throw Error('保证金上限内没有满足损失比例与数量步长的仓位，请提高上限或调整参数。');
  notional=quantity*s.entry;loss=quantity*unit+s.reserve;maxLeverage=s.cap/100*notional/loss;
  upper=Math.floor(Math.min(maxLeverage,platformMax)+1e-10);margin=notional/reference;
 }
 const selected=reference,marginCapped=quantity<initialQuantity-1e-10;
 return {quantity,notional,loss,margin,exit,minLeverage,maxLeverage,reference,selected,lower,upper,marginCapped};
}
if(typeof module!=='undefined'&&module.exports){module.exports=calculate;return;}
window.PositionRisk={calculate,read};
const ids=['risk','entry','stop','side','cap','feeIn','feeOut','slip','reserve','platformMax','marginLimit'];
const el=id=>document.getElementById(id),value=id=>id==='side'?document.querySelector('input[name=side]:checked').value:el(id).value,fmt=n=>n.toLocaleString('zh-CN',{maximumFractionDigits:2}),pct=n=>fmt(n*100)+'%';
function read(){const s={step:0};for(const id of ids){const v=value(id);s[id]=id==='side'?v:v===''?null:Number(v);}return s;}
function update(save){
 try{
  const s=read();el('cap-value').textContent=s.cap+'%';el('cap').setAttribute('aria-valuetext',s.cap+'%');const r=calculate(s);
  el('error').textContent='';el('output').hidden=false;
  el('notional').textContent=fmt(r.notional)+' U';el('margin-label').textContent=(r.selected===null?'所需保证金':fmt(r.selected)+'倍对应的逐仓保证金');el('margin').textContent=r.margin===null?'无法匹配':fmt(r.margin)+' U';el('leverage-value').textContent=r.selected===null?'无可用倍数':fmt(r.selected)+'倍';el('leverage-caption').textContent='逐仓杠杆预算上限';
  el('risk-note').textContent='止损预计亏 '+fmt(r.loss)+' U'+(s.feeIn||s.feeOut||s.slip||s.reserve?'；已包含填写的费用及滑点假设':'；未计费用与滑点');
  const warnings=[];if(r.marginCapped)warnings.push('已按保证金上限缩小仓位，实际止损亏损低于预算。');if(r.selected===null)warnings.push('当前预算内没有符合条件的整数杠杆。请缩小仓位或重新评估预算，不要直接开到上限。');
  if(r.margin!==null&&r.loss/r.margin>s.cap/100+1e-10)warnings.push('止损损失超过你设置的保证金损失比例上限。');
  if(r.selected!==null&&r.selected>s.platformMax)warnings.push('所选杠杆超过填写的平台上限。');
  el('warning').textContent=warnings.join(' ');
  el('simple-note').textContent=r.reference===null?'无法给出逐仓参考杠杆；下方高级设置可查看约束。':'按止损时最多损失保证金 '+fmt(s.cap)+'%计算，理论杠杆上限为 '+fmt(r.maxLeverage)+'倍；向下取整数并限制在填写的平台上限内，得到 '+fmt(r.reference)+'倍。这是预算上限，不是安全杠杆建议。';
  el('reference-status').textContent='仅为预算上限，未核验强平。'+(r.margin===null?'':' 止损损失约占本笔保证金 '+pct(r.loss/r.margin)+'。');
  el('advanced-note').textContent='等效数量 '+fmt(r.quantity)+'；止损距离 '+pct(Math.abs(s.entry-s.stop)/s.entry)+'；假设止损成交价 '+r.exit.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+'。账户本金不参与计算。按填写的损失比例，理论最低保证金 '+fmt(r.loss/(s.cap/100))+' U，理论杠杆上限 '+fmt(r.maxLeverage)+'倍；平台是否支持及强平位置需另行核实。';
  el('rows').replaceChildren(...[...new Set([1,2,3,5,10,15,20,r.reference].filter(x=>x!==null))].sort((a,b)=>a-b).map(l=>{
   const tr=document.createElement('tr'),m=r.notional/l,checks=[];if(l===r.selected)tr.className='current-leverage';if(s.marginLimit!==null&&m>s.marginLimit+1e-8)checks.push('超过保证金上限');if(l>s.platformMax)checks.push('超过平台上限');
   if(r.loss/m>s.cap/100)checks.push('超过损失比例上限');
   [fmt(l)+'倍',fmt(m)+' U',pct(r.loss/m),checks.join('；')||'通过预算，未核验强平'].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td);});return tr;
  }));
 }catch(e){el('error').textContent=e.message;el('output').hidden=false;for(const id of ['notional','margin','leverage-value'])el(id).textContent='—';el('risk-note').textContent='等待有效参数，暂不显示预算结果。';el('reference-status').textContent='';el('warning').textContent='';el('advanced-note').textContent='请先修正输入。';el('rows').replaceChildren();}
 window.dispatchEvent(new Event('trade-input-change'));
 if(save){try{localStorage.setItem('position-calculator-default70-v6',JSON.stringify(Object.fromEntries(ids.map(id=>[id,value(id)]))));}catch(e){}}
}
try{const current=localStorage.getItem('position-calculator-default70-v6');const saved=JSON.parse(current||localStorage.getItem('position-calculator-fees-v5')||localStorage.getItem('position-calculator-trade-v4')||'null');if(saved&&!current)saved.cap='70';if(saved&&!current){for(const key of ['feeIn','feeOut'])if(saved[key]===''||saved[key]==null||Number(saved[key])===0)saved[key]='0.05';}if(saved)for(const id of ids)if(Object.hasOwn(saved,id)){if(id==='side'){const radio=document.querySelector('input[name=side][value="'+(saved[id]==='short'?'short':'long')+'"]');radio.checked=true;}else if(id==='cap'){const n=Number(saved[id]);el(id).value=String([10,20,30,40,50,60,70,80,90].includes(n)?n:70);}else el(id).value=saved[id];}}catch(e){}
const defaultsKey='position-trade-defaults-v1';
let tradeDefaults={risk:500,marginLimit:3000};
try{
 const saved=JSON.parse(localStorage.getItem(defaultsKey)||'null');
 if(saved&&Number.isFinite(saved.risk)&&saved.risk>0)tradeDefaults.risk=saved.risk;
 if(saved&&(saved.marginLimit===null||(Number.isFinite(saved.marginLimit)&&saved.marginLimit>0)))tradeDefaults.marginLimit=saved.marginLimit;
}catch(e){}
el('default-risk').value=tradeDefaults.risk;el('default-margin').value=tradeDefaults.marginLimit??'';
el('risk').value=tradeDefaults.risk;el('marginLimit').value=tradeDefaults.marginLimit??'';
for(const id of ['default-risk','default-margin'])el(id).addEventListener('change',()=>{
 const risk=el('default-risk').value===''?NaN:Number(el('default-risk').value),marginLimit=el('default-margin').value===''?null:Number(el('default-margin').value);
 if(!Number.isFinite(risk)||risk<=0||marginLimit!==null&&(!Number.isFinite(marginLimit)||marginLimit<=0)){el('defaults-error').textContent='默认亏损预算须大于0；保证金上限须大于0或留空。';return;}
 el('defaults-error').textContent='';tradeDefaults={risk,marginLimit};
 try{localStorage.setItem(defaultsKey,JSON.stringify(tradeDefaults));}catch(e){}
 el('risk').value=risk;el('marginLimit').value=marginLimit??'';update(true);
});
const settings=el('settings-dialog');el('open-settings').addEventListener('click',()=>settings.showModal());el('close-settings').addEventListener('click',()=>settings.close());settings.addEventListener('click',e=>{if(e.target===settings){const b=settings.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right)settings.close();}});
ids.filter(id=>id!=='side').forEach(id=>el(id).addEventListener('input',()=>update(true)));document.querySelectorAll('input[name=side]').forEach(r=>r.addEventListener('change',()=>update(true)));update(false);
})();
