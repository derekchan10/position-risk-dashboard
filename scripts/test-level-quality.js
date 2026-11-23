const assert=require('node:assert/strict'),P=require('../planner');
const bars=Array.from({length:310},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:100,high:103,low:97,close:100}));
// A historical pivot beyond the old 90-day window, but within the new 252-day window.
bars[100]={...bars[100],high:150};
let a=P.analyze({bars},'2026-01-01',110,90,'long');
assert.equal(a.historyCount,252);assert(a.zones.some(z=>z.labels.some(l=>l.includes(bars[100].date))));
assert(a.zones.every(z=>!z.broken));assert(a.zones.every(z=>z.reactions<=z.touches));
// A cluster of adjacent candles is one visit, not many independent reactions.
const old=a.zones.find(z=>z.target===150);assert.equal(old.touches,1);assert.equal(old.reactions,1);
const repeated=structuredClone(bars);repeated[120].high=150;repeated[122].high=150;repeated[140].high=150;
a=P.analyze({bars:repeated},'2026-01-01',110,90,'long');const z=a.zones.find(z=>z.target===150);assert.equal(z.touches,3);assert.match(z.quality,/多次/);
// Sustained closing beyond resistance excludes it, but an intraday wick alone does not.
const broken=structuredClone(bars);for(const i of [308,309])broken[i]={...broken[i],open:160,high:162,low:155,close:160};
a=P.analyze({bars:broken},'2026-01-01',110,90,'long');assert(a.excludedZones.some(z=>z.target===150));assert(!a.zones.some(z=>z.target===150));
const wick=structuredClone(bars);wick[309].high=160;a=P.analyze({bars:wick},'2026-01-01',110,90,'long');assert(a.zones.some(z=>z.target===150));
const shortBars=broken.map(b=>({...b,open:300-b.open,high:300-b.low,low:300-b.high,close:300-b.close}));a=P.analyze({bars:shortBars},'2026-01-01',190,210,'short');assert(a.excludedZones.some(z=>z.target===150));
// Tight five-session ranges are recognized; old/out-of-cutoff points cannot leak in.
const dense=structuredClone(bars);for(let i=160;i<165;i++)dense[i]={...dense[i],open:140,close:140,high:141,low:139};
a=P.analyze({bars:dense},'2026-01-01',110,90,'long');assert(a.zones.some(z=>z.consolidation));
const future={date:'2099-01-01',open:1000,high:1001,low:999,close:1000};assert.deepEqual(P.analyze({bars:[...dense,future]},'2026-01-01',110,90,'long'),a);
const outside=structuredClone(bars);outside[20].high=200;a=P.analyze({bars:outside},'2026-01-01',110,90,'long');assert(!a.zones.some(z=>z.target===200));
console.log('PASS: expanded history, independent contacts/reactions, consolidation, confirmed breaks, wick preservation, mirrored short and no future leakage');
