/**
 * opening-pick.js ——「击杀·历练」三星的开局奖励。
 * 图鉴升到三星后，每个正式对局额外提供一次三选一；不要求先在局内抽到历练。
 * 本局标记用于防止重复发放，不写入账号存档；重新开局会重新获得机会。
 */
'use strict';
const CONFIG = require('../config.js');
const ID = 's_sr_cm_exp'; // 保留原编号，兼容既有解锁、星级和碎片。

function queue(game) {
  const { run, meta } = game;
  if (!CONFIG.STAR3_ENABLED || !run || !meta || run._openingRelicPickQueued) return false;
  if (game.state === 'testfield' || game.menuStage === 'test') return false;
  const count = CONFIG.relicValue(ID, 'openingPick', meta.starOf(ID));
  if (count <= 0) return false;
  // 开局还没有激活塔：使用全部塔系与通用池，沿用普通品质概率及去重规则。
  const candidates = game._rollRelicCandidates(false, { opening: true });
  if (!candidates || !candidates.length) return false;
  game.pendingRelicPicks.push({ candidates, opening: true });
  run._openingRelicPickQueued = true;
  return true;
}

function finish(game) {
  // 开局选到城墙属性时，在第一只怪推进前更新生命上限与满血值。
  const bonus = game.meta.relicBonus();
  const wall = game.run.relicNum('s_sr_cm_wall');
  game.run.lineHp = Math.round(CONFIG.LINE.hp * (1 + 0.10 * bonus.wall) * (1 + wall / 100));
  game.run.lineMaxHp = game.run.lineHp;
  // 新手引导在开局选择完成后开始，避免引导遮罩吞掉三选一的点击。
  require('../game/tutorial.js').begin(game);
}

module.exports = { queue, finish };
