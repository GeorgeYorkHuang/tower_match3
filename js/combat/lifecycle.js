'use strict';
// Per-frame order and reset semantics; caller owns every queue and enemy.

function reset(combat) {
  if (combat.game && combat.game.dmgNumbers) combat.game.dmgNumbers.clear();
  combat.shots = [];
  combat.delayed = [];
  combat.timers = {};
  combat.atkTimers = {};
  combat.kills = {};
  combat.bWait = {};
  combat.bCatch = {};          // v1.16.42 回旋镖接镖冷却计时
  combat._nextDmg = {};        // 回旋镖·接镖 C 续投：下镖伤害加成（v1.16）
  combat.groundDots = [];      // 火·火柱余烬 / 毒·毒池·毒沼：地面持续区域
  combat.frostOrbs = [];       // 冰·冬珠：持续冰霜之球
  combat.iceGrounds = [];      // v1.16.98 冰晶3★/冰雾3★：减速/降攻速地面
  combat.poisonSticks = [];    // 毒·毒棒：独立攻击的召唤物（v1.15）
  combat.mines = [];           // 炮·地雷阵（v1.16）
  combat.turrets = [];         // 炮·炮台（v1.16）
  combat.storms = [];          // 回旋镖·风暴镖（v1.16）
  combat.windTrails = [];      // 回旋镖·风痕（v1.16）
  // v1.16.38 同步清理战斗实体 fx（弹道/风暴镖/炮台/地雷/地面持续区），避免切塔/清场/重开后幽灵残留
  const g = combat.game;
  if (g && g.fx) {
    const entityFx = ['shot', 'cyclone', 'turret', 'mine', 'groundDot', 'frostOrb', 'poisonStick'];
    g.fx = g.fx.filter((f) => !entityFx.includes(f.type));
  }
}

function update(combat, dt, initEnemyState) {
  const g = combat.game;
  if (!g.run.slotOrder.length) return; // 无塔不战斗

  // v1.16.96 3★ 时间窗口递减：智慧典籍3★ 攻速窗口 / 战术转移3★ 洗牌伤害窗口 / 焚天3★ 攻速窗口（秒）
  if (g.run._tomeBuffTtl > 0) g.run._tomeBuffTtl = Math.max(0, g.run._tomeBuffTtl - dt);
  // v1.16.102 疾接3★：城墙无敌帧递减
  if (g.run._wallInvT > 0) g.run._wallInvT = Math.max(0, g.run._wallInvT - dt);
  if (g.run._shuffleBuffTtl > 0) g.run._shuffleBuffTtl = Math.max(0, g.run._shuffleBuffTtl - dt);
  if (g.run._burnallTtl > 0) g.run._burnallTtl = Math.max(0, g.run._burnallTtl - dt);
  // v1.16.96 余烬风暴3★：余烬弹倒计时，1 秒后射向最近敌人
  if (g.run._emberShots && g.run._emberShots.length) {
    const rem = [];
    for (const es of g.run._emberShots) {
      es.t -= dt;
      if (es.t <= 0) {
        const near = combat.enemies().filter((o) => o.hp > 0).sort((a, b) => Math.hypot(a.x - es.x, a.y - es.y) - Math.hypot(b.x - es.x, b.y - es.y))[0];
        if (near) {
          combat.damage(near, es.dmg, 'fire');
          combat.fxFlash(near.x, near.y, '#ff9f43', 0.3);
          combat.fxRing(near.x, near.y, '#ff7043', 30, 0.3, 3);
          g.fx.push({ type: 'shot', kind: 'line', color: '#ff9f43', x: es.x, y: es.y, tx: near.x, ty: near.y, t: 0, dur: 0.3, key: 'fire', aim: true, scale: 0.9 });
        }
      } else {
        rem.push(es);
      }
    }
    g.run._emberShots = rem;
  }

  // 兼容缺字段的敌人（测试/旧数据）：惰性补齐 A1 状态
  g.enemies.forEach((e) => { if (!e.dots) initEnemyState(e); });

  // 1. 飞行弹道推进与命中结算（回旋镖 sweep：沿途扫过伤害；散射 scatter：无目标沿途碰撞；其余：终点单体命中）
  for (let i = combat.shots.length - 1; i >= 0; i--) {
    if (!combat.stepShot(combat.shots[i], dt)) { combat.shots[i].finished = true; combat.shots.splice(i, 1); }
  }
  // 2. 延迟爆炸（炮引信/炮火支援落点）
  combat.updateDelayed(dt);
  // 3. 敌人状态推进（DoT / 控制 / 层数衰减）
  g.enemies.forEach((e) => combat.tickStatus(e, dt));
  // 3.5 地面持续区域（火·余烬 / 毒·毒池·毒沼）
  combat.updateGroundDots(dt);
  // 3.6 毒·毒棒召唤物
  combat.updatePoisonSticks(dt);
  // 3.7 炮·地雷阵
  combat.updateMines(dt);
  // 3.8 炮·炮台
  combat.updateTurrets(dt);
  // 3.9 回旋镖·风暴镖
  combat.updateStorms(dt);
  // 3.10 回旋镖·风痕
  combat.updateWindTrails(dt);
  // 4. 塔攻击调度（每塔独立节奏）
  g.run.slotOrder.slice().forEach((key) => combat.tickTower(key, dt));
  // 5. 周期技
  // 5. 周期技（按塔分节：火/冰/电/毒/炮/回旋镖）
  combat.tickFire(dt);
  combat.tickIce(dt);
  combat.tickElectric(dt);
  combat.tickPoison(dt);
  combat.tickCannon(dt);
  combat.tickBoomerang(dt);
  // 6. 死亡清场（死亡技能已在伤害结算处触发）
  // v1.17.23 fix：v1.17.22 把全歼统计挂在 main.stepEnemies 的尸体过滤处，但此处更早把尸体
  //   filter 掉了 → 统计永远看不到死亡，clearedWaves 恒 0（深度轨迹不走、通关数恒「全歼 0 波」）。
  //   改为在此归集死亡并回调统计（main 处保留为兜底）。
  const dead = g.enemies.filter((e) => e.hp <= 0);
  if (dead.length && g._tallyWaveDeaths) g._tallyWaveDeaths(dead);
  g.enemies = g.enemies.filter((e) => e.hp > 0);
}

module.exports = { reset, update };
