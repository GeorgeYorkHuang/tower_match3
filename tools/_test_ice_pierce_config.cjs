const assert=require('assert'),{CombatSystem}=require('../js/combat.js'),B=require('../js/config/tower-skills.js');
const c=Object.create(CombatSystem.prototype),e={hp:100,x:0,y:0},near={hp:100,x:0,y:-40};let hits=[];
c.game={run:{relic3:()=>false,relicNum:()=>0},fx:[]};c.damage=(o,d)=>hits.push({o,d});c.relicVal=()=>0;c.lv=(k,n)=>n==='冰穿刺'?1:0;c.branchLv=(k,n,b)=>n==='冰穿刺'&&b==='C'?1:0;c.tryAttackDebuff=()=>{};c.iceHitFx=()=>{};c.towerMuzzle=()=>({x:0,y:100});c.enemies=()=>[e,near];c.shotDmg=()=>100;c.fxParticle=()=>{};c.fxRing=()=>{};c.fxFlash=()=>{};
const b=B.ice['冰穿刺'],old={count:b.baseTargets,length:b.coneLength};try{b.baseTargets=0;b.coneLength=20;c.hitIce(e,100);assert(!hits.some(h=>h.o===near));hits=[];b.coneLength=60;c.hitIce(e,100);assert(hits.some(h=>h.o===near&&h.d===30));}finally{b.baseTargets=old.count;b.coneLength=old.length;}
console.log('PASS: actual ice-pierce cone hit range responds to configuration.');
