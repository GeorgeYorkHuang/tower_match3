/**
 * battle-drops.js —— 局内宝箱节点及Boss奖励去重。
 * 按敌人的归属波次判定；所有领取标记只保存在当前Run，支持残怪跨波击杀。
 */
'use strict';
const RULE = require('../config/battle-relic-drops.js');

function scheduled(game) { return RULE.fields.includes(game.menuStage); }
function bossRarity(wave) {
  if (RULE.goldBossWaves.includes(wave)) return 'ssr';
  return RULE.ordinaryBossWaves.includes(wave) ? 'mixed' : null;
}
function claimBoss(game, enemy) {
  if (!enemy.isBoss) return false;
  const wave = enemy.waveNo || game.run.wave;
  const paid = game.run._bossRewardsGranted || (game.run._bossRewardsGranted = {});
  if (paid[wave]) return false;
  paid[wave] = true;
  return true;
}
function grantBossChest(game, enemy) {
  const wave = enemy.waveNo || game.run.wave;
  const rarity = bossRarity(wave);
  if (!rarity || enemy.isFinalBoss) return false;
  game.fieldChests.push({ x: enemy.x, y: enemy.y, t: 0,
    kind: rarity === 'ssr' ? 'majorBoss' : 'miniBoss', waveNo: wave,
    ...(rarity === 'ssr' ? { rarity: 'ssr' } : {}) });
  game.run._waveChestDropped = true;
  game.toast(rarity === 'ssr' ? '金色圣物宝箱 · 消除棋盘相邻方块领取' : 'Boss宝箱 · 消除棋盘相邻方块领取', '#f7c948');
  return true;
}
function emptyGold(game, rarity) {
  if (rarity !== 'ssr') return false;
  game.run.gold += RULE.emptyGoldSilver;
  game.toast('金色圣遗物已全部获得 · 补偿' + RULE.emptyGoldSilver + '银币', '#f7c948');
  return true;
}
module.exports = { scheduled, bossRarity, claimBoss, grantBossChest, emptyGold };
