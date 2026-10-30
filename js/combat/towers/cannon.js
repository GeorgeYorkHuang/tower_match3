'use strict';
// Caller-owned tower/enemy state; shared damage and explosion paths remain on Combat.
const SKILL_NUM = require('../../config/tower-skills.js');

function hitCannon(combat, e, dmg) {
  const g = combat.game;
  // v1.16.14 军火库 C 双倍火力：普攻 10%/20%/30% 概率造成双倍伤害（仅主目标）
  const armC = combat.branchLv('cannon', '军火库', 'C');
  if (armC > 0 && Math.random() < 0.10 * armC) {
    dmg *= 2;
    combat.fxFlash(e.x, e.y, '#ffb347', 0.25);
  }
  // v1.16.103 火药3★：每次命中积攒 1 层「火药热度」，累计 25 层后下一发炮弹为过热弹（200% 伤害，爆炸半径 +30%），随后清零
  let overheat = false;
  const powT = combat.tower('cannon');
  if (g.run.relic3('can_powder') && powT) {
    powT._heat = (powT._heat || 0) + 1;
    if (powT._heat >= 25) { powT._heat = 0; overheat = true; combat.fxFlash(e.x, e.y, '#ffb347', 0.4); }
  }
  if (overheat) dmg *= 2;
  // v1.16.103 弹药库3★：能量溢出时转化为 5% 暴击率（上限 +25%＝5 层；命中时判定）
  if (g.run.relic3('can_armory') && powT && powT.energy >= g.run.armoryEnergyMax()) {
    powT._ovCrit = Math.min(5, (powT._ovCrit || 0) + 1);
    if (Math.random() < 0.05 * powT._ovCrit) {
      dmg *= 2;
      combat.fxFlash(e.x, e.y, '#ffd24a', 0.3);
    }
  }
  // v1.16.103 重爆3★：重炮爆炸中心 40 码内伤害 ×1.5（近距离惩罚强化——主目标即中心）
  if (g.run.relic3('can_heavy') && combat.lv('cannon', '重炮') > 0) dmg *= 1.5;
  // 普攻溅射（v1.16.12）：基础 100px 范围、40% 溅射伤害（v1.16.22 由 10% 上调）；学「重炮」后范围 +25%/级（A 扩爆 +15%/级、B 炸力 +15%/级）
  const heavy = combat.lv('cannon', '重炮');
  let r = SKILL_NUM.cannon['重炮'].radius * (1 + SKILL_NUM.cannon['重炮'].radiusPerLevel * heavy + SKILL_NUM.cannon['重炮'].radiusPerBranch * combat.branchLv('cannon', '重炮', 'A'));
  if (heavy > 0) r *= (1 + combat.relicVal('can_heavy') / 100);   // v1.16.114 重爆1★/2★：爆炸范围 +30%/45%
  if (overheat) r *= 1.3;   // 过热弹爆炸半径 +30%
  const splDmg = dmg * SKILL_NUM.cannon['重炮'].splashDamage * (1 + SKILL_NUM.cannon['重炮'].damagePerBranch * combat.branchLv('cannon', '重炮', 'B'));
  // 协同（爆炸类 +50%）在 explode() 内按 SYNERGIES[1] 统一结算（v1.16.20 修正越界索引）
  // 震击（v1.16）：40%+20pp×B 概率击退 60×(1+0.4×A)px；C 迟滞被击退减速 1/1.5/2 秒（随等级）
  const shock = combat.lv('cannon', '震击');
  let knock = 0, slowAfter = 0;
  if (shock > 0 && Math.random() < SKILL_NUM.cannon['震击'].probability + SKILL_NUM.cannon['震击'].probabilityPerBranch * combat.branchLv('cannon', '震击', 'B')) {
    knock = SKILL_NUM.cannon['震击'].knockback * (1 + SKILL_NUM.cannon['震击'].knockbackPerBranch * combat.branchLv('cannon', '震击', 'A')) * (1 + combat.relicVal('can_knock') / 100);   // v1.16.114 震烈1★/2★
    slowAfter = SKILL_NUM.cannon['震击'].slowDuration + SKILL_NUM.cannon['震击'].slowDurationPerBranch * combat.branchLv('cannon', '震击', 'C');   // C1=1s / C2=1.5s / C3=2s
  }
  combat.damage(e, dmg, 'cannon');
  // 爆炸（AOE 溅射 + 震尘减速）——排除主目标（普攻主目标已吃满 100%）
  combat.explode(e.x, e.y, r, splDmg, 'cannon', knock, slowAfter, e);
  if (combat.branchLv('cannon', '重炮', 'C') > 0) {
    combat.enemies().forEach((o) => {
      if (o.hp > 0 && o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= r && Math.random() < 0.20 * combat.branchLv('cannon', '重炮', 'C')) combat.applySlow(o, 0.30, 1);
    });
  }
  // 贯穿弹（v1.16）：爆炸后弹片向前贯穿 2+裂片 个敌人（70%×碎劲），C 贯透减速 15%
  const pierce = combat.lv('cannon', '贯穿弹');
  if (pierce > 0) {
    // v1.16.103 穿透3★：弹片贯穿改为贯穿路径上所有敌人（无人数上限），每多贯穿 1 名伤害 -10%（下限 40%）
    const pierceAll = g.run.relic3('can_pierce');
    const n = pierceAll ? Infinity : SKILL_NUM.cannon['贯穿弹'].targets + combat.branchLv('cannon', '贯穿弹', 'A') + combat.relicVal('can_pierce');   // v1.16.114 穿透1★/2★
    const pDmg0 = dmg * SKILL_NUM.cannon['贯穿弹'].damage * (1 + SKILL_NUM.cannon['贯穿弹'].damagePerBranch * combat.branchLv('cannon', '贯穿弹', 'B'));
    const cands = combat.enemies().filter((o) => o !== e && o.hp > 0 && Math.abs(o.y - e.y) < SKILL_NUM.cannon['贯穿弹'].targetHalfHeight && Math.abs(o.x - e.x) < SKILL_NUM.cannon['贯穿弹'].targetHalfWidth)
      .sort((a, b) => b.y - a.y);
    // v1.16.103 火线3★：贯穿路径留下火线 1.5 秒，每秒 15% 伤害
    const fireline = g.run.relic3('can_fireline');
    for (let i = 0; i < Math.min(n, cands.length); i++) {
      const hitT = cands[i];
      const pDmg = pierceAll ? pDmg0 * Math.max(0.4, 1 - 0.10 * i) : pDmg0;
      combat.damage(hitT, pDmg, 'cannon');
      if (fireline) {
        combat.groundDots = combat.groundDots || [];
        combat.groundDots.push({ x: (e.x + hitT.x) / 2, y: (e.y + hitT.y) / 2, r: 40, ttl: 1.5, dps: combat.shotDmg('cannon', true) * 0.15, key: 'fire' });
        combat.fxRing((e.x + hitT.x) / 2, (e.y + hitT.y) / 2, '#ff7043', 40, 0.4, 3);
      }
      // v1.16.42 C 贯透档位式：被贯穿敌人减速 15%/30%/45%
      const pierceC = combat.branchLv('cannon', '贯穿弹', 'C');
      if (pierceC > 0) combat.applySlow(hitT, SKILL_NUM.cannon['贯穿弹'].slow[pierceC], SKILL_NUM.cannon['贯穿弹'].slowDuration);
      combat.fxParticle(hitT.x, hitT.y, '#d89e63', 3, 22, 0.3, 90, 4);
    }
  }
}

