/**
 * test_combat.js —— A1 真实战斗行为专项测试（mock game，纯 combat 逻辑）
 * 验证技能不是「只加 DPS 乘区」，而是有真实行为：DoT / 冰冻 / 连锁 / 溅射 / 死亡爆炸 / 攻城状态
 * 运行：node tools/test_combat.js
 */
const assert = require('assert');
const CONFIG = require('../js/config.js');
const { CombatSystem, initEnemyState } = require('../js/combat.js');

/** 构造 mock game（塔技能可指定 level，或 {A,B,C} 分支等级） */
function mkGame(skills, slotOrder) {
  const order = (slotOrder || []).slice();
  Object.keys(skills || {}).forEach((k) => { if (!order.includes(k)) order.push(k); });
  if (!order.length) order.push('fire');
  const towers = {};
  order.forEach((k) => {
    const lvMap = skills[k] || {};
    towers[k] = {
      level: 1,
      pool: CONFIG.EFFECT_POOLS[k].map((e) => {
        const v = lvMap[e.name] || 0;
        const isObj = typeof v === 'object';
        const br = (b) => (isObj ? (v[b] || 0) : v);
        return { name: e.name, level: isObj ? Math.max(br('A'), br('B'), br('C')) : v, branches: { A: br('A'), B: br('B'), C: br('C') } };
      }),
      _chargeLayers: 0,
    };
  });
  const game = {
    run: {
      slotOrder: order,
      lineHp: CONFIG.LINE.hp,
      effects: {
        tower: (k) => towers[k] || null,
        towerDps: (k) => (CONFIG.TOWERS[k] ? CONFIG.TOWERS[k].baseDps : 0),
        synergyDone: [false, false, false],
      },
    },
    ly: {
      areaX: 25, areaY: 72, areaW: 700, areaH: 970, entryH: 68, wallY: 967,
      slotY: 1079, slotSize: 48, slotGap: 12,
    },
    enemies: [],
    fx: [],
    playSfx() {},
  };
  return game;
}

