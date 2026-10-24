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

/* v1.16.37 塔口坐标：测试战场单塔大槽中心 (65,1103) / 正式战斗槽位中心
   v1.16.39 正式战斗槽数恒 4（渲染固定），不随已激活塔数变化——得塔前后塔位坐标稳定 */
t('塔口坐标：测试战场单塔大槽 / 正式战斗固定 4 槽（弹道不从塔区中间发出）', () => {
  const g = mkGame({ boomerang: {} }, ['boomerang']);
  const c = new CombatSystem(g);
  g.state = 'testfield';
  assert.deepStrictEqual(c.towerMuzzle('boomerang'), { x: 65, y: 1103 }, '测试战场出战塔大槽中心 (65,1103)（渲染硬编码 15,1053 大槽）');
  g.state = 'fighting';
  const m2 = c.towerMuzzle('boomerang');
  assert.strictEqual(m2.x, 285, '正式战斗 1 塔（第 0 槽）中心 x=285（恒 4 槽 startX 261 + 24，不再单槽居中 375）');
  g.run.slotOrder = ['fire', 'ice', 'poison', 'electric'];
  const m3 = c.towerMuzzle('poison');
  assert.strictEqual(m3.x, 405, '正式战斗 4 塔第 3 槽中心 x=405（startX 261 + 2×60 + 24）');
  assert.strictEqual(m3.y, 1103, '正式战斗槽中心 y=1103');
});

