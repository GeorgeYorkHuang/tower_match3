'use strict';
// Fire attacks and impact callbacks. Mutable state stays on the supplied Combat/Run/Enemy.
const CONFIG = require('../../config.js');
const SKILL_NUM = require('../../config/tower-skills.js');

function _attackFireOnHit(combat, e, dmg) {
  const g = combat.game, run = g.run;
  // 焰雨3★：火球命中同一目标 3 次 → 下次攻击必为三连火球（追加 3 发等额伤害）
  if (run.relic3('fire_rain')) {
    if (run._fireTripleNext) {
      run._fireTripleNext = false;
      // v1.16.114 三连重构：命中 3 次后追加 3 次完整普攻——发射 3 条真实火球弹道（扇形直瞄），
      //   命中走完整结算（灼烧判定/大火球爆炸/多重火球 C 分裂），即三连在大火球、多重火球下也会多次触发其攻击效果
      const mz = combat.towerMuzzle('fire');
      const R = combat.range('fire');
      const durF = CONFIG.TOWERS.fire.shot.dur;
      const dx = e.x - mz.x, dy = e.y - mz.y;
      for (let k = 0; k < 3; k++) {
        const off = (k - 1) * 0.10;
        const cos = Math.cos(off), sin = Math.sin(off);
        const tx = mz.x + dx * cos - dy * sin;
        const ty = mz.y + dx * sin + dy * cos;
        const st = (o) => combat._fireImpact(o, dmg, off);
        combat.addProjectile({ key: 'fire', scatter: true, dmg, t: 0, dur: durF, sx: mz.x, sy: mz.y, tx, ty, hitR: 45, onHit: st }, { type: 'shot', kind: 'line', color: '#ff7043', x: mz.x, y: mz.y, t: 0, dur: durF, key: 'fire', aim: true, scale: 1.15, tx, ty });
      }
      combat.fxRing(e.x, e.y, '#ff9f43', 60, 0.5, 4);
      if (g.fx) g.fx.push({ type: 'floatText', text: '焰雨·三连！', x: e.x, y: e.y - 46, t: 0, dur: 0.9, size: 22, color: '#ffd24a' });   // v1.16.113 触发确认飘字
    } else {
      e._fireHits = (e._fireHits || 0) + 1;
      if (e._fireHits >= 3) { e._fireHits = 0; run._fireTripleNext = true; }
    }
  }
}

function _fireAttackOnAttack(combat) {
  const g = combat.game, run = g.run;
  // 熔炉之息3★：每 5 次普攻附带一次免费火柱
  run._forgeCount = (run._forgeCount || 0) + 1;
  if (run.relic3('fire_forge') && run._forgeCount >= 5) {
    run._forgeCount = 0;
    const alive = combat.enemies().filter((o) => o.hp > 0 && combat.inTowerRange('fire', o.x, o.y));
    if (alive.length) {
      const ftgt = alive[Math.floor(Math.random() * alive.length)];
      combat.pillarWaves = combat.pillarWaves || [];
      combat.pillarWaves.push({ t: 0.6, x: ftgt.x, y: ftgt.y, r: 120, dmg: combat.shotDmg('fire', true) * 1.2, ember: 0 });
      g.fx.push({ type: 'pillar', x: ftgt.x, y: ftgt.y, r: 120, t: 0, dur: 2.4, seed: Math.random() * 100 });
      combat.fxParticle(ftgt.x, ftgt.y - 10, '#ffd24a', 4, 60, 0.5, 150, 5);
    }
  }
  // 火焰弹射：普攻 25%/40% 概率额外发射一枚火球；3★ 命中 50% 概率返还 1 点能量
  const dmg = combat.shotDmg('fire');
  const fbN = run.relicNum('fire_bounce');
  if (fbN > 0 && Math.random() < fbN / 100) {
    const mz = combat.towerMuzzle('fire');
    const R = combat.range('fire');
    const off = (Math.random() * 2 - 1) * 0.24;
    const tx = mz.x + Math.sin(off) * R, ty = mz.y - Math.cos(off) * R;
    const fbStrike = (m2) => {
      combat.damage(m2, dmg, 'fire');
      combat.tryAttackDebuff('fire', m2, dmg);
      combat.fxParticle(m2.x, m2.y, '#ff9f43', 4, 30, 0.3, 120, 4);
      if (run.relic3('fire_bounce') && Math.random() < 0.5) {
        const ft = combat.tower('fire');
        if (ft) ft.energy = Math.min(ft.energy + 1, run.armoryEnergyMax());
      }
    };
    combat.addProjectile({ key: 'fire', scatter: true, dmg, t: 0, dur: CONFIG.TOWERS.fire.shot.dur, sx: mz.x, sy: mz.y, tx, ty, hitR: 42, onHit: fbStrike }, { type: 'shot', kind: 'line', color: '#ff7043', x: mz.x, y: mz.y, t: 0, dur: CONFIG.TOWERS.fire.shot.dur, key: 'fire', aim: true, scale: 1.0, tx, ty });
  }
}

