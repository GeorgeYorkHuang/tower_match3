'use strict';
// Tower behavior acts only on caller-owned Combat, tower and enemy state.
const CONFIG = require('../../config.js');
const SKILL_NUM = require('../../config/tower-skills.js');

function hitBoomerang(combat, e, dmg) {
  // 猎手标记（v1.16.42 重做）：命中同目标叠加标记，标记持续 5 秒（到期自动清零）；
  //   A 深镖：受标记敌人受伤 +8%/16%/24%（damage 内全来源结算）；B 多标：层数上限 +2/+4/+6；C 猎杀：死亡扩散 1/2/3 个
  const markLv = combat.lv('boomerang', '猎手标记');
  let v = dmg;
  if (markLv > 0) {
    const cap = SKILL_NUM.boomerang['猎手标记'].stackCap + SKILL_NUM.boomerang['猎手标记'].stacksPerBranch * combat.branchLv('boomerang', '猎手标记', 'B');
    e._mark = Math.min(cap, (e._mark || 0) + 1);
    e._markT = SKILL_NUM.boomerang['猎手标记'].markDur;   // v1.16.42 标记持续 5 秒（每次命中刷新）
    // 标记视觉：目标头顶紫色标记计数
    combat.fxParticle(e.x, e.y - 16, '#d2b4de', 2, 12, 0.35, 60, 4);
  }
  combat.damage(e, v, 'boomerang');
  // 普攻流血（v1.16.21→v1.16.53 统一判定）：20% 概率；「放血」+25%（20→45%）、A 刺骨 +15%/级（45→90%）
  combat.tryAttackDebuff('boomerang', e, v);
  // 折返增伤（v1.16）：折返段 = 命中伤害 ×0.65×(1+0.25×A)；B 缓返命中减速 20%；C 宽返吸附已在 sweepDamage
  const fold = combat.lv('boomerang', '折返增伤');
  if (fold > 0) {
    const foldDmg = v * SKILL_NUM.boomerang['折返增伤'].damage * (1 + SKILL_NUM.boomerang['折返增伤'].damagePerBranch * combat.branchLv('boomerang', '折返增伤', 'A'));
    combat.damage(e, foldDmg, 'boomerang');
    if (combat.branchLv('boomerang', '折返增伤', 'B') > 0) combat.applySlow(e, SKILL_NUM.boomerang['折返增伤'].slow, SKILL_NUM.boomerang['折返增伤'].slowDuration);
    // 折返视觉：紫色小回环
    combat.fxRing(e.x, e.y, '#c39bd3', 34, 0.3, 2.5);
  }
  // （v1.16.14 回旋镖「穿透」已替换为「放血」dot 强化，穿透实现移除）
}

