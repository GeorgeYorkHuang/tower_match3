'use strict';
const CONFIG = require('../config.js');
const GlobalSkills = require('../global-skills.js');
// Slot/ammo and shuffle/refill coordination here; catalog effects remain in skills/global-runtime.

function castGlobal(combat, which) {
  const g = combat.game;
  if (!g.run.spendAmmo(which)) return false;
  const GS = CONFIG.GLOBAL_SKILL;
  const index = which === 'shuffle' ? 0 : 1;
  which = (g.run.globalSlots || ['shuffle','refill'])[index];
  if (which !== 'shuffle' && which !== 'refill') return GlobalSkills.cast(combat,which);
  if (which === 'shuffle') {
    // 全局洗牌：打乱当前三消棋盘所有方块（重新生成，无初始三消）
    const b = g.run.board;
    if (b) b.grid = b.genBoard();
    g.anim = null;                       // 清掉进行中交换/消除动画，避免与新棋盘渲染冲突
    g.selected = null; g.pickCell = null;
    combat.fxFlash(375, 800, '#ff8c42', 0.5);
    combat.fxRing(375, 800, '#ff8c42', 300, 0.5, 8);
    g.toast && g.toast('🔀 全局洗牌', '#ff8c42');
    // v1.16.89 洗牌重做：额外触发一遍已有技能——周期技计时器置满立即触发一次 + 全体塔按已激活技能数追加普攻
    const n = combat.castGlobalBurst();
    if (n > 0) g.toast && g.toast(`⚡ 技能齐发 · 全塔普攻 ×${n}`, '#ff8c42');
    // v1.16.96 战术转移3★：洗牌后 2 秒内全塔伤害 ×1.3（shotDmg 统一乘区）
    if (g.run.relic3('cm_shuffle')) g.run._shuffleBuffTtl = 2;
  } else {
    // 能量补给：所有已解锁塔各 +refillEnergy（封顶能量上限）
    let refilled = 0;
    Object.keys(g.run.slotOrder).forEach((_, i) => {
      const tk = g.run.slotOrder[i];
      const tw = g.run.effects.tower(tk);
      if (!tw || tw.level <= 0) return;
      const before = tw.energy;
      tw.energy = Math.min(before + GS.refillEnergy, g.run.armoryEnergyMax());
      refilled += tw.energy - before;
    });
    combat.fxFlash(375, 800, '#7ef0a3', 0.5);
    combat.fxRing(375, 800, '#7ef0a3', 300, 0.5, 8);
    g.toast && g.toast(`🔋 能量补给 +${GS.refillEnergy}`, '#7ef0a3');
    if (refilled > 0) g.toast && g.toast(`全场补给 ${Math.round(refilled)} 点`, '#7ef0a3');
  }
  return true;
}

function castGlobalBurst(combat) {
  const g = combat.game;
  // 统计已激活技能数（周期技 + 非周期技，含默认激活与三选一获取，level>0 即算）
  let n = 0;
  g.run.slotOrder.slice().forEach((key) => {
    const t = combat.tower(key);
    if (!t || t.level === 0) return;
    n += (t.pool || []).filter((e) => e.level > 0).length;
  });
  // 周期技立即触发一遍：全部周期计时器置满 → 以极小 dt 推进各周期技 tick（越过阈值即触发并复位计时）
  Object.keys(combat.timers).forEach((k) => { combat.timers[k] = 9999; });
  combat.tickFire(0.001); combat.tickIce(0.001); combat.tickElectric(0.001);
  combat.tickPoison(0.001); combat.tickCannon(0.001); combat.tickBoomerang(0.001);
  // 每塔额外普攻 N 次（N = 已激活技能总数；无目标时 attackOnce 内部静默跳过）
  if (n > 0) g.run.slotOrder.slice().forEach((key) => {
    for (let i = 0; i < n; i++) combat.attackOnce(key);
  });
  return n;
}

module.exports = { castGlobal, castGlobalBurst };