function hitFire(combat, e, dmg) {
  const g = combat.game;
  const run = g.run;
  // v1.16.21：火焰鹰眼已重做为「烈焰墙」（周期技），此处不再有普攻乘区
  combat._attackFireOnHit(e, dmg);   // 3★ 圣遗物挂点（焰雨三连）
  combat._fireAttackHit(e, dmg);     // 命中伤害段（灼烧判定/大火球/多重火球）
}

function _fireMultiShot(combat, e, dmg) {
  const g = combat.game;
  const balance = SKILL_NUM.fire['多重火球'];
  const big = combat.lv('fire', '大火球');
  const mz = combat.towerMuzzle('fire');
  const fsx = mz.x, fsy = mz.y;
  const n = balance.count + combat.branchLv('fire', '多重火球', 'A') + combat.relicVal('fire_rain');   // v1.16.114 焰雨1★/2★：每次攻击火球数量 +2/+3
  const perDmg = dmg * balance.damage * (1 + SKILL_NUM.fire['多重火球'].condense[combat.branchLv('fire', '多重火球', 'B')]);   // 凝火 +15/30/50%
  const dur = CONFIG.TOWERS.fire.shot.dur;
  const tint = '#ff7043';
  // 以主目标方向为基准旋转 off 角度 → 扇形轨迹终点（中心弹 off=0 即锁定主目标）
  const aimOf = (tgt, off) => {
    const dx = tgt.x - fsx, dy = tgt.y - fsy;
    const cos = Math.cos(off), sin = Math.sin(off);
    return { tx: fsx + dx * cos - dy * sin, ty: fsy + dx * sin + dy * cos };
  };
  const R = combat.range('fire');                 // 射界半径（= 塔射程）
  const hitR = balance.hitRadius;                              // 散射火球碰撞半径（弹体较大）
  const cLv = combat.branchLv('fire', '多重火球', 'C');
  const strike = (o, d, ang) => {
    combat.damage(o, d, 'fire');
    combat._attackFireOnHit(o, d);   // v1.16.112 多重火球路径同样接入焰雨3★三连
    combat.tryAttackDebuff('fire', o, d);   // v1.16.53 多重火球散射命中属普攻强化：统一灼烧判定
    combat.fxParticle(o.x, o.y, '#ff9f43', 6, 46, 0.35, 140, 5);
    combat.fxRing(o.x, o.y, '#ff7043', 26, 0.25, 3);
    combat.fxFlash(o.x, o.y, '#ffd24a', 0.2);
    // 多重火球 C 散射（v1.16.42 档位式 3/4/5）：命中后分裂 3/4/5 个小火球，沿弹道方向 120° 均匀散射（每个 25% 攻击伤害 + 20% 点燃）
    if (cLv > 0) {
      const nSplit = SKILL_NUM.fire['多重火球'].scatterSplit[cLv];
      for (let k = 0; k < nSplit; k++) {
        const off = -Math.PI / 3 + (k / Math.max(1, nSplit - 1)) * (2 * Math.PI / 3);   // -60°~+60° 均匀
        const da = off + (ang || 0);
        const tx2 = o.x + Math.cos(da) * R, ty2 = o.y + Math.sin(da) * R;
        const mStrike = (m2) => {
          combat.damage(m2, dmg * balance.splitDamage, 'fire');
          combat.fxParticle(m2.x, m2.y, '#ffd24a', 4, 30, 0.3, 110, 4);
          combat.tryAttackDebuff('fire', m2, dmg);   // v1.16.53 分裂小火球属普攻强化：统一灼烧判定（吃点燃技能加成）
        };
        combat.addProjectile({ key: 'fire', scatter: true, dmg: dmg * balance.splitDamage, t: 0, dur: dur * balance.splitDurationRatio, sx: o.x, sy: o.y, tx: tx2, ty: ty2, hitR: balance.splitHitRadius, onHit: mStrike }, { type: 'shot', kind: 'line', color: '#ffd24a', x: o.x, y: o.y, t: 0, dur: dur * balance.splitDurationRatio, key: 'fire', aim: true, scale: 0.9, tx: tx2, ty: ty2 });
      }
    }
    // 大火球叠加：每枚火球命中处按大火球口径爆炸溅射（选了大火球 → 火球变大火球）
    if (big > 0) {
      const bgr = SKILL_NUM.fire['大火球'].radius * (1 + SKILL_NUM.fire['大火球'].radiusPerBranch * combat.branchLv('fire', '大火球', 'A')) * (1 + combat.relicVal('fire_nuke') / 100);   // v1.16.114 爆核1★/2★
      const bgs = dmg * SKILL_NUM.fire['大火球'].splashDamage * (1 + SKILL_NUM.fire['大火球'].damagePerBranch * combat.branchLv('fire', '大火球', 'B'));
      const bgIgnite = SKILL_NUM.fire['大火球'].ignitePerBranch * combat.branchLv('fire', '大火球', 'C');
      combat.enemies().forEach((o2) => {
        if (o2 === o || o2.hp <= 0) return;
        const d2 = Math.hypot(o2.x - o.x, o2.y - o.y);
        if (d2 <= bgr) {
          combat.damage(o2, bgs, 'fire');
          if (bgIgnite > 0 && Math.random() < bgIgnite) combat.applyBurn(o2, dmg, 'fire');
          // v1.16.96 爆核3★：爆炸边缘敌人被击退 40码 并点燃
          if (g.run.relic3('fire_nuke') && d2 > bgr * 0.5) {
            o2.y = Math.max(50, o2.y - 40);
            combat.applyBurn(o2, dmg, 'fire');
            combat.fxParticle(o2.x, o2.y, '#ff9f43', 3, 24, 0.3, 100, 4);
          }
        }
      });
      combat.fxRing(o.x, o.y, '#ff7043', bgr, 0.4, 4);
      combat.fxParticle(o.x, o.y, '#ffab40', 8, bgr * 0.8, 0.5, 140, 5);
      combat.fxFlash(o.x, o.y, '#ff9f43');
    }
  };
  // 中心弹：锁定主目标（onHit 命中才结算；render 末端跟随目标，目标死亡时落回创建点，弹体始终可见）
  const aim0 = aimOf(e, 0);
  const baseAng = Math.atan2(aim0.ty - fsy, aim0.tx - fsx);
  const strikeCenter = (o) => strike(o, perDmg, baseAng);
  combat.addProjectile({ key: 'fire', target: e, dmg: perDmg, t: 0, dur, sx: fsx, sy: fsy, onHit: strikeCenter }, { type: 'shot', kind: 'line', color: tint, x: fsx, y: fsy, t: 0, dur, key: 'fire', target: e, scale: 1.35, tx: e.x, ty: e.y });
  // 两侧：以主目标方向为基准等角扇形（中心弹两侧均匀分布），沿途碰撞命中即止
  const maxOff = (n - 2) * balance.fanStep;   // 扇形半角（弧度）：5 枚 ±0.24 / 6 枚 ±0.32 / 7 枚 ±0.40
  for (let i = 0; i < n - 1; i++) {
    const off = n > 2 ? (-maxOff + i * (2 * maxOff / (n - 2))) : 0;
    const ap = aimOf(e, off);
    const rayLen=Math.hypot(ap.tx-fsx,ap.ty-fsy)||1;
    const reach=combat.range('fire');
    ap.tx=fsx+(ap.tx-fsx)*reach/rayLen; ap.ty=fsy+(ap.ty-fsy)*reach/rayLen;
    const strikeSide = (o) => strike(o, perDmg, Math.atan2(ap.ty - fsy, ap.tx - fsx));
    combat.addProjectile({ key: 'fire', scatter: true, dmg: perDmg, t: 0, dur, sx: fsx, sy: fsy, tx: ap.tx, ty: ap.ty, hitR, onHit: strikeSide }, { type: 'shot', kind: 'line', color: tint, x: fsx, y: fsy, t: 0, dur, key: 'fire', aim: true, scale: 1.35, tx: ap.tx, ty: ap.ty });
  }
}