function sweepDamage(combat, s) {
  const g = combat.game;
  const p = Math.min(1, s.t / s.dur);
  const pos = combat.sweepPos(s, p);
  const bx = pos.x, by = pos.y;
  const foldC = combat.branchLv('boomerang', '折返增伤', 'C');
  const r = 42 * (1 + 0.20 * foldC);
  for (const e of g.enemies) {
    if (e.hp <= 0 || s.hitIds[e.id]) {
      // v1.16.102 强返3★：折返镖命中同一目标第二次时伤害 ×1.5（仅折返增伤激活）
      // v1.16.102 镖群3★：多镖呈环状回收时命中路径上的所有敌人（每敌额外一次回程命中）
      const wantReturn = g.run.relic3('boo_return') && combat.lv('boomerang', '折返增伤') > 0 && !s.hitIds[e.id + '_r'];
      const wantMulti = g.run.relic3('boo_multi') && combat.lv('boomerang', '多镖') > 0 && !s.hitIds[e.id + '_2'];
      if ((wantReturn || wantMulti) && Math.hypot(e.x - bx, e.y - by) <= r) {
        if (wantReturn) s.hitIds[e.id + '_r'] = true;
        if (wantMulti) s.hitIds[e.id + '_2'] = true;
        combat.damage(e, s.dmg * (wantReturn ? 1.5 : 1), 'boomerang');
      }
      continue;
    }
    if (Math.hypot(e.x - bx, e.y - by) <= r) {
      s.hitIds[e.id] = true;
      // v1.16.102 回旋3★：飞镖速度提升使命中率提高，Miss 补偿为 +10% 伤害
      const spinV = g.run.relic3('boo_spin') ? 1.1 : 1;
      combat.damage(e, s.dmg * spinV, 'boomerang');
      combat.tryAttackDebuff('boomerang', e, s.dmg * spinV);   // v1.16.53 多镖扫过属普攻强化：统一流血判定（吃放血技能加成）
    }
  }
  // 风痕（v1.16）：镖路径每秒留下风痕伤害区（A 久痕 +0.5s/级；B 劲风 +30%/级；C 卷痕减速 15%）
  // v1.16.36 修正：空间间隔采样（相邻留痕 ≥32px，r=34 伤害区仍连续全覆盖）+ 上限 120→240，
  //            避免多镖/疾飞高频投掷下活跃点数迅速打满 120 导致风痕整体断供
  if (s.windLv > 0) {
    const wA = combat.branchLv('boomerang', '风痕', 'A');
    const wB = combat.branchLv('boomerang', '风痕', 'B');
    const wC = combat.branchLv('boomerang', '风痕', 'C');
    combat.windTrails = combat.windTrails || [];
    const spaced = !s._wLast || Math.hypot(bx - s._wLast.x, by - s._wLast.y) >= SKILL_NUM.boomerang['风痕'].sampleDistance;
    if (spaced && combat.windTrails.length < SKILL_NUM.boomerang['风痕'].maxTrails) {
      const ttl = SKILL_NUM.boomerang['风痕'].duration + SKILL_NUM.boomerang['风痕'].durationPerBranch * wA;
      const dps = combat.shotDmg('boomerang', true) * SKILL_NUM.boomerang['风痕'].damage * (1 + SKILL_NUM.boomerang['风痕'].damagePerBranch * wB);
      combat.windTrails.push({ x: bx, y: by, r: SKILL_NUM.boomerang['风痕'].radius, ttl, dps, slow: SKILL_NUM.boomerang['风痕'].slow[wC] });   // v1.16.42 C 卷痕档位式 10%/20%/30%
      s._wLast = { x: bx, y: by };
    }
    if (Math.random() < 0.5) combat.fxParticle(bx, by, '#c39bd3', 1, 14, 0.5, 50, 3);
  }
}

function tickAttack(combat, dt) {
  const g = combat.game, key = 'boomerang';
  const flying = combat.shots.some((s) => s.sweep && s.key === key);
  if (flying) return;                       // 镖在飞行中不投（也不累计攻速计时）
  const catchSkill = combat.lv('boomerang', '接镖') > 0;
  if (combat.bWait[key]) {
    combat.bWait[key] = false;
    // v1.16.114 疾接1★/2★：接镖后下一镖造成的伤害提升 15%/20%（叠加在接镖 C 续投之上）
    combat._nextDmg[key] = (combat._nextDmg[key] || 0) + combat.relicVal('boo_catch') / 100;
    // v1.16.102 疾接3★：接镖瞬间 0.3 秒无敌帧（对精英投射物有效，窗口由 run._wallInvT 承载）
    if (g.run.relic3('boo_catch')) g.run._wallInvT = 0.3;
    if (catchSkill) {
      const cnt = combat.branchLv('boomerang', '接镖', 'C');
      if (cnt > 0) combat._nextDmg[key] = (combat._nextDmg[key] || 0) + 0.10 * cnt;
      combat.attackOnce(key);
      return;
    }
    combat.bCatch[key] = 0;                   // 未学接镖：开始 0.5s 接镖冷却
  }
  if (combat.bCatch[key] !== undefined) {
    combat.bCatch[key] += dt;
    if (combat.bCatch[key] >= SKILL_NUM.boomerang['接镖'].catchCd) { combat.bCatch[key] = undefined; combat.attackOnce(key); }
  } else {
    combat.attackOnce(key);                   // 空闲/无目标：直接尝试（attackOnce 内部无目标时复位等待）
  }
  return;
}

