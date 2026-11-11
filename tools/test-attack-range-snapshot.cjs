/** 普攻射程快照回归：扣费跨档、零能量、齐射、小冰锥分配与穿透。 */
'use strict';
const assert = require('assert');
const api = require('./tower-balance-fixture.cjs');
const { attackEnergyMultiplier } = require('../js/combat/attack-energy.js');
const close = (a, b, label) => assert(Math.abs(a-b) < 1e-7, `${label}: ${a} != ${b}`);
function world(key, names) {
  const w = api.setup(key, names.map(n => [n, 'A']), 0, 'dense', 41, 'finite');
  const m = w.combat.towerMuzzle(key), target = w.game.enemies[0];
  target.x=m.x; target.y=m.y-500; w.game.enemies=[target];
  return w;
}
function advance(w) {
  for(let i=0;i<180;i++)for(let j=w.combat.shots.length-1;j>=0;j--) {
    if(!w.combat.stepShot(w.combat.shots[j],1/60))w.combat.shots.splice(j,1);
  }
}
try {
  let cases=0;
  for(const [key,names,swarm] of [
    ['fire',['多重火球','大火球'],false], ['ice',['多重冰锥'],false],
    ['ice',['冰穿刺'],false], ['ice',['多重冰锥','冰穿刺'],false],
    ['ice',['多重冰锥','冰穿刺'],true],
  ]) {
    for(const energy of ['halfCost','cost',20.05,40.05,60]) {
      const w=world(key,names),c=w.combat;
      if(swarm)w.tower.pool.find(s=>s.name==='多重冰锥').branches.C=1;
      const fee=w.run.attackCost(w.tower)*attackEnergyMultiplier(c,key);
      w.tower.energy=energy==='halfCost'?fee/2:energy==='cost'?fee:energy;
      const before=w.tower.energy,range=c.range(key),target=w.game.enemies[0],hp=target.hp;
      assert(c.pickTarget(key)===target);
      c.attackOnce(key);
      close(w.tower.energy,Math.max(0,before-fee),'收费不变');
      assert(c.shots.length>0);
      for(const s of c.shots)close(Math.hypot(s.tx-s.sx,s.ty-s.sy),range,'每枚弹道保持选敌射程');
      const ranges=c.shots.map(s=>Math.hypot(s.tx-s.sx,s.ty-s.sy));
      w.tower.energy=100;
      close(Math.hypot(c.shots[0].tx-c.shots[0].sx,c.shots[0].ty-c.shots[0].sy),ranges[0],'飞行中补能不改轨迹');
      advance(w);
      assert(target.hp<hp,key+' 真实碰撞可命中原先锁定的500距离目标');
      cases++;
    }
  }
  for(const key of ['fire','ice']) {
    const names=key==='fire'?['多重火球','大火球']:['多重冰锥','冰穿刺'];
    const w=world(key,names),c=w.combat;
    w.tower.energy=.1;
    const range=c.range(key);
    w.run.gsState.volley={ [key]:true };
    c.attackOnce(key);
    assert(c.shots.length>=9,'齐射追加弹真实生成');
    for(const s of c.shots)close(Math.hypot(s.tx-s.sx,s.ty-s.sy),range,'齐射所有批次使用同一快照');
    assert(c.range(key)<range);
    assert.equal(c.pickTarget(key),null,'下一次仍用扣费后短射程');
    const count=c.shots.length;
    c.attackOnce(key);
    assert.equal(c.shots.length,count,'下一次无目标不凭旧快照出手');
    close(w.tower.energy,0,'下一次无目标不收费');
  }
  // 无穿透的小冰锥重新分配目标时，不能把500距离目标从候选里剔除。
  const small=world('ice',['多重冰锥']),c=small.combat;
  small.tower.pool.find(s=>s.name==='多重冰锥').branches.C=1;
  const near={...small.game.enemies[0],id:99,x:c.towerMuzzle('ice').x+20,y:c.towerMuzzle('ice').y-350};
  small.game.enemies.unshift(near); small.tower.energy=.1;
  c.attackOnce('ice');
  assert(c.shots.some(s=>Math.abs(s.ty-small.game.enemies[1].y)<1e-7),'远处候选保留在小冰锥分配中');
  const outside=world('fire',['多重火球']);
  outside.tower.energy=0;
  outside.combat.attackOnce('fire');
  assert.equal(outside.combat.shots.length,0,'原本超出射程不发射');
  console.log(`PASS ${cases} real collision/fee-crossing cases; fire/ice volleys, next-shot range, moving energy snapshot, swarm redistribution and no-target exclusion.`);
} finally {api.restore();}
