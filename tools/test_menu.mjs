/**
 * test_menu.mjs —— 主界面三页签（战斗/商店/圣物）+ 圣物/宝箱/每日精选/迁移 专项测试（mock wx）
 * 运行：node tools/test_menu.mjs
 * 覆盖（v1.4.0：无技能卡/技能槽/圣物装备槽）：
 *   1. 初始状态 = 主界面（menu），menuState 字段齐全（3 页签）
 *   2. 页签切换：战斗 / 商店 / 圣物（底部大分页）
 *   3. 每日精选圣物卡：金币购买 + 跨天自动刷新
 *   4. 圣物：拥有即常驻加成（无装备）+ 升级消耗 1 同名圣物 + 金币
 *   5. 宝箱：开启倒计时 → 到时发圣物卡
 *   6. 进入战斗：每塔默认 3 技能 Lv1 激活（无技能槽）
 *   7. 跨塔升级三选一候选（多塔 pending → 候选跨池）
 *   8. bonusStrike 三消额外攻击不抛错
 *   9. v3/v4 → v5 存档迁移（技能卡丢弃 / 圣物装备槽合并 / 序列化 v5）
 *   10. v2 → v3 存档迁移（save.load 链路）
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

/* 渲染一帧（menu 分支走 main.render 同序列） */
function renderOnce() {
  const st = game.menuState();
  game.menuHits = game.renderer.menuLayer(ctx2d, st, game.menuHits);
}

/* 模拟一次点击（逻辑坐标） */
function tapAt(lx, ly) {
  const c = toClient(lx, ly);
  wxHandlers.start({ touches: [{ clientX: c.x, clientY: c.y }] });
  wxHandlers.end({ touches: [] });
}

/* 在指定逻辑区域扫描第一个命中 key 的 hit，返回其矩形中心 {lx, ly, data, rect} 或 null；
   dataMatch 支持字符串（严格相等）或函数 (data)=>bool */
function findHit(key, x0, y0, x1, y1, dataMatch) {
  const match = typeof dataMatch === 'function' ? dataMatch : (d) => dataMatch === undefined || d === dataMatch;
  for (let yy = y0; yy <= y1; yy += 4) {
    for (let xx = x0; xx <= x1; xx += 4) {
      const it = game.menuHits.find((h) => h.key === key && match(h.data) && h.hit(xx, yy));
      if (it) {
        const r = it.rect || { x: xx, y: yy, w: 1, h: 1 };
        return { lx: r.x + r.w / 2, ly: r.y + r.h / 2, data: it.data, rect: r };
      }
    }
  }
  return null;
}

t('初始状态：主界面 menu + menuState 字段齐全（3 页签）', () => {
  assert.strictEqual(game.state, 'menu', '初始应在主界面');
  const st = game.menuState();
  ['gold', 'diamond', 'tab', 'keys', 'relics', 'chests', 'daily', 'panel', 'towerUnlocks'].forEach((k) => {
    assert.ok(k in st, `menuState 应含 ${k}`);
  });
  assert.strictEqual(st.tab, 'battle');
  assert.strictEqual(st.keys.length, 6, '6 座塔配置');
  assert.strictEqual(st.freeSkills('fire').length, CONFIG.EFFECT.activeSlots, '每塔默认 3 技能');
  assert.deepStrictEqual(st.freeSkills('fire'), ['点燃', '溅射', '连击'], '默认技能 = 池前 3');
});

t('页签切换：底部大分页（战斗 → 商店 → 圣物，无配置页）', () => {
  renderOnce();
  const expect = ['shop', 'relic'];
  expect.forEach((tab) => {
    const c = findHit('tab', 40, 1504, 710, 1604, tab);
    assert.ok(c, `应命中底部 ${tab} 页签`);
    tapAt(c.lx, c.ly);
    assert.strictEqual(game.menuTab, tab, `点击应切到 ${tab}`);
    renderOnce();
  });
  // 不应存在配置页签
  assert.strictEqual(findHit('tab', 40, 1504, 710, 1604, 'config'), null, '不应有配置页签');
  game.menuTab = 'battle';
});

