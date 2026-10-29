const assert=require('assert');const {CombatSystem}=require('../js/combat.js');const balance=require('../js/config/tower-skills.js');
for(const [key,skill,method,timer] of [['fire','烈焰墙','tickFire','fireWall'],['fire','火雨','tickFire','fireRain'],['ice','冰花','tickIce','iceFlower'],['ice','冬珠','tickIce','frostOrb'],['ice','冰墙','tickIce','iceWall']]){
 const c=Object.create(CombatSystem.prototype),casts=[];
 c.game={run:{relic3:()=>false,lineHp:100},fx:[]};c.timers={};c.lv=(k,n)=>k===key&&n===skill?1:0;c._weakPeriod=()=>1;c.enemies=()=>[];c.castEnergy=(k,n)=>casts.push(n);c.branchLv=()=>0;c.ly=()=>({wallY:100});c.fxFlash=()=>{};c.fxRing=()=>{};c.fxParticle=()=>{};
 const old=balance[key][skill].period;try{balance[key][skill].period=1;c[method](0.5);assert.equal(casts.length,0);c[method](0.5);assert.deepEqual(casts,[skill]);if(skill==='冰墙'){assert.equal(c.iceWall.absorb,balance.ice['冰墙'].absorb);assert.equal(c.iceWall.ttl,balance.ice['冰墙'].duration);}}finally{balance[key][skill].period=old;}
}
console.log('PASS: five real periodic skill paths use configured periods; ice-wall shield and duration use config.');