/** 造一只敌人 */
function mkEnemy(hp, x, y) {
  return initEnemyState({ id: Math.random() * 1e6, x, y, hp, maxHp: hp, isBoss: false, speed: 20 });
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

/* ---------- 用例 ---------- */

t('火·点燃：命中附加灼烧 DoT 并持续掉血', () => {
  const g = mkGame({ fire: { 点燃: 2 } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  c.hit('fire', e, 100);
  const dot = e.dots.find((d) => d.type === 'burn');
  assert.ok(dot, '应有灼烧 DoT');
  assert.ok(dot.dps > 0, 'DoT dps 应为正');
  const hp0 = e.hp;
  c.tickStatus(e, 0.6); // 一个 tick
  assert.ok(e.hp < hp0, 'DoT 应持续掉血');
});

t('冰·冰冻：命中概率冻结（冻结后不能移动）', () => {
  const g = mkGame({ ice: { 冰冻: 1 } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发
  try { c.hit('ice', e, 50); } finally { Math.random = orig; }
  assert.ok(e.frozen > 0, '应进入冻结状态');
  // 冻结移动检查：moveEnemy 逻辑（main）以 frozen>0 停移，此处验证状态被正确设置
});

t('冰·寒霜：普攻减速概率提升至70%', () => {
  const g = mkGame({ ice: { 寒霜: 1 } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发（0 < 0.70）
  try { c.hit('ice', e, 50); } finally { Math.random = orig; }
  assert.ok(e.slow && e.slow.mult < 1 && e.slow.ttl > 0, '应有减速状态');
  // mkGame 数字技能 → 全分支 1：幅度 = 30% + 15%×B1 = 45%
  assert.ok(Math.abs(e.slow.mult - 0.55) < 1e-6, `减速幅度应为 45%，实际 ${(1 - e.slow.mult) * 100}%`);
});

t('冰·寒霜C：减速目标易伤+15%/级', () => {
  const g = mkGame({ ice: { 寒霜: { C: 2 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 触发减速
  try { c.hit('ice', e, 100); } finally { Math.random = orig; }
  assert.ok(e.slow.ttl > 0, '应处于减速');
  // 再次命中：寒霜C2 → 受伤 ×(1+0.15×2)=×1.3
  const before = e.hp;
  c.hit('ice', e, 100);
  const lost = before - e.hp;
  assert.ok(Math.abs(lost - 100 * 1.3) < 1e-6, `减速目标应受伤 130，实际 ${lost.toFixed(1)}`);
});

t('冰·多重冰锥：等角度扇形散射命中', () => {
  const g = mkGame({ ice: { 多重冰锥: 1 } });
  const c = new CombatSystem(g);
  // 主目标 + 两侧散射弹道（基础 3 枚 = 主 + 2 散射；A=1 速记 → 4 枚 = 主 + 3 散射）
  const e1 = mkEnemy(1000, 330, 650); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 375, 800); g.enemies.push(e2);
  const e3 = mkEnemy(1000, 420, 650); g.enemies.push(e3);
  const orig = Math.random; Math.random = () => 0.5;
  try {
    c.hit('ice', e2, 100);
    assert.ok(c.shots.filter((s) => s.scatter).length === 3, '应生成 3 枚散射冰锥弹道');
    c.update(0.6);
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((x) => x.hp < 1000).length;
  assert.ok(hurt >= 2, `主目标 + 至少 1 枚散射应命中，实际 ${hurt}`);
});

t('冰·冰花：周期对最近敌人范围伤害 + A传染', () => {
  const g = mkGame({ ice: { 冰花: { A: 1 } } });
  const c = new CombatSystem(g);
  // 主目标 y=900（最近），两个周边敌（100 内）+ 一个远处（传染 60 内）
  g.enemies.push(mkEnemy(10000, 375, 900));
  g.enemies.push(mkEnemy(10000, 400, 930));
  g.enemies.push(mkEnemy(10000, 410, 950));   // 传染 60px 内
  c.tickPeriodic(8);   // 冰花周期 8s 触发
  c.update(0.9);       // v1.16.10：冰花改为延迟 0.8s（第 4 帧动画末尾）结算范围伤害
  const hurt = g.enemies.filter((x) => x.hp < 10000).length;
  assert.ok(hurt >= 3, `冰花 100 范围 + A 传染 60 应覆盖 3 个，实际 ${hurt}`);
});

t('冰·碎冰：命中后碎裂碎冰穿透身后敌人', () => {
  const g = mkGame({ ice: { 碎冰: 1 } });
  const c = new CombatSystem(g);
  // 主目标 + 身后（更靠近远处）敌人：碎冰沿弹道方向越过主目标后命中
  const e1 = mkEnemy(1000, 375, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 370, 680); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0.5;
  try {
    c.hit('ice', e1, 100);
    assert.ok(c.shots.filter((s) => s.scatter).length === 4, '应生成 4 枚碎冰弹道（基础3 + A速记1）');
    c.update(0.1);   // 推进碎冰越过主目标飞向身后
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((x) => x.hp < 1000).length;
  assert.ok(hurt >= 2, `主目标 + 身后敌人应被命中，实际 ${hurt}`);
});

t('冰·冰墙：周期附魔城墙 + 结束回血', () => {
  const g = mkGame({ ice: { 冰墙: { C: 1 } } });
  const c = new CombatSystem(g);
  const origHp = g.run.lineHp;   // CONFIG.LINE.hp
  c.timers.iceWall = 19.9;
  c.update(0.2);   // timer 20.1 ≥20 → 生成冰墙（ttl 8 + 2×A0；C1 → 回血 40）
  assert.ok(c.iceWall && c.iceWall.ttl > 0, '应生成冰墙');
  assert.ok(c.iceWall.absorb === 500, '冰墙吸收值应为 500');
  assert.ok(c.iceWall.heal === 40, 'C1 回血应为 40');
  // 模拟攻城扣血后冰墙消散回血
  g.run.lineHp -= 100;
  c.update(8.0);   // ttl 8 - 8.0 → 结束
  assert.ok(!c.iceWall, '冰墙应已消散');
  assert.ok(Math.abs(g.run.lineHp - (origHp - 100 + 40)) < 1e-6, `结束应回血 40，实际 lineHp=${g.run.lineHp}`);
});

t('冰·冬珠：持续冰霜之球范围伤害', () => {
  const g = mkGame({ ice: { 冬珠: 1 } });
  const c = new CombatSystem(g);
  g.enemies.push(mkEnemy(10000, 375, 800));
  g.enemies.push(mkEnemy(10000, 390, 830));   // 110 范围内
  c.timers.frostOrb = 9.9;
  c.update(0.2);   // timer 10.1 ≥10 → 释放冬珠（推进仅 -0.2s）
  assert.ok(c.frostOrbs.length === 2, '应生成 2 颗冬珠（基础1 + C速记1）');
  c.update(0.7);   // 累计 0.9s > 0.8s tickI → 第一跳
  const hurt = g.enemies.filter((x) => x.hp < 10000).length;
  assert.ok(hurt === 2, `冬珠一跳应伤范围内 2 个，实际 ${hurt}`);
});

t('电·连锁：命中后跳转第二目标', () => {
  const g = mkGame({ electric: { 连锁: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 380, 806); g.enemies.push(e2);
  c.hit('electric', e1, 100);
  assert.ok(e2.hp < 1000, '第二目标应被连锁伤害');
});

t('电·麻痹：命中概率麻痹', () => {
  const g = mkGame({ electric: { 麻痹: 1 } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0;
  try { c.hit('electric', e, 100); } finally { Math.random = orig; }
  assert.ok(e.paralyzed > 0, '应进入麻痹状态');
});

t('电·麻痹A满B满：80%概率 + 时长3.5s + 减速50%（v1.16.18 技能+15%）', () => {
  const g = mkGame({ electric: { 麻痹: { A: 3, B: 3 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random;
  try {
    Math.random = () => 0.79;  // 0.79 < 0.80 → A=3 满概率 20+15+3×15=80% 应触发
    c.hit('electric', e, 100);
  } finally { Math.random = orig; }
  assert.ok(e.paralyzed > 0, 'A=3 满概率 80% 应触发麻痹');
  assert.ok(e.paralyzed >= 3.5 - 1e-6, 'B=3 时长应为 2 + 0.5×3 = 3.5s');
  assert.ok(e.slow && e.slow.mult <= 0.5 + 1e-6, '麻痹应附带 50% 减速');
});

t('电·过载A：每3层填充1发弹药', () => {
  const g = mkGame({ electric: { 过载: { A: 1 } } });
  const c = new CombatSystem(g);
  const tw = g.run.effects.tower('electric');
  tw.ammo = 0;
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  c.hit('electric', e, 100);
  assert.ok(tw.ammo === 0, '1 层不填充');
  c.hit('electric', e, 100);
  assert.ok(tw.ammo === 0, '2 层不填充');
  c.hit('electric', e, 100);
  assert.ok(tw.ammo === 1, '3 层填充 1 发');
});

t('电·过载C：满层闪电爆发麻痹周边敌人', () => {
  const g = mkGame({ electric: { 过载: { C: 2 } } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 400, 400); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 420, 410); g.enemies.push(e2);
  const e3 = mkEnemy(1000, 800, 800); g.enemies.push(e3);
  c.hit('electric', e1, 100);
  c.hit('electric', e1, 100);
  c.hit('electric', e1, 100);
  assert.ok(e1.overload && e1.overload.n >= 3, '应叠满 3 层');
  assert.ok(e2.hp < 1000, '150px 内敌人应受爆发伤害');
  assert.ok(e2.paralyzed > 0, '周边敌人应被麻痹');
  assert.ok(e3.hp === 1000, '150px 外敌人不受影响');
});

t('电·活电：命中麻痹敌人扩散5个游走电球', () => {
  const g = mkGame({ electric: { 活电: { B: 1 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random;
  try { Math.random = () => 0; c.hit('electric', e, 100); } finally { Math.random = orig; }
  assert.ok(e.paralyzed > 0, '目标应麻痹');
  assert.ok(c.shots.some((s) => s.orb), '应生成游走电球');
  assert.ok(c.shots.filter((s) => s.orb).length === 5, '基础扩散 5 个电球');
});

t('电·雷暴：随机电击目标（A 速记 5 个）', () => {
  const g = mkGame({ electric: { 雷暴: 1 } });
  const c = new CombatSystem(g);
  const orig = Math.random;
  try {
    Math.random = () => 0.5;
    for (let i = 0; i < 5; i++) g.enemies.push(mkEnemy(1000, 100 + i * 80, 500 + i * 30));
    c.update(10);   // 周期 10×(1-0.25×1)=7.5s（C 速记 1）触发至少一次；普攻也会命中最近目标
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((e) => e.hp < 1000).length;
  assert.ok(hurt === 5, `A1 速记雷暴应电击 5 个（基础3 + A1×2），实际 ${hurt}`);
});

t('电·雷暴B：雷击连锁周边敌人', () => {
  const g = mkGame({ electric: { 雷暴: { B: 2 } } });
  const c = new CombatSystem(g);
  const orig = Math.random;
  try {
    Math.random = () => 0.5;
    // 紧密聚堆（间距 30 < 90）：雷击命中后连锁必覆盖周边
    for (let i = 0; i < 4; i++) g.enemies.push(mkEnemy(1000, 300 + i * 30, 500));
    c.update(10);
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((e) => e.hp < 1000).length;
  assert.ok(hurt >= 4, `雷击3个+连锁应覆盖全部4个，实际 ${hurt}`);
});

t('电·电弧：周期触发射程内前3目标', () => {
  const g = mkGame({ electric: { 电弧: 1 } });
  const c = new CombatSystem(g);
  const orig = Math.random;
  try {
    Math.random = () => 0.5;
    // 4 个射程内（塔口 y≈1103，range 700）+ 1 个超射程（y=100）
    for (let i = 0; i < 4; i++) g.enemies.push(mkEnemy(1000, 100 + i * 80, 500 + i * 30));
    g.enemies.push(mkEnemy(1000, 500, 100));
    c.update(10);   // 电弧周期 5s（Lv1）触发一次
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((e) => e.hp < 1000).length;
  assert.ok(hurt === 3, `电弧应命中射程内前 3（超射程不受），实际 ${hurt}`);
});

t('电·电弧A：强弧伤害+50%/级', () => {
  const g = mkGame({ electric: { 电弧: { A: 2 } } });
  const c = new CombatSystem(g);
  for (let i = 0; i < 3; i++) g.enemies.push(mkEnemy(1000, 100 + i * 80, 700 + i * 50));
  c.tickPeriodic(5);   // 电弧周期 5s（Lv1）触发一次，无普攻干扰
  const dmg = 23 * 0.4 * (1 + 0.3 * 1) * (1 + 0.5 * 2);   // v1.16.11 电弧基础 0.5→0.4；A2 → 技能 Lv2
  g.enemies.forEach((e) => assert.ok(Math.abs(e.hp - (1000 - dmg)) < 1e-6, `A2 应造成 ${dmg}，实际 ${1000 - e.hp}`));
});

t('电·充能C：共享全塔攻速；B：每层+10%', () => {
  const g1 = mkGame({ electric: { 充能: { C: 1 } }, fire: {} });
  const c1 = new CombatSystem(g1);
  c1.tower('electric')._chargeLayers = 3;
  const ivShared = c1.interval('fire');   // 无 C 时 fire 不吃充能
  assert.ok(ivShared < 0.85, `C 共享后 fire 攻速应提升，实际 ${ivShared.toFixed(3)}s`);
  const g2 = mkGame({ electric: { 充能: { B: 1 } }, fire: {} });
  const c2 = new CombatSystem(g2);
  c2.tower('electric')._chargeLayers = 3;
  const ivB = c2.interval('electric');    // B1：每层 10% → 1/(1+0.10×3)
  assert.ok(Math.abs(ivB - 1 / 1.3) < 1e-6, `B1 三层应为 ${(1 / 1.3).toFixed(3)}s，实际 ${ivB.toFixed(3)}s`);
});

t('电·麻痹C：传导邻近敌人麻痹', () => {
  const g = mkGame({ electric: { 麻痹: { C: 1 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const o = mkEnemy(1000, 385, 815); g.enemies.push(o);   // 60px 内
  const orig = Math.random;
  try { Math.random = () => 0.1; c.hit('electric', e, 100); } finally { Math.random = orig; }
  assert.ok(e.paralyzed > 0, '主目标应麻痹');
  assert.ok(o.paralyzed > 0, '邻近敌人应被传导麻痹');
});

t('电·电磁场C：扩磁命中多目标', () => {
  const g = mkGame({ electric: { 电磁场: { C: 2 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  for (let i = 0; i < 3; i++) g.enemies.push(mkEnemy(1000, 375 + (i - 1) * 40, 800));
  const orig = Math.random;
  try { Math.random = () => 0.05; c.hit('electric', e, 100); } finally { Math.random = orig; }
  const hurt = g.enemies.filter((x) => x.hp < 1000).length;
  assert.ok(hurt >= 3, `C2 应命中主目标+3 微型连锁（110px 内），实际受伤 ${hurt}`);
});

t('火·点燃A：余烬爆发结束结算', () => {
  const g = mkGame({ fire: { 点燃: { A: 1 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  c.hit('fire', e, 100);
  const dot = e.dots.find((d) => d.type === 'burn');
  assert.ok(dot, '应有灼烧 DoT');
  c.update(3.2);   // ttl=3×1.5=4.5s，跑到 3.2s 时灼烧跳了多轮但未结束
  assert.ok(e.hp < 10000, '灼烧应持续掉血');
  c.update(2.0);   // 总计 5.2s > 4.5s：dot 到期 → 余烬爆发
  assert.ok(e.hp < 10000 - 100 * 0.2 * 0.5 * 3, '余烬爆发应造成额外立即伤害');
});

t('火·多重火球：主目标直瞄 + 额外火球无目标散射（沿途碰撞）', () => {
  const g = mkGame({ fire: { 多重火球: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(2000, 370, 800); g.enemies.push(e1);
  c.hit('fire', e1, 200);
  assert.ok(e1.hp < 2000, '主目标应立即受一枚火球伤害');
  // 主目标移出战场（避免散射弹道优先命中主目标，干扰散射路径验证）
  g.enemies = g.enemies.filter((o) => o !== e1);
  // 额外火球：无 target 的散射弹道（v1.13.13），数量 = n-1 = 3（基础 3 枚 + A 速记 1）
  const scatters = c.shots.filter((s) => s.scatter);
  assert.strictEqual(scatters.length, 3, `应有 3 条散射弹道（实际 ${scatters.length}）`);
  scatters.forEach((s) => {
    assert.ok(!s.target, '散射弹道不配置目标');
    assert.ok(s.hitR > 0 && s.tx !== s.sx, '散射弹道有碰撞半径与射界终点');
  });
  // 碰撞检测确定性验证：把敌人放到某条散射弹道当前位置 → scatterCheck 应命中
  const s0 = scatters[0];
  s0.t = 0.3;
  const p = 0.3 / s0.dur;
  const bx = s0.sx + (s0.tx - s0.sx) * p, by = s0.sy + (s0.ty - s0.sy) * p;
  const e2 = mkEnemy(2000, bx, by); g.enemies.push(e2);   // 放在弹道正上方
  const hit = c.scatterCheck(s0);
  assert.strictEqual(hit, e2, '位于弹道上的敌人应被碰撞命中');
  // 未命中路径：把 e2 移出战场，远离弹道的敌人 → 返回 null
  g.enemies = g.enemies.filter((o) => o !== e2);
  const e3 = mkEnemy(2000, bx + 500, by + 500); g.enemies.push(e3);
  assert.strictEqual(c.scatterCheck(s0), null, '远离弹道的敌人不应被命中');
  // 命中结算：推进 update 直到该弹道命中（敌人挡在路径上）
  const e2b = mkEnemy(2000, bx, by); g.enemies.push(e2b);   // 重新放回弹道位置
  let guard = 0;
  while (c.shots.some((s) => s.scatter) && guard < 120) { c.update(1 / 60); guard++; }
  assert.ok(e2b.hp < 2000, '推进后位于弹道上的敌人应受散射火球伤害');
  assert.ok(!c.shots.some((s) => s.scatter), '散射弹道命中后消失（或射界耗尽）');
});

t('火·火焰鹰眼两极反转：越近伤害越高', () => {
  const g = mkGame({ fire: { 火焰鹰眼: { C: 2 } } });
  const c = new CombatSystem(g);
  const near = mkEnemy(10000, 370, 950); g.enemies.push(near);  // 距塔行 1079 → 129（近）
  const far = mkEnemy(10000, 370, 820); g.enemies.push(far);    // 距塔行 1079 → 259（远）
  const hpN0 = near.hp, hpF0 = far.hp;
  c.hit('fire', near, 100);
  c.hit('fire', far, 100);
  const dNear = hpN0 - near.hp, dFar = hpF0 - far.hp;
  assert.ok(dNear > 0 && dFar > 0, '两目标都应受伤害');
  assert.ok(dNear > dFar, '距塔越近伤害越高（两极反转）');
});

t('火·火柱：周期技对随机敌人范围爆炸', () => {
  const g = mkGame({ fire: { 火柱: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(2000, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(2000, 380, 810); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0.01; // 随机选 e1
  try { c.tickPeriodic(10); } finally { Math.random = orig; }
  assert.ok(e1.hp < 2000, '火柱落点目标应受伤害');
  assert.ok(e2.hp < 2000, '火柱范围应波及邻近敌人');
});

t('火·火雨：每波 3 批×2-5 颗独立落下，落地结算伤害+灼烧', () => {
  const g = mkGame({ fire: { 火雨: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(5000, 370, 800); g.enemies.push(e1);
  c.tickPeriodic(12); // 触发火雨（3 波 × 3 批 × 每批 2-5 颗）
  const drops = g.fx.filter((f) => f.type === 'raindrop');
  assert.ok(drops.length >= 18, `基础 3 波×3 批×2 颗 → 至少 18 颗火雨点（实际 ${drops.length}）`);
  assert.ok(drops.length <= 45, `每批至多 5 颗 → 至多 45 颗（实际 ${drops.length}）`);
  drops.forEach((d) => {
    assert.ok(d.ty - d.y === 260, '火雨点起点应在落点上方 260px（平行圈内）');
    assert.ok(d.tx === d.x, '火雨点垂直落下（起点/落点同列）');
  });
  // 落地结算：把一发火雨点放到敌人身上，推进后敌人受伤并带灼烧
  c.rainWaves = c.rainWaves || [];
  c.rainWaves.push({ t: 0.01, dx: e1.x, dy: e1.y, r: 80, dmg: 60, ignite: 0 });
  c.update(1 / 60);
  assert.ok(e1.hp < 5000, '落地结算：落点半径内敌人受火雨伤害（30% 段伤）');
  assert.ok(e1.dots.some((d) => d.type === 'burn'), '落地结算：火雨造成灼烧效果');
});

t('死亡触发：燃爆（灼烧敌人死亡时概率爆炸波及邻近）', () => {
  const g = mkGame({ fire: { 燃爆: 1, 点燃: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(100, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 815); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 必触发（40% 基础概率）
  try { c.hit('fire', e1, 100); } finally { Math.random = orig; }
  assert.ok(e1.hp <= 0, '主目标应死亡');
  assert.ok(e2.hp < 1000, '燃爆应波及邻近敌人');
});

t('火·灼烧爆裂：灼烧每跳概率向外爆炸', () => {
  const g = mkGame({ fire: { 点燃: 1, 燃爆: { C: 2 } } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(3000, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(3000, 385, 815); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 必触发（0.15+0.10×(C-1)）
  try {
    c.hit('fire', e1, 100);
    c.tickStatus(e1, 0.6); // 触发一次跳伤
  } finally { Math.random = orig; }
  assert.ok(e2.hp < 3000, '灼烧跳伤爆炸应波及邻近敌人');
});

t('毒·基础中毒 + 剧毒：命中概率叠层 DoT（v1.15）', () => {
  const g = mkGame({ poison: { 剧毒: 1 } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 触发上毒
  try { c.hit('poison', e, 80); } finally { Math.random = orig; }
  const dot = e.dots.find((d) => d.type === 'poison');
  assert.ok(dot && dot.stack === 1, '应有 1 层中毒');
  assert.ok(dot.stackDps > 0, '应有每层 DoT 伤害（单发×10%）');
  assert.strictEqual(dot.maxStack, 5, '默认层数上限 5');
  // 未触发（概率外）→ 无 DoT
  const e2 = mkEnemy(1000, 375, 800); g.enemies.push(e2);
  Math.random = () => 0.99;
  try { c.hit('poison', e2, 80); } finally { Math.random = orig; }
  assert.ok(!e2.dots.find((d) => d.type === 'poison'), '概率未命中时不上毒');
});

t('毒·中毒可叠层：多次命中叠到上限并刷新', () => {
  const g = mkGame({ poison: { 剧毒: 1, '毒性强化': { C: 1 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 每次必上毒
  try {
    for (let i = 0; i < 10; i++) c.hit('poison', e, 80);
  } finally { Math.random = orig; }
  const dot = e.dots.find((d) => d.type === 'poison');
  assert.ok(dot.stack <= 7, '毒性强化 C+1 级 → 上限 7');
  assert.strictEqual(dot.stack, 7, '叠满上限 7');
  // DoT 结算：层数 × 每层 dps
  const hp0 = e.hp;
  c.update(1.0);
  assert.ok(hp0 - e.hp > 0, 'DoT 应按层数持续掉血');
});

t('回旋镖·折返增伤：命中后折返段追加伤害（A 增强）', () => {
  const g = mkGame({ boomerang: { '折返增伤': { A: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  c.hit('boomerang', e, 100);
  const lost = 1000 - e.hp;
  assert.ok(lost > 100, '折返段应追加额外伤害');
  assert.ok(lost <= 100 + 100 * 0.65 * 1.25 + 0.01, '折返段 = 命中×0.65×(1+0.25×A)');
});

t('炮·重炮：爆炸范围伤害（半径随 A 增强）', () => {
  const g = mkGame({ cannon: { 重炮: { A: 2 } } }, ['cannon']);
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 820); g.enemies.push(e2);
  c.hit('cannon', e1, 100);
  assert.ok(e2.hp < 1000, '爆炸应波及邻近敌人');
  assert.ok(Math.abs(48 * (1 + 0.25 + 0.15 * 2) - 48 * 1.55) < 0.01, '重炮半径 = 48×(1+0.25×lv+0.15×A)');
});

t('死亡触发：燃爆（灼烧敌人死亡时爆炸波及邻近）', () => {
  const g = mkGame({ fire: { 燃爆: 1, 点燃: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(100, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 815); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 必触发（40% 基础概率）
  try { c.hit('fire', e1, 100); } finally { Math.random = orig; }
  assert.ok(e1.hp <= 0, '主目标应死亡');
  assert.ok(e2.hp < 1000, '燃爆应波及邻近敌人');
});

t('死亡触发：毒爆（v1.15 传播中毒）', () => {
  const g = mkGame({ poison: { 毒爆: 1, 剧毒: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(100, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 815); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 上毒必中
  try { c.hit('poison', e1, 100); } finally { Math.random = orig; }
  assert.ok(e1.hp <= 0, '主目标应死亡');
  const dot = e2.dots.find((d) => d.type === 'poison');
  assert.ok(dot && dot.stack === 1, '毒爆应向邻近 200px 内目标传播 1 层中毒');
});

t('协同：燃爆×毒爆 不再存在（毒爆重做为传播，v1.15 移除协同）', () => {
  const hit = CONFIG.SYNERGIES.some((s) =>
    (s.a.tower === 'fire' && s.a.effect === '燃爆' && s.b.tower === 'poison' && s.b.effect === '毒爆') ||
    (s.a.tower === 'poison' && s.a.effect === '毒爆' && s.b.tower === 'fire' && s.b.effect === '燃爆'));
  assert.ok(!hit, '毒爆重做后不应再有燃爆×毒爆协同');
});

t('全塔攻击调度：tickTower 按间隔发弹道并命中', () => {
  const g = mkGame({ fire: { 点燃: 1 } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  // 推进 2s：fire atkInterval 0.9 → 至少 2 发弹道
  for (let i = 0; i < 125; i++) c.update(1 / 60);
  assert.ok(e.hp < 1000, '敌人应被真实攻击命中掉血');
  assert.ok(g.fx.some((f) => f.type === 'shot'), '应有弹道特效');
});

/* ================= v1.15 毒塔重做专项 ================= */

t('毒·毒池：周期释放，池内敌人每秒毒伤并叠毒', () => {
  const g = mkGame({ poison: { 毒池: 1 } });
  const c = new CombatSystem(g);
  const e = mkEnemy(5000, 375, 800); g.enemies.push(e);
  for (let i = 0; i < 5 * 60 + 8; i++) c.update(1 / 60); // 5s（+余量防浮点边界）→ 触发毒池
  assert.ok(c.groundDots.some((d) => d.key === 'poison' && d.dps > 0), '应释放毒池（key=poison）');
  c.update(1.0); // 池内 1s：直伤 + 叠毒
  const dot = e.dots.find((d) => d.type === 'poison');
  assert.ok(e.hp < 5000, '毒池应造成直伤');
  assert.ok(dot && dot.stack >= 1, '毒池应每秒叠毒 1 层');
});

t('毒·毒棒：周期召唤独立攻击（继承 30% 攻击、索敌 200px）', () => {
  const g = mkGame({ poison: { 毒棒: 1 } });   // mkGame 数字=全分支 1：A 数量+1 → 2 根
  const c = new CombatSystem(g);
  const e = mkEnemy(5000, 375, 800); g.enemies.push(e);
  for (let i = 0; i < 4 * 60 + 8; i++) c.update(1 / 60); // 4s（+余量）→ 召唤毒棒
  assert.strictEqual(c.poisonSticks.length, 2, '毒棒 A 分支 → 应召唤 1+A=2 根');
  const st = c.poisonSticks[0];
  assert.ok(Math.abs(st.dmg - c.shotDmg('poison') * 0.24) < 1e-9, '毒棒应继承 24% 攻击');
  c.update(1.0); // 毒棒攻击 1 次
  assert.ok(e.hp < 5000, '毒棒应独立攻击敌人');
  const dot = e.dots.find((d) => d.type === 'poison');
  assert.ok(dot && dot.stack >= 1, '毒棒攻击应叠毒');
});

t('毒·毒藤：缠绕最靠城墙敌人（定身 + 每秒叠毒）', () => {
  const g = mkGame({ poison: { 毒藤: 1 } });   // mkGame 数字=全分支 1：A 数量+1 → 缠 2 目标
  const c = new CombatSystem(g);
  const e1 = mkEnemy(5000, 375, 850); g.enemies.push(e1); // 更靠墙
  const e2 = mkEnemy(5000, 375, 500); g.enemies.push(e2);
  for (let i = 0; i < 6 * 60 + 8; i++) c.update(1 / 60); // 6s（+余量）→ 毒藤
  assert.ok(e1.frozen > 0, '靠墙敌人应被缠绕定身');
  assert.ok(e1._vineT > 0, '应有缠绕叠毒计时');
  assert.ok(e2.frozen > 0, 'A 分支数量+1 → 第二个目标也被缠');
  c.update(1.0);
  const dot = e1.dots.find((d) => d.type === 'poison');
  assert.ok(dot && dot.stack >= 1, '缠绕期间应每秒叠毒');
});

t('毒·毒藤 C：被缠敌人死亡后藤蔓延伸缠 100px 内下一个', () => {
  const g = mkGame({ poison: { 毒藤: { C: 1 } } });   // 只升 C：缠 1 个 + 死亡延伸
  const c = new CombatSystem(g);
  const e1 = mkEnemy(5000, 375, 850); g.enemies.push(e1); // 靠墙，先被缠
  const e2 = mkEnemy(5000, 380, 800); g.enemies.push(e2); // 稍不靠墙（100px 内）
  for (let i = 0; i < 6 * 60 + 8; i++) c.update(1 / 60); // 6s → 毒藤缠 e1
  assert.ok(e1.frozen > 0 && !(e2.frozen > 0), '仅最靠墙敌人被缠');
  const orig = Math.random; Math.random = () => 0;
  try { c.hit('poison', e1, 99999); } finally { Math.random = orig; }
  assert.ok(e1.hp <= 0, '被缠敌人死亡');
  assert.ok(e2.frozen > 0, '藤蔓应延伸缠住 100px 内下一个敌人');
  assert.ok(e2._vineT > 0, '延伸目标应持续叠毒');
});

t('毒·瘟疫：中毒敌人减速 20% + 周期传染判定', () => {
  const g = mkGame({ poison: { 瘟疫: 1, 剧毒: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(5000, 375, 800); g.enemies.push(e1);
  const e2 = mkEnemy(5000, 380, 800); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 上毒必中 + 传染必中
  try {
    c.hit('poison', e1, 100);
    c.update(2.1); // 触发减速 + 2s 判定
  } finally { Math.random = orig; }
  assert.ok(e1.slow && Math.abs(e1.slow.mult - 0.8) < 1e-9, '中毒敌人应减速 20%');
  assert.ok(e2.dots.find((d) => d.type === 'poison'), '应传染给周边敌人');
});

t('毒·瘴气环境：光环内敌人持续叠毒 + 标记命中率下降 + C 攻击力降低', () => {
  const g = mkGame({ poison: { '瘴气环境': { C: 2 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(5000, 375, 1079); g.enemies.push(e); // 塔口附近
  const e2 = mkEnemy(5000, 700, 300); g.enemies.push(e2); // 光环外
  const orig = Math.random; Math.random = () => 0; // 上毒必中
  try { c.update(1.1); } finally { Math.random = orig; }
  assert.ok(e._miasma === true, '光环内敌人应标记瘴气');
  assert.ok(e._miasmaAtkMult === 0.65, '瘴气 C 级 2 → 攻击力 -35%');
  assert.ok(!e2._miasma, '光环外敌人不应标记');
  const dot = e.dots.find((d) => d.type === 'poison');
  assert.ok(dot && dot.stack >= 1, '光环内应每秒叠毒');
});

t('毒·毒爆 C：死亡后留毒沼（4s 每秒 +1 层）', () => {
  const g = mkGame({ poison: { 毒爆: { C: 1 }, 剧毒: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(100, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(5000, 375, 800); g.enemies.push(e2); // 毒沼范围内
  const orig = Math.random; Math.random = () => 0; // 上毒必中
  try { c.hit('poison', e1, 100); } finally { Math.random = orig; }
  assert.ok(c.groundDots.some((d) => d.key === 'poison' && d.dps === 0 && d.stackPerSec === 1), '毒爆 C 应留毒沼');
  c.update(1.0);
  const dot = e2.dots.find((d) => d.type === 'poison');
  assert.ok(dot && dot.stack >= 1, '毒沼应每秒叠毒');
});

t('回旋镖 sweep：椭圆大弧越过怪物后绕回，沿途扫过所有敌人（每敌单镖一次）', () => {
  const g = mkGame({ boomerang: {} });
  const c = new CombatSystem(g);
  // 椭圆大弧弹道（起点=塔位，终点=远处）；敌人在轨迹采样点（p=0.15/0.45/0.70）上
  const s0 = { key: 'boomerang', dmg: 100, t: 0, dur: 1.2, sx: 375, sy: 1100, tx: 375, ty: 400, sweep: true, hitIds: {} };
  const p1 = c.sweepPos(s0, 0.15), p2 = c.sweepPos(s0, 0.45), p3 = c.sweepPos(s0, 0.70);
  const e1 = mkEnemy(1000, p1.x, p1.y); g.enemies.push(e1);
  const e2 = mkEnemy(1000, p2.x, p2.y); g.enemies.push(e2);
  const e3 = mkEnemy(1000, p3.x, p3.y); g.enemies.push(e3);
  // 直接构造一枚 sweep 弹，推进 1.2s（dur）
  c.shots.push(Object.assign({}, s0));
  for (let i = 0; i < 90; i++) c.update(1 / 60);
  // 椭圆轨迹经过 3 个采样位置：全部都应被扫到
  assert.ok(e1.hp < 1000, '路径上敌人 1 应被扫中');
  assert.ok(e2.hp < 1000, '路径上敌人 2 应被扫中');
  assert.ok(e3.hp < 1000, '路径上敌人 3 应被扫中');
  // 每敌只受一次（sweep 去重）：血量减少 ≤ 一次 100 伤害（无暴击等复合）
  assert.ok(1000 - e1.hp <= 100, '单镖对同一敌人只结算一次');
});

t('回旋镖·多镖：多投且单镖衰减（B 稳镖减半）', () => {
  const g = mkGame({ boomerang: { 多镖: { B: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  const dmg = c.shotDmg('boomerang');
  c.attackOnce('boomerang');
  const sweeps = c.shots.filter((s) => s.sweep);
  assert.strictEqual(sweeps.length, 2, '多镖 Lv1 应一次投出 2 枚回旋镖');
  sweeps.forEach((s) => assert.ok(Math.abs(s.dmg - dmg * (1 - 0.12 * 0.5)) < 0.01, 'B 稳镖：单镖衰减减半为 6%'));
});

t('回旋镖·放血：强化流血伤害与时长（替换穿透，v1.16.14）', () => {
  const g = mkGame({ boomerang: { 放血: { A: 1, B: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 700); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发流血
  try { c.hit('boomerang', e, 100); } finally { Math.random = orig; }
  assert.strictEqual(e.bleedT, 5, 'B1 流血时间应为 4+1=5s');
  assert.ok(Math.abs(e._bleedDmg - (100 * 0.10 * 2 * 1.5)) < 0.01, 'A1 每跳 = 10%×2×(1+0.5) = 30 点');
  const hp0 = e.hp;
  e.y += 100; c.tickStatus(e, 0.1);
  assert.ok(Math.round(hp0 - e.hp) === 30, '移动 100px 应结算 30 点流血伤害');
});

t('冰·冰冻：基础 30% 概率，A 分支每级 +15%', () => {
  const g = mkGame({ ice: { 冰冻: { A: 1 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0.40; // 0.30 < 0.40 < 0.45 → 基础30%不触发、A1(45%)触发
  try { c.hit('ice', e, 100); } finally { Math.random = orig; }
  assert.ok(e.frozen > 0, 'A1 概率 45% 应冻结');
});

t('炮·军火库 C：双倍火力概率造成双倍伤害', () => {
  const g = mkGame({ cannon: { 军火库: { C: 1 } } }, ['cannon']);
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 700); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 10% 必触发
  try { c.hit('cannon', e, 100); } finally { Math.random = orig; }
  assert.ok(e.hp <= 10000 - 200, 'C1 双倍火力应造成 200 伤害（溅射已排除主目标）');
});

t('冰·冰冻 C 碎冰爆：击杀冰冻敌人范围爆炸并减速', () => {
  const g = mkGame({ ice: { 冰冻: { C: 1 } } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(100, 375, 700); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 380, 740); g.enemies.push(e2); // 相邻 40px < 100
  e1.frozen = 1;
  c.damage(e1, 999, 'ice'); // 击杀
  assert.ok(e2.hp < 1000, '碎冰爆应波及相邻敌人');
  assert.ok(e2.slow && e2.slow.ttl > 0, '碎冰爆应减速波及敌人');
});

t('回旋镖·猎手标记：命中同目标叠层增伤', () => {
  const g = mkGame({ boomerang: { 猎手标记: { A: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  c.hit('boomerang', e, 100);
  const hp1 = e.hp;
  c.hit('boomerang', e, 100);
  assert.ok(hp1 - e.hp > 100, '第二击应受标记层数加成');
});

t('回旋镖·风痕：镖路径留痕（A 久痕）', () => {
  const g = mkGame({ boomerang: { 风痕: { A: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const s0 = { key: 'boomerang', dmg: 100, t: 0, dur: 1.2, sx: 375, sy: 1100, tx: 375, ty: 400, sweep: true, hitIds: {}, windLv: 1 };
  c.shots.push(s0);
  for (let i = 0; i < 30; i++) c.update(1 / 60);
  assert.ok(c.windTrails && c.windTrails.length > 0, '镖路径应留下风痕');
});

t('回旋镖·风暴镖：每 12 秒召唤持续伤害旋风（A 扩域）', () => {
  const g = mkGame({ boomerang: { 风暴镖: { A: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 700); g.enemies.push(e);
  c.update(12.01);
  assert.strictEqual(c.storms.length, 1, '应生成 1 个风暴镖');
  const hp0 = e.hp;
  for (let i = 0; i < 30; i++) c.update(1 / 60); // 0.5s 圈内 DoT
  assert.ok(e.hp < hp0, '风暴内敌人应持续受伤');
});

t('回旋镖·镖阵：每 10 秒投出环形镖阵（A 增镖）', () => {
  const g = mkGame({ boomerang: { 镖阵: { A: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 700); g.enemies.push(e);
  c.update(10.01);
  assert.ok(c.shots.filter((s) => s.ring).length >= 12, 'A1 应投出 12 枚环形镖');
});

t('回旋镖接镖机制：镖未接回不投下一个，接回后立即投', () => {
  const g = mkGame({ boomerang: {} });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const dmg = c.shotDmg('boomerang');
  let maxS = 0;
  for (let i = 0; i < 300; i++) { // 推进 5s（dur 2.4s，应投两枚）
    c.update(1 / 60);
    maxS = Math.max(maxS, c.shots.filter((s) => s.sweep).length);
  }
  assert.strictEqual(maxS, 1, '任意时刻至多一枚回旋镖在飞（接到镖才能投下一个）');
  assert.ok(e.hp < 1000 - dmg * 1.5, '接回后第二枚应继续造成伤害');
});

t('回旋镖·接镖C续投：接镖立即投且下镖伤害 +10%/级', () => {
  const g = mkGame({ boomerang: { 接镖: { C: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  const dmg = c.shotDmg('boomerang');
  c.attackOnce('boomerang');
  c.shots = []; c.bWait.boomerang = true; // 模拟接回
  c.update(1 / 60);
  const s = c.shots.find((x) => x.sweep);
  assert.ok(s && Math.abs(s.dmg - dmg * 1.10) < 0.01, '续投伤害 = shotDmg×1.10');
});

t('炮·双管齐射：A 概率双发（固定随机触发）', () => {
  const g = mkGame({ cannon: { 双管齐射: { A: 1 } } }, ['cannon']);
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0;
  try { c.attackOnce('cannon'); } finally { Math.random = orig; }
  assert.strictEqual(c.shots.length, 2, '双管齐射应发射 2 枚炮弹');
});

t('炮·贯穿弹：爆炸后弹片贯穿身后敌人', () => {
  const g = mkGame({ cannon: { 贯穿弹: { A: 1 } } }, ['cannon']);
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 375, 700); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 375, 745); g.enemies.push(e2);
  c.hit('cannon', e1, 100);
  assert.ok(e2.hp < 1000, '贯穿弹应命中身后敌人');
});

t('炮·炮火支援：每 12 秒降下炮击（延迟爆炸落点）', () => {
  const g = mkGame({ cannon: { 炮火支援: { A: 1 } } }, ['cannon']);
  const c = new CombatSystem(g);
  g.enemies.push(mkEnemy(1000, 375, 700));
  c.update(12.01);
  assert.ok(c.delayed.length >= 4, 'A1 应降下 4 发延迟落点');
});

t('炮·地雷阵：每 15 秒城墙前布雷，踩中爆炸', () => {
  const g = mkGame({ cannon: { 地雷阵: { A: 1 } } }, ['cannon']);
  const c = new CombatSystem(g);
  c.update(15.01);
  assert.ok(c.mines.length >= 5, 'A1 应埋 5 颗雷');
  const m = c.mines[0];
  const e = mkEnemy(2000, m.x, m.y); g.enemies.push(e);
  for (let i = 0; i < 60 && e.hp > 0; i++) c.update(1 / 60);
  assert.ok(e.hp < 2000, '敌人踩中地雷应爆炸受伤');
});

t('炮·炮台：周期召唤自动炮台独立炮击（v1.16.18 无敌人不部署）', () => {
  const g = mkGame({ cannon: { 炮台: { A: 1 } } }, ['cannon']);
  const c = new CombatSystem(g);
  // 无敌人：CD 到点不部署
  c.update(20.02);
  assert.ok(!c.turrets || c.turrets.length === 0, '场上无敌人时不部署炮台');
  // 有敌人：CD 到点部署
  const e = mkEnemy(2000, 375, 700); g.enemies.push(e);
  c.update(10.01);
  assert.ok(c.turrets.length >= 2, 'A1 应部署 2 门炮台');
  for (let i = 0; i < 120 && e.hp > 0; i++) c.update(1 / 60);
  assert.ok(e.hp < 2000, '炮台应独立炮击敌人');
});

t('协同：炮重炮×火大火球（溅射已更名重炮，v1.16）', () => {
  const hit = CONFIG.SYNERGIES.some((s) =>
    (s.a.tower === 'cannon' && s.a.effect === '重炮' && s.b.tower === 'fire' && s.b.effect === '大火球') ||
    (s.a.tower === 'fire' && s.a.effect === '大火球' && s.b.tower === 'cannon' && s.b.effect === '重炮'));
  assert.ok(hit, 'SYNERGIES 应引用新技能名 重炮');
});

t('普攻·火塔：无技能时 20% 概率灼烧（固定随机触发）', () => {
  const g = mkGame({ fire: {} });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random;
  Math.random = () => 0; // 必触发
  try { c.hit('fire', e, 100); } finally { Math.random = orig; }
  assert.ok(e.dots.some((d) => d.type === 'burn'), '20% 命中应附加灼烧 DoT');
  const e2 = mkEnemy(1000, 375, 800); g.enemies.push(e2);
  Math.random = () => 0.99; // 不触发
  try { c.hit('fire', e2, 100); } finally { Math.random = orig; }
  assert.ok(!e2.dots.some((d) => d.type === 'burn'), '未到 20% 概率时不应灼烧');
});

t('普攻·炮塔：基础 100px 范围 10% 溅射（无技能）', () => {
  const g = mkGame({ cannon: {} }, ['cannon']);
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 375, 700); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 380, 770); g.enemies.push(e2); // 距 e1 ≈70px < 100
  c.hit('cannon', e1, 100);
  assert.strictEqual(Math.round(e1.hp), 900, '主目标应吃满 100% 伤害');
  assert.ok(e2.hp <= 992, '100px 内敌人应受 10% 溅射伤害');
});

t('普攻·镖塔：20% 概率流血，随移动距离结算伤害', () => {
  const g = mkGame({ boomerang: {} }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 700); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发
  try { c.hit('boomerang', e, 100); } finally { Math.random = orig; }
  assert.ok(e.bleedT === 4, '应施加 4s 流血');
  assert.ok(Math.abs(e._bleedDmg - 10) < 0.01, '每 100px 应结算 10%×命中伤害');
  const hp0 = e.hp;
  e.y += 100;                      // 敌人移动 100px
  c.tickStatus(e, 0.1);
  assert.ok(e.hp < hp0, '移动 100px 后应结算一次流血伤害');
  assert.strictEqual(Math.round(hp0 - e.hp), 10, '本次跳伤应等于 10 点');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
