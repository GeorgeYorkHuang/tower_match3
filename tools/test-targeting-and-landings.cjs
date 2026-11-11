/** 六塔分工、在途软避让、固定炮弹落点与火球落地回归；调用真实战斗逻辑。 */
'use strict';
const assert=require('assert');
const api=require('./tower-balance-fixture.cjs');
const {initEnemyState}=require('../js/combat.js');
const Incoming=require('../js/combat/incoming-damage.js');
const close=(a,b,label)=>assert(Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
function world(key,skills=[]) {
  const w=api.setup(key,skills.map(s=>[s,'A']),0,'dense',41,'finite');
  w.game.enemies=[];
  return w;
}
function enemy(w,id,x=375,y=700,hp=10000) {
  const e=initEnemyState({id,x,y,hp,maxHp:hp,type:'normal',genLv:1,speed:0,armor:0});
  w.game.enemies.push(e);return e;
}
function advance(w,seconds=3) {
  for(let i=0;i<seconds*60;i++)for(let j=w.combat.shots.length-1;j>=0;j--) {
    const s=w.combat.shots[j];
    if(!w.combat.stepShot(s,1/60)){s.finished=true;w.combat.shots.splice(j,1);}
  }
}
try {
  // 不同塔的在途伤害会让电塔避开已预计致死的目标；晚到弹体不抢先占用。
  const shared=world('fire');
  shared.run.slotOrder.push('electric');shared.run.effects.setActiveKeys(shared.run.slotOrder);
  shared.run.effects.tower('electric').unlock();shared.run.effects.tower('electric').energy=60;
  const weak=enemy(shared,1,375,740,10),strong=enemy(shared,2,375,650,10000);
  assert.equal(shared.combat.pickTarget('electric'),weak);
  shared.combat.attackOnce('fire');
  assert.equal(shared.combat.shots[0].target,weak);
  shared.combat.shots[0].t=.7;
  assert.equal(shared.combat.pickTarget('electric'),strong,'较早到达的致死预估让后塔换目标');
  shared.combat.shots[0].t=0;
  assert.equal(shared.combat.pickTarget('electric'),weak,'晚于本次到达的弹体不阻止收掉危险目标');
  shared.combat.shots[0].finished=true;
  assert.equal(shared.combat.pickTarget('electric'),weak,'结束弹体释放预估');
  shared.game.enemies=[weak];shared.combat.shots[0].finished=false;shared.combat.shots[0].t=.8;
  assert.equal(shared.combat.pickTarget('electric'),weak,'唯一目标/Boss不被硬排除');
  shared.combat.reset();assert.equal(Incoming.build(shared.combat).size,0,'新局没有旧预估');

  const poison=world('poison');
  const poisoned=enemy(poison,1,375,710),fresh=enemy(poison,2,375,700);
  poisoned.dots=[{type:'poison',stack:5,ttl:4}];
  assert.equal(poison.combat.pickTarget('poison'),fresh,'毒塔优先未中毒目标');
  const ice=world('ice');
  const frozen=enemy(ice,1,375,710),fast=enemy(ice,2,375,690);
  frozen.frozen=2;fast.speed=100;
  assert.equal(ice.combat.pickTarget('ice'),fast,'冰塔优先未受控快怪');
  for(const key of ['fire','cannon','electric']) {
    const w=world(key,key==='fire'?['大火球']:[]);
    const isolated=enemy(w,1,150,710,100);
    const center=enemy(w,2,450,690,20000);
    for(let i=0;i<4;i++)enemy(w,3+i,450+(i-2)*15,680-i*5,20000);
    assert.notEqual(w.combat.pickTarget(key),isolated,key+'优先密集敌群');
    const urgent=enemy(w,99,375,950,100);
    assert.equal(w.combat.pickTarget(key),urgent,key+'紧急防线威胁优先');
    assert(center.hp>0);
  }
  const boom=world('boomerang',['多镖']);
  enemy(boom,1,250,650);enemy(boom,2,510,660);enemy(boom,3,375,520);
  boom.combat.attackOnce('boomerang');
  assert(new Set(boom.combat.shots.map(s=>s.target)).size>=2,'多镖发射前分配不同方向');

  // 散射的软预估每个目标仅计一枚，不把整扇弹全部记成必命中。
  const fan=world('fire',['多重火球']);
  const target=enemy(fan,1);
  fan.combat.attackOnce('fire');
  assert.equal(fan.combat.shots.filter(s=>s.damageReservation).length,1);
  const reserve=Incoming.expected(Incoming.build(fan.combat),target,2);
  assert(reserve>0 && reserve<fan.combat.shots.reduce((n,s)=>n+s.dmg,0));

  // 炮弹固定落点：视觉和实际到点相同，原目标死后只造成原溅射，无退款/额外直击。
  for(const moving of [false,true]) {
    const w=world('cannon');w.tower.energy=60;
    const main=enemy(w,1,375,650),near=enemy(w,2,395,650);
    w.combat.attackOnce('cannon');const shot=w.combat.shots[0];
    assert(shot.fixedImpact);const point={...shot.fixedImpact},dmg=shot.dmg;
    close(w.tower.energy,59,'炮弹仅收费一次');
    if(moving)main.y-=200;else main.hp=0;
    const hp=near.hp;
    assert.equal(shot.visual.target,null,'固定落点视觉退出原跟踪更新');
    close(shot.visual.tx,point.x,'视觉固定X');close(shot.visual.ty,point.y,'视觉固定Y');
    advance(w);
    close(hp-near.hp,dmg*.2,'目标死亡/移走后仅原20%基础溅射');
    close(w.tower.energy,59,'落空不退能也不重扣');
    const after=near.hp;w.combat.resolveShot(shot);close(near.hp,after,'同炮弹只爆炸一次');
  }
  const live=world('cannon');const main=enemy(live,1,375,650),near=enemy(live,2,395,650);
  live.combat.attackOnce('cannon');const damage=live.combat.shots[0].dmg;
  advance(live);close(10000-main.hp,damage,'存活主目标只吃原直伤');close(10000-near.hp,damage*.2,'周边只吃溅射');
  const double=world('cannon',['重炮','双管齐射']);enemy(double,1);
  const random=Math.random;Math.random=()=>0;
  try {double.combat.attackOnce('cannon');} finally {Math.random=random;}
  assert.equal(double.combat.shots.length,2);
  assert(double.combat.shots.every(s=>s.fixedImpact && s.visual.target===null),'双管各自固定落点');

  const lostDouble=world('cannon',['重炮','双管齐射']);
  lostDouble.tower.pool.find(s=>s.name==='双管齐射').branches.C=3;
  const lost=enemy(lostDouble,1);
  Math.random=()=>0;
  try {
    lostDouble.combat.attackOnce('cannon');
    assert.equal(lostDouble.combat.shots.length,2);
    const paid=lostDouble.tower.energy;lost.hp=0;advance(lostDouble);
    close(lostDouble.tower.energy,paid,'原目标死亡的落地溅射不触发双管命中返能');
  } finally {Math.random=random;}

  // C燃烧地面：目标死亡/无碰撞也在端点触发，每枚一次；无C分支不生成。
  for(const mode of ['expired','hit','noC']) {
    const w=world('fire',['多重火球']);
    const t=enemy(w,1,375,650,1e6);
    if(mode!=='noC')w.tower.pool.find(s=>s.name==='多重火球').branches.C=1;
    w.combat.attackOnce('fire');const shots=w.combat.shots.slice(),paid=w.tower.energy;
    if(mode!=='hit')t.hp=0;
    if(mode==='expired') {
      advance(w,.2);assert.equal(w.combat.groundDots.length,0,'原目标死亡不让火球提前落地');
    }
    advance(w);
    assert.equal(w.combat.groundDots.length,mode==='noC'?0:shots.length,'每枚在命中/射程终点只落地一次');
    for(const s of shots)if(s.onExpire)s.onExpire(s);
    assert.equal(w.combat.groundDots.length,mode==='noC'?0:shots.length,'重复结束不叠地面');
    close(w.tower.energy,paid,'燃烧地面不再收费');
    for(const dot of w.combat.groundDots) {
      close(dot.r,40,'原范围');close(dot.ttl,1.5,'原C1持续时间');
      assert(dot.dps>0 && dot.y>=w.game.ly.areaY+w.game.ly.entryH && dot.y<=w.game.ly.wallY);
    }
    if(mode!=='noC') {
      const dot=w.combat.groundDots[0],victim=enemy(w,2,dot.x,dot.y,1e6);
      const expected=w.combat.groundDots.reduce((sum,d)=>sum+(Math.hypot(d.x-victim.x,d.y-victim.y)<=d.r?d.dps*.25:0),0);
      w.combat.updateGroundDots(.25);close(1e6-victim.hp,expected,'落地后按原DPS造成持续伤害');
      w.combat.updateGroundDots(3);assert.equal(w.combat.groundDots.length,0,'地面到期正常清理');
    }
  }
  console.log('PASS six-tower preferences/emergency/single-target fallback, ETA reservations/reset/scatter confidence, multiblade distribution, fixed cannon visuals/direct/splash/double/once/no-refund, fire ground hit/expiry/once/noC.');
} finally {api.restore();}