function _fireAttackHit(combat, e, dmg) {
  const g = combat.game;   // v1.16.114 修复：strike/大火球块依赖 g.fx/g.run，此前缺声明（学多重火球会 ReferenceError）
  // 普攻灼烧（v1.16.21→v1.16.53 统一判定）：基础 20%；学「点燃」+25%（A 炽焰每级 +15%）；强化攻击同吃此加成
  combat.tryAttackDebuff('fire', e, dmg);
  // 大火球：主目标 120%
  const big = combat.lv('fire', '大火球');
  const mainMult = big > 0 ? SKILL_NUM.fire['大火球'].mainDamage : 1;
  const multi = combat.lv('fire', '多重火球');
  // v1.16.130 多重火球发射已移至 attackOnce _fireMultiShot（一次普攻从塔口扇形飞出 n 枚，中心锁定主目标）；
  //   此处仅保留单发路径（无多重火球技能时的普攻命中）
  {
    combat.damage(e, dmg * mainMult, 'fire');                        // 单发（无多重火球时）
    // v1.16.114 焰雨1★/2★（无多重火球时）：单发也追加 N 枚散射火球（完整命中结算：灼烧/大火球/C 分裂）
    const rainN = combat.relicVal('fire_rain');
    if (rainN > 0) {
      const mz0 = combat.towerMuzzle('fire');
      const R0 = combat.range('fire');
      const rr = combat.shotDmg('fire');
      const hitR0 = 45;
      for (let i = 0; i < rainN; i++) {
        const off0 = (Math.random() * 2 - 1) * 0.20;
        const tx0 = mz0.x + Math.sin(off0) * R0, ty0 = mz0.y - Math.cos(off0) * R0;
        const st0 = (o) => combat._fireImpact(o, rr, off0);
        combat.addProjectile({ key: 'fire', scatter: true, dmg: rr, t: 0, dur: CONFIG.TOWERS.fire.shot.dur, sx: mz0.x, sy: mz0.y, tx: tx0, ty: ty0, hitR: hitR0, onHit: st0 }, { type: 'shot', kind: 'line', color: '#ff7043', x: mz0.x, y: mz0.y, t: 0, dur: CONFIG.TOWERS.fire.shot.dur, key: 'fire', aim: true, scale: 1.0, tx: tx0, ty: ty0 });
      }
    }
  }
  // 大火球：爆炸范围溅射（扩大 +30%/级、强化 +20%/级、引燃 50%/75%/100% 概率点燃）
  // v1.16.21：多重火球叠加时每枚火球命中处已各自爆炸（见 strike）；此块仅处理未学多重火球的单发大火球
  if (big > 0 && multi <= 0) combat._fireSingleBlast(e, dmg);
}

