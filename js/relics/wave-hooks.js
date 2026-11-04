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
  // 金库3★：记录波初城墙血（波末无伤判定）
  run._waveStartHp = run.lineHp;
  // v1.17.43 UR 未凋之种：本波召唤物击杀加成本波清零（按波结算）
  run._seedBonus = 0;
  run._waveChestDropped = false;
}

function endWave(run) {
  // v1.16.78 金库：每波结束银币 +N%（按星级）；v1.16.96 3★：本波城墙无伤时银币额外 +30%
  run.gold += Math.round(run._waveGold * (1 + run.relicNum('cm_vault') / 100));
  if (run.relic3('cm_vault') && run.lineHp >= run._waveStartHp - 0.001) {
    run.gold += Math.round(run._waveGold * 0.3);
    run.relicFx('cm_vault', '无伤银币 +30%'); // v1.17 生效提示
  }
  // 新通用卡：低血量时的磐石回复与每波自愈分别结算；低血量条件按波末原血量判定。
  const maxHp = run.lineMaxHp || CONFIG.LINE.hp;
  const lowHpHeal = run.relic3('s_sr_cm_wall') && run.lineHp < maxHp * 0.3
    ? run.relicValue('s_sr_cm_wall', 'lowHpRegen') : 0;
  const regenBase = run.relicNum('s_sr_cm_regen');
  const regenMult = run.relic3('s_sr_cm_regen')
    ? run.relicValue('s_sr_cm_regen', 'regenMult') : 1;
  const regen = regenBase * (regenMult || 1);
  const totalRegen = lowHpHeal + regen;
  if (totalRegen > 0) {
    run.lineHp = Math.min(maxHp, run.lineHp + maxHp * totalRegen / 100);
    if (lowHpHeal) run.relicFx('s_sr_cm_wall', `低血回复 ${lowHpHeal}%`);
    if (regen) run.relicFx('s_sr_cm_regen', `城墙回复 ${regen}%`);
  }
}

module.exports = { startWave, endWave };
