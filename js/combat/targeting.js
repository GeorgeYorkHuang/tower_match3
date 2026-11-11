'use strict';
// 共用射程与发射前分工选敌；保留敌人实例，不修改飞行中弹体的目标。
const CONFIG = require('../config.js');
const COMBAT_BALANCE = require('../config/combat-common.js');
const EnergyState = require('../config/energy-state.js');
const POLICY = require('../config/targeting.js');
const SKILLS = require('../config/tower-skills.js');
const Incoming = require('./incoming-damage.js');
const Trajectory = require('./trajectory-aim.js');

function range(combat, key, energyBefore) {
  const cfg = CONFIG.TOWERS[key];
  const base = Math.max(60, cfg.range - 50);   // ：全塔射程统一缩小 50px（普攻/技能同口径）
  const tower = combat.tower ? combat.tower(key) : null;
  const run = combat.game && combat.game.run;
  const maxEnergy = run && run.armoryEnergyMax ? run.armoryEnergyMax(key) : CONFIG.GLOBAL_SKILL.energyMax;
  const energy = energyBefore == null ? (tower ? tower.energy : 0) : energyBefore;
  const state = EnergyState.evaluate(energy, maxEnergy);
  if (state.energy <= 0) return 400;
  // 射程跟随攻击力的能量档位衰减；90 点及以上不再获得额外射程。
  const attack = Math.min(1, state.attack);
  const t = Math.max(0, Math.min(1, (attack - 0.3) / 0.7));
  return Math.max(300, Math.min(1000, 400 + (base - 400) * t));
}

function rankTargets(combat, key, options = {}) {
  const r = options.range == null ? combat.range(key) : options.range;
  const mz = combat.towerMuzzle(key), alive = combat.enemies().filter(e => e.hp > 0);
  const incoming = Incoming.build(combat);
  const arrival = CONFIG.TOWERS[key].shot.dur;
  const ly = combat.ly(), wall = ly.wallY, entry = ly.areaY + (ly.entryH || 0);
  const excluded = options.exclude || [];
  const candidates = alive.filter(e => !excluded.includes(e) && Math.hypot(e.x - mz.x, e.y - mz.y) <= r)
    .map(enemy => ({
      enemy,
      distance: Math.hypot(enemy.x-mz.x,enemy.y-mz.y),
      urgent: wall-enemy.y<=POLICY.emergencyDistance,
      covered: Incoming.expected(incoming,enemy,arrival)>=enemy.hp+(enemy.shield||0),
    }));
  // 先保留最靠前的少量候选，再评价群体/路径；避免每发对所有怪做全量两两评分。
  candidates.sort((a,b) => Number(b.urgent)-Number(a.urgent) || Number(a.covered)-Number(b.covered)
    || b.enemy.y-a.enemy.y || a.distance-b.distance);
  candidates.length = Math.min(candidates.length, POLICY.maxCandidates);
  const weights = POLICY[key] || {};
  const skill = name => combat.lv(key,name)>0;
  const radius = key === 'cannon' ? (SKILLS.cannon['重炮'].radius + SKILLS.cannon['重炮'].radiusPerLevel * combat.lv(key,'重炮'))
      * (1+SKILLS.cannon['重炮'].radiusPerBranch*combat.branchLv(key,'重炮','A'))
    : key === 'fire' && skill('大火球') ? SKILLS.fire['大火球'].radius
      * (1+SKILLS.fire['大火球'].radiusPerBranch*combat.branchLv(key,'大火球','A')) : 110;
  // 此值仅用于偏好“能承受一轮攻击”的目标，不调用正式伤害结算/快照入口。
  const definition=CONFIG.TOWERS[key], owner=combat.tower(key);
  const estimate=(definition.baseDps+definition.perLv*Math.max(0,(owner&&owner.level||1)-1))*definition.atkInterval;
  const useDensity=weights.density && (key!=='fire' || skill('多重火球') || skill('大火球'));
  const useLane=key==='boomerang' || (key==='ice' && skill('冰穿刺')) || (key==='fire' && skill('多重火球'));
  const geometry=useLane&&weights.geometryScore?Trajectory.scorer(combat,key,alive,r,mz):null;
  const fanHalf=key==='fire' ? Math.max(0,(SKILLS.fire['多重火球'].count+combat.branchLv('fire','多重火球','A')-2)*SKILLS.fire['多重火球'].fanStep) : 0;
  const fanSlope=Math.tan(fanHalf);
  const scored = candidates.map(candidate => {
    const e=candidate.enemy;
    const dx=e.x-mz.x, dy=e.y-mz.y, distance=candidate.distance||1;
    const front=Math.max(0,Math.min(1,(e.y-entry)/Math.max(1,wall-entry)));
    const controlled=e.frozen>0 || e.paralyzed>0 || e._vineT>0;
    const slowed=e.slow && e.slow.ttl>0 && e.slow.mult<0.9;
    let density=0, lane=0;
    if(useDensity || (useLane&&!geometry)) for(const other of alive) {
      if(other===e)continue;
      if(useDensity && Math.hypot(other.x-e.x,other.y-e.y)<=radius)density++;
      if(useLane&&!geometry) {
        const ox=other.x-mz.x,oy=other.y-mz.y,along=(ox*dx+oy*dy)/distance;
        const side=Math.abs(ox*dy-oy*dx)/distance;
        const width=key==='fire' ? SKILLS.fire['多重火球'].hitRadius+Math.max(0,along)*fanSlope : key==='ice'?60:65;
        if(along>0 && along<=(key==='boomerang'?distance+200:r) && side<=width)lane++;
      }
    }
    const poison=(e.dots||[]).find(dot=>dot.type==='poison');
    const freshPoison=poison ? 1/(1+Math.max(1,poison.stack||1)) : 1;
    const health=(e.hp+(e.shield||0))/(e.hp+(e.shield||0)+Math.max(1,estimate));
    let score=(weights.front||0)*front+(weights.density||0)*Math.min(1,density/4)
      +(weights.health||0)*health+(weights.lane||0)*(geometry?geometry(e):Math.min(1,lane/4))
      +(weights.speed||0)*Math.min(1,(e.speed||0)/100)
      +(weights.freshControl||0)*(controlled || slowed ? 0 : 1)+(weights.freshPoison||0)*freshPoison;
    if(candidate.covered)score-=POLICY.reservedKillPenalty; // 软避让，只有一个目标仍然会攻击。
    if(wall-e.y<=POLICY.emergencyDistance && !controlled)score+=8;
    score-=distance/Math.max(1,r)*0.25;
    if(options.directions)for(const used of options.directions) {
      const delta=Math.atan2(dy,dx)-Math.atan2(used.y-mz.y,used.x-mz.x);
      const angle=Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)));
      if(angle<0.12)score-=2;
    }
    return {enemy:e,score,distance};
  });
  scored.sort((a,b)=>b.score-a.score || a.distance-b.distance);
  return scored.map(item=>item.enemy);
}
function pickTarget(combat,key) { return rankTargets(combat,key)[0] || null; }

