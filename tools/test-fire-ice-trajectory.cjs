/** 火/冰发射前预判回归：真实移动碰撞、固定飞行方向、原费用/伤害/射程以及离散轨迹评分。 */
'use strict';
const assert=require('assert'),api=require('./tower-balance-fixture.cjs');
const {initEnemyState}=require('../js/combat.js');
const Aim=require('../js/combat/trajectory-aim.js'),policy=require('../js/config/targeting.js');
const {attackEnergyMultiplier}=require('../js/combat/attack-energy.js');
const original={fire:{...policy.fire},ice:{...policy.ice}};
const close=(a,b,label)=>assert(Math.abs(a-b)<1e-6,`${label}: ${a} != ${b}`);
function world(key,skills,swarm=false) {
  const w=api.setup(key,skills.map(s=>[s,'A']),0,'dense',41,'finite');
  if(swarm)w.tower.pool.find(s=>s.name==='多重冰锥').branches.C=1;
  const mz=w.combat.towerMuzzle(key);
  const e=initEnemyState({id:1,x:mz.x+300,y:mz.y-350,hp:1e7,maxHp:1e7,speed:340,size:40,armor:0});
  w.game.enemies=[e];return {...w,e};
}
function fireAndMove(w,key) {
  const fee=w.run.attackCost(w.tower)*attackEnergyMultiplier(w.combat,key),before=w.tower.energy;
  w.combat.attackOnce(key);close(w.tower.energy,Math.max(0,before-fee),'原费用');
  const shots=w.combat.shots.slice(),points=shots.map(s=>[s.tx,s.ty]);
  const amounts=shots.map(s=>s.dmg);
  for(let f=0;f<90;f++) {
    w.e.y=Math.min(w.game.ly.wallY-20,w.e.y+w.e.speed/60);
    for(let j=w.combat.shots.length-1;j>=0;j--)if(!w.combat.stepShot(w.combat.shots[j],1/60))w.combat.shots.splice(j,1);
    shots.forEach((s,i)=>{close(s.tx,points[i][0],'飞行中X不变');close(s.ty,points[i][1],'飞行中Y不变');});
  }
  return {damage:1e7-w.e.hp,amounts,fee,count:shots.length};
}
try {
  let cases=0;
  for(const [key,skills,swarm] of [
    ['fire',['多重火球'],false],['ice',['冰穿刺'],false],['ice',['多重冰锥'],false],
    ['ice',['多重冰锥'],true],['ice',['多重冰锥','冰穿刺'],true],
  ]) {
    policy[key].trajectoryAim=false;const before=fireAndMove(world(key,skills,swarm),key);
    policy[key].trajectoryAim=true;const after=fireAndMove(world(key,skills,swarm),key);
    assert(after.damage>0,key+'预判后真实移动碰撞命中');
    assert(after.damage>before.damage,key+'斜向快怪回归改善');
    assert.deepStrictEqual(after.amounts,before.amounts,'不更改每枚伤害');
    close(after.fee,before.fee,'预判不改变收费');assert.equal(after.count,before.count,'不增加弹数');cases++;
  }
  const w=world('ice',['冰穿刺']);
  const mz=w.combat.towerMuzzle('ice'),e=w.e,R=w.combat.range('ice');
  e.frozen=2;let point=Aim.intercept(w.combat,'ice',e,R);close(point.y,e.y,'冻结目标不预支移动');
  e.frozen=0;e._vineT=2;point=Aim.intercept(w.combat,'ice',e,R);close(point.y,e.y,'缠绕目标不移动');
  e._vineT=0;e.bossStandoffY=e.y+10;
  point=Aim.intercept(w.combat,'ice',e,R);close(point.y,e.bossStandoffY,'预判不越过Boss驻足线');
  delete e.bossStandoffY;e.speed=100;e.slow={ttl:2,mult:.5};
  const slow=Aim.intercept(w.combat,'ice',e,R);e.slow=null;
  const fast=Aim.intercept(w.combat,'ice',e,R);assert(slow.y<fast.y,'沿用减速后的移速');
  w.game.enemyMoveSpeed=()=>20;
  assert(Aim.intercept(w.combat,'ice',e,R).y<slow.y,'正式移速接口优先，支持地图和圣物修正');

  const fan=world('fire',['多重火球']);fan.tower.pool.find(s=>s.name==='多重火球').branches.A=3;
  const m=fan.combat.towerMuzzle('fire');
  const center=initEnemyState({id:2,x:m.x,y:m.y-750,hp:1000,speed:0});
  const gap=initEnemyState({id:3,x:m.x+Math.sin(.08)*750,y:m.y-Math.cos(.08)*750,hp:1000,speed:0});
  const alone=Aim.scorer(fan.combat,'fire',[center],900,m)(center);
  const withGap=Aim.scorer(fan.combat,'fire',[center,gap],900,m)(center);
  close(alone,withGap,'位于离散火球间隙的敌人不虚增命中评分');
  assert.equal(Aim.fanOffsets(6,.08).length,6,'评分和原实弹数量一致');
  const closeEnemy={...center,x:m.x,y:m.y-100};
  const actual=Aim.scorer(fan.combat,'fire',[center,closeEnemy],900,m)(center);
  assert(actual>alone,'实际覆盖更多射线时提高评分');
  console.log(`PASS ${cases} moving-hit comparisons; fixed flight/no extra shots/damage/fees, freeze/vine/slow/map speed/Boss cap, exact ray gaps and coverage.`);
}finally{Object.assign(policy.fire,original.fire);Object.assign(policy.ice,original.ice);api.restore();}