function launchAttack(combat, { key, target, dmg, dur, sx, sy, tint, baseShot }) {
  const g = combat.game;
  // 回旋镖 v1.16 重做：弧线飞出再飞回，沿途扫过所有敌人；投出后标记等待接回（接镖机制保留）
  // v1.16.130 多镖重做：每枚镖独立索敌——主镖锁定最近敌人（pickTarget），其余镖从主目标 Y 轴往上 40px
  //   截面内随机选敌，各自飞向各自目标点（不再共享一个落点一排散开）
  combat.bWait[key] = true;
  const multi = combat.lv('boomerang', '多镖');
  const nextBoost = combat._nextDmg[key] || 0;   // 接镖 C 续投：下镖伤害 +10%/级
  combat._nextDmg[key] = 0;
  // 怪物只沿 +y 走向城墙（main.moveEnemy），预测位移 = speed × 减速系数 × 到达弧顶时间（dur×0.53）
  // v1.16.5 接镖 A 疾飞：镖飞行速度 +20%/级 → 飞行时长缩短、命中与接回更快
  const flyBoost = 1 + SKILL_NUM.boomerang['接镖'].speedPerBranch * combat.branchLv('boomerang', '接镖', 'A') + combat.relicVal('boo_spin') / 100;   // v1.16.114 回旋1★/2★：镖速 +20%/30%
  const bDur = dur / flyBoost;
  const slowMult = (target.slow && target.slow.ttl > 0) ? target.slow.mult : 1;
  const wallY = (g.ly && g.ly.wallY) ? g.ly.wallY - 10 : 957;
  const n = SKILL_NUM.boomerang['多镖'].baseCount + multi + combat.relicVal('boo_multi');   // v1.16.114 镖群1★/2★：每次投掷镖数 +2/+3
  const decay = multi > 0 ? (SKILL_NUM.boomerang['多镖'].damageDecayPerLevel * multi) * (combat.branchLv('boomerang', '多镖', 'B') > 0 ? SKILL_NUM.boomerang['多镖'].branchDecayMultiplier : 1) : 0;
  const perDmg = dmg * (1 - decay) * (1 + nextBoost);
  const maxD = CONFIG.TOWERS.boomerang.range;
  // v1.16.130 独立索敌：主镖 = 最近敌人，其余 = 主目标上方 40px 截面内随机敌人
  const bladeTargets = [target];
  for (let i = 1; i < n; i++) bladeTargets.push(combat.pickAltTarget('boomerang', target));
  // 移除通用视觉弹道（baseShot），按 n 枚重建（各镖独立目标、各自轨迹）
  const bidx = g.fx.indexOf(baseShot);
  if (bidx >= 0) g.fx.splice(bidx, 1);
  for (let i = 0; i < n; i++) {
    const t_i = bladeTargets[i];
    const aimY_i = Math.min(t_i.y + t_i.speed * slowMult * bDur * 0.53, wallY);
    const dx = t_i.x - sx, dy = aimY_i - sy;
    const dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, maxD / dist);
    const ex = sx + dx * k, ey = sy + dy * k;
    combat.addProjectile({ key, dmg: perDmg, t: 0, dur: bDur, sx, sy, tx: ex, ty: ey, sweep: true, hitIds: {}, windLv: combat.lv('boomerang', '风痕') }, { type: 'shot', kind: 'arc', color: tint, x: sx, y: sy, tx: ex, ty: ey, t: 0, dur: bDur, key, fold: combat.lv('boomerang', '折返增伤') > 0 });
  }
}

function tryAttackDebuff(combat, o, dmg) {
  // 流血（v1.16.21）：基础 20%；学放血 +25%（20→45）+ A 刺骨 +15%/级（45→90%）
  const bleedLv = combat.lv('boomerang', '放血');
  const bleedChance = SKILL_NUM.boomerang['放血'].baseProbability + (bleedLv > 0 ? SKILL_NUM.boomerang['放血'].learnedProbability + SKILL_NUM.boomerang['放血'].probabilityPerBranch * combat.branchLv('boomerang', '放血', 'A') : 0) + combat.relicVal('boo_bleed') / 100;   // v1.16.114 放血刃1★/2★
  // v1.16.102 放血刃3★：流血概率触顶（≥80%）时，多余判定转为流血时长 +1 秒
  const bleedTip = combat.game.run.relic3('boo_bleed') && bleedChance >= 0.8;
  if (bleedTip ? Math.random() < 0.8 : Math.random() < bleedChance) {
    combat.applyBleed(o, dmg);
  } else if (bleedTip) {
    combat.applyBleed(o, dmg);
    o.bleedT += 1;   // 触顶失败判定转流血时长 +1 秒
    combat.fxParticle(o.x, o.y - 8, '#c0392b', 4, 20, 0.4, 80, 4);
  }
}