function _fireSingleBlast(combat, e, dmg) {
  const r0 = SKILL_NUM.fire['大火球'].radius * (1 + SKILL_NUM.fire['大火球'].radiusPerBranch * combat.branchLv('fire', '大火球', 'A')) * (1 + combat.relicVal('fire_nuke') / 100);
  const splDmg = dmg * SKILL_NUM.fire['大火球'].splashDamage * (1 + SKILL_NUM.fire['大火球'].damagePerBranch * combat.branchLv('fire', '大火球', 'B'));
  const igniteProb = SKILL_NUM.fire['大火球'].ignitePerBranch * combat.branchLv('fire', '大火球', 'C');
  combat.enemies().forEach((o) => {
    if (o === e || o.hp <= 0) return;
    const d2 = Math.hypot(o.x - e.x, o.y - e.y);
    if (d2 <= r0) {
      combat.damage(o, splDmg, 'fire');
      if (igniteProb > 0 && Math.random() < igniteProb) combat.applyBurn(o, dmg, 'fire');
      // v1.16.96 爆核3★：爆炸边缘敌人被击退 40码 并点燃
      if (combat.game.run.relic3('fire_nuke') && d2 > r0 * 0.5) {
        o.y = Math.max(50, o.y - 40);
        combat.applyBurn(o, dmg, 'fire');
        combat.fxParticle(o.x, o.y, '#ff9f43', 3, 24, 0.3, 100, 4);
      }
    }
  });
  // 大火球视觉：大爆炸环 + 火焰粒子
  combat.fxRing(e.x, e.y, '#ff7043', r0, 0.4, 4);
  combat.fxParticle(e.x, e.y, '#ffab40', 10, r0, 0.5, 160, 6);
  combat.fxFlash(e.x, e.y, '#ff9f43');
}

