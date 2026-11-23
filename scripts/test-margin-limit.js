const assert=require('node:assert/strict'),calculate=require('../app.js');
const s={side:'long',entry:130,stop:124,risk:500,cap:70,feeIn:.05,feeOut:.05,slip:0,reserve:0,step:0,platformMax:20};
const base=calculate(s);assert.equal(calculate({...s,marginLimit:null}).quantity,base.quantity);
const capped=calculate({...s,marginLimit:300});assert(capped.margin<=300+1e-8);assert(capped.loss<500);assert(capped.loss/capped.margin<=.7+1e-8);assert(capped.selected<=base.selected);assert(capped.marginCapped);
const enough=calculate({...s,marginLimit:1000});assert.equal(enough.quantity,base.quantity);assert(!enough.marginCapped);
for(const side of ['long','short'])for(const reserve of [0,10,100])for(const step of [0,1]){const x={...s,side,stop:side==='long'?124:136,reserve,step,marginLimit:300};const r=calculate(x);assert(r.margin<=300+1e-8);assert(r.loss<=500+1e-8);assert(r.loss/r.margin<=.7+1e-8);assert(r.selected<=20);}
assert.throws(()=>calculate({...s,marginLimit:0}));assert.throws(()=>calculate({...s,marginLimit:NaN}));assert.throws(()=>calculate({...s,reserve:100,marginLimit:10}));
console.log('PASS: optional margin cap, smaller position, loss ratio, reserve, lot rounding and both directions');
