const assert=require('node:assert/strict'),{pyramidPercentages:p}=require('../planner.js');
assert.deepEqual(p(3),[50,33.33,16.67]);assert.deepEqual(p(2),[66.67,33.33]);assert.deepEqual(p(1),[100]);assert.deepEqual(p(3,30),[35,23.33,11.67]);assert.deepEqual(p(3,100),[0,0,0]);assert.deepEqual(p(0),[]);
for(const n of [1,2,3,4])for(const retain of [0,5,22.5,30,99.99,100]){const result=p(n,retain);assert.equal(result.reduce((sum,x)=>sum+Math.round(x*100),0),Math.round((100-retain)*100));assert(result.every((x,i)=>i===0||x<=result[i-1]));}
assert.throws(()=>p(3,-1));console.log('PASS: front-loaded pyramid weights, retention, rounding and exact totals');
