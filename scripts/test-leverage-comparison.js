const assert=require('node:assert/strict'),C=require('../app');
const s={entry:130,stop:124,risk:500,cap:100,feeIn:.05,feeOut:.05,slip:0,reserve:0,step:0,platformMax:20,marginLimit:3000,side:'long'};
const rows=C.compareLeverages(s),one=rows.find(r=>r.leverage===1),five=rows.find(r=>r.leverage===5);
assert.equal(one.notional,3000);assert.equal(one.margin,3000);assert(one.loss<500);assert.equal(one.reached,false);
assert(Math.abs(five.loss-500)<1e-8);assert(five.margin<=3000);assert.equal(five.reached,true);
for(const row of rows){assert(row.loss<=500+1e-8);assert(row.margin<=3000+1e-8);assert(Math.abs(row.notional-row.quantity*130)<1e-8);}
const capped=C.compareLeverages({...s,marginLimit:100});assert(capped.every(r=>r.margin<=100+1e-8));assert(capped.every(r=>!r.reached));
const unlimited=C.compareLeverages({...s,marginLimit:null});assert(unlimited.every(r=>Math.abs(r.loss-500)<1e-8));
const short=C.compareLeverages({...s,side:'short',stop:136});assert(short.every(r=>r.loss<=500+1e-8));
const fees=C.compareLeverages({...s,slip:.2,reserve:10,marginLimit:1000});assert(fees.every(r=>r.loss<=500+1e-8&&r.margin<=1000+1e-8));
console.log('PASS: independent leverage sizing, margin limit, risk reached/limited, fees, slip, reserve and short direction');
