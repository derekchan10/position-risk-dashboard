const assert=require('node:assert/strict'),P=require('../planner.js');
function bars(closes){return closes.map((close,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),open:close-.2,high:close+.5,low:close-.5,close,volume:i===closes.length-1?200:100}));}
const zone={low:105,high:105,target:105,r:2.5,atrDistance:2},a={side:'long',zones:[zone],targets:[zone]};
const decline={bars:bars(Array.from({length:35},(_,i)=>120-i))};
const falling=P.setupAssessment(decline,'2026-02-05',a);assert.equal(falling.extent,'明显');assert.equal(falling.confirmation,'仍创新低');assert.equal(falling.profile,'defensive');
const recovery={bars:bars([...Array.from({length:35},(_,i)=>120-i),87,90,94])},confirmed=P.setupAssessment(recovery,'2026-02-08',a);
assert.equal(confirmed.confirmation,'确认增强');assert.equal(confirmed.profile,'balanced');assert.equal(confirmed.metrics.volumeRatio,2);
const noVolume={bars:recovery.bars.map(({volume,...bar})=>bar)},missing=P.setupAssessment(noVolume,'2026-02-08',a);assert.equal(missing.metrics.volumeRatio,null);assert(missing.facts.some(x=>x.includes('成交量缺失')));assert.notEqual(missing.profile,'balanced');
const cramped=P.setupAssessment(recovery,'2026-02-08',{...a,zones:[{...zone,r:1.2}],targets:[]});assert.equal(cramped.space,'空间不足');assert.equal(cramped.profile,'observe');assert(!cramped.applicable);
const distant=P.setupAssessment(recovery,'2026-02-08',{...a,zones:[{...zone,atrDistance:5}],targets:[]});assert.equal(distant.space,'目标偏远');
const stale=P.setupAssessment(recovery,'2026-03-01',a);assert.equal(stale.extent,'数据较旧');assert(!stale.applicable);
assert.equal(P.setupAssessment({bars:recovery.bars.slice(0,20)},'2026-02-08',a).extent,'数据不足');
const neutral=P.setupAssessment({bars:bars(Array(35).fill(100))},'2026-02-05',a);assert.equal(neutral.metrics.rsi,50);assert.equal(neutral.extent,'不明显');assert.equal(neutral.profile,'observe');
const mirrored={bars:recovery.bars.map(b=>({...b,open:200-b.open,high:200-b.low,low:200-b.high,close:200-b.close}))},short=P.setupAssessment(mirrored,'2026-02-08',{...a,side:'short'});assert.equal(short.names[0],'超涨程度');assert.equal(short.profile,'balanced');assert.equal(short.confirmation,'确认增强');assert(Math.abs(short.metrics.rsi+confirmed.metrics.rsi-100)<.02);
const poisoned={bars:[...recovery.bars,{date:'2099-01-01',open:999,high:1000,low:1,close:2,volume:999999999}]};assert.deepEqual(P.setupAssessment(poisoned,'2026-02-08',a),confirmed);
assert.deepEqual(P.setupPercentages(3,0,'defensive'),[60,30,10]);assert.deepEqual(P.setupPercentages(3,0,'balanced'),[33.34,33.33,33.33]);assert.deepEqual(P.setupPercentages(3,30,'defensive'),[42,21,7]);
for(const profile of ['defensive','balanced','pyramid','observe'])for(const count of [0,1,2,3])for(const retain of [0,22.5,100])assert.equal(P.setupPercentages(count,retain,profile).reduce((sum,x)=>sum+Math.round(x*100),0),count?Math.round((100-retain)*100):0);
console.log('PASS: RSI, falling/recovery confirmation, volume gaps, space gates, stale data, short symmetry, cutoff and allocations');