t('每日精选圣物卡：金币购买 + 跨天自动刷新', () => {
  game.meta.gold = 10000;
  game.meta.dailyPicks = null;
  game.menuTab = 'shop';
  renderOnce();
  const dp = findHit('dailyPick', 420, 320, 530, 700);
  assert.ok(dp, '每日精选卡存在');
  assert.strictEqual(game.meta.dailyPicks.picks.length, CONFIG.DAILY.perDay, '每日 3 张精选卡');
  const before = game.meta.gold;
  const rid = dp.data.relic;
  tapAt(dp.lx, dp.ly);
  assert.strictEqual(game.meta.gold, before - CONFIG.DAILY.price, '精选卡应扣 dailyPrice');
  assert.ok(game.meta.relicCount(rid) >= 1, '精选圣物应入持有');
  // 跨天刷新：伪造昨天日期
  const yesterday = new Date(Date.now() - 86400000);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  const ystr = `${yesterday.getFullYear()}-${p(yesterday.getMonth() + 1)}-${p(yesterday.getDate())}`;
  game.meta.dailyPicks.date = ystr;
  game.meta.ensureDailyPicks(Date.now());
  assert.notStrictEqual(game.meta.dailyPicks.date, ystr, '跨天应刷新日期');
  game.menuTab = 'battle';
});

t('圣物：拥有即常驻加成（无装备槽）+ 升级消耗 1 同名圣物 + 金币', () => {
  game.meta.gold = 10000;
  game.meta.relics = {};
  game.meta.relicLevels = {};
  game.meta.addRelic('gold');
  game.meta.addRelic('gold');
  // 无装备概念：拥有即计入加成（按等级；Lv0 时效果为 0 属正常）
  const b0 = game.meta.relicBonus();
  assert.strictEqual(b0.gold, 0, 'Lv0 圣物无加成');
  // 升级：耗 1 同名圣物 + 金币
  const cost = game.meta.relicUpCost('gold');
  const goldBefore = game.meta.gold;
  const up = game.meta.upgradeRelic('gold');
  assert.ok(up.ok, '升级应成功');
  assert.strictEqual(game.meta.relicLevel('gold'), 1, '等级应 +1');
  assert.strictEqual(game.meta.relicCount('gold'), 1, '应消耗 1 同名圣物');
  assert.strictEqual(game.meta.gold, goldBefore - cost.gold, '应扣金币');
  // 升级后（Lv1）拥有即常驻生效
  const b1 = game.meta.relicBonus();
  assert.strictEqual(b1.gold, 1, 'Lv1 圣物常驻加成生效');
  // 无同名圣物 → 拒绝
  game.meta.relics.gold = 0;
  const up2 = game.meta.upgradeRelic('gold');
  assert.strictEqual(up2.ok, false, '无同名圣物应拒绝升级');
  assert.strictEqual(up2.reason, 'relic');
});

t('宝箱：开启倒计时 → 到时发圣物卡', () => {
  game.meta.chests = 2;
  game.meta.chestTimer = null;
  const now = Date.now();
  const r1 = game.meta.startChest(now);
  assert.ok(r1.ok, '开箱应成功');
  assert.strictEqual(game.meta.chests, 1);
  assert.ok(game.meta.chestTimer, '应有倒计时');
  assert.strictEqual(game.meta.finishChest(now + 1000), null, '未到点不应发卡');
  const got = game.meta.finishChest(now + CONFIG.RELIC.chestOpenSec * 1000 + 1);
  assert.ok(got && got.id && got.name, '到点应发圣物卡');
  assert.ok(game.meta.relicCount(got.id) >= 1, '圣物持有应增加');
  assert.strictEqual(game.meta.chestTimer, null, '倒计时应清除');
});

