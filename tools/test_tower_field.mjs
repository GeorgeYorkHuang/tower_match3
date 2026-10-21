/**
 * test_tower_field.mjs — v1.14 测试战场专项测试（mock wx）
 * 运行：node tools/test_tower_field.mjs
 * 覆盖：
 *   1. 主界面「测试战场」入口按钮 → enterTestField：state=testfield、6 塔全部出战（level=1）
 *   2. update 后弹药恒满（ammo = ammoMax）
 *   3. testSkillAction：分支 A 0→1→2→3→0 循环；level 派生 = max(分支)；picked/activeNames 同步
 *   4. testSkillAll：一键激活（A·Lv3）与清空
 *   5. spawnTestEnemies / clearTestEnemies：敌人入列与清场
 *   6. 塔槽触摸 → 技能面板打开；面板 A 分支按钮 → 分支 +1（真实触摸链路）
 *   7. 攻城不扣城墙血（测试战场城墙无敌）
 */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);

const store = {};
const wxHandlers = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; },
  setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart(fn) { wxHandlers.start = fn; },
  onTouchMove(fn) { wxHandlers.move = fn; },
  onTouchEnd(fn) { wxHandlers.end = fn; },
};
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => undefined;
  },
  set() { return true; },
});
const canvasHandlers = {};
global.canvas = { width: 1125, height: 2001, getContext: () => ctx2d, addEventListener: (t, fn) => { canvasHandlers[t] = fn; } };
global.GameGlobal = {};
global.requestAnimationFrame = () => {};
require('../js/game/main.js');
const game = global.GameGlobal.game;
const CONFIG = require('../js/config.js');
const DESIGN = CONFIG.DESIGN;
const toClient = (lx, ly) => ({ x: lx * 375 / DESIGN.W, y: ly * 667 / DESIGN.H });

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

function tapAt(lx, ly) {
  const c = toClient(lx, ly);
  wxHandlers.start({ touches: [{ clientX: c.x, clientY: c.y }] });
  wxHandlers.end({ touches: [] });
}

/* ---------- 用例 ---------- */

// 1. 主界面入口按钮 → 测试战场
t('主界面「测试战场」按钮进入 testfield（单塔出战）', () => {
  game.goMenu();
  game.menuTab = 'battle';
  game.render();
  const hasBtn = (game.menuHits || []).some((it) => it.key === 'testfield');
  assert.ok(hasBtn, 'menuHits 应包含 testfield 按钮');
  // 测试按钮区域：ty=940 th=74 → 中心 (375, 977)
  tapAt(375, 977);
  assert.strictEqual(game.state, 'testfield', '点击后 state 应为 testfield');
  assert.strictEqual(game.run.slotOrder.length, 1, '应单塔出战');
  assert.strictEqual(game.run.slotOrder[0], 'fire', '默认出战火塔');
  const tw = game.run.effects.tower('fire');
  assert.ok(tw.level >= 1, '火塔应已解锁');
  // 全部 6 塔可在切换简表选择
  const st = game.testState();
  assert.strictEqual(st.allTowers.length, 6, '切换简表应有 6 塔');
});

// 2. 弹药恒满
t('测试战场弹药恒满', () => {
  game.update(0.5);
  game.run.slotOrder.forEach((k) => {
    const tw = game.run.effects.tower(k);
    assert.strictEqual(tw.ammo, CONFIG.GLOBAL_SKILL.ammoMax, `${k} 弹药应恒满`);
  });
});

// 3. 技能分支循环 + level 派生（v1.16.5：level = 1+分支） + picked 同步
t('testSkillAction：A 分支 0→1→2→3→0 循环与激活同步', () => {
  const tw = game.run.effects.tower('fire');
  const ef = tw.pool.find((e) => e.name === '点燃');
  game.testSkillAction('fire', '点燃', 'A');
  assert.strictEqual(ef.branches.A, 1);
  assert.strictEqual(ef.level, 2, '分支 Lv1 → 技能 Lv2（1+分支）');
  assert.ok(tw.activeNames.includes('点燃'), '应加入 activeNames');
  assert.ok(tw.picked.has('点燃'), '应加入 picked');
  game.testSkillAction('fire', '点燃', 'A'); // 2
  game.testSkillAction('fire', '点燃', 'A'); // 3
  assert.strictEqual(ef.branches.A, 3);
  assert.strictEqual(ef.level, 4, '分支 Lv3 → 技能 LvMAX(4)');
  game.testSkillAction('fire', '点燃', 'A'); // 0（循环回 0）
  assert.strictEqual(ef.branches.A, 0);
  assert.strictEqual(ef.level, 0, '清零后 level 应为 0');
  assert.ok(!tw.activeNames.includes('点燃'), '清零后应移出 activeNames');
  // 再激活 + 清除按钮路径
  game.testSkillAction('fire', '点燃', 'A');
  game.testSkillAction('fire', '点燃', 'clear');
  assert.strictEqual(ef.branches.A, 0);
  assert.strictEqual(ef.level, 0, '清除后 level 应为 0');
  assert.ok(!tw.picked.has('点燃'), '清除后应移出 picked');
});

