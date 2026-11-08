'use strict';
/* 小 Boss「圣坛蔓钟」——每 5 波（5,10,15...）的无脚本 Boss（isBoss 且无 bossId）。
 * 贴图：enemies.js BOSS_ART.miniboss_bell（钟摆 8 帧，bossArtKey 标记由 wave.js spawnOne 写入）。
 * 特色机制：周期性"敲钟"——钟体震出金色光环，并从波次投放队列释放 2 只花粉小怪（isSummon）。
 * 数值均为建议值，owner 可调：RING_CD / RING_MAX / SPAWN_N / SPAWN_HP_MULT。 */
const RING_CD = 7.0;        // 敲钟间隔（秒）
const RING_MAX = 3;         // 每只蔓钟最多敲钟次数（防波次无限延长）
const SPAWN_N = 2;          // 每次敲钟震出小怪数
const SPAWN_HP_MULT = 0.6;  // 小怪血量 = 本波主等级普通怪 × 0.6

function tick(g, dt) {
  if (!g.enemies || !g.enemies.length) return;
  const boss = g.enemies.find(e => e.isBoss && e.bossArtKey === 'miniboss_bell' && e.hp > 0);
  if (!boss) return;
  boss._ringClock = (boss._ringClock || 0) + dt;
  if (boss._ringClock < RING_CD) return;
  boss._ringClock %= RING_CD;
  if ((boss._ringCount || 0) >= RING_MAX) return;
  boss._ringCount += 1;
  const ENEMY = require('../config.js').ENEMY;
  const lv = ENEMY.mainLevel(g.run.wave);
  const hp = ENEMY.levelOf(lv).hp * SPAWN_HP_MULT;
  for (let i = 0; i < SPAWN_N; i++) {
    g.wave.plan.push({ lv, type: 'normal', hp, offset: 0.5 + Math.random() * 0.3, isBoss: false, isSummon: true });
  }
  g.wave.planDoneAt = null;   // 有新投放，重置投放完成时间戳
  g.fx.push({ type: 'ring', x: boss.x, y: boss.y, t: 0, dur: 0.5, color: '#e8c878', rMax: 110 });
}

module.exports = { tick };
