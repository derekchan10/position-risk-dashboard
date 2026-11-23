const assert=require('node:assert/strict'),C=require('../app');
const s={entry:130,stop:124,risk:500,cap:100,feeIn:.05,feeOut:.05,slip:0,reserve:0,step:0,platformMax:20,marginLimit:3000,side:'long'};
const selected=C(s);assert.equal(selected.selected,3);assert.equal(selected.notional,9000);assert.equal(selected.margin,3000);assert(selected.loss<500);
const rows=C.compareLeverages(s),four=rows.find(r=>r.leverage===4);assert(four.loss>500);assert(four.checks.includes('超过亏损上限'));
for(const row of rows){assert(Math.abs(row.margin-3000)<1e-8);assert.equal(row.notional,3000*row.leverage);}
const tiny=C({...s,marginLimit:100});assert.equal(tiny.selected,20);assert.equal(tiny.notional,2000);
const large=C({...s,marginLimit:20000});assert.equal(large.selected,1);assert(large.margin<20000);assert(Math.abs(large.loss-500)<1e-8);assert(large.marginReduced);
const unlimited=C.compareLeverages({...s,marginLimit:null});assert(unlimited.every(r=>Math.abs(r.loss-500)<1e-8));
for(const side of ['long','short'])for(const reserve of [0,10]){const x={...s,side,stop:side==='long'?124:136,reserve,slip:.2};const r=C(x);assert(r.loss<=500+1e-8);assert(r.margin<=3000+1e-8);assert(r.loss<=r.margin+1e-8);}
console.log('PASS: full-margin sizing, maximum integer leverage under risk cap, over-budget comparison, platform cap, one-times fallback, fees and short direction');
