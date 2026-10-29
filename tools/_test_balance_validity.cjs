const assert=require('assert');
const tables=require('../js/config/tower-skills.js'),globalBalance=require('../js/config/global-balance.js'),common=require('../js/config/combat-common.js');
function validate(value,path='config') {
 for(const [key,v] of Object.entries(value)){
  const at=path+'.'+key;
  if(v&&typeof v==='object'){validate(v,at);continue;}
  if(typeof v!=='number')continue;
  assert(Number.isFinite(v),at+' must be finite');
  if(key!=='base')assert(v>=0,at+' must be nonnegative'); // signed rotation speed in storm rings
  if(['period','minPeriod','duration','baseDuration','tickInterval','attackInterval','distancePerTick','minAttackInterval','scatterHitRadius'].includes(key))assert(v>0,at+' must be positive');
  if(['probability','baseProbability','learnedProbability','deathProbability','spreadP','glacierSlowCap'].includes(key))assert(v<=1,at+' must not exceed one');
  if(['count','targets','baseCount','baseTargets','targetCount','extraTargets','branchCount','stackCap','maxTrails'].includes(key))assert(Number.isInteger(v),at+' must be an integer');
 }
}
validate(tables);validate(globalBalance);validate(common);
const storm=tables.electric['雷暴'];assert(storm.period-storm.periodReductionPerBranch*3>0,'storm C3 period must stay positive');
assert(tables.poison['剧毒'].freq.every(v=>v<1),'poison interval denominator must remain positive');
assert(tables.boomerang['风暴镖'].rings.length===tables.boomerang['风暴镖'].ringCounts.length,'storm rings/counts must match');
for(const bad of [{period:0},{duration:-1},{baseProbability:1.1},{count:2.5},{damage:NaN}])assert.throws(()=>validate(bad));
console.log('PASS numeric configuration constraints and five invalid-config rejection cases.');