function pickAltTarget(combat, key, main, options) {
  if(key==='boomerang' && options) {
    return rankTargets(combat,key,{range:options.range,exclude:options.exclude,directions:options.exclude})[0] || main;
  }
  const r = combat.range(key);
  const mz = combat.towerMuzzle(key);
  const y0 = main.y - COMBAT_BALANCE.alternateTargetBand, y1 = main.y;
  const cands = combat.enemies().filter((e) => e.hp > 0 && e !== main && e.y >= y0 && e.y <= y1 && Math.hypot(e.x - mz.x, e.y - mz.y) <= r);
  if (!cands.length) return main;
  return cands[Math.floor(Math.random() * cands.length)];
}

function towerMuzzle(combat, key) {
  const g = combat.game;
  const ly = combat.ly();
  if (g.state === 'testfield') return { x: 15 + 50, y: 1053 + 50 };   // 渲染 testFieldLayer 硬编码单塔大槽（100×100，中心 65,1103）
  const n = ly.slotCount || 4;
  const rowW = n * ly.slotSize + (n - 1) * ly.slotGap;
  const startX = (750 - rowW) / 2;
  const slotW = ly.slotSize + ly.slotGap;
  const idx = g.run.slotOrder.indexOf(key);
  return { x: startX + Math.max(0, idx) * slotW + ly.slotSize / 2, y: ly.slotY + ly.slotSize / 2 };
}

function inTowerRange(combat, key, x, y, energyBefore) {
  return Math.abs(combat.towerMuzzle(key).y - y) <= range(combat, key, energyBefore);
}

module.exports = { range, rankTargets, pickTarget, pickAltTarget, towerMuzzle, inTowerRange };
