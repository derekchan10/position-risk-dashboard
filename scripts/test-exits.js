const assert=require('node:assert/strict'),P=require('../planner.js');
const data=require('../tests/fixtures/nvda-history.json');const a=P.analyze(data,'2026-11-23',130,124,'long');
assert(a.zones.every(z=>z.labels.every(l=>!l.startsWith('MA'))));
assert(a.targets.every(z=>z.r>=1&&z.atrDistance<=4));
const flat={bars:Array.from({length:220},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:100,high:101,low:99,close:100}))};
const no=P.analyze(flat,'2026-01-01',105,100,'long');assert.equal(no.targets.length,0);
assert.equal(P.trailing('long',130,124,3,140,135,2).reference,135); // cannot lower a tightened stop
assert.equal(P.trailing('long',130,124,3,150,135,2).reference,144);
assert.equal(P.trailing('short',130,136,3,110,120,2).reference,116);
assert.throws(()=>P.trailing('long',130,124,3,125,124,2));
assert.throws(()=>P.trailing('long',130,124,3,140,145,2));
const poisoned={...data,bars:[...data.bars,{date:'2099-01-01',open:1,high:99999,low:1,close:9999}]};assert.deepEqual(P.analyze(poisoned,'2026-11-23',130,124,'long'),a);
console.log('PASS: horizontal-only targets, no padding, ATR limit, long/short trailing monotonicity, cutoff');
