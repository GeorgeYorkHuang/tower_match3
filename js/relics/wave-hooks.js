'use strict';
// Wave-local relic state belongs to the supplied Run, never the shared definitions.
const CONFIG = require('../config.js');

function startWave(run) {
  // v1.16.78 战术转移：每波免费洗牌 +N 次（按星级）；v1.16.96 3★ 额外 +1 次
  const shN = run.relicNum('cm_shuffle');
  if (shN > 0) {
    run.freeShuffle += shN + (run.relic3('cm_shuffle') ? 1 : 0);
    run.relicFx('cm_shuffle', `免费洗牌 +${shN + (run.relic3('cm_shuffle') ? 1 : 0)}`); // v1.17 生效提示
  }
  // v1.16.96 金库3★：记录波初城墙血（波末无伤判定）；赏金猎人3★：连续无宝箱波计数
  run._waveStartHp = run.lineHp;
  if (run.relic3('cm_bounty')) {
    if (run._waveChestDropped) run._bountyStreak = 0;
    else run._bountyStreak += 1;
  }
  run._waveChestDropped = false;
}

function endWave(run) {
  // v1.16.78 金库：每波结束银币 +N%（按星级）；v1.16.96 3★：本波城墙无伤时银币额外 +30%
  run.gold += Math.round(run._waveGold * (1 + run.relicNum('cm_vault') / 100));
  if (run.relic3('cm_vault') && run.lineHp >= run._waveStartHp - 0.001) {
    run.gold += Math.round(run._waveGold * 0.3);
    run.relicFx('cm_vault', '无伤银币 +30%'); // v1.17 生效提示
  }
  // v1.16.78 生命回复：每波结束城墙回复 N% 生命；v1.16.96 3★：回复溢出转为护盾（上限10%最大血量）
  const regen = run.relicNum('cm_regen');
  if (regen > 0) {
    const maxHp = run.lineMaxHp || CONFIG.LINE.hp;
    const healed = maxHp * regen / 100;
    const before = run.lineHp;
    run.lineHp = Math.min(maxHp, run.lineHp + healed);
    const overflow = healed - (run.lineHp - before);
    if (overflow > 0 && run.relic3('cm_regen')) {
      run.wallShield = Math.min(maxHp * 0.1, run.wallShield + overflow);
    }
    run.relicFx('cm_regen', `城墙回复 ${regen}%`); // v1.17 生效提示
  }
}

function bountyGuarantee(run) {
  if (!run.relic3('cm_bounty') || run._bountyStreak < 3) return false;
  run._bountyStreak = 0;
  return true;
}

module.exports = { startWave, endWave, bountyGuarantee };
