const assert=require('assert'),{CombatSystem}=require('../js/combat.js'),B=require('../js/config/tower-skills.js');
for(const skill of ['毒池','毒棒','毒藤']){
 const c=Object.create(CombatSystem.prototype),casts=[];const e={x:100,y:100,hp:100};c.game={run:{relic3:()=>false},fx:[]};c.timers={};c.lv=(k,n)=>n===skill?1:0;c.branchLv=()=>0;c._weakPeriod=()=>1;c.enemies=()=>[e];c.inTowerRange=()=>true;c.castEnergy=(k,n)=>casts.push(n);c.shotDmg=()=>100;c.towerMuzzle=()=>({x:0,y:0});c.fxRing=()=>{};c.fxParticle=()=>{};
 const b=B.poison[skill],old=b.period,min=b.minPeriod;try{b.period=1;if('minPeriod' in b)b.minPeriod=0.1;c.tickPoison(0.5);assert.equal(casts.length,0);c.tickPoison(0.5);assert.deepEqual(casts,[skill]);if(skill==='毒池'){assert.equal(c.groundDots[0].dps,100*b.damage);assert.equal(c.groundDots[0].ttl,b.duration);}if(skill==='毒棒')assert.equal(c.poisonSticks[0].dmg,100*b.damage);if(skill==='毒藤')assert.equal(e._vineT,b.duration);}finally{b.period=old;if(min!==undefined)b.minPeriod=min;}
}
console.log('PASS poison real periods, pool damage/duration, summoned stick damage and vine duration read configuration.');
const source=require('fs').readFileSync(require('path').join(__dirname,'../js/combat.js'),'utf8');
assert(!source.includes("SKILL_NUM.ice['碎冰'].count + this.branchLv('poison'"));
assert(source.includes("SKILL_NUM.poison['毒爆'].targets + this.branchLv('poison'"));
console.log('PASS: poison explosion target count uses its own config, not ice shards.');
