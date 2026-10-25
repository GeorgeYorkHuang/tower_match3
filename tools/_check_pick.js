/**
 * _check_pick.js —— mock canvas 验证 v1.16.45 三选一布局 + gameover 按钮修复（过程文件，非交付）
 */
const CONFIG = require('../js/config.js');
const { Renderer } = require('../js/game/render.js');

const ctx = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (!(k in t)) t[k] = () => {};
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; },
});
const r = new Renderer();

// 1) 三选一：技能卡（长描述）+ 分支卡 混合候选
const group = {
  tower: 'fire', target: null,
  candidates: [
    { name: '灼烧', type: 'skill', fromTower: 'fire', desc: CONFIG.EFFECT_POOLS.fire.find(q => q.name === '灼烧').desc },
    { name: '点燃', type: 'branch', branch: 'A', branchLv: 2, fromTower: 'fire', desc: CONFIG.EFFECT_POOLS.fire.find(q => q.name === '点燃').a },
    { name: '火柱', type: 'branch', branch: 'C', branchLv: 0, fromTower: 'fire', desc: CONFIG.EFFECT_POOLS.fire.find(q => q.name === '火柱').c },
  ],
};
const onPick = [];
r.pickLayer(ctx, group, 3, onPick);
if (onPick.length !== 3) throw new Error('onPick 数量错误');
if (!onPick.every((o) => o && typeof o.hit === 'function')) throw new Error('onPick 结构错误');

// 2) gameover：按钮修复验证（restart.hit 应为函数，toMenu 为对象）
const rb = {};
r.gameOver(ctx, { wave: 3, gold: 1200, synDoneCount: 1 }, rb);
if (typeof rb.hit !== 'function') throw new Error(`restart.hit 应为函数，实际 ${typeof rb.hit}`);
if (!rb.toMenu || typeof rb.toMenu.hit !== 'function') throw new Error('toMenu.hit 应为函数');
if (!rb.hit(300, 840) || !rb.hit(500, 820)) throw new Error('重新开局按钮命中区异常');
if (rb.hit(300, 900) || rb.hit(600, 840)) throw new Error('重新开局按钮命中区外误判');
if (!rb.toMenu.hit(300, 950) || rb.toMenu.hit(300, 900)) throw new Error('返回主界面按钮命中区异常');

console.log('三选一布局 + gameover 按钮修复验证通过');
