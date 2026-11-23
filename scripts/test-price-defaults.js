const assert=require('node:assert/strict'),p=require('../planner.js'),data=require('../tests/fixtures/nvda-history.json');
const long=p.priceDefaults({...data,quote:{price:200}},'long');assert(long.stop<long.entry);assert.equal(long.base,Math.min(...data.bars.slice(-10).map(b=>b.low)));
const short=p.priceDefaults({...data,quote:{price:100}},'short');assert(short.stop>short.entry);assert.equal(p.priceDefaults({...data,quote:{price:.01}},'long').stop,null);assert.throws(()=>p.priceDefaults(data,'long'));console.log('PASS: quote-based entry, ten-bar lows/highs, invalid stop direction and missing quote');

for(const k of [.1,.2,.3]){const l=p.priceDefaults({...data,quote:{price:200}},'long',k),s=p.priceDefaults({...data,quote:{price:100}},'short',k);assert.equal(l.stop,Math.round((l.base-k*l.atr)*100)/100);assert.equal(s.stop,Math.round((s.base+k*s.atr)*100)/100);}
assert.throws(()=>p.priceDefaults({...data,quote:{price:200}},'long',.4));