function tickCannon(combat, dt) {
  const g = combat.game;
  // 炮·炮火支援（v1.16 周期）：每 12 秒对敌人密集区降下 3 发炮击（60%×威力，半径130；A 增援 +1发/级；C 焦土留燃烧地面 2s 30%/s）
  // v1.16.31：逐发弹道——每发间隔 0.1s 从塔口升空（0.3s 至高点 300px）后**消失**；发射 1.0s 后在目标头顶
  //           高 300px 处**出现**并 0.3s 垂直落下（第 1 发落地 1.3s，之后每发 +0.1s，3~6 发总动画 1.5~1.8s）；
  //           每发落地前 0.5s 地面出现 130px 棕色描边受击圈（持续至落地爆炸）
  const support = combat.lv('cannon', '炮火支援');
  if (support > 0) {
    combat.timers.support = (combat.timers.support || 0) + dt;
    if (combat.timers.support >= SKILL_NUM.cannon['炮火支援'].period * combat._weakPeriod('cannon')) {
      combat.timers.support = 0;
      combat.castEnergy('cannon', '炮火支援');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('cannon', e.x, e.y));
      if (alive.length) {
        const n = SKILL_NUM.cannon['炮火支援'].count + combat.branchLv('cannon', '炮火支援', 'A');
        const dmg = combat.shotDmg('cannon') * SKILL_NUM.cannon['炮火支援'].damage * (1 + SKILL_NUM.cannon['炮火支援'].damagePerBranch * combat.branchLv('cannon', '炮火支援', 'B'));
        const mus = combat.towerMuzzle('cannon');
        for (let i = 0; i < n; i++) {
          const t = alive[Math.floor(Math.random() * alive.length)];
          const px = t.x + (Math.random() - 0.5) * 40;
          const py = t.y + (Math.random() - 0.5) * 40;
          const off = 0.1 * i;                       // 逐发间隔 0.1s
          // 炮弹：升空 0.3s → 高点悬停至 1.0s → 0.3s 垂直落下（总 1.3s + 偏移）
          g.fx.push({ type: 'strikeShell', sx: mus.x, sy: mus.y, tx: px, ty: py, t: 0, dur: 1.3 + off, offset: off, seed: Math.random() * 100 });
          // 炮击圈：落地前 0.5s 出现（显示至落地爆炸，时长 0.8s）
          g.fx.push({ type: 'strike', x: px, y: py, r: SKILL_NUM.cannon['炮火支援'].radius, t: 0, dur: 0.8 + off, offset: off, seed: Math.random() * 100 });
          combat.delayed.push({ x: px, y: py, r: SKILL_NUM.cannon['炮火支援'].radius, dmg, delay: 1.3 + off, t: 0, key: 'cannon', knock: 0, slowAfter: false, ember: combat.branchLv('cannon', '炮火支援', 'C') });
        }
      }
    }
  }
  // 炮·地雷阵（v1.16.22 重做）：每 6 秒抛投 3 颗雷（A 布雷 +2/级），雷从塔口以 500px/s 飞向部署点（飞行不可引爆），
  //   落地布设 0.3s 后可引爆，持续 20 秒；有敌人时部署在最近敌人（最靠墙）附近一圈随机位置，无敌人时攻击范围内随机（B 雷威 +50%/级；C 连爆）
  const mineLv = combat.lv('cannon', '地雷阵');
  if (mineLv > 0) {
    combat.timers.mine = (combat.timers.mine || 0) + dt;
    if (combat.timers.mine >= SKILL_NUM.cannon['地雷阵'].period * combat._weakPeriod('cannon')) {
      combat.timers.mine = 0;
      combat.castEnergy('cannon', '地雷阵');
      const n = SKILL_NUM.cannon['地雷阵'].count + SKILL_NUM.cannon['地雷阵'].countPerBranch * combat.branchLv('cannon', '地雷阵', 'A');
      // 塔口坐标（v1.16.37 统一 towerMuzzle）
      const ly = combat.ly();
      const mz = combat.towerMuzzle('cannon');
      const fx0 = mz.x, fy0 = mz.y;
      const range = combat.range('cannon');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('cannon', e.x, e.y));
      const topY = ly.areaY + ly.entryH + 10;
      const wallY = ly.wallY - 12;
      for (let i = 0; i < n; i++) {
        // 部署点：有敌人 → 最近敌人（y 最大）附近一圈随机；无敌人 → 攻击范围内随机
        let tx, ty;
        if (alive.length) {
          const near = alive.reduce((a, b) => (b.y > a.y ? b : a));
          const ang = Math.random() * Math.PI * 2;
          const rr = 30 + Math.random() * 150;   // v1.16.23：部署圈半径 ×3（10~60 → 30~180px）
          tx = near.x + Math.cos(ang) * rr;
          ty = near.y + Math.sin(ang) * rr;
        } else {
          tx = 40 + Math.random() * 620;
          ty = fy0 - 30 - Math.random() * Math.max(60, range - 90);
        }
        tx = Math.max(25, Math.min(725, tx));
        ty = Math.max(topY, Math.min(wallY, ty));
        const dist = Math.hypot(tx - fx0, ty - fy0);
        combat.mines = combat.mines || [];
        combat.mines.push({
          x: fx0, y: fy0, r: SKILL_NUM.cannon['地雷阵'].radius,
          dmg: combat.shotDmg('cannon') * SKILL_NUM.cannon['地雷阵'].damage * (1 + SKILL_NUM.cannon['地雷阵'].damagePerBranch * combat.branchLv('cannon', '地雷阵', 'B')),
          armed: 0, ttl: SKILL_NUM.cannon['地雷阵'].duration, chain: combat.branchLv('cannon', '地雷阵', 'C'),
          fly: { sx: fx0, sy: fy0, tx, ty, t: 0 },
        });
        const flyDur = dist / 200;   // 200px/s
        g.fx.push({ type: 'mine', x: tx, y: ty, t: 0, dur: flyDur + SKILL_NUM.cannon['地雷阵'].duration, seed: Math.random() * 100, fly: { sx: fx0, sy: fy0, tx, ty, dur: flyDur } });
        combat.fxParticle(fx0, fy0 - 8, '#b5651d', 4, 22, 0.3, 90, 4);
      }
    }
  }
  // 炮·炮台（v1.16 周期召唤）：每 10 秒部署一门自动炮台（A 增台 +1/级；B 久驻 +2s 且 CD -1s/级），独立炮击最靠墙敌人（70% 伤害·1s/发；C 重炮台爆炸范围 +30%/级）
  const turret = combat.lv('cannon', '炮台');
  if (turret > 0) {
    combat.timers.turret = (combat.timers.turret || 0) + dt;
    const cd = Math.max(SKILL_NUM.cannon['炮台'].minPeriod, SKILL_NUM.cannon['炮台'].period - SKILL_NUM.cannon['炮台'].periodReductionPerBranch * combat.branchLv('cannon', '炮台', 'B')) * combat._weakPeriod('cannon');
    if (combat.timers.turret >= cd) {
      combat.timers.turret = 0;
      combat.castEnergy('cannon', '炮台');
      const n = SKILL_NUM.cannon['炮台'].count + combat.branchLv('cannon', '炮台', 'A');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('cannon', e.x, e.y));
      if (!alive.length) return;   // v1.16.18 没有敌人时不部署炮台
      for (let i = 0; i < n; i++) {
        const near = alive[Math.floor(Math.random() * alive.length)];
        const px = near.x + (Math.random() - 0.5) * 90;
        const py = near.y + (Math.random() - 0.5) * 90;
        const ttl = SKILL_NUM.cannon['炮台'].duration + SKILL_NUM.cannon['炮台'].durationPerBranch * combat.branchLv('cannon', '炮台', 'B');
        combat.turrets = combat.turrets || [];
        combat.turrets.push({ x: px, y: py, ttl, atkT: 0, atkI: SKILL_NUM.cannon['炮台'].attackInterval, dmg: combat.shotDmg('cannon') * SKILL_NUM.cannon['炮台'].damage, r: SKILL_NUM.cannon['炮台'].radius * (1 + SKILL_NUM.cannon['炮台'].radiusPerBranch * combat.branchLv('cannon', '炮台', 'C')) });
        g.fx.push({ type: 'turret', x: px, y: py, t: 0, dur: ttl, seed: Math.random() * 100 });
        combat.fxRing(px, py, '#b5651d', 40, 0.5, 3.5);
      }
    }
  }
}