function _fireImpact(combat, o, d, ang) {
  const g = combat.game;
  combat.damage(o, d, 'fire');
  combat.tryAttackDebuff('fire', o, d);
  combat.fxParticle(o.x, o.y, '#ff9f43', 6, 46, 0.35, 140, 5);
  combat.fxRing(o.x, o.y, '#ff7043', 26, 0.25, 3);
  combat.fxFlash(o.x, o.y, '#ffd24a', 0.2);
  // 多重火球 C 散射分裂（档位式 3/4/5，每个 25% 伤害 + 统一灼烧判定）
  const cLv = combat.branchLv('fire', '多重火球', 'C');
  if (combat.lv('fire', '多重火球') > 0 && cLv > 0) {
    const nSplit = SKILL_NUM.fire['多重火球'].scatterSplit[cLv];
    const R = combat.range('fire');
    for (let k = 0; k < nSplit; k++) {
      const off = -Math.PI / 3 + (k / Math.max(1, nSplit - 1)) * (2 * Math.PI / 3);
      const da = off + (ang || 0);
      const tx2 = o.x + Math.cos(da) * R, ty2 = o.y + Math.sin(da) * R;
      const mStrike = (m2) => {
        combat.damage(m2, d * SKILL_NUM.fire['多重火球'].splitDamage, 'fire');
        combat.tryAttackDebuff('fire', m2, d);
        combat.fxParticle(m2.x, m2.y, '#ffd24a', 4, 30, 0.3, 110, 4);
      };
      combat.addProjectile({ key: 'fire', scatter: true, dmg: d * SKILL_NUM.fire['多重火球'].splitDamage, t: 0, dur: CONFIG.TOWERS.fire.shot.dur * SKILL_NUM.fire['多重火球'].splitDurationRatio, sx: o.x, sy: o.y, tx: tx2, ty: ty2, hitR: SKILL_NUM.fire['多重火球'].splitHitRadius, onHit: mStrike }, { type: 'shot', kind: 'line', color: '#ffd24a', x: o.x, y: o.y, t: 0, dur: CONFIG.TOWERS.fire.shot.dur * SKILL_NUM.fire['多重火球'].splitDurationRatio, key: 'fire', aim: true, scale: 0.9, tx: tx2, ty: ty2 });
    }
  }
  // 大火球爆炸（含爆核1★/2★ 半径扩大）
  if (combat.lv('fire', '大火球') > 0) combat._fireSingleBlast(o, d);
}

module.exports = { _attackFireOnHit, _fireAttackOnAttack, hitFire, _fireMultiShot, _fireAttackHit, _fireSingleBlast, _fireImpact };
