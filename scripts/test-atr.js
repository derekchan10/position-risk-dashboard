const assert=require('node:assert/strict'),p=require('../planner.js');
// 14 constant true ranges of 2, then a gap makes TR=10 (not the candle range 2).
const bars=Array.from({length:14},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,open:100,high:101,low:99,close:100}));
bars.push({date:'2026-01-15',open:109,high:110,low:108,close:109});
assert(Math.abs(p.wilderATR(bars)-(2*13+10)/14)<1e-12);
bars.push({date:'2026-01-16',open:109,high:110,low:108,close:109});
const expected=(((2*13+10)/14)*13+2)/14;
assert(Math.abs(p.wilderATR(bars)-expected)<1e-12);
assert.notEqual(p.wilderATR(bars),36/14); // SMA would be a different value.
assert.equal(p.priceDefaults({bars,quote:{price:120}},'long').atr,expected);
console.log('PASS: Wilder smoothing, gap true range, shared auto-stop ATR');
