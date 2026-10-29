const assert=require('assert'),{CombatSystem}=require('../js/combat.js'),B=require('../js/config/tower-skills.js');
for(const name of ['极光电击','雷暴']){
 const c=Object.create(CombatSystem.prototype),casts=[],damage=[];c.game={fx:[],run:{relic3:()=>false,relicNum:()=>0}};c.timers={};c.lv=(k,n)=>n===name?1:0;c.branchLv=()=>0;c._weakPeriod=()=>1;c.castEnergy=(k,n)=>casts.push(n);c.towerMuzzle=()=>({x:0,y:100});c.range=()=>500;c.inTowerRange=()=>true;c.shotDmg=()=>100;c.damage=(e,d)=>damage.push(d);c.fxFlash=()=>{};c.fxRing=()=>{};c.fxParticle=()=>{};
 let enemies=[];c.enemies=()=>enemies;
 const cfg=B.electric[name],saved={period:cfg.period,damage:cfg.damage};try{cfg.period=1;c.tickElectric(0.5);assert.equal(casts.length,0);cfg.damage=0.5;enemies=[{x:0,y:0,hp:100}];c.tickElectric(0.5);assert.deepEqual(casts,[name]);assert.equal(damage[0],50);}finally{Object.assign(cfg,saved);}
}
assert.notStrictEqual(B.electric['雷暴'].chainProbability,B.poison['瘟疫'].prob);
console.log('PASS electric real periods/damage read config; storm probability independent of poison.');
{
 const c=Object.create(CombatSystem.prototype);c.game={fx:[],run:{relic3:()=>false,relicNum:()=>0}};c.shots=[];c.lv=(k,n)=>n==='活电'?1:0;c.branchLv=()=>0;c.relicVal=()=>0;c.damage=()=>{};c.tryAttackDebuff=()=>{};c.fxFlash=()=>{};c.fxRing=()=>{};c.fxParticle=()=>{};
 const b=B.electric['活电'],old={count:b.count,damage:b.damage,duration:b.duration};try{b.count=7;b.damage=0.25;b.duration=3;c.hitElectric({x:0,y:0,hp:100,paralyzed:1},100);assert.equal(c.shots.length,7);assert(c.shots.every(s=>s.dmg===25&&s.dur===3));}finally{Object.assign(b,old);}
 console.log('PASS live-electric projectile count, damage and lifetime respond to config.');
}