function tickBoomerang(combat, dt) {
  const g = combat.game;
  const stormBalance=SKILL_NUM.boomerang['风暴镖'], bounceBalance=SKILL_NUM.boomerang['弹力镖'];
  // 回旋镖·风暴镖（v1.16.21 重做）：每 12 秒在敌人密集区选一存活敌人，生成 120px 三同心圈（40/80/120）旋转小飞镖（内4/中6/外8枚，每镖30%伤害，命中不消失，每镖对同敌0.3秒冷却；A 转速 +25%/级；B 伤害 +20%/级；C 镖数每圈 +1/级）
  const cyclone = combat.lv('boomerang', '风暴镖');
  if (cyclone > 0) {
    combat.timers.storm = (combat.timers.storm || 0) + dt;
    if (combat.timers.storm >= stormBalance.period * combat._weakPeriod('boomerang')) {
      combat.timers.storm = 0;
      combat.castEnergy('boomerang', '风暴镖');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('boomerang', e.x, e.y));
      if (alive.length) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        // 三圈角速度不同：内圈 2.6 顺时针 / 中圈 2.0 逆时针 / 外圈 2.4 顺时针（A 疾旋统一 +25%/级）
        const rings = stormBalance.rings;
        const baseN = stormBalance.ringCounts;
        const nAdd = combat.branchLv('boomerang', '风暴镖', 'C');
        const perDmg = combat.shotDmg('boomerang') * stormBalance.damage * (1 + stormBalance.damagePerBranch * combat.branchLv('boomerang', '风暴镖', 'B'));
        const spdMul = 1 + stormBalance.speedPerBranch * combat.branchLv('boomerang', '风暴镖', 'A');
        const darts = [];
        rings.forEach((rc, ri) => {
          const n = baseN[ri] + nAdd;
          const spd = rc.base * spdMul;   // 带方向符号（正=顺时针）
          for (let i = 0; i < n; i++) darts.push({ r: rc.r, spd, a: (Math.PI * 2 * i) / n, hitIds: {} });
        });
        combat.storms = combat.storms || [];
        // v1.16.102 旋风3★：风暴镖持续时间翻倍（3→6 秒）
        const cyclTtl = combat.game.run.relic3('boo_cyclone') ? stormBalance.duration * 2 : stormBalance.duration;
        const sto = { x: t.x, y: t.y, r: 120, ttl: cyclTtl, darts, perDmg };
        const fxo = { type: 'cyclone', x: t.x, y: t.y, r: 120, t: 0, dur: cyclTtl, darts };
        sto.fx = fxo;                    // v1.16.38 风暴镖 fx 引用（同步清除）
        combat.storms.push(sto);
        g.fx.push(fxo);
      }
    }
  }
  // 回旋镖·弹力镖（v1.16.21 原镖阵重做，新单体）：每 8 秒射 2 枚十字飞镖，碰敌人或战斗区边缘反弹（60% 伤害，反弹 10 次结束）；A 增镖 +1/级；B 利刃 +25%/级；C 弹力增强 +5 次/级
  const ringN = combat.lv('boomerang', '弹力镖');
  if (ringN > 0) {
    combat.timers.ringN = (combat.timers.ringN || 0) + dt;
    if (combat.timers.ringN >= bounceBalance.period * combat._weakPeriod('boomerang')) {
      combat.timers.ringN = 0;
      combat.castEnergy('boomerang', '弹力镖');
      const alive = combat.enemies().filter((e) => e.hp > 0 && combat.inTowerRange('boomerang', e.x, e.y));
      const mus = combat.towerMuzzle('boomerang');
      const n = bounceBalance.count + 1 * combat.branchLv('boomerang', '弹力镖', 'A');
      const perDmg = combat.shotDmg('boomerang') * bounceBalance.damage * (1 + bounceBalance.damagePerBranch * combat.branchLv('boomerang', '弹力镖', 'B'));
      const maxB = bounceBalance.bounces + bounceBalance.bouncesPerBranch * combat.branchLv('boomerang', '弹力镖', 'C');
      // 初始方向：射程内随机存活敌人方向 ± 散射（无敌人则全随机）
      let baseAng = Math.random() * Math.PI * 2;
      if (alive.length) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        baseAng = Math.atan2(t.y - mus.y, t.x - mus.x);
      }
      for (let i = 0; i < n; i++) {
        const ang = baseAng + (i - (n - 1) / 2) * bounceBalance.spreadStep;
        const d = { key: 'boomerang', dmg: perDmg, t: 0, dur: bounceBalance.duration, x: mus.x, y: mus.y, ang, speed: bounceBalance.speed, bounce: true, bounces: 0, maxB, hitR: bounceBalance.hitRadius, hitIds: {} };
        combat.shots.push(d);
        const fxo = { type: 'shot', kind: 'bounce', ref: d, t: 0, dur: bounceBalance.duration, color: '#c39bd3' };
        d.fx = fxo;                    // v1.16.38 弹力镖 fx 引用（提前结束同步清除）
        g.fx.push(fxo);
      }
    }
  }
}