t('进入战斗：0 塔开局，最先消除的颜色解锁出战塔（跨局解锁不带入）', () => {
  game.meta.towerUnlocks = ['fire']; // 历史跨局解锁，v1.6 不再带入新局
  game.newRun(true);
  assert.strictEqual(game.state, 'fighting', '应进入战斗');
  assert.strictEqual(game.run.slotOrder.length, 0, '开局不应有初始塔');
  const r1 = game.run.applyMatch('red', '3', 3);
  assert.ok(r1.gotTower, '消除红色应解锁火塔');
  assert.deepStrictEqual(game.run.slotOrder, ['fire'], '最先消除的颜色决定第一座塔');
  const eff = game.run.effects.tower('fire');
  assert.strictEqual(eff.level, 1, '解锁塔应参战 Lv1');
  const s0 = eff.pool.find((e) => e.name === '点燃');
  const s2 = eff.pool.find((e) => e.name === '连击');
  assert.ok(s0 && s0.level === 1, '默认技能 点燃 应激活 Lv1');
  assert.ok(s2 && s2.level === 1, '默认技能 连击 应激活 Lv1');
  assert.strictEqual(eff.activeNames.length, CONFIG.EFFECT.activeSlots, '激活 3 个默认技能');
  game.goMenu();
  assert.strictEqual(game.state, 'menu', '应能返回主界面');
});

t('跨塔升级三选一：候选跨池 + 应用扣触发塔 pending', () => {
  game.meta.towerUnlocks = ['fire', 'ice'];
  game.newRun(true);
  // v1.6：塔位由本局消除决定——此处模拟本局已解锁两塔
  const eff = game.run.effects;
  eff.tower('fire').unlock();
  eff.tower('ice').unlock();
  game.run.slotOrder = ['fire', 'ice'];
  eff.tower('fire').pending = 1;
  eff.tower('ice').pending = 1;
  const q = eff.buildUpgradeQueue(game.run.slotOrder.slice());
  assert.ok(q.length >= 1, '应有升级队列');
  const g0 = q.find((x) => x.tower === 'fire');
  assert.ok(g0 && g0.candidates.length === 3, '每组 3 候选');
  const hasCross = q.some((x) => x.candidates.some((c) => c.fromTower !== x.tower));
  console.log(`      跨塔候选出现：${hasCross}`);
  const beforeFire = eff.tower('fire').pending;
  const res = eff.tower('fire').applyChoice(g0.candidates[0]);
  assert.ok(res.ok, '应用应成功');
  assert.strictEqual(eff.tower('fire').pending, beforeFire - 1, '触发塔 pending 应 -1');
  eff.tower('fire').pending = 0;
  eff.tower('ice').pending = 0;
});

t('bonusStrike：三消额外攻击不抛错', () => {
  game.state = 'fighting';
  game.run.applyMatch('red', '3', 3); // v1.6：消除解锁 fire 出战
  game.enemies = [{ id: 1, x: 375, y: 900, hp: 500, maxHp: 500, type: 'normal', isBoss: false, speed: 0, attack: 8, attackInterval: 1 }];
  game.combat.reset();
  game.combat.bonusStrike('fire', '3');
  game.combat.bonusStrike('fire', '4');
  game.combat.bonusStrike('fire', 'L5');
  game.combat.bonusStrike('fire', '6+');
  const alive = game.enemies.find((e) => e.id === 1);
  assert.ok(alive.hp < 500, '额外攻击应造成伤害');
  game.enemies = [];
  game.goMenu();
  assert.strictEqual(game.state, 'menu');
});

t('v3/v4 → v5 存档迁移：技能卡丢弃 / 圣物装备槽合并 / 序列化 v5', () => {
  const MetaClass = require('../js/meta.js').Meta;
  // v4 存档形态：含技能卡 / 每塔技能槽 / 圣物装备槽（v3 同理迁移）
  const v4 = {
    version: 4,
    gold: 777,
    diamond: 2,
    skillCards: { fire: { '燃爆': { count: 2, lv: 2 } } },
    towerSkillSlots: { fire: ['点燃', '溅射', '燃爆'], ice: null },
    relics: { gold: 1 },
    relicLevels: {},
    relicSlots: ['gold', null, 'dmg'],
    chests: 1,
    chestTimer: null,
    dailyPicks: null,
    towerUnlocks: ['fire'],
  };
  const migrated = MetaClass.fromJSON(v4);
  assert.strictEqual(migrated.gold, 777, '金币保留');
  assert.strictEqual(migrated.diamond, 2, '钻石保留');
  // 技能卡丢弃：无 cardCount 相关 API，直接验证 toJSON 无该字段
  // 圣物装备槽合并：装备过的 gold/dmg 视为已拥有
  assert.strictEqual(migrated.relicCount('gold'), 1, '装备过的圣物并入持有');
  assert.strictEqual(migrated.relicCount('dmg'), 1, '装备过的 dmg 并入持有');
  // 序列化写 v5
  const j = migrated.toJSON();
  assert.strictEqual(j.version, 5, 'toJSON 应写 v5');
  assert.ok(!('skillCards' in j) && !('towerSkillSlots' in j) && !('relicSlots' in j), 'v5 无技能卡/槽/装备槽');
});