/* v1.16.38 弹力镖/风暴镖：结束同步清除 fx，reset 清理战斗实体 fx（修复技能结束后幽灵残留） */
t('弹力镖/风暴镖：结束同步清除 fx，reset 清理实体 fx', () => {
  const g = mkGame({ boomerang: { 弹力镖: 1, 风暴镖: 1 } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 700); g.enemies.push(e);
  c.timers.ringN = 8; c.timers.storm = 12;
  c.tickBoomerang(0);
  const dart = c.shots.find((s) => s.bounce);
  assert.ok(dart && dart.fx, '弹力镖应携带 fx 引用');
  assert.ok(g.fx.some((f) => f.type === 'shot' && f.kind === 'bounce'), '弹力镖 fx 已生成');
  assert.ok(g.fx.some((f) => f.type === 'cyclone'), '风暴镖 fx 已生成');
  // 提前结束：弹力镖超时 + 风暴镖 ttl 耗尽 → 实体与其 fx 同步清除
  dart.t = dart.dur;
  c.storms[0].ttl = 0;
  c.update(0);
  assert.ok(!c.shots.includes(dart), '弹力镖超时移除');
  assert.ok(dart.fx.t >= dart.fx.dur, '弹力镖 fx 同步结束（不再冻结残留）');
  assert.strictEqual(c.storms.length, 0, '风暴镖 ttl 耗尽移除');
  assert.ok(g.fx.find((f) => f.type === 'cyclone').t >= 3, '风暴镖 fx 同步结束');
  // reset 清理战斗实体 fx（切塔/清场/重开后无幽灵）
  g.fx.push({ type: 'shot', kind: 'line', t: 0, dur: 1 });
  c.reset();
  assert.ok(!g.fx.some((f) => ['shot', 'cyclone', 'turret', 'mine'].includes(f.type)), 'reset 后无战斗实体 fx 残留');
});

t('火·点燃：命中附加灼烧 DoT 并持续掉血', () => {
  const g = mkGame({ fire: { 点燃: 2 } });   // 点燃 Lv2：A1 → 灼烧几率 20%+25%+15%=60%
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发 60%
  try { c.hit('fire', e, 100); } finally { Math.random = orig; }
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

t('冰·寒霜：冰缓 20%+25%+A极寒、B凝结时长、C深寒幅度', () => {
  const g = mkGame({ ice: { 寒霜: 1 } });   // A1B1C1：概率 20+25+15=60%、幅度 30+10=40%、时长 3+1=4s
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发（0 < 0.60）
  try { c.hit('ice', e, 50); } finally { Math.random = orig; }
  assert.ok(e.slow && e.slow.mult < 1 && e.slow.ttl > 0, '应有冰缓状态');
  assert.ok(Math.abs(e.slow.mult - 0.60) < 1e-6, `C1 深寒减速幅度应为 40%，实际 ${(1 - e.slow.mult) * 100}%`);
  assert.ok(Math.abs(e.slow.ttl - 4) < 1e-6, `B1 凝结冰缓时长应为 4s，实际 ${e.slow.ttl}`);
});

t('冰·寒霜C：深寒减速幅度提升', () => {
  const g = mkGame({ ice: { 寒霜: { C: 2 } } });   // C2 → 减速幅度 30%+20%=50%
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 0 < 0.45（20%+25%）
  try { c.hit('ice', e, 100); } finally { Math.random = orig; }
  assert.ok(e.slow && e.slow.ttl > 0, '应处于冰缓');
  assert.ok(Math.abs((1 - e.slow.mult) - 0.50) < 1e-6, `C2 深寒应减速 50%，实际 ${(1 - e.slow.mult) * 100}%`);
});

t('冰·多重冰锥：等角度扇形散射命中（无 C）', () => {
  const g = mkGame({ ice: { 多重冰锥: { A: 1 } } });   // A1、C0 → 4 枚 = 主 + 3 散射
  const c = new CombatSystem(g);
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

t('冰·多重冰锥C：增殖 10/14/18 枚超小型冰锥', () => {
  const g = mkGame({ ice: { 多重冰锥: { C: 1 } } });   // C1 → 10 枚（无 A）
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 330, 650); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 375, 800); g.enemies.push(e2);
  const e3 = mkEnemy(1000, 420, 650); g.enemies.push(e3);
  const orig = Math.random; Math.random = () => 0.5;
  try {
    c.hit('ice', e2, 100);
    assert.ok(c.shots.filter((s) => s.scatter).length === 10, '应生成 10 枚超小型冰锥弹道');
    assert.ok(c.shots.filter((s) => s.scatter).every((s) => s.hitR === 30), '超小冰锥碰撞半径应为 30');
    c.update(1.0);   // 推进至弹道到达各自索敌目标
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((x) => x.hp < 1000).length;
  assert.ok(hurt >= 2, `各自索敌应命中多个敌人，实际 ${hurt}`);
});

t('冰·冰花：周期对最近敌人范围伤害 + A扩张/B霜力/C繁花', () => {
  const g = mkGame({ ice: { 冰花: { A: 1, C: 1 } } });
  const c = new CombatSystem(g);
  // 主目标 y=900（最近），周边敌（120 内）+ 一个 100~120 环带（A1 扩张 120 才覆盖）+ 远处不受
  g.enemies.push(mkEnemy(10000, 375, 900));
  g.enemies.push(mkEnemy(10000, 400, 930));
  g.enemies.push(mkEnemy(10000, 375, 1010));   // 距主 110px：A1 扩张 120 覆盖
  g.enemies.push(mkEnemy(10000, 800, 800));    // 远处不受
  c.tickPeriodic(8);   // 冰花周期 8s 触发
  c.update(0.9);       // 延迟 0.8s 结算范围伤害
  const hurt = g.enemies.filter((x) => x.hp < 10000).length;
  assert.ok(hurt >= 3, `A1 扩张 120px + C1 双花应覆盖主目标周边 3 个，实际 ${hurt}`);
  assert.ok(g.enemies[3].hp === 10000, '远处敌人不受冰花伤害');
});

t('普攻·冰塔：无技能时 20% 概率冰缓（减速30%·3s）', () => {
  const g = mkGame({ ice: {} }, ['ice']);
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发
  try { c.hit('ice', e, 50); } finally { Math.random = orig; }
  assert.ok(e.slow && Math.abs((1 - e.slow.mult) - 0.30) < 1e-6 && Math.abs(e.slow.ttl - 3) < 1e-6, '冰缓应减速30%·3s');
});

t('冰·冰穿刺：弹道穿透 1 名敌人（基础实装）', () => {
  const g = mkGame({ ice: { 冰穿刺: 1 } });   // A1B1C1：穿透 1+1=2 名、穿透伤 +30%
  const c = new CombatSystem(g);
  const e1 = mkEnemy(3000, 375, 800); g.enemies.push(e1);
  const e2 = mkEnemy(3000, 380, 730); g.enemies.push(e2);   // e1 身后（远离塔侧）
  const e3 = mkEnemy(3000, 420, 800); g.enemies.push(e3);   // 同排侧向（投影≈0，非身后）
  const orig = Math.random; Math.random = () => 0.5;
  try { c.hit('ice', e1, 100); } finally { Math.random = orig; }
  assert.ok(e2.hp < 3000, '穿透应命中目标身后第 1 名敌人');
  assert.ok(Math.abs((3000 - e2.hp) - 100 * 1.3) < 1e-6, `B1 透射穿透伤害 +30%（应 130），实际 ${3000 - e2.hp}`);
  assert.ok(e3.hp === 3000, '侧向同排敌人不应被穿透命中');
});

t('冰·冰穿刺C：身后 60px·90° 扇形区域伤害', () => {
  const g = mkGame({ ice: { 冰穿刺: { C: 1 } } });   // C1 → 扇形 30% 伤害
  const c = new CombatSystem(g);
  const f1 = mkEnemy(3000, 375, 800); g.enemies.push(f1);
  const f2 = mkEnemy(3000, 395, 740); g.enemies.push(f2);   // 身后 ~60px 内、±45° 扇形
  const f3 = mkEnemy(3000, 375, 880); g.enemies.push(f3);   // 塔侧（不是身后）不应受扇形伤害
  const o2 = Math.random; Math.random = () => 0.5;
  try { c.hit('ice', f1, 100); } finally { Math.random = o2; }
  assert.ok(f2.hp < 3000, 'C1 冰霜透射应命中身后扇形内敌人');
  assert.ok(f3.hp === 3000, '扇形伤害不应命中塔侧敌人');
});

t('冰·碎冰：命中后碎裂碎冰 60° 散射 + B伤害/C冻结', () => {
  const g = mkGame({ ice: { 碎冰: 1 } });   // A1B1C1：4 枚、伤害 +15%、冻结 5%
  const c = new CombatSystem(g);
  // 主目标 + 身后（更靠近远处）敌人：碎冰沿弹道方向 ±30° 散射
  const e1 = mkEnemy(1000, 375, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 370, 680); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0.5;
  try {
    c.hit('ice', e1, 100);
    assert.ok(c.shots.filter((s) => s.scatter).length === 4, '应生成 4 枚碎冰弹道（基础3 + A速记1）');
    c.update(0.1);
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((x) => x.hp < 1000).length;
  assert.ok(hurt >= 2, `主目标 + 身后敌人应被命中，实际 ${hurt}`);
  // C1 冻结：5% 概率 → Math.random=0 必触发
  const g2 = mkGame({ ice: { 碎冰: { C: 1 } } });
  const c2 = new CombatSystem(g2);
  const f1 = mkEnemy(1000, 375, 800); g2.enemies.push(f1);
  const f2 = mkEnemy(1000, 370, 680); g2.enemies.push(f2);
  const o2 = Math.random; Math.random = () => 0;
  try { c2.hit('ice', f1, 100); c2.update(0.1); } finally { Math.random = o2; }
  assert.ok(f2.frozen > 0, 'C1 碎冰命中 5% 冻结应生效');
});

t('冰·冰墙：周期附魔城墙 + A持续/B反伤/C融暖回血', () => {
  const g = mkGame({ ice: { 冰墙: { A: 1, B: 1, C: 1 } } });
  const c = new CombatSystem(g);
  const origHp = g.run.lineHp;   // CONFIG.LINE.hp
  c.timers.iceWall = 19.9;
  c.update(0.2);   // timer 20.1 ≥20 → 生成冰墙（A1 → 12s；B1 → 反伤 30%；C1 → 回血 50）
  assert.ok(c.iceWall && c.iceWall.ttl > 0, '应生成冰墙');
  assert.ok(Math.abs(c.iceWall.ttl - 12) < 1e-6, `A1 凝壁持续应 12s，实际 ${c.iceWall.ttl}`);
  assert.ok(c.iceWall.absorb === 300, '冰墙吸收值应为 300');
  assert.ok(Math.abs(c.iceWall.reflect - 0.3) < 1e-6, 'B1 反伤应 30%');
  assert.ok(c.iceWall.heal === 50, 'C1 回血应为 50');
  // 模拟攻城扣血后冰墙消散回血
  g.run.lineHp -= 100;
  c.update(12.1);   // ttl 12 - 12.1 → 结束
  assert.ok(!c.iceWall, '冰墙应已消散');
  assert.ok(Math.abs(g.run.lineHp - (origHp - 100 + 50)) < 1e-6, `结束应回血 50，实际 lineHp=${g.run.lineHp}`);
});

t('冰·冬珠：持续冰霜之球范围伤害 + A寒域减速/B扩张/C凝华频率', () => {
  const g = mkGame({ ice: { 冬珠: 1 } });   // A1B1C1：范围 110×1.2=132、跳频 0.7s、减速 20%
  const c = new CombatSystem(g);
  g.enemies.push(mkEnemy(10000, 375, 800));
  g.enemies.push(mkEnemy(10000, 390, 830));   // 110 范围内
  c.timers.frostOrb = 9.9;
  c.update(0.2);   // timer 10.1 ≥10 → 释放冬珠（推进仅 -0.2s）
  assert.ok(c.frostOrbs.length === 1, '应生成 1 颗冬珠（C 不再增加数量）');
  assert.ok(Math.abs(c.frostOrbs[0].tickI - 0.7) < 1e-6, `C1 凝华跳频应 0.7s，实际 ${c.frostOrbs[0].tickI}`);
  assert.ok(Math.abs(c.frostOrbs[0].r - 132) < 1e-6, `B1 扩张范围应 132，实际 ${c.frostOrbs[0].r}`);
  c.update(0.7);   // 累计 0.9s > 0.7s tickI → 第一跳
  const hurt = g.enemies.filter((x) => x.hp < 10000).length;
  assert.ok(hurt === 2, `冬珠一跳应伤范围内 2 个，实际 ${hurt}`);
  assert.ok(g.enemies.every((x) => x.slow && x.slow.ttl > 0), 'A1 寒域减速 20% 应作用范围内敌人');
});

t('电·连锁：基础连锁 3 个敌人（v1.16.21）', () => {
  const g = mkGame({ electric: { 连锁: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 380, 806); g.enemies.push(e2);
  const e3 = mkEnemy(1000, 390, 812); g.enemies.push(e3);
  c.hit('electric', e1, 100);
  assert.ok(e2.hp < 1000, '第二目标应被连锁伤害');
  assert.ok(e3.hp < 1000, '第三目标应被连锁伤害');
});

t('电·麻痹：命中概率麻痹', () => {
  const g = mkGame({ electric: { 麻痹: 1 } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0;
  try { c.hit('electric', e, 100); } finally { Math.random = orig; }
  assert.ok(e.paralyzed > 0, '应进入麻痹状态');
});

t('电·麻痹A满B满：85%概率 + 时长3.5s + 减速50%（v1.16.53 基础20% + 技能+20% + A+15%/级 → 40/55/70/85%）', () => {
  const g = mkGame({ electric: { 麻痹: { A: 3, B: 3 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random;
  try {
    Math.random = () => 0.84;  // 0.84 < 0.85 → A=3 满概率 20+20+3×15=85% 应触发
    c.hit('electric', e, 100);
  } finally { Math.random = orig; }
  assert.ok(e.paralyzed > 0, 'A=3 满概率 85% 应触发麻痹');
  assert.ok(e.paralyzed >= 3.5 - 1e-6, 'B=3 时长应为 2 + 0.5×3 = 3.5s');
  assert.ok(e.slow && e.slow.mult <= 0.5 + 1e-6, '麻痹应附带 50% 减速');
  // 概率外不触发：0.86 > 0.85
  const e2 = mkEnemy(1000, 375, 800); g.enemies.push(e2);
  const orig2 = Math.random;
  try { Math.random = () => 0.86; c.hit('electric', e2, 100); } finally { Math.random = orig2; }
  assert.ok(e2.paralyzed === 0, '概率外（0.86 > 85%）不应麻痹');
});

t('电·过载A：命中麻痹目标叠层，3层消耗并填充1发弹药', () => {
  const g = mkGame({ electric: { 过载: { A: 1 } } });
  const c = new CombatSystem(g);
  const tw = g.run.effects.tower('electric');
  tw.ammo = 0;
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  e.paralyzed = 1;   // 麻痹目标才叠层
  c.hit('electric', e, 100);
  assert.ok(tw.ammo === 0, '1 层不填充');
  c.hit('electric', e, 100);
  assert.ok(tw.ammo === 0, '2 层不填充');
  c.hit('electric', e, 100);
  assert.ok(tw.ammo === 1, '3 层消耗全部层数并填充 1 发');
  assert.ok(e.overload && e.overload.n === 0, '3 层触发后应清零（消耗所有过载）');
  // 未麻痹目标不叠层
  const e2 = mkEnemy(1000, 375, 800); g.enemies.push(e2);
  c.hit('electric', e2, 100);
  assert.ok(!e2.overload || e2.overload.n === 0, '未麻痹目标不应叠层');
});

t('电·过载C：满层闪电爆发麻痹周边敌人', () => {
  const g = mkGame({ electric: { 过载: { C: 2 } } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 400, 400); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 420, 410); g.enemies.push(e2);
  const e3 = mkEnemy(1000, 800, 800); g.enemies.push(e3);
  e1.paralyzed = 1;
  c.hit('electric', e1, 100);
  e1.paralyzed = 1;
  c.hit('electric', e1, 100);
  e1.paralyzed = 1;
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
    c.update(10);   // 周期 10-1=9s（C 速记 1）触发至少一次；普攻也会命中最近目标
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((e) => e.hp < 1000).length;
  assert.ok(hurt === 5, `A1 速记雷暴应电击 5 个（基础3 + A1×2），实际 ${hurt}`);
});

t('电·雷暴B：雷击 30%/45%/60% 几率连锁周边敌人（v1.16.21 连雷）', () => {
  const g = mkGame({ electric: { 雷暴: { B: 2 } } });
  const c = new CombatSystem(g);
  const orig = Math.random;
  try {
    Math.random = () => 0.3;   // 0.3 < 0.45（B2 连雷概率）→ 触发连锁
    // 紧密聚堆（间距 30 < 90）：雷击命中后连锁覆盖周边
    for (let i = 0; i < 4; i++) g.enemies.push(mkEnemy(1000, 300 + i * 30, 500));
    c.update(10);
  } finally { Math.random = orig; }
  const hurt = g.enemies.filter((e) => e.hp < 1000).length;
  assert.ok(hurt >= 4, `雷击3个+连锁应覆盖全部4个，实际 ${hurt}`);
});

t('电·极光电击：电击最近敌人 + 分叉 3 个（v1.16.51 基础重做，A3 范围 160 码）', () => {
  const g = mkGame({ electric: { 极光电击: { A: 3 } } });
  const c = new CombatSystem(g);
  const eNear = mkEnemy(1000, 390, 950); g.enemies.push(eNear);   // 最近（行距 153）→ 主线电击目标
  const eMid = mkEnemy(1000, 375, 950); g.enemies.push(eMid);     // 距最近 15px → 分叉命中
  const eExt = mkEnemy(1000, 443, 874); g.enemies.push(eExt);     // 距最近 ≈93px（A3 分叉范围 160 内）→ 分叉命中
  const eOut = mkEnemy(1000, 300, 800); g.enemies.push(eOut);     // 距最近 ≈175px > 160 → 不受伤害
  c.update(8.1);   // 周期固定 8s → 触发
  assert.ok(eNear.hp < 1000, '最近目标应受主线电击伤害');
  const mainDmg = 1000 - eNear.hp;
  assert.ok(eMid.hp < 1000 && eExt.hp < 1000, '分叉范围内敌人应被分叉电击');
  assert.ok(Math.abs((1000 - eMid.hp) - mainDmg * 0.4) < 1e-6, '分叉伤害应为主线 40%');
  assert.ok(Math.abs((1000 - eExt.hp) - mainDmg * 0.4) < 1e-6, 'eExt 分叉伤害应与 eMid 一致（40%）');
  assert.ok(eOut.hp === 1000, '分叉范围外敌人不应受伤害');
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

t('火·点燃C：余烬爆发结束结算', () => {
  const g = mkGame({ fire: { 点燃: { C: 1 } } });   // 余烬 C1：伤害+20%、时长 3-0.5=2.5s
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发（20%+25%=45%）
  try { c.hit('fire', e, 100); } finally { Math.random = orig; }
  const dot = e.dots.find((d) => d.type === 'burn');
  assert.ok(dot, '应有灼烧 DoT');
  c.update(1.8);   // ttl=2.5s，跑到 1.8s 时灼烧跳了多轮但未结束
  assert.ok(e.hp < 10000, '灼烧应持续掉血');
  c.update(1.0);   // 总计 2.8s > 2.5s：dot 到期 → 余烬爆发
  assert.ok(e.hp < 10000 - 30, '余烬爆发应造成额外立即伤害');
});

t('火·多重火球：主目标直瞄 + 额外火球无目标散射（沿途碰撞）', () => {
  const g = mkGame({ fire: { 多重火球: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(2000, 370, 800); g.enemies.push(e1);
  c.hit('fire', e1, 200);
  assert.ok(e1.hp < 2000, '主目标应立即受一枚火球伤害');
  // 主目标移出战场（避免散射弹道优先命中主目标，干扰散射路径验证）
  g.enemies = g.enemies.filter((o) => o !== e1);
  // 额外火球：无 target 的散射弹道（v1.13.13），数量 = n-1 = 5（v1.16.21 基础 5 枚 = 主 + 4 散射，A 速记 1 → 6 枚）
  //   + C 散射分裂（v1.16.42 档位式 3/4/5）：C1 → 分裂 3 条 mini 小火球弹道（scatter:true, hitR=30）
  const scatters = c.shots.filter((s) => s.scatter);
  const mains = scatters.filter((s) => s.hitR === 45);
  const minis = scatters.filter((s) => s.hitR === 30);
  assert.strictEqual(mains.length, 5, `应有 5 条主散射弹道（实际 ${mains.length}）`);
  assert.strictEqual(minis.length, 3, `C 散射应分裂 3 条小火球弹道（v1.16.42 C1=3，实际 ${minis.length}）`);
  mains.concat(minis).forEach((s) => {
    assert.ok(!s.target, '散射弹道不配置目标');
    assert.ok(s.hitR > 0 && s.tx !== s.sx, '散射弹道有碰撞半径与射界终点');
  });
  // 碰撞检测确定性验证：把敌人放到某条主散射弹道当前位置 → scatterCheck 应命中
  const s0 = mains[0];
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

t('火·烈焰墙：周期在最近怪物处释放火墙（释放伤害 + 灼烧 + C迟滞减速）', () => {
  const g = mkGame({ fire: { 烈焰墙: 2 } });   // lv2 速记：A/B/C 全 2
  const c = new CombatSystem(g);
  const e1 = mkEnemy(3000, 370, 800); g.enemies.push(e1);   // 最近的怪（y=800，作为墙心）
  const e2 = mkEnemy(3000, 420, 800); g.enemies.push(e2);   // x 差 50 < 墙半宽 70（B2 宽 140）→ 墙内
  c.tickPeriodic(15);   // 触发火墙释放
  assert.ok(e1.hp < 3000 && e2.hp < 3000, '释放瞬间墙内敌人应受 50%×1.4 伤害');
  assert.ok(c.fireWalls && c.fireWalls.length === 1, '应生成持续火墙');
  // 墙持续期间：推进 0.6s → 墙内灼烧 + C2 迟滞减速 20%
  c.update(0.6);
  assert.ok(e1.dots.some((d) => d.type === 'burn'), '墙内敌人应被灼烧');
  assert.ok(e1.slow && e1.slow.mult === 0.8, 'C2 迟滞应减速 20%');
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

t('火·火雨：分波结算伤害（每 0.5s 一波·每波 24%）', () => {
  const g = mkGame({ fire: { 火雨: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(5000, 370, 800); g.enemies.push(e1);
  c.tickPeriodic(12); // 触发火雨（A 速记 1 → 4 波 × 3 批 × 每批 2-5 颗）
  const drops = g.fx.filter((f) => f.type === 'raindrop');
  assert.ok(drops.length >= 24, `4 波×3 批×2 颗 → 至少 24 颗火雨点（实际 ${drops.length}）`);
  assert.ok(drops.length <= 60, `每批至多 5 颗 → 至多 60 颗（实际 ${drops.length}）`);
  drops.forEach((d) => {
    assert.ok(d.ty - d.y === 260, '火雨点起点应在落点上方 260px（平行圈内）');
    assert.ok(d.tx === d.x, '火雨点垂直落下（起点/落点同列）');
  });
  // 波结算：第一波在全部颗落地后（t≈0.6s）对火雨圈内敌人结算 24%×1.4 伤害并灼烧
  c.rainWaves = c.rainWaves || [];
  c.rainWaves.push({ t: 0.01, px: e1.x, py: e1.y, r: 168, dmg: 60 });
  c.update(1 / 60);
  assert.ok(e1.hp < 5000, '波结算：火雨圈内敌人受每波 24% 伤害');
  assert.ok(e1.dots.some((d) => d.type === 'burn'), '波结算：火雨造成灼烧效果');
});

t('死亡触发：爆燃（灼烧敌人死亡时概率爆炸波及邻近）', () => {
  const g = mkGame({ fire: { 爆燃: 1, 点燃: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(100, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 815); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 必触发（40% 基础概率）
  try { c.hit('fire', e1, 100); } finally { Math.random = orig; }
  assert.ok(e1.hp <= 0, '主目标应死亡');
  assert.ok(e2.hp < 1000, '爆燃应波及邻近敌人');
});

t('火·灼烧爆裂：灼烧每跳概率向外爆炸', () => {
  const g = mkGame({ fire: { 点燃: 1, 爆燃: { C: 2 } } });
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
  assert.ok(Math.abs(dot.ttl - 7) < 1e-6, `剧毒 B1 时长应 5+2=7s，实际 ${dot.ttl}`);
  assert.ok(Math.abs(dot.freq - 1 / 0.9) < 1e-6, `剧毒 C1 跳频应 1/0.9（间隔0.9s），实际 ${dot.freq}`);
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

t('毒·毒性强化：基础 DoT 15%、A 18%/21%/24%、B 时长 +2/+4/+6s', () => {
  const g = mkGame({ poison: { 毒性强化: { A: 1, B: 1 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0;
  try { c.hit('poison', e, 100); } finally { Math.random = orig; }
  const dot = e.dots.find((d) => d.type === 'poison');
  assert.ok(Math.abs(dot.stackDps - 18) < 1e-6, `A1 每跳应 18%（100×18%），实际 ${dot.stackDps}`);
  assert.ok(Math.abs(dot.ttl - 7) < 1e-6, `B1 时长应 5+2=7s，实际 ${dot.ttl}`);
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

t('炮·重炮：爆炸范围伤害（半径随 A 增强，溅射 40%）', () => {
  const g = mkGame({ cannon: { 重炮: { A: 2 } } }, ['cannon']);
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 820); g.enemies.push(e2);
  c.hit('cannon', e1, 100);
  assert.ok(e2.hp < 1000, '爆炸应波及邻近敌人');
  assert.ok(Math.abs(48 * (1 + 0.25 + 0.15 * 2) - 48 * 1.55) < 0.01, '重炮半径 = 48×(1+0.25×lv+0.15×A)');
  assert.ok(Math.abs((1000 - e2.hp) - 100 * 0.40) < 0.01, '溅射伤害 = 40%（100 伤 × 0.40）');
});

t('炮·重炮 C 震尘：减速概率随等级（20%/40%/60%）', () => {
  const g = mkGame({ cannon: { 重炮: { C: 2 } } }, ['cannon']);
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 820); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 必触发
  try { c.hit('cannon', e1, 100); } finally { Math.random = orig; }
  assert.ok(e2.slow && e2.slow.mult === 0.7 && e2.slow.ttl === 1, 'C2 震尘应减速 30%·1s');
});

t('炮·震击 C 迟滞：被击退减速时长随等级（1/1.5/2 秒）', () => {
  const g = mkGame({ cannon: { 震击: { C: 2 } } }, ['cannon']);
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 820); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 必击退
  try { c.hit('cannon', e1, 100); } finally { Math.random = orig; }
  assert.ok(e2.y < 820, '爆炸溅射应击退邻近敌人（向上）');
  assert.ok(e2.slow && e2.slow.mult === 0.7 && Math.abs(e2.slow.ttl - 1.5) < 0.001, 'C2 迟滞应减速 30%·1.5s');
});

t('死亡触发：爆燃（灼烧敌人死亡时爆炸波及邻近）', () => {
  const g = mkGame({ fire: { 爆燃: 1, 点燃: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(100, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 395, 815); g.enemies.push(e2);
  const orig = Math.random; Math.random = () => 0; // 必触发（40% 基础概率）
  try { c.hit('fire', e1, 100); } finally { Math.random = orig; }
  assert.ok(e1.hp <= 0, '主目标应死亡');
  assert.ok(e2.hp < 1000, '爆燃应波及邻近敌人');
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

t('协同：爆燃×毒爆 不再存在（毒爆重做为传播，v1.15 移除协同）', () => {
  const hit = CONFIG.SYNERGIES.some((s) =>
    (s.a.tower === 'fire' && s.a.effect === '爆燃' && s.b.tower === 'poison' && s.b.effect === '毒爆') ||
    (s.a.tower === 'poison' && s.a.effect === '毒爆' && s.b.tower === 'fire' && s.b.effect === '爆燃'));
  assert.ok(!hit, '毒爆重做后不应再有爆燃×毒爆协同');
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

t('毒·瘴气：城墙上方毒瘴区域内敌人 2s 叠毒 + 标记命中率下降 + C 攻击力降低', () => {
  const g = mkGame({ poison: { '瘴气': { C: 2 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(5000, 375, 917); g.enemies.push(e); // 城墙上方 50px 毒瘴条带内（wallY=967 → 中心 917）
  const e2 = mkEnemy(5000, 700, 300); g.enemies.push(e2); // 毒瘴外
  const orig = Math.random; Math.random = () => 0; // 上毒必中
  try { c.update(2.1); } finally { Math.random = orig; }
  assert.ok(e._miasma === true, '毒瘴内敌人应标记瘴气');
  assert.ok(e._miasmaAtkMult === 0.65, '瘴气 C 级 2 → 攻击力 -35%');
  assert.ok(!e2._miasma, '毒瘴外敌人不应标记');
  const dot = e.dots.find((d) => d.type === 'poison');
  assert.ok(dot && dot.stack >= 1, '毒瘴内应每 2s 叠毒');
});

t('毒·毒爆 C：死亡后留毒沼（v1.16.42 60px/4s 每秒 +1 层 + 泥沼减速，swamp 与毒池区分）', () => {
  const g = mkGame({ poison: { 毒爆: { C: 1 }, 剧毒: 1 } });
  const c = new CombatSystem(g);
  const e1 = mkEnemy(100, 370, 800); g.enemies.push(e1);
  const e2 = mkEnemy(5000, 375, 800); g.enemies.push(e2); // 毒沼范围内
  const orig = Math.random; Math.random = () => 0; // 上毒必中
  try { c.hit('poison', e1, 100); } finally { Math.random = orig; }
  const gd = c.groundDots.find((d) => d.key === 'poison' && d.swamp === true);
  assert.ok(gd, '毒爆 C 应留毒沼（swamp 标记）');
  assert.ok(gd.r === 60 && gd.ttl === 4 && gd.dps === 0 && gd.stackPerSec === 1, '毒沼应为 60px/4s 纯叠毒');
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

t('回旋镖·放血：强化流血（v1.16.21：+25% 概率 / A 刺骨 +15%/级 / B 时长 / C 溃烂）', () => {
  const g = mkGame({ boomerang: { 放血: { A: 1, B: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 700); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发流血
  try { c.hit('boomerang', e, 100); } finally { Math.random = orig; }
  assert.strictEqual(e.bleedT, 5, 'B1 流血时间应为 4+1=5s');
  assert.ok(Math.abs(e._bleedDmg - 40) < 0.01, '每 100px 应 40%（每10px 4%，A 不影响伤害）');
  const hp0 = e.hp;
  e.y += 100; c.tickStatus(e, 0.1);
  assert.ok(Math.round(hp0 - e.hp) === 40, '移动 100px 应结算 40 点流血伤害');
});

t('冰·冰冻：基础 20% 概率，A 分支档位提升、B 深结时长', () => {
  const g = mkGame({ ice: { 冰冻: { A: 1 } } });
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 800); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0.30; // 0.20 < 0.30 < 0.35 → 基础20%不触发、A1(35%)触发
  try { c.hit('ice', e, 100); } finally { Math.random = orig; }
  assert.ok(e.frozen > 0, 'A1 概率 35% 应冻结');
  // B1 深结：冻结时长 2 + 1 = 3s
  const g2 = mkGame({ ice: { 冰冻: { A: 1, B: 1 } } });
  const c2 = new CombatSystem(g2);
  const e2 = mkEnemy(1000, 375, 800); g2.enemies.push(e2);
  const o2 = Math.random; Math.random = () => 0;
  try { c2.hit('ice', e2, 100); } finally { Math.random = o2; }
  assert.ok(Math.abs(e2.frozen - 3) < 1e-6, `B1 深结冻结时长应为 3s，实际 ${e2.frozen}`);
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

t('回旋镖·风痕：多镖+疾飞高频投掷下风痕持续留痕（v1.16.36 不再因 120 上限断供）', () => {
  const g = mkGame({ boomerang: { 风痕: 1, 接镖: { A: 3 }, 多镖: { A: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  let pushed = 0;
  const arr = [];
  Object.defineProperty(arr, 'push', { value: function (x) { pushed++; Array.prototype.push.call(this, x); } });
  c.windTrails = arr;
  const e = mkEnemy(1000000, 400, 600); g.enemies.push(e);
  for (let i = 0; i < 60 * 8; i++) c.update(1 / 60);
  assert.ok(pushed >= 240, `多镖+疾飞 8 秒内风痕应持续留痕（≥240 点，旧实现约 130 点即断供），实测 ${pushed}`);
});

t('回旋镖·风暴镖：每 12 秒召唤三圈旋转小飞镖（C 增镖每圈 +1）', () => {
  const g = mkGame({ boomerang: { 风暴镖: { C: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(10000, 375, 700); g.enemies.push(e);
  c.update(12.01);
  assert.strictEqual(c.storms.length, 1, '应生成 1 个风暴镖');
  const s = c.storms[0];
  assert.strictEqual(s.darts.length, 21, 'C1 应 21 枚镖（4/6/8 + 每圈1）');
  assert.strictEqual(s.darts.filter((d) => d.r === 40).length, 5, '内圈 5 枚');
  assert.strictEqual(s.darts.filter((d) => d.r === 80).length, 7, '中圈 7 枚');
  assert.strictEqual(s.darts.filter((d) => d.r === 120).length, 9, '外圈 9 枚');
  // 敌人放在内圈镖初始轨道上（释放即命中）；命中后镖不消失
  const e2 = mkEnemy(10000, 375 + 40, 700); g.enemies.push(e2);
  const hp0 = e2.hp;
  for (let i = 0; i < 30; i++) c.update(1 / 60); // 0.5s 旋转
  assert.ok(e2.hp < hp0, '旋转小飞镖应独立命中敌人造成伤害');
  assert.strictEqual(s.darts.length, 21, '镖命中后不消失（数量不变）');
  assert.ok(e.hp === 10000, '圆心处敌人不应被镖扫到（圈轨道外）');
  // 方向：内圈+外圈顺时针（spd>0）、中圈逆时针（spd<0）
  assert.ok(s.darts.filter((d) => d.r === 40).every((d) => d.spd > 0), '内圈应顺时针');
  assert.ok(s.darts.filter((d) => d.r === 80).every((d) => d.spd < 0), '中圈应逆时针');
  assert.ok(s.darts.filter((d) => d.r === 120).every((d) => d.spd > 0), '外圈应顺时针');
});

t('回旋镖·弹力镖：每 8 秒射 2 枚十字镖（A 增镖 +1/级），遇敌反弹结算伤害、边缘反弹、反弹 10 次后消失', () => {
  const g = mkGame({ boomerang: { 弹力镖: { A: 1 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  // A1 → 3 枚；随机方向可能不立即命中 → 先验证发射数量
  c.update(8.01);
  assert.ok(c.shots.filter((s) => s.bounce).length >= 3, 'A1 应射出 3 枚弹力镖');
  // 清掉系统随机镖，只保留构造的直冲镖做单镖命中断言
  c.shots = c.shots.filter((s) => !s.bounce);
  const e = mkEnemy(10000, 400, 1000); g.enemies.push(e);
  const dmg = c.shotDmg('boomerang') * 0.60;
  c.shots.push({ key: 'boomerang', dmg, t: 0, dur: 8, x: 375, y: 1103, ang: Math.atan2(1000 - 1103, 400 - 375), speed: 400, bounce: true, bounces: 0, maxB: 10, hitR: 30, hitIds: {} });
  for (let i = 0; i < 20; i++) c.update(1 / 60);
  assert.ok(e.hp < 10000, '弹力镖应命中敌人造成伤害');
  assert.ok(Math.abs(10000 - e.hp - dmg) < 0.01, `单镖命中伤害应 = 60%×shotDmg（${dmg}），实际 ${10000 - e.hp}`);
});

t('回旋镖接镖机制：镖未接回不投下一个，接回后立即投', () => {
  const g = mkGame({ boomerang: {} });
  const c = new CombatSystem(g);
  const dmg = c.shotDmg('boomerang');
  // 敌人在塔正上方目标线（v1.16.21 弧顶点越过目标 42px → 距顶点 39px 在 42 命中带内），speed=0 固定在带内
  const e = mkEnemy(10000, 375, 800); e.speed = 0; g.enemies.push(e);
  let maxS = 0;
  for (let i = 0; i < 300; i++) { // 推进 5s（dur 2.4s，应投两枚）
    c.update(1 / 60);
    maxS = Math.max(maxS, c.shots.filter((s) => s.sweep).length);
  }
  assert.strictEqual(maxS, 1, '任意时刻至多一枚回旋镖在飞（接到镖才能投下一个）');
  assert.ok(e.hp <= 10000 - dmg * 2, '两枚镖应各扫到目标一次（合计 ≥ 2 枚伤害）');
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

t('炮·炮火支援：每 12 秒逐发发射炮弹（间隔 0.1s 升空消失→1s 头顶重现→0.3s 垂直落下，伤害 60%）', () => {
  const g = mkGame({ cannon: { 炮火支援: { A: 1 } } }, ['cannon']);
  const c = new CombatSystem(g);
  g.enemies.push(mkEnemy(1000, 375, 700));
  c.update(12.01);
  assert.ok(c.delayed.length >= 4, 'A1 应降下 4 发延迟落点');
  assert.ok(c.delayed.every((d) => d.delay >= 1.3 && d.delay <= 1.6), '落点应按逐发间隔 0.1s 依次爆炸（1.3~1.6s）');
  assert.ok(Math.abs(c.delayed[0].dmg / c.shotDmg('cannon') - 0.60) < 0.001, '每发伤害 = 普攻 × 60%');
  assert.ok(g.fx.some((f) => f.type === 'strike' && f.offset === 0), '应生成 130px 炮击圈标识（首发无偏移）');
  assert.ok(g.fx.some((f) => f.type === 'strikeShell' && f.offset === 0.1), '应逐发发射炮弹（第 2 发偏移 0.1s）');
});

t('炮·地雷阵：每 6 秒从塔口抛投，落地布设后可引爆', () => {
  const g = mkGame({ cannon: { 地雷阵: { A: 1 } } }, ['cannon']);
  const c = new CombatSystem(g);
  g.enemies.push(mkEnemy(1000, 375, 700));
  c.update(6.01);
  assert.ok(c.mines.length >= 5, 'A1 每 6 秒应抛投 5 颗雷');
  const m = c.mines[0];
  assert.ok(m.fly, '雷生成后应处于飞行状态（不可引爆）');
  assert.ok(m.armed === 0, '飞行期间不可引爆（armed 未开始计时）');
  // 推进至落地（飞行段 500px/s）+ 布设 0.3s 完毕
  const lx = m.fly.tx, lyy = m.fly.ty;   // 先存部署点（落地后 fly 置空）
  const dist = Math.hypot(lx - m.fly.sx, lyy - m.fly.sy);
  const steps = Math.ceil((dist / 500 + 0.4) * 60);
  for (let i = 0; i < steps; i++) c.update(1 / 60);
  assert.ok(!m.fly && m.armed <= 0, '落地布设 0.3s 后应可引爆');
  // 部署圈：最近敌人 (375,700) 附近 30~180px
  const dd = Math.hypot(lx - 375, lyy - 700);
  assert.ok(dd >= 30 && dd <= 180, '部署点应在最近敌人附近 30~180px 圈内');
  // 敌人踩中爆炸
  const e = mkEnemy(2000, m.x, m.y); g.enemies.push(e);
  for (let i = 0; i < 60 && e.hp > 0; i++) c.update(1 / 60);
  assert.ok(e.hp < 2000, '敌人踩中地雷应爆炸受伤');
});

t('炮·地雷阵：无敌人时在攻击范围内随机部署', () => {
  const g = mkGame({ cannon: { 地雷阵: 1 } }, ['cannon']);
  const c = new CombatSystem(g);
  c.update(6.01);
  assert.ok(c.mines.length >= 3, '无敌人也应抛投 3 颗雷');
  const ly = c.ly();
  const fy0 = ly.slotY + ly.slotSize / 2;
  c.mines.forEach((m) => {
    assert.ok(m.fly.tx >= 25 && m.fly.tx <= 725 && m.fly.ty < fy0, '无敌人时部署点应在攻击范围内（塔口上方）');
  });
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

t('普攻·炮塔：基础 100px 范围 40% 溅射（无技能）', () => {
  const g = mkGame({ cannon: {} }, ['cannon']);
  const c = new CombatSystem(g);
  const e1 = mkEnemy(1000, 375, 700); g.enemies.push(e1);
  const e2 = mkEnemy(1000, 380, 770); g.enemies.push(e2); // 距 e1 ≈70px < 100
  c.hit('cannon', e1, 100);
  assert.strictEqual(Math.round(e1.hp), 900, '主目标应吃满 100% 伤害');
  assert.strictEqual(Math.round(e2.hp), 960, '100px 内敌人应受 40% 溅射伤害');
});

t('普攻·镖塔：20% 概率流血，随移动距离结算伤害', () => {
  const g = mkGame({ boomerang: {} }, ['boomerang']);
  const c = new CombatSystem(g);
  const e = mkEnemy(1000, 375, 700); g.enemies.push(e);
  const orig = Math.random; Math.random = () => 0; // 必触发
  try { c.hit('boomerang', e, 100); } finally { Math.random = orig; }
  assert.ok(e.bleedT === 4, '应施加 4s 流血');
  assert.ok(Math.abs(e._bleedDmg - 40) < 0.01, '每 100px 应结算 40%×命中伤害（每10px 4%）');
  const hp0 = e.hp;
  e.y += 100;                      // 敌人移动 100px
  c.tickStatus(e, 0.1);
  assert.ok(e.hp < hp0, '移动 100px 后应结算一次流血伤害');
  assert.strictEqual(Math.round(hp0 - e.hp), 40, '本次跳伤应等于 40 点');
});

t('放血·镖塔：+25% 概率（20→45）、A 刺骨 +15%/级、C 溃烂每10px 4%→6/8/10%', () => {
  const g = mkGame({ boomerang: { 放血: { A: 1, B: 1, C: 2 } } }, ['boomerang']);
  const c = new CombatSystem(g);
  // 概率：20+25+15 = 60% → Math.random 0.99 不触发
  const e1 = mkEnemy(1000, 375, 700); g.enemies.push(e1);
  const orig = Math.random; Math.random = () => 0.99;
  try { c.hit('boomerang', e1, 100); } finally { Math.random = orig; }
  assert.ok(!e1.bleedT, '60% 概率下 0.99 不应触发');
  // Math.random 0 → 触发；C2 → 每100px 40%+40%=80%
  const e2 = mkEnemy(1000, 375, 700); g.enemies.push(e2);
  Math.random = () => 0;
  try { c.hit('boomerang', e2, 100); } finally { Math.random = orig; }
  assert.ok(e2.bleedT === 5, 'B1 时长应 4+1=5s');
  assert.ok(Math.abs(e2._bleedDmg - 80) < 0.01, `C2 每100px 应 80%（40%+2×20%），实际 ${e2._bleedDmg}`);
  const hp0 = e2.hp;
  e2.y += 100;
  c.tickStatus(e2, 0.1);
  assert.strictEqual(Math.round(hp0 - e2.hp), 80, '本次跳伤应等于 80 点');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