function updateStorms(combat, dt) {
  if (!combat.storms || !combat.storms.length) return;
  for (let i = combat.storms.length - 1; i >= 0; i--) {
    const st = combat.storms[i];
    st.ttl -= dt;
    if (st.ttl <= 0) {
      if (st.fx) st.fx.t = st.fx.dur;   // v1.16.38 同步结束风暴镖 fx
      // v1.16.102 旋风3★：风暴镖结束时原地爆炸（150% 伤害，半径 140 码）
      if (combat.game.run.relic3('boo_cyclone')) {
        combat.explode(st.x, st.y, 140, combat.shotDmg('boomerang', true) * 1.5, 'boomerang');
      }
      combat.storms.splice(i, 1);
      continue;
    }
    // v1.16.102 风暴眼3★：风暴镖中心的敌人每秒受到 15% 额外伤害
    if (combat.game.run.relic3('boo_eye')) {
      st._eyeT = (st._eyeT || 0) + dt;
      if (st._eyeT >= 1) {
        st._eyeT = 0;
        const center = combat.enemies().filter((o) => o.hp > 0)
          .sort((a, b) => Math.hypot(a.x - st.x, a.y - st.y) - Math.hypot(b.x - st.x, b.y - st.y))[0];
        if (center) {
          combat.damage(center, combat.shotDmg('boomerang') * 0.15, 'boomerang');
          combat.fxFlash(center.x, center.y, '#c39bd3', 0.25);
        }
      }
    }
    const ds = st.darts;
    for (let j = ds.length - 1; j >= 0; j--) {
      const d = ds[j];
      d.a += d.spd * dt;
      const dx = st.x + Math.cos(d.a) * d.r;
      const dy = st.y + Math.sin(d.a) * d.r;
      const cooldowns = d.hitCooldowns || (d.hitCooldowns = Object.create(null));
      for(const id of Object.keys(cooldowns)){cooldowns[id]-=dt;if(cooldowns[id]<=1e-9)delete cooldowns[id];}
      for(const hitE of combat.enemies()) {
        if(hitE.hp<=0 || cooldowns[hitE.id]>0 || Math.hypot(hitE.x-dx,hitE.y-dy)>=SKILL_NUM.boomerang['风暴镖'].hitRadius)continue;
        cooldowns[hitE.id] = SKILL_NUM.boomerang['风暴镖'].hitCooldown;
        combat.damage(hitE, st.perDmg, 'boomerang');
        combat.fxFlash(dx, dy, '#c39bd3');
        combat.fxParticle(dx, dy, '#c39bd3', 3, 16, 0.25, 80, 4);
      }
    }
  }
}

function updateWindTrails(combat, dt) {
  if (!combat.windTrails || !combat.windTrails.length) return;
  for (let i = combat.windTrails.length - 1; i >= 0; i--) {
    const w = combat.windTrails[i];
    w.ttl -= dt;
    if (w.ttl <= 0) { combat.windTrails.splice(i, 1); continue; }
    combat.enemies().forEach((o) => {
      if (o.hp <= 0 || Math.hypot(o.x - w.x, o.y - w.y) > w.r) return;
      // v1.16.102 风刃3★：风痕叠加时伤害取最高值 +30%/层（上限 3 层）
      let mult = 1;
      if (combat.game.run.relic3('boo_wind')) {
        const layers = Math.min(3, combat.windTrails.filter((w2) => w2 !== w && Math.hypot(o.x - w2.x, o.y - w2.y) <= w2.r).length + 1);
        mult = 1 + 0.3 * layers;
      }
      combat.damage(o, w.dps * dt * mult, 'boomerang');
      // v1.16.102 长痕3★：风痕命中的敌人附加 1 层标记（持续 5 秒，需学习猎手标记技能；每敌 1 秒内至多叠 1 层）
      if (combat.game.run.relic3('boo_trail') && combat.lv('boomerang', '猎手标记') > 0) {
        o._trailMarkCd = (o._trailMarkCd || 0) - dt;
        if (o._trailMarkCd <= 0) {
          o._trailMarkCd = 1;
          const cap = SKILL_NUM.boomerang['猎手标记'].stackCap + SKILL_NUM.boomerang['猎手标记'].stacksPerBranch * combat.branchLv('boomerang', '猎手标记', 'B');
          o._mark = Math.min(cap, (o._mark || 0) + 1);
          o._markT = SKILL_NUM.boomerang['猎手标记'].markDur;
          combat.fxParticle(o.x, o.y - 16, '#d2b4de', 2, 12, 0.35, 60, 4);
        }
      }
      if (w.slow) combat.applySlow(o, w.slow, 0.2);
    });
  }
}