// 4. 一键激活 / 清空
t('testSkillAll：全部激活（A·Lv3）与清空', () => {
  const tw = game.run.effects.tower('fire');
  game.testSkillAll('fire', true);
  assert.strictEqual(tw.pool.length, 8, '火塔 8 技能');
  tw.pool.forEach((ef) => {
    assert.strictEqual(ef.branches.A, 3, `${ef.name} A 分支应为 3`);
    assert.ok(tw.picked.has(ef.name), `${ef.name} 应已激活`);
  });
  game.testSkillAll('fire', false);
  tw.pool.forEach((ef) => assert.strictEqual(ef.level, 0, `${ef.name} 应清空`));
  assert.strictEqual(tw.activeNames.length, 0, 'activeNames 应清空');
});

// 5. 刷怪与清场
t('spawnTestEnemies / clearTestEnemies', () => {
  game.clearTestEnemies();
  game.spawnTestEnemies('normal', 2);
  assert.strictEqual(game.enemies.length, 2, '应入列 2 只普通怪');
  assert.strictEqual(game.enemies[0].hp, 500, '普通怪测试血量 500');
  assert.ok(game.enemies[0].speed > 50, `测试战场怪速应 ×3（约 62），实际 ${game.enemies[0].speed}`);
  // 推进 5 秒：怪物进入射程后首发弹道命中结算（塔锁定 y 最大的敌人，故断言任一敌人受伤）
  for (let i = 0; i < 50; i++) game.update(0.1);
  assert.ok(game.enemies.some((e) => e.hp < 500), '进射程后应已受到攻击伤害');
  game.spawnTestEnemies('boss', 1);
  assert.strictEqual(game.enemies.length, 3);
  assert.ok(game.enemies[2].isBoss, '第 3 只应为 Boss');
  // 渲染层必须收到真实 enemies / fx（v1.14.3 修复：此前 main.render 漏传参数导致场上无怪）
  let seenEnemies = null, seenFx = null;
  const origTFL = game.renderer.testFieldLayer.bind(game.renderer);
  game.renderer.testFieldLayer = (ctx, s, hits, enemies, fx) => { seenEnemies = enemies; seenFx = fx; return origTFL(ctx, s, hits, enemies, fx); };
  game.render();
  game.renderer.testFieldLayer = origTFL;
  assert.strictEqual(seenEnemies, game.enemies, '渲染层应收到真实 enemies 数组');
  assert.strictEqual(seenFx, game.fx, '渲染层应收到真实 fx 数组');
  game.clearTestEnemies();
  assert.strictEqual(game.enemies.length, 0, '清场后无敌人');
});

// 5b. v1.16.11 怪物等级（tier）：波 6+ 血量/减伤随档位提升，精英/Boss 叠加自带 armor
t('tier 运行时接入：波 6 敌人减伤 + 精英/Boss 叠加 armor', () => {
  game.clearTestEnemies();
  game.run.wave = 6;                       // T2：hpMult 1.5 / atkMult 1.25 / armor 0.08
  game.spawnTestEnemies('normal', 1);
  const n = game.enemies[0];
  assert.ok(Math.abs(n.armor - 0.08) < 1e-9, `波6 普通怪减伤应为 8%，实际 ${n.armor}`);
  assert.strictEqual(n.hp, Math.round(500 * 1.5), `波6 普通怪血量应 ×1.5（750），实际 ${n.hp}`);
  game.spawnTestEnemies('elite', 1);
  const el = game.enemies[game.enemies.length - 1];
  assert.ok(Math.abs(el.armor - (0.08 + 0.10)) < 1e-9, `波6 精英减伤应 8%+10%=18%，实际 ${el.armor}`);
  game.spawnTestEnemies('boss', 1);
  const bs = game.enemies[game.enemies.length - 1];
  assert.ok(Math.abs(bs.armor - (0.08 + 0.25)) < 1e-9, `波6 Boss 减伤应 8%+25%=33%，实际 ${bs.armor}`);
  game.clearTestEnemies();
  game.run.wave = 1;                       // 还原，避免影响后续用例
});

