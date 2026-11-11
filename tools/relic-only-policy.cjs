/** 离线圣物构筑策略：只看当前候选、在场塔和预设技能；不预看后续随机数，不修改游戏配置。 */
'use strict';
const CONFIG = require('../js/config.js');

// 卡片依赖原本计划学习的技能；通用普攻附带的灼烧、中毒、冰缓、流血同样可受益。
const dependencies = {
  s_sr_fire_rain: ['火雨'], s_sr_fire_wall: ['烈焰墙'], s_fire_rain: ['火雨'],
  s_sr_ice_boom: ['冰花'], s_ice_bloom: ['冰花'], s_sr_ice_freeze: ['冰冻'],
  s_sr_poison_pool: ['毒池'], s_sr_poison_stick: ['毒棒'], s_poison_nest: ['毒棒'],
  s_sr_elec_storm: ['雷暴'], s_elec_field: ['雷暴'],
  s_sr_boo_hunt: ['折返增伤'], s_sr_boo_multi: ['多镖'], boo_cyclone: ['风暴镖'],
  s_sr_can_knock: ['震击'], s_can_splash: ['双管齐射', '炮火支援'],
};
const periodic = new Set(['火柱', '火雨', '烈焰墙', '冰花', '冬珠', '冰墙', '毒棒', '毒池', '毒藤',
  '雷暴', '极光电击', '球形闪电', '弹力镖', '风暴镖', '风眼涡旋', '炮台', '炮火支援', '地雷阵', '碎裂弹']);

function score(g, candidate, routes) {
  const id = candidate.id, key = candidate.tint;
  const skills = (routes[key] || []).map(([name]) => name);
  if (key !== 'common' && !g.run.slotOrder.includes(key)) return -10;
  if (dependencies[id] && !dependencies[id].some(name => skills.includes(name))) return .1;
  if (id === 's_sr_cm_exp') return g.run.wave < 20 ? 8 : 5;
  if (id === 's_sr_cm_triple') return g.run.wave < 20 ? 5 : 3;
  if (id === 's_sr_cm_wall') return g.run.lineHp < g.run.lineMaxHp * .5 ? 7 : 5;
  if (id === 's_sr_cm_regen') return g.run.lineHp < g.run.lineMaxHp * .8 ? 6 : 4;
  if (id === 's_sr_cm_bounty') return 0; // 本测试不重掷，不能把费用减免当输出收益。
  const tower = g.combat.tower(key);
  if (id.endsWith('_energy')) return tower && tower.energy < 40 ? 9 : 5;
  if (id.endsWith('_atk')) return 6;
  if (id.endsWith('_spd')) return 5.5;
  if (id.endsWith('_cd')) return skills.some(name => periodic.has(name)) ? 5 : .5;
  if (id.endsWith('_cap')) return tower && tower.energy >= 80 ? 3 : 1;
  if (id === 's_poison_curse') return 9;
  if (id === 's_fire_burn') return 8;
  if (id === 'boo_tip' || id === 'can_war') return 7;
  if (id === 's_ice_chill' || id === 's_elec_shock') return 6;
  return CONFIG.relicRarity(id) === 'ssr' ? 8 : 6.5;
}
function select(g, candidates, routes, strategy = 'build') {
  if (strategy === 'first') return 0;
  const values = candidates.map(c => score(g, c, routes));
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

function chestMove(g, fallback) {
  const board = g.run.board, grid = board.grid;
  const chests = [];
  grid.forEach((row, r) => row.forEach((v, c) => { if (v && typeof v === 'object' && v.s === 'chest' && !v.arriving) chests.push([r, c]); }));
  if (!chests.length) return fallback();
  let best = null, count = 0;
  for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) {
    for (const [rr, cc] of [[r, c + 1], [r + 1, c]]) {
      if (!board.inRange(rr, cc)) continue;
      const a = grid[r][c], b = grid[rr][cc];
      if (typeof a !== 'string' || typeof b !== 'string' || a === b) continue;
      let matches;
      try { grid[r][c] = b; grid[rr][cc] = a; matches = board.findMatches(); }
      finally { grid[r][c] = a; grid[rr][cc] = b; }
      const cells = matches.flatMap(m => m.cells);
      const adjacent = chests.filter(([cr, co]) => cells.some(([mr, mc]) => Math.abs(cr - mr) + Math.abs(co - mc) === 1)).length;
      if (adjacent > count) { best = [[r, c], [rr, cc]]; count = adjacent; }
    }
  }
  return best || fallback();
}

module.exports = { score, select, chestMove };
