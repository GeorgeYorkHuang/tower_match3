const assert=require('assert');const {CombatSystem}=require('../js/combat.js');const B=require('../js/config/tower-skills.js');
for(const key of ['fire','ice'])for(const multi of [false,true])for(const volley of [false,true]){
 const c=Object.create(CombatSystem.prototype),skill=key==='fire'?'多重火球':'多重冰锥';const target={hp:100,x:0,y:0};const tower={energy:100};c.game={run:{gsState:{volley:volley?{[key]:true}:{}},relic3:()=>false,spendAttackEnergy(){}},fx:[],playSfx(){}};c.shots=[];c.tower=()=>tower;c.pickTarget=()=>target;c.branchLv=()=>0;c.relicVal=()=>0;c.lv=(k,n)=>multi&&k===key&&n===skill?1:0;c.ly=()=>({});c.towerMuzzle=()=>({x:0,y:300});c.shotDmg=()=>100;c.range=()=>300;c._fireAttackOnAttack=()=>{};c.fxParticle=()=>{};c.fxFlash=()=>{};
 c.attackOnce(key);const expected=(multi?B[key][skill].count:1)*(volley?3:1);assert.equal(c.shots.length,expected,key+multi+volley);if(multi)assert(c.shots.every(s=>typeof s.onHit==='function'));assert.equal(c.game.fx.filter(f=>f.type==='shot').length,expected);
}
console.log('PASS fire/ice normal, multi and volley: no extra base projectiles or visuals.');

{
 const c=Object.create(CombatSystem.prototype);let spent=0;const t={energy:20,_rapidN:4};
 c.game={run:{relic3:()=>true,spendAttackEnergy:()=>spent++}};c.tower=()=>t;c.pickTarget=()=>null;
 c.attackOnce('cannon');assert.equal(spent,0);assert.equal(t._rapidN,4);
}
{
 const c=Object.create(CombatSystem.prototype),e={x:0,y:0,hp:100};let immediate=0;
 c.game={fx:[],run:{relic3:()=>false}};c.shots=[];c.towerMuzzle=()=>({x:0,y:300});c.branchLv=(k,n,b)=>b==='C'?1:0;c.relicVal=()=>0;c.range=()=>300;c.enemies=()=>[e];c.inTowerRange=()=>true;c.damage=()=>immediate++;
 c._iceMultiShot(e,100);assert.equal(c.shots.length,B.ice['多重冰锥'].swarm[1]);assert.equal(immediate,0);
}
{
 const c=Object.create(CombatSystem.prototype);c.game={};c.enemies=()=>{throw new Error('Projectile must not collide before launch');};
 assert(c.stepShot({scatter:true,t:-0.2,dur:1},0.1));
}
console.log('PASS: no target consumes no energy or rapid counter; ice swarm has no premature damage; delayed shots wait.');