function stepBounce(combat, s, dt) {
  const g = combat.game;
  // v1.16.21 弹力镖（原镖阵重做，新单体）：直线飞行，碰敌人或战斗区域边缘反弹；每次碰敌造成伤害（同敌仅一次），反弹 maxB 次或超时后消失
  s.x += Math.cos(s.ang) * s.speed * dt;
  s.y += Math.sin(s.ang) * s.speed * dt;
  const aX = g.ly.areaX, aW = g.ly.areaW, aY = g.ly.areaY, aH = g.ly.areaH;
  if (s.x < aX) { s.x = aX; s.ang = Math.PI - s.ang; s.bounces++; }
  else if (s.x > aX + aW) { s.x = aX + aW; s.ang = Math.PI - s.ang; s.bounces++; }
  if (s.y < aY) { s.y = aY; s.ang = -s.ang; s.bounces++; }
  else if (s.y > aY + aH) { s.y = aY + aH; s.ang = -s.ang; s.bounces++; }
  const hitE = combat.enemies().find((o) => o.hp > 0 && Math.hypot(o.x - s.x, o.y - s.y) < (s.hitR || 30));
  if (hitE) {
    if (!s.hitIds[hitE.id]) {
      s.hitIds[hitE.id] = true;
      // v1.16.102 弹力3★：弹力镖每次反弹伤害 +5%（最多 +50%）
      const bounceV = combat.game.run.relic3('boo_bounce') ? (1 + 0.05 * Math.min(10, s.bounces)) : 1;
      combat.damage(hitE, s.dmg * bounceV, 'boomerang');
      combat.fxFlash(hitE.x, hitE.y, '#c39bd3');
      combat.fxParticle(hitE.x, hitE.y, '#c39bd3', 3, 18, 0.3, 90, 4);
    }
    const nx = s.x - hitE.x, ny = s.y - hitE.y;
    const nl = Math.hypot(nx, ny) || 1;
    const vx = Math.cos(s.ang), vy = Math.sin(s.ang);
    const dot = vx * (nx / nl) + vy * (ny / nl);
    s.ang = Math.atan2(vy - 2 * dot * (ny / nl), vx - 2 * dot * (nx / nl));
    s.bounces++;
  }
  if (s.bounces >= s.maxB || s.t >= s.dur) {
    if (s.fx) s.fx.t = s.fx.dur;   // v1.16.38 弹力镖提前结束（反弹满/超时）时同步结束其 fx，防止幽灵残留
    // v1.16.102 飞刃3★：弹力镖消失时 30% 概率分裂为 2 枚小镖（50% 伤害，反弹 2 次）
    if (combat.game.run.relic3('boo_blade') && Math.random() < 0.3 && !s._splitDone) {
      s._splitDone = true;
      for (let k = 0; k < 2; k++) {
        const subAng = s.ang + (Math.PI / 2) * (k === 0 ? -1 : 1) + (Math.random() * 0.6 - 0.3);
        const sub = { key: 'boomerang', dmg: s.dmg * 0.5, t: 0, dur: 3, x: s.x, y: s.y, ang: subAng, speed: 380, bounce: true, bounces: 0, maxB: 2, hitR: 22, hitIds: {} };
        combat.shots.push(sub);
        const subFx = { type: 'shot', kind: 'bounce', ref: sub, t: 0, dur: 3, color: '#aed6f1' };
        sub.fx = subFx;
        combat.game.fx.push(subFx);
      }
    }
    return false;
  }
  return true;
}

module.exports = { hitBoomerang, sweepDamage, tickAttack, launchAttack, tryAttackDebuff, tickBoomerang, updateStorms, updateWindTrails, stepBounce };