function updateMines(combat, dt) {
  if (!combat.mines || !combat.mines.length) return;
  for (let i = combat.mines.length - 1; i >= 0; i--) {
    const m = combat.mines[i];
    if (m.fly) {
      const dx = m.fly.tx - m.fly.sx, dy = m.fly.ty - m.fly.sy;
      const dist = Math.hypot(dx, dy) || 1;
      m.fly.t += dt;
      const p = Math.min(1, (m.fly.t * 500) / dist);   // v1.16.23：抛投速度 200→500px/s
      m.x = m.fly.sx + dx * p;
      m.y = m.fly.sy + dy * p;
      if (p >= 1) { m.x = m.fly.tx; m.y = m.fly.ty; m.fly = null; m.armed = 0.3; m.ttl = 20; }
      continue;   // 飞行期间不可引爆
    }
    m.ttl -= dt;
    m.armed -= dt;
    // v1.16.103 地雷强化3★：地雷持续 20 秒未被触发时自动引爆，造成 150% 伤害
    if (m.ttl <= 0) {
      if (combat.game.run.relic3('can_mine')) combat.explode(m.x, m.y, m.r, m.dmg * 1.5, 'cannon');
      combat.mines.splice(i, 1);
      continue;
    }
    if (m.armed > 0) continue;
    const hit = combat.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) <= 60);
    if (!hit) continue;
    combat.mines.splice(i, 1);
    // v1.16.103 雷场3★：地雷被引爆时，90 码内的其他地雷共鸣引爆（造成 50% 伤害，可继续连锁）
    if (combat.game.run.relic3('can_minefield')) {
      combat.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false);   // 主雷全额爆炸
      const q = [m];
      const visited = new Set([m]);
      while (q.length) {
        const cur = q.pop();
        for (let j = combat.mines.length - 1; j >= 0; j--) {
          const o2 = combat.mines[j];
          if (o2.fly || visited.has(o2)) continue;
          if (Math.hypot(o2.x - cur.x, o2.y - cur.y) <= 90) {
            visited.add(o2);
            combat.mines.splice(j, 1);
            combat.explode(o2.x, o2.y, o2.r, o2.dmg * 0.5, 'cannon', 0, false);
            q.push(o2);
          }
        }
      }
    } else {
      combat.explode(m.x, m.y, m.r, m.dmg, 'cannon', 0, false);
    }
    if (m.chain > 0) {
      // v1.16.42 C 连爆 → 碎雷重做：爆炸后星状向四周 130px 内散射 5/6/7 片弹片，每片 30% 攻击伤害
      const nShard = SKILL_NUM.cannon['地雷阵'].shards[m.chain];
      const shardDmg = combat.shotDmg('cannon', true) * SKILL_NUM.cannon['地雷阵'].shardDmg;
      const R2 = SKILL_NUM.cannon['地雷阵'].shardR;
      const SPEED = SKILL_NUM.cannon['地雷阵'].shardSpeed;
      for (let k = 0; k < nShard; k++) {
        const ang = (Math.PI * 2 * k) / nShard + (Math.random() - 0.5) * 0.4;
        const tx2 = m.x + Math.cos(ang) * R2, ty2 = m.y + Math.sin(ang) * R2;
        const shard = {
          key: 'cannon', dmg: shardDmg, t: 0, dur: R2 / SPEED, sx: m.x, sy: m.y, tx: tx2, ty: ty2,
          scatter: true, hitR: 34,
          onHit: (o, dd) => { combat.damage(o, dd, 'cannon'); combat.fxParticle(o.x, o.y, '#d89e63', 3, 18, 0.3, 80, 4); },
        };
        combat.shots.push(shard);
        combat.game.fx.push({ type: 'shot', kind: 'line', color: '#e6b980', x: m.x, y: m.y, t: 0, dur: R2 / SPEED, key: 'cannon', aim: true, scale: 0.8, tx: tx2, ty: ty2 });
      }
    }
  }
}

