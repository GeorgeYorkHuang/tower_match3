'use strict';
// Preserve active-tower snapshot order and synchronous nested deaths; no cached state.
const SKILL_NUM = require('../config/tower-skills.js');
const RelicKill = require('../relics/kill-hooks.js');

function onKill(combat, e) {
  const g = combat.game;
  // 毒·致死：低血死亡（此处仅为触发记录，实际致死在命中时判断）
  // 按所有激活塔触发死亡技能
  g.run.slotOrder.slice().forEach((key) => {
    if (key === 'fire' && combat.hasDot(e, 'burn')) {
      RelicKill.fireDeath(combat, e);
      // 爆燃（v1.13：基础 40% 概率引爆；v1.16.21 A 爆裂 +30/60/90%、B 扩张 +20/40/60%）
      if (combat.has('fire', '爆燃') && Math.random() < SKILL_NUM.fire['爆燃'].deathProbability) {
        const aLv = combat.branchLv('fire', '爆燃', 'A');
        const bLv = combat.branchLv('fire', '爆燃', 'B');
        const boomR = SKILL_NUM.fire['爆燃'].baseRadius * (1 + SKILL_NUM.fire['爆燃'].radius[bLv]);
        combat.explode(e.x, e.y, boomR, combat.shotDmg('fire', true) * SKILL_NUM.fire['爆燃'].baseDamage * (1 + SKILL_NUM.fire['爆燃'].dmg[aLv]), 'fire');
        RelicKill.fireExplosionSpread(combat, e, boomR);
      }
    }
    if (key === 'poison' && combat.has('poison', '毒爆') && combat.hasDot(e, 'poison')) {
      // v1.16.42 毒爆重做：中毒目标死亡时传染 3+A 个目标，每个目标 30% 几率造成 1 层中毒；
      //   B 继承：30%/40%/50% 概率传播时附带死亡时所有层数；C 毒沼：留下 60px 毒沼 4/5/6 秒每秒叠 1 层并减速 25%
      const n = SKILL_NUM.poison['毒爆'].targets + combat.branchLv('poison', '毒爆', 'A');
      const bLv = combat.branchLv('poison', '毒爆', 'B');
      const r = SKILL_NUM.poison['毒爆'].radius;
      const cands = combat.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= r)
        .sort((a, b) => (Math.abs(a.x - e.x) + Math.abs(a.y - e.y)) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)));
      const picks = cands.slice(0, n);
      // v1.16.100 毒爆连锁3★：传染链每跳一环，毒伤 +10%（链式增伤，链数随传染传递）
      const chainN = (e._poisonChain || 0) + 1;
      picks.forEach((o) => {
        if (Math.random() < SKILL_NUM.poison['毒爆'].spreadP) {
          // v1.16.100 瘟疫之源3★：传染时保留目标 50% 现有层数（无论是否触发 B 继承）
          const base = RelicKill.poisonInheritanceBase(combat, e);
          const layers = (bLv > 0 && Math.random() < SKILL_NUM.poison['毒爆'].inherit[bLv]) ? combat.poisonStack(e) : base;
          combat.applyPoison(o, combat.shotDmg('poison', true), 'poison', layers);
          o._poisonChain = chainN;
          combat.fxBeam(e.x, e.y, o.x, o.y, '#7ee2a8', 0.3, 3);
        }
      });
      combat.fxRing(e.x, e.y, '#52be80', r, 0.5, 5);
      combat.fxFlash(e.x, e.y, '#52be80');
      if (combat.branchLv('poison', '毒爆', 'C') > 0) {
        const cLv = combat.branchLv('poison', '毒爆', 'C');
        combat.groundDots = combat.groundDots || [];
        // v1.16.42 毒沼：60px 泥沼，4/5/6 秒，每秒叠 1 层 + 泥沼减速 25%（swamp 标记与毒池视觉区分）
        combat.groundDots.push({ x: e.x, y: e.y, r: SKILL_NUM.poison['毒爆'].swampR, ttl: SKILL_NUM.poison['毒爆'].swampTtl[cLv], key: 'poison', dps: 0, stackPerSec: 1, swamp: true, slow: SKILL_NUM.poison['毒爆'].swampSlow });
      }
    }
    RelicKill.poisonEssence(combat, e, key);
    // 毒·毒藤 C（v1.15）：被缠绕敌人死亡时，藤蔓延伸缠住 100px（每级 +50px）内下一个敌人
    if (key === 'poison' && combat.lv('poison', '毒藤') > 0 && e._vineT > 0) {
      const vc = combat.branchLv('poison', '毒藤', 'C');
      if (vc > 0) {
        const vr = 100 + 50 * vc;
        const next = combat.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= vr)
          .sort((a, b) => b.y - a.y)[0];
        if (next) {
          next.frozen = Math.max(next.frozen || 0, 2);
          next._vineT = Math.max(next._vineT || 0, 2);
          RelicKill.poisonTrail(combat, next);
          combat.fxBeam(e.x, e.y, next.x, next.y, '#2ecc71', 1, 4);
          combat.fxRing(next.x, next.y, '#7dcea0', 26, 1, 3);
        }
      }
    }
    // 冰·冰冻 C 碎冰（v1.16.21）：击杀冰冻敌人 → 120px 范围爆炸（30%/40%/50%×攻击力，档位式）并减速 30%
    if (key === 'ice' && combat.branchLv('ice', '冰冻', 'C') > 0 && e.frozen > 0) {
      const frzC = combat.branchLv('ice', '冰冻', 'C');
      combat.explode(e.x, e.y, SKILL_NUM.ice['冰冻'].shatterRadius, combat.shotDmg('ice', true) * SKILL_NUM.ice['冰冻'].shatter[frzC], 'ice', 0, true);
    }
    RelicKill.iceDeath(combat, e, key);
    RelicKill.electricDeath(combat, e, key);
    // （冰·霜星 已改为周期技「冰花」，死亡溅射移除 v1.13.23）
    // 回旋镖·猎手标记 C 猎杀（v1.16.42）：标记目标死亡时，向 100px 范围内 1/2/3 个敌人扩散标记（各 5s 持续）
    if (key === 'boomerang' && combat.branchLv('boomerang', '猎手标记', 'C') > 0 && (e._mark || 0) > 0) {
      const cLv = combat.branchLv('boomerang', '猎手标记', 'C');
      const markCap = SKILL_NUM.boomerang['猎手标记'].stackCap + SKILL_NUM.boomerang['猎手标记'].stacksPerBranch * combat.branchLv('boomerang', '猎手标记', 'B');
      const cands = combat.enemies().filter((o) => o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= SKILL_NUM.boomerang['猎手标记'].spreadRadius);
      for (let i = 0; i < Math.min(cLv, cands.length); i++) {
        const pick = cands[i];
        pick._mark = Math.min(markCap, (pick._mark || 0) + 1);
        pick._markT = SKILL_NUM.boomerang['猎手标记'].markDur;
        combat.fxBeam(e.x, e.y, pick.x, pick.y, '#d2b4de', 0.4, 2.5);
      }
      RelicKill.hunterTransfer(combat, e, cands, markCap);
    }
    RelicKill.boomerangDeath(combat, e, key);
    RelicKill.cannonDeath(combat, e, key);
  });
  // 爆炸表现 + 音效（按最近伤害来源着色）
  const KILL_COLOR = { fire: '#ff7043', poison: '#7ee2a8', cannon: '#d89e63', ice: '#7fd4ff', electric: '#f4d03f', boomerang: '#c39bd3' };
  g.fx.push({ type: 'boom', x: e.x, y: e.y, t: 0, dur: 0.5, color: KILL_COLOR[e.lastDmgKey] || '#ff9f43' });
  combat.fxRing(e.x, e.y, KILL_COLOR[e.lastDmgKey] || '#ff9f43', 40, 0.35, 4);
  g.playSfx('boom', 0.35);
  // 击杀奖励钩子：经验（圣物加成）/ 精英圣物掉落 / Boss 宝箱掉落（game 层实现）
  if (g.onKillReward) g.onKillReward(e);
}

module.exports = { onKill };