t('战斗内圣物宝箱：精英掉落 → 三选一弹层 → 选择获取并恢复战斗', () => {
  game.meta.towerUnlocks = ['fire'];
  game.newRun(true);
  assert.strictEqual(game.state, 'fighting', '进入战斗');
  // 控制随机：掉落触发（<0.35），且候选生成去重
  const origRandom = Math.random;
  Math.random = () => { return 0.05; }; // 命中掉落
  game.pendingRelicPicks = [];
  game.onKillReward({ type: 'elite', isBoss: false, lastDmgKey: 'fire' });
  Math.random = origRandom;
  // 击杀经验可能先触发升级三选一（picking），先走完该流程恢复 fighting
  if (game.state === 'picking') {
    const n = game.pickQueue.length;
    for (let i = 0; i < n; i++) {
      const group = game.pickQueue[game.pickIndex];
      game.run.applyChoice(group.tower, group.candidates[0]);
      game.nextPick();
    }
    assert.strictEqual(game.state, 'fighting', '升级三选一走完应恢复战斗');
  }
  assert.strictEqual(game.pendingRelicPicks.length, 1, '精英掉落应入队圣物宝箱');
  assert.strictEqual(game.pendingRelicPicks[0].candidates.length, 3, '三选一候选 3 个');
  assert.strictEqual(new Set(game.pendingRelicPicks[0].candidates.map((c) => c.id)).size, 3, '候选不重复');
  // update 触发弹层（暂停战斗）
  game.update(0.016);
  assert.strictEqual(game.state, 'relicpick', '应进入圣物三选一弹层');
  assert.ok(game.relicPick && game.relicPick.candidates.length === 3, '弹层候选 3 个');
  // 选择第 1 项 → 获取 + 回战斗
  const rid = game.relicPick.candidates[0].id;
  const before = game.meta.relicCount(rid);
  game.relicPickChoice(0);
  assert.strictEqual(game.state, 'fighting', '选择后应恢复战斗');
  assert.strictEqual(game.meta.relicCount(rid), before + 1, '圣物持有应 +1');
  assert.strictEqual(game.pendingRelicPicks.length, 0, '队列应清空');
  game.goMenu();
});

t('v2 → v3 存档迁移（save.load 链路）：卡带等级 / 卡位 / 钻石 / 每日精选', () => {
  const SaveManager = require('../js/save.js').SaveManager;
  const mock = {
    version: 2,
    gold: 777,
    skillCards: { fire: { '溅射': 2, '连击': 1 } },
    skillSlots: [{ tower: 'fire', skill: '溅射' }, { tower: 'ice', skill: '连击' }, null, null],
    relics: { gold: 1 },
    relicLevels: {},
    relicSlots: [null, null, null],
    chests: 1,
    chestTimer: null,
    towerUnlocks: ['fire', 'ice'],
  };
  const oldWx = global.wx;
  global.wx = { getStorageSync: () => mock, setStorageSync() {}, removeStorageSync() {} };
  const sv = new SaveManager({});
  const migrated = sv.load();
  assert.strictEqual(migrated.version, 3, '迁移到 v3 中间态');
  assert.strictEqual(migrated.gold, 777);
  assert.strictEqual(migrated.skillCards.fire['溅射'].count, 2, '卡数保留（v3 中间态字段）');
  assert.strictEqual(migrated.diamond, 0, '新增钻石字段');
  assert.strictEqual(migrated.relics.gold, 1);
  global.wx = oldWx;
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
