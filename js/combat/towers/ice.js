'use strict';
// Ice attack/impact callbacks use the supplied Combat and current enemy instances.
const CONFIG = require('../../config.js');
const SKILL_NUM = require('../../config/tower-skills.js');

function _iceMultiShot(combat, e, dmg) {
  const g = combat.game;
  const balance = SKILL_NUM.ice['多重冰锥'];
  const mz = combat.towerMuzzle('ice');
  const msx = mz.x, msy = mz.y;
  const aLv = combat.branchLv('ice', '多重冰锥', 'A');
  const bLv = combat.branchLv('ice', '多重冰锥', 'B');
  const cLv = combat.branchLv('ice', '多重冰锥', 'C');
  const dur = CONFIG.TOWERS.ice.shot.dur;
  const R = combat.range('ice');                 // 射界半径（= 塔射程）
  if (cLv > 0) {
    // C 增殖：超小型冰锥各自索敌（循环锁定射程内敌人直飞），每枚 10% 伤害（A 数量叠加、B 伤害叠加），命中 20% 冰缓
    const n = SKILL_NUM.ice['多重冰锥'].swarm[cLv] + aLv + combat.relicVal('ice_blizzard');   // v1.16.114 暴雪1★/2★
    const perDmg = dmg * balance.swarmDamage * (1 + balance.damagePerBranch * bLv);
    const hitR = balance.swarmHitRadius;                             // 超小冰锥碰撞半径更小
    const strike = (o, d) => {
      combat.damage(o, d, 'ice');
      combat.tryAttackDebuff('ice', o, d);   // v1.16.53 增殖超小冰锥属普攻强化：统一冰缓/冰冻判定（吃寒霜/冰冻技能加成）
      combat.iceHitFx(o, d);                 // v1.16.98 暴雪3★
      combat.fxParticle(o.x, o.y, '#b8e6ff', 4, 34, 0.3, 110, 4);
      combat.fxRing(o.x, o.y, '#7fd4ff', 16, 0.2, 2);
    };
    const targets = combat.enemies().filter((o) => o.hp > 0 && combat.inTowerRange('ice', o.x, o.y));
    for (let i = 0; i < n; i++) {
      const tgt = targets.length ? targets[i % targets.length] : e;   // 各自索敌：循环分配射程内目标
      combat.addProjectile({ key: 'ice', scatter: true, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, tx: tgt.x, ty: tgt.y, hitR, onHit: strike }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', aim: true, scale: 0.38, tx: tgt.x, ty: tgt.y });
    }
    // 增殖仅由每枚真实冰锥碰撞结算，不额外对主目标即时扣血。
    return;
  }
  const n = balance.count + aLv + combat.relicVal('ice_blizzard');   // v1.16.114 暴雪1★/2★：每次攻击冰锥数量 +2/+3
  const perDmg = dmg * balance.damage * (1 + balance.damagePerBranch * bLv);
  const hitR = balance.hitRadius;                                     // 散射冰锥碰撞半径
  const strike = (o, d) => {                           // 命中结算（中心直瞄与散射弹道共用）
    combat.damage(o, d, 'ice');
    combat.tryAttackDebuff('ice', o, d);   // v1.16.53 多重冰锥散射属普攻强化：统一冰缓/冰冻判定
    combat.iceHitFx(o, d);                 // v1.16.98 暴雪3★
    combat.fxParticle(o.x, o.y, '#b8e6ff', 6, 46, 0.35, 140, 5);
    combat.fxRing(o.x, o.y, '#7fd4ff', 26, 0.25, 3);
    combat.fxFlash(o.x, o.y, '#7fd4ff', 0.2);
  };
  // 以主目标方向为基准旋转 off 角度 → 扇形轨迹终点（中心弹 off=0 即锁定主目标）
  const aimOf = (tgt, off) => {
    const dx = tgt.x - msx, dy = tgt.y - msy;
    const cos = Math.cos(off), sin = Math.sin(off);
    return { tx: msx + dx * cos - dy * sin, ty: msy + dx * sin + dy * cos };
  };
  // 中心弹：锁定主目标（onHit 命中才结算；render 末端跟随目标，目标死亡时落回创建点，弹体始终可见）
  const aim0 = aimOf(e, 0);
  const strikeCenter = (o) => strike(o, perDmg);
  combat.addProjectile({ key: 'ice', target: e, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, onHit: strikeCenter }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', target: e, scale: 1.15, tx: e.x, ty: e.y });
  // 两侧：以主目标方向为基准等角扇形（中心弹两侧均匀分布），沿途碰撞命中即止
  const maxOff = (n - 2) * balance.fanStep;
  for (let i = 0; i < n - 1; i++) {
    const off = n > 2 ? (-maxOff + i * (2 * maxOff / (n - 2))) : 0;
    const ap = aimOf(e, off);
    const rayLen=Math.hypot(ap.tx-msx,ap.ty-msy)||1;
    const reach=combat.range('ice');
    ap.tx=msx+(ap.tx-msx)*reach/rayLen; ap.ty=msy+(ap.ty-msy)*reach/rayLen;
    const strikeSide = (o) => strike(o, perDmg);
    combat.addProjectile({ key: 'ice', scatter: true, dmg: perDmg, t: 0, dur, sx: msx, sy: msy, tx: ap.tx, ty: ap.ty, hitR, onHit: strikeSide }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: msx, y: msy, t: 0, dur, key: 'ice', aim: true, scale: 1.15, tx: ap.tx, ty: ap.ty });
  }
}

function hitIce(combat, e, dmg) {
  combat.damage(e, dmg, 'ice');
  // v1.16.114 暴雪1★/2★（未学多重冰锥时）：单发追加 N 枚散射冰锥（命中结算：冰缓/冰冻/暴雪3★ 冰爆）
  const blzN = combat.relicVal('ice_blizzard');
  if (blzN > 0) {
    const mzI = combat.towerMuzzle('ice');
    const RI = combat.range('ice');
    const durI = CONFIG.TOWERS.ice.shot.dur;
    for (let i = 0; i < blzN; i++) {
      const offI = blzN > 1 ? (i / (blzN - 1) - 0.5) * 0.24 : 0;
      const txI = mzI.x + Math.sin(offI) * RI;
      const tyI = mzI.y - Math.cos(offI) * RI;
      const stI = (o) => {
        combat.damage(o, dmg, 'ice');
        combat.tryAttackDebuff('ice', o, dmg);
        combat.iceHitFx(o, dmg);
        combat.fxParticle(o.x, o.y, '#b8e6ff', 4, 34, 0.3, 110, 4);
      };
      combat.addProjectile({ key: 'ice', scatter: true, dmg, t: 0, dur: durI, sx: mzI.x, sy: mzI.y, tx: txI, ty: tyI, hitR: 45, onHit: stI }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: mzI.x, y: mzI.y, t: 0, dur: durI, key: 'ice', aim: true, scale: 1.15, tx: txI, ty: tyI });
    }
  }
  // v1.13.27 普攻命中打击特效：冰锥撞击爆冰晶（白屑 + 蓝屑 + 小环 + 微闪）
  combat.fxParticle(e.x, e.y, '#eaf6ff', 6, 44, 0.30, 130, 5);
  combat.fxParticle(e.x, e.y, '#a9d6f5', 4, 62, 0.35, 90, 4);
  combat.fxRing(e.x, e.y, '#d6f0ff', 16, 0.2, 2);
  // 普攻冰缓+冰冻（v1.16.21→v1.16.53 统一判定）：冰缓基础 20%（寒霜 +25% + A 极寒每级 +15%）；
  //   冰冻学技能后 20%（A 档位）；强化攻击同吃此加成
  combat.tryAttackDebuff('ice', e, dmg);
  // v1.16.98 暴雪3★：主目标命中判定（已冰缓 → 30% 冰爆）
  combat.iceHitFx(e, dmg);
  // v1.16.98 冰雾（1★/2★ 补齐保留项行为）：普攻 20%/30% 概率额外减速目标周围敌人（半径100）
  //   3★：触发时残留冰雾地面 3 秒，域内敌人攻速 -20%
  const fogN = combat.game.run.relicNum('ice_fog');
  if (fogN > 0 && Math.random() < fogN / 100) {
    combat.enemies().forEach((o) => {
      if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) <= 100) {
        combat.applySlow(o, 0.3, 1);
        combat.fxParticle(o.x, o.y, '#d6f0ff', 4, 34, 0.35, 100, 4);
      }
    });
    if (combat.game.run.relic3('ice_fog')) {
      combat.iceGrounds.push({ x: e.x, y: e.y, r: 100, ttl: 3, fog: true });
      combat.fxRing(e.x, e.y, '#d6f0ff', 100, 0.6, 4);
    }
  }
  // v1.16.130 多重冰锥发射已移至 attackOnce _iceMultiShot（一次普攻从塔口扇形飞出 n 枚，中心锁定主目标）；
  //   C 增殖分支保留在 _iceMultiShot（超小冰锥各自索敌独立飞行）
  // 碎冰（v1.13.24 原低温全塔改；v1.16.21 分支重做）：冰锥命中目标后碎裂成 3 枚小碎冰，飞行速度与原冰锥一致，
  //   沿弹道方向呈 60° 角散射（±30°），碎冰命中敌人即止（不穿透）
  //   A 裂片 +1/级（3→4→5）、B 碎劲 伤害档位 +15%/30%/45%、C 冻结 命中 5%/10%/15% 几率冻结 2s
  const shard = combat.lv('ice', '碎冰');
  if (shard > 0) {
    const g = combat.game;
    // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
    const mz = combat.towerMuzzle('ice');
    const msx = mz.x, msy = mz.y;
    const len = Math.hypot(e.x - msx, e.y - msy) || 1;
    const dx = (e.x - msx) / len, dy = (e.y - msy) / len;   // 弹道方向（继续向前 = 敌人身后）
    const n = SKILL_NUM.ice['碎冰'].count + combat.branchLv('ice', '碎冰', 'A');
    const dmg = combat.shotDmg('ice') * SKILL_NUM.ice['碎冰'].baseDamage * (1 + SKILL_NUM.ice['碎冰'].dmg[combat.branchLv('ice', '碎冰', 'B')]);
    const frzP = SKILL_NUM.ice['碎冰'].frz[combat.branchLv('ice', '碎冰', 'C')];
    const sx = e.x + dx * SKILL_NUM.ice['碎冰'].spawnOffset, sy = e.y + dy * SKILL_NUM.ice['碎冰'].spawnOffset;   // 越过主目标，避免立即重复命中
    const R = combat.range('ice');
    const dur = CONFIG.TOWERS.ice.shot.dur;
    const hitR = SKILL_NUM.ice['碎冰'].hitRadius;
    const strike = (o, d) => {
      // v1.16.98 碎冰强化3★：碎冰命中已有冰缓的敌人时伤害 ×1.5
      if (combat.game.run.relic3('ice_shard') && o.slow && o.slow.ttl > 0) d *= 1.5;
      combat.damage(o, d, 'ice');
      combat.tryAttackDebuff('ice', o, d);   // v1.16.53 碎冰小碎冰属普攻强化：统一冰缓/冰冻判定（C 冻结为其专属保留）
      combat.iceHitFx(o, d);                 // v1.16.98 暴雪3★
      // v1.13.27 碎冰命中：冰晶迸发 + 闪光 + 小环
      combat.fxFlash(o.x, o.y, '#d6f0ff', 0.22);
      combat.fxParticle(o.x, o.y, '#b8e6ff', 6, 46, 0.35, 140, 5);
      combat.fxRing(o.x, o.y, '#7fd4ff', 26, 0.25, 3);
      // C 冻结：命中 5%/10%/15% 几率冻结 2s
      if (frzP > 0 && Math.random() < frzP) {
        o.frozen = Math.max(o.frozen || 0, SKILL_NUM.ice['碎冰'].freezeDuration);
        combat.fxFlash(o.x, o.y, '#d6f0ff', 0.3);
        combat.fxRing(o.x, o.y, '#7fd4ff', 40, 0.35, 3);
      }
    };
    const baseA = Math.atan2(dy, dx);
    const spread = SKILL_NUM.ice['碎冰'].halfAngle;   // 60° 总散射角（±30°）
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * 2 * spread : 0;
      const a = baseA + off;
      const tx = sx + Math.cos(a) * R;
      const ty = sy + Math.sin(a) * R;
      combat.addProjectile({ key: 'ice', scatter: true, dmg, t: 0, dur, sx, sy, tx, ty, hitR, onHit: strike }, { type: 'shot', kind: 'line', color: '#7fd4ff', x: sx, y: sy, t: 0, dur, key: 'ice', aim: true, scale: 0.85, tx, ty });
    }
  }
  // 冰穿刺（v1.16.21 重做，原「冰锥穿透」未实装补全）：弹道可穿透敌人（基础 1 名）
  //   A 冰穿 穿透目标 +1/+2/+3（1→2/3/4 名）；B 透射 穿透后伤害 +30%/60%/90%；C 冰霜透射 命中后对敌人身后 60px·90° 扇形造成 30%/40%/50% 伤害
  const pierce = combat.lv('ice', '冰穿刺');
  if (pierce > 0) {
    const g = combat.game;
    // v1.16.37 统一 towerMuzzle（测试战场单塔大槽）
    const mz = combat.towerMuzzle('ice');
    const psx = mz.x, psy = mz.y;
    const dirLen = Math.hypot(e.x - psx, e.y - psy) || 1;
    const ddx = (e.x - psx) / dirLen, ddy = (e.y - psy) / dirLen;   // 弹道方向（塔→目标）
    const aLv = combat.branchLv('ice', '冰穿刺', 'A');
    const bLv = combat.branchLv('ice', '冰穿刺', 'B');
    const cLv = combat.branchLv('ice', '冰穿刺', 'C');
    const pierceN = SKILL_NUM.ice['冰穿刺'].baseTargets + aLv + combat.relicVal('ice_pierce');   // v1.16.114 穿透凝冰1★/2★：+1/+2
    // 穿透目标：沿弹道方向位于目标身后（远离塔侧）的敌人，按投影距离排序
    const cands = combat.enemies().filter((o) => o.hp > 0 && o !== e
        && ((o.x - e.x) * ddx + (o.y - e.y) * ddy) > SKILL_NUM.ice['冰穿刺'].minProjection)
      .sort((a, b) => ((a.x - e.x) * ddx + (a.y - e.y) * ddy) - ((b.x - e.x) * ddx + (b.y - e.y) * ddy));
    const hitCnt = Math.min(pierceN, cands.length);
    for (let i = 0; i < hitCnt; i++) {
      const pT = cands[i];
      const pDmg = dmg * (1 + SKILL_NUM.ice['冰穿刺'].pierceDmg[bLv]);   // B 透射 +30/60/90%
      combat.damage(pT, pDmg, 'ice');
      combat.iceHitFx(pT, pDmg);                 // v1.16.98 暴雪3★
      // v1.16.98 穿透凝冰3★：冰锥贯穿 2 名以上敌人时，对最后一名敌人造成冰冻 1 秒
      if (combat.game.run.relic3('ice_pierce') && hitCnt >= 2 && i === hitCnt - 1) combat.freezeE(pT, 1);
      combat.fxParticle(pT.x, pT.y, '#b8e6ff', 5, 40, 0.3, 110, 4);
      combat.fxRing(pT.x, pT.y, '#a9d6f5', 20, 0.2, 2);
    }
    // C 冰霜透射：对敌人身后 60px·90° 扇形区域（以弹道方向为中轴 ±45°）造成伤害
    if (cLv > 0) {
      const fDmg = combat.shotDmg('ice') * SKILL_NUM.ice['冰穿刺'].cone[cLv];
      combat.enemies().forEach((o) => {
        if (o.hp <= 0 || o === e) return;
        const proj = (o.x - e.x) * ddx + (o.y - e.y) * ddy;          // 沿弹道方向投影（正=身后）
        const side = Math.abs((o.x - e.x) * ddy - (o.y - e.y) * ddx); // 侧向距离
        if (proj > 0 && proj <= SKILL_NUM.ice['冰穿刺'].coneLength && side <= proj * SKILL_NUM.ice['冰穿刺'].coneWidthRatio) combat.damage(o, fDmg, 'ice');   // ±45°（90° 扇形）
      });
      combat.fxParticle(e.x, e.y, '#d6f0ff', 8, 70, 0.35, 130, 5);
      combat.fxRing(e.x, e.y, '#b8e6ff', 42, 0.3, 3);
    }
  }
}

function iceHitFx(combat, o, d) {
  if (!combat.game.run.relic3('ice_blizzard')) return;
  if (!(o.slow && o.slow.ttl > 0)) return;
  if (Math.random() >= 0.30) return;
  combat.explode(o.x, o.y, 80, d * 0.6, 'ice');
}

module.exports = { _iceMultiShot, hitIce, iceHitFx };