// 6. 塔槽触摸 → 面板；面板 A 按钮 → 分支 +1（真实触摸链路）
t('塔槽触摸打开面板 + 面板 A 分支按钮生效', () => {
  game.clearTestEnemies();
  game.testPanel = null;
  game.render(); // 重建 testHits
  const firstKey = game.run.slotOrder[0];
  // 出战塔槽：x=15..115 y=1053..1153 → 中心 (65, 1103)
  tapAt(65, 1103);
  assert.ok(game.testPanel, '点塔位应打开技能面板');
  assert.strictEqual(game.testPanel.key, firstKey, '槽应为出战塔');
  game.render(); // 重建含面板按钮的 testHits
  const firstSkill = game.run.effects.tower(firstKey).pool[0].name;
  // 面板行 0 A 按钮：b0=278，A bx=278..374 y=258..310 → 中心 (326, 284)
  tapAt(326, 284);
  const tw = game.run.effects.tower(firstKey);
  const ef = tw.pool.find((e) => e.name === firstSkill);
  assert.strictEqual(ef.branches.A, 1, `点 A 按钮后 ${firstSkill} A 分支应为 1`);
  // 面板关闭
  game.render();
  tapAt(663, 192); // panel_close 命中区 (634,168)-(692,216) 中心 (663,192)
  assert.strictEqual(game.testPanel, null, '点关闭应关闭面板');
});

// 6b. 更换出战塔（真实触摸链路）
t('切换钮更换出战塔并打开新塔面板', () => {
  game.render(); // 重建含 tf_switch 的 testHits
  // 6 塔切换钮：x=185+i*66, y=1053..1109 → ice 钮（i=1）中心 (185+66+28, 1081) = (279, 1081)
  tapAt(279, 1081);
  assert.strictEqual(game.run.slotOrder.length, 1, '仍单塔出战');
  assert.strictEqual(game.run.slotOrder[0], 'ice', '切换后出战冰塔');
  assert.ok(game.testPanel, '切塔后应自动打开技能面板');
  assert.strictEqual(game.testPanel.key, 'ice', '面板应为冰塔');
  const tw = game.run.effects.tower('ice');
  assert.ok(tw.level >= 1, '冰塔应已解锁');
  // 冰塔分支操作生效
  game.render();
  const firstSkill = tw.pool[0].name;
  tapAt(326, 284); // 行 0 A 按钮
  const ef = tw.pool.find((e) => e.name === firstSkill);
  assert.strictEqual(ef.branches.A, 1, `冰塔 ${firstSkill} A 分支应为 1`);
  // 切回火塔（先关闭冰塔面板——面板打开时底层按钮不响应）
  game.render();
  tapAt(663, 192); // 关面板
  assert.strictEqual(game.testPanel, null, '面板应关闭');
  game.render();
  tapAt(213, 1081); // fire 钮（i=0）中心 (213, 1081)
  assert.strictEqual(game.run.slotOrder[0], 'fire', '切回火塔');
  assert.strictEqual(game.testPanel.key, 'fire', '面板切回火塔');
});

// 6c. v1.16.4：切塔后旧塔立即取消生效（战斗系统只认出战塔 + 协同断开）
t('切塔后旧塔取消生效（单塔模式）', () => {
  // 当前出战火塔，激活其技能
  game.testSkillAll('fire', true);
  // 切到冰塔 → 火塔在战斗系统内立即失效
  game.switchTestTower('ice');
  assert.ok(game.run.effects.tower('fire'), '火塔配置对象仍保留（不丢配置）');
  assert.strictEqual(game.combat.tower('fire'), null, '非出战塔在战斗系统内不生效');
  assert.strictEqual(game.combat.tower('ice'), game.run.effects.tower('ice'), '出战塔正常生效');
  assert.ok(game.run.effects.synergyDone.every((d) => !d), '切塔后旧协同全部断开');
  // 切回火塔 → 恢复生效
  game.switchTestTower('fire');
  assert.strictEqual(game.combat.tower('fire'), game.run.effects.tower('fire'), '切回后火塔恢复生效');
  assert.ok(game.run.effects.tower('fire').activeNames.length > 0, '原技能配置保留');
});

// 7. 攻城不扣城墙血（测试战场城墙无敌）
t('测试战场攻城不扣城墙血', () => {
  const lineHp0 = game.run.lineHp;
  // 直接放一只到城墙攻击范围的敌人并推进
  const ly = game.renderer.ly;
  const wallLine = ly.wallY - 10;
  game.enemies.push({ x: 375, y: wallLine + 5, hp: 999999, maxHp: 999999, speed: 0, isBoss: false, type: 'normal', attack: 500, attackInterval: 1, attackT: 0.9, frozen: 0, paralyzed: 0 });
  game.update(0.2); // 推进：攻击间隔满 → 触发一次攻城
  assert.strictEqual(game.run.lineHp, lineHp0, '城墙血不应减少');
  assert.strictEqual(game.run.broken, false, '不应破防');
  game.enemies = [];
});

// 8. 返回主界面清理面板状态
t('测试战场返回主界面（goMenu）清理面板', () => {
  game.testPanel = { key: 'fire' };
  game.goMenu();
  assert.strictEqual(game.state, 'menu', '应回到主界面');
  assert.strictEqual(game.testPanel, null, '面板应清理');
  assert.strictEqual(game.testSpeed, 1, '倍速应重置');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
