/* 临时冒烟（不提交）：v1.16.76 激励系统 —— meta 星级/碎片/深度宝箱/里程碑 + config 工具函数 + 菜单渲染 */
const CONFIG = require('../js/config.js');
const { Meta } = require('../js/meta.js');
const { Renderer } = require('../js/game/render.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fails++; } };

// 1) config 工具函数
ok(CONFIG.relicRarity('fire_seed') === 'ssr', 'fire_seed 应为 ssr');
ok(CONFIG.relicRarity('fire_seal') === 'r', 'fire_seal 应为 r');
ok(CONFIG.relicAttr('fire_seed') === 'attack', 'fire_seed 属性 attack');
ok(CONFIG.relicAttr('ice_spike') === 'control', 'ice_spike 属性 control');
ok(CONFIG.relicAttr('cm_power') === 'attack', 'cm_power 属性 attack');
ok(CONFIG.relicAttr('cm_wall') === 'control', 'cm_wall 属性 control');
ok(!!CONFIG.randomShardId('attack'), 'randomShardId(attack) 有值');
ok(!!CONFIG.randomShardCardId('ssr'), 'randomShardCardId(ssr) 有值');
ok(CONFIG.WAVE.maxWave > 9000, 'maxWave 已无尽化');

// 2) meta 星级/升星
const m = new Meta();
m.runCodex.fire_seed = 1;
ok(m.starOf('fire_seed') === 1, '解锁即 1★');
m.gold = 5000; m.addShard('fire_seed', 10);
ok(m.upStar('fire_seed') === null, '2★ 升星成功');
ok(m.starOf('fire_seed') === 2, '星级=2');
m.addShard('fire_seed', 30); m.gold = 5000; m.starStones = 1;
ok(m.upStar('fire_seed') === null, '3★ 升星成功（金级带星辉石）');
ok(m.starOf('fire_seed') === 3 && m.starStones === 0, '3★ 消耗星辉石');
ok(m.upStar('fire_seed') === '已达 3★', '3★ 封顶');
m.runCodex.ice_spike = 1; m.gold = 100;
ok(m.upStar('ice_spike') === '金币不足', '金币不足拦截');
ok(m.upStar('nonexist_x') === '未解锁该圣遗物', '未解锁拦截');

// 3) 里程碑 + 深度宝箱
const mi = m.checkMilestone(22);
ok(mi.includes(10) && mi.includes(20), '22 波首达 10/20');
ok(m.checkMilestone(22).length === 0, '重复不重复发');
ok(m.bestWave === 22, 'bestWave 更新');
const tier = m.tierByWave(22);
ok(tier.key === 'silver', '22 波 → 白银');
ok(m.tierByWave(5).key === 'wood' && m.tierByWave(50).key === 'star', '档位边界');
ok(m.grantDeepChest(tier) === true, '发放宝箱');
m.deepChests[0].openAt = Date.now() - 1;   // 置为就绪
const gain = m.openDeepChest(0);
ok(gain && gain.gold > 0 && gain.shards > 0, '开启收益入账');
ok(m.deepChests.length === 0, '开启后移除');
// 槽位上限
for (let i = 0; i < 5; i++) m.grantDeepChest(CONFIG.DEPTH_CHEST.tiers[4]);
ok(m.deepChests.length === CONFIG.DEPTH_CHEST.slots, '槽位上限 4');
ok(m.grantDeepChest(CONFIG.DEPTH_CHEST.tiers[4]) === false, '槽满拒绝');
// 未就绪速开
m.deepChests = [];
m.grantDeepChest(CONFIG.DEPTH_CHEST.tiers[4]);
m.diamond = 100;
ok(m.speedOpen(0) === true, '钻石速开成功');
ok(m.diamond < 100, '速开扣钻');

// 4) 每日首战
const b1 = m.dailyFirstBonus('lava', Date.now());
const b2 = m.dailyFirstBonus('lava', Date.now());
const b3 = m.dailyFirstBonus('lava', Date.now());
ok(b1 === 1.5 && b2 === 1.5 && b3 === 0.5, '首战前2局×1.5之后×0.5');

// 5) 菜单渲染（新面板/新状态）
function mockCtx() {
  return {
    font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    measureText: () => ({ width: 100 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect() {}, strokeRect() {}, fill() {}, stroke() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, arcTo() {}, closePath() {}, quadraticCurveTo() {}, bezierCurveTo() {}, fillText() {}, strokeText() {},
    rect() {}, drawImage() {}, clip() {}, save() {}, restore() {}, setTransform() {}, translate() {}, rotate() {}, scale() {},
  };
}
const r = new Renderer();
const s = {
  tab: 'battle', gold: 5000, diamond: 50, stage: 'lava', chests: 1, chestOpenSec: 30,
  relics: [], daily: { picks: [] }, panel: null, codexSel: 'fire',
  towerCodex: { fire: 1, ice: 1, poison: 1, electric: 1 },
  relicStars: m.relicStars, shards: m.shards, starStones: m.starStones,
  runCodex: m.runCodex, relicScroll: 0,   // v1.17.20 补齐：menuRelic 读取 runCodex/relicScroll
  deepChests: [{ tier: 'star', name: '星辉宝箱', ready: false, remainMin: 300 }, { tier: 'silver', name: '白银宝箱', ready: true, remainMin: 0 }],
  bestWave: 22, debug: true,
};
for (const tab of ['battle', 'shop', 'relic', 'codex']) {
  s.tab = tab;
  try { r.menuLayer(mockCtx(), s); console.log('menuLayer[' + tab + '] OK'); } catch (e) { console.error('menuLayer[' + tab + '] THROW:', e.stack.split('\n')[0]); fails++; }
}
// 升星面板 + 调试面板
s.panel = { type: 'starUp' };
try { const it = r.menuLayer(mockCtx(), s); console.log('starUp OK, rows=', it.filter(i => i.key === 'relicStar').length); } catch (e) { console.error('starUp THROW:', e.stack.split('\n')[0]); fails++; }
s.panel = { type: 'debug' };
try { const it = r.menuLayer(mockCtx(), s); console.log('debug OK, acts=', it.filter(i => i.key.startsWith('dbg_')).length); } catch (e) { console.error('debug THROW:', e.stack.split('\n')[0]); fails++; }
// 战场卡 5 战场
for (const st of ['ancient', 'lava', 'frost', 'abyss', 'test']) {
  s.tab = 'battle'; s.stage = st; s.panel = null;
  try { r.menuLayer(mockCtx(), s); } catch (e) { console.error('field[' + st + '] THROW:', e.stack.split('\n')[0]); fails++; }
}
console.log('fields OK');
// 撤离层 + gameOver 摘要
try { const H = {}; r.evacuationLayer(mockCtx(), { run: { wave: 10 }, depthPool: 1234, depthMult: 1.3 }, H); ok(H.evacGo && H.evacStay, '撤离层按钮'); console.log('evac OK'); } catch (e) { console.error('evac THROW:', e.stack.split('\n')[0]); fails++; }
try { const btn = {}; r.gameOver(mockCtx(), { summary: { evacuated: true, wave: 42, payout: 999, miles: [10, 20, 40], chestName: '星辉宝箱', chestGranted: true, shards: 12, depthMult: 2.1 } }, btn); ok(btn.hit, 'gameOver 摘要按钮'); console.log('gameOver OK'); } catch (e) { console.error('gameOver THROW:', e.stack.split('\n')[0]); fails++; }

process.exit(fails ? 1 : 0);