function updateTurrets(combat, dt) {
  if (!combat.turrets || !combat.turrets.length) return;
  const g = combat.game;
  for (let i = combat.turrets.length - 1; i >= 0; i--) {
    const tu = combat.turrets[i];
    tu.ttl -= dt;
    if (tu.ttl <= 0) {
      // v1.16.103 增援3★：炮台消失时返还 2 点能量
      if (g.run.relic3('can_reinforce')) {
        const ct = combat.tower('cannon');
        if (ct) ct.energy = Math.min(ct.energy + 2, g.run.armoryEnergyMax());
      }
      combat.turrets.splice(i, 1);
      continue;
    }
    tu.atkT += dt;
    if (tu.atkT >= tu.atkI) {
      tu.atkT -= tu.atkI;
      const tgt = combat.enemies().filter((o) => o.hp > 0).sort((a, b) => b.y - a.y)[0];
      if (tgt) {
        // v1.16.103 炮群3★：多门炮台同时存在时，每门伤害 +10%/门
        const turretDmg = g.run.relic3('can_turret') ? tu.dmg * (1 + 0.1 * (combat.turrets.length - 1)) : tu.dmg;
        combat.damage(tgt, turretDmg, 'cannon');
        combat.explode(tgt.x, tgt.y, tu.r, turretDmg * 0.48, 'cannon', 0, false);
        combat.fxBeam(tu.x, tu.y, tgt.x, tgt.y, '#d89e63', 0.25, 3);
        // v1.16.6 炮台开火炮口闪光 + 后坐火星
        combat.fxFlash(tu.x, tu.y - 8, '#ffd24a', 0.15);
        combat.fxParticle(tu.x, tu.y - 6, '#d89e63', 2, 18, 0.2, 60, 3);
        // v1.16.10 开火帧动画标记：命中对应炮台 fx，0.3s 内渲染第 4 帧开火
        const fi = combat.game.fx.findIndex((x) => x.type === 'turret' && Math.abs(x.x - tu.x) < 2 && Math.abs(x.y - tu.y) < 2);
        if (fi >= 0) combat.game.fx[fi].attackT = combat.game.fx[fi].t;
      }
    }
  }
}

module.exports = { hitCannon, tickCannon, updateMines, updateTurrets };
