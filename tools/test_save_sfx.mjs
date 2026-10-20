/**
 * test_save_sfx.mjs —— 存档恢复/波末写入、音效上下文、打击特效专项测试（mock wx）
 * 运行：node tools/test_save_sfx.mjs
 */
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);

/* mock wx：存储 + 音效 */
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; },
  setStorageSync(k, v) { store[k] = v; },
};
store['xxfx_save_v1'] = {
  version: 1, gold: 12345,
  towers: { fire: { level: 3, exp: 50 }, ice: { level: 1, exp: 0 } },
  towerUnlocks: ['fire', 'ice'], // 塔位解锁顺序（先消先得）
};

const ctx2d = new Proxy({}, { get() { return () => undefined; }, set() { return true; } });
const handlers = {};
global.canvas = {
  width: 375, height: 667,
  getContext: () => ctx2d,
  addEventListener: (t, fn) => { handlers[t] = fn; },
};
global.GameGlobal = {};
global.requestAnimationFrame = () => {};

require('../js/game/main.js');
const game = global.GameGlobal.game;

/* v2→v5 语义：金币/圣物等跨局保留；塔位不再跨局恢复（v1.6：每局从 0 塔开始，先消先得） */
game.newRun(true); // 进入战斗，开局 0 塔

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

t('存档恢复：金币迁移 + 塔位不再跨局带入（v1.6）', () => {
  assert.strictEqual(game.run.gold, 12345, 'v1 金币应迁移到 meta 并镜像 run');
  assert.strictEqual(game.run.effects.tower('fire').level, 0, '跨局已得塔不预填新局，开局 0 塔');
  assert.strictEqual(game.run.effects.tower('boomerang').level, 0, '其余塔同样为 0');
});

t('存档恢复：塔位解锁不再恢复（slotOrder 空）', () => {
  assert.deepStrictEqual(game.run.slotOrder, [], '重进游戏不再预填塔位，由最先消除的 4 种颜色决定');
});

t('音效上下文创建（wx 环境）', () => {
  assert.ok(game.sfx && game.sfx.bgm, 'bgm 应创建（SfxManager 模块化）');
  assert.ok(game.sfx.fxShot, '射击音效应创建');
  assert.ok(game.sfx.fxBoom, '爆炸音效应创建');
});

t('打击特效：击杀产生爆炸并清除敌人', () => {
  game.state = 'fighting';
  game.run.applyMatch('red', '3', 3); // v1.6：消除解锁 fire 出战
  // 敌人放在塔射程内（y=900 靠近塔位区），hp=1 一发即死；推进真实战斗直到弹道命中击杀
  game.enemies = [{ id: 999, x: 375, y: 900, hp: 1, maxHp: 1, type: 'normal', isBoss: false, speed: 0, attack: 8, attackInterval: 1 }];
  const dt = 1 / 60;
  let elapsed = 0;
  while (game.enemies.length > 0 && elapsed < 5) {
    game.stepEnemies(dt);
    elapsed += dt;
  }
  assert.ok(game.fx.some((f) => f.type === 'boom'), '击杀应产生爆炸特效');
  assert.strictEqual(game.enemies.length, 0, '敌人应被清除');
});

t('波末存档写入与 meta 一致（v5）', () => {
  const g0 = game.meta.gold;
  game.waveEnd();
  const saved = store['xxfx_save_v1'];
  assert.ok(saved, '存档应被写入');
  assert.strictEqual(saved.version, 5, '应写入 v5 存档');
  assert.strictEqual(saved.gold, game.meta.gold, '存档金币应与 meta 同步');
  assert.ok(!('skillCards' in saved) && !('towerSkillSlots' in saved) && !('relicSlots' in saved), 'v5 应移除技能卡/技能槽/圣物装备槽');
  assert.ok('relics' in saved && 'chests' in saved, '存档应含圣物与宝箱');
  assert.ok('diamond' in saved && 'dailyPicks' in saved, '存档应含钻石与每日精选');
  assert.ok(Array.isArray(saved.towerUnlocks), 'v1.6 塔位不再跨局持久化（保留空数组字段兼容）');
  assert.strictEqual(saved.towerUnlocks.length, 0, '开局 0 塔，先消先得不再写入存档');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
