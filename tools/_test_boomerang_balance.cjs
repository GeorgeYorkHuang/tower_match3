const assert=require('assert'),{CombatSystem}=require('../js/combat.js'),B=require('../js/config/tower-skills.js');
for(const skill of ['风暴镖','弹力镖']){const c=Object.create(CombatSystem.prototype);c.game={fx:[],run:{relic3:()=>false}};c.timers={};c.shots=[];c.lv=(k,n)=>n===skill?1:0;c.branchLv=()=>0;c._weakPeriod=()=>1;c.enemies=()=>[{x:10,y:10,hp:100}];c.inTowerRange=()=>true;c.castEnergy=()=>{};c.shotDmg=()=>100;c.towerMuzzle=()=>({x:0,y:100});c.fxFlash=()=>{};c.fxRing=()=>{};c.fxParticle=()=>{};const b=B.boomerang[skill],old=b.period;try{b.period=1;c.tickBoomerang(1);if(skill==='弹力镖'){assert.equal(c.shots.length,b.count);assert.equal(c.shots[0].dmg,100*b.damage);assert.equal(c.shots[0].dur,b.duration);}else{assert.equal(c.storms.length,1);assert.equal(c.storms[0].perDmg,100*b.damage);assert.equal(c.storms[0].ttl,b.duration);}}finally{b.period=old;}}
console.log('PASS actual boomerang periodic attacks read periods, counts, damage and durations.');
{
 const c=Object.create(CombatSystem.prototype);c.branchLv=()=>0;c.fxParticle=()=>{};
 const b=B.boomerang['放血'],old={duration:b.duration,damage:b.damage};try{b.duration=9;b.damage=0.25;const e={x:0,y:0};c.applyBleed(e,100);assert.equal(e.bleedT,9);assert.equal(e._bleedDmg,25);}finally{Object.assign(b,old);}
 console.log('PASS actual bleed duration and per-distance damage read config.');
}
