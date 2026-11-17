'use strict';
// 熔岩/霜风 Boss 扩展规格；已接入项生命预算仍待独立平衡。
// 只保存定义，不保存 encounter、Enemy 或图像对象。
module.exports = {
  lava_twins: {
    id: 'lava_twins', field: 'lava', wave: 40, name: '熔脉双生·卡洛斯',
    threshold: 0.60, twinHpRatio: 0.30, phaseStun: 0.5,
    suppressionPeriod: 10, suppressionDuration: 3, attackRateScale: 0.92,
    resonancePeriod: 10, resonanceMax: 3, attackPerStack: 0.12,
    // 17.5% + 3×5个百分点 = 32.5%，旧稿29.5%为算术错误。
    twinArmor: 0.175, armorPerStack: 0.05,
    syncWindow: 8, survivorHealRatio: 0.15,
  },
  frost_twins: {
    id: 'frost_twins', field: 'frost', wave: 40, name: '双啸霜灵·维尔德',
    threshold: 0.60, twinHpRatio: 0.30, phaseStun: 0.5,
    suppressionPeriod: 10, suppressionDuration: 3, attackRateScale: 0.92,
    resonancePeriod: 10, resonanceMax: 3, attackPerStack: 0.12,
    splitHaste: 1.10, splitHasteDuration: 4, twinSpeed: 1.30,
    syncWindow: 8, survivorHealRatio: 0.15,
  },
  lava_ignis: {
    id: 'lava_ignis', field: 'lava', wave: 60, tier: 'final', name: '熔心巨像·伊格尼斯',
    thresholds: [0.70, 0.35], phaseNames: ['升温', '抛核', '过载'],
    standoffRatio: 0.80, phaseStun: 0.5,
    suppressionPeriod: 12, suppressionDuration: 4, intervalScale: 1.25,
    summonPeriod: 15, summonCount: 5,
    hp: 183000, armor: 0.45, attack: 450, speed: 0.95, genLv: 13,
    spawnInterval: 0.2, edgeInset: 75,
    summonHp: 1280, summonLv: 12, summonLimit: 10, coreWallRatio: 0.01,
    adds: [
      [...Array(10).fill(13), ...Array(6).fill(14)],
      [...Array(14).fill(13), ...Array(6).fill(14)],
      [...Array(17).fill(13), ...Array(7).fill(14)],
    ],
    castDuration: 8, interruptDamageRatio: 0.05, interruptDelay: 8, wallDamageRatio: 0.25,
  },
  frost_skall: {
    id: 'frost_skall', field: 'frost', wave: 60, tier: 'final', name: '霜风之喉·斯卡尔',
    thresholds: [0.70, 0.35], phaseNames: ['寒风', '霜影', '冰封'],
    standoffRatio: 0.80, phaseStun: 0.5,
    suppressionPeriod: 10, suppressionDuration: 3, intervalScale: 1.30,
    shadowThresholds: [0.70, 0.40], shadowCount: 2, shadowSpeed: 2.20,
    freezePeriod: 15, freezeTowerCount: 2, freezeDuration: 4, freezeWarning: 1,
    hp: 281000, armor: 0.20, attack: 400, speed: 1.55, genLv: 13,
    spawnInterval: 0.2, edgeInset: 75, shadowHp: 1405, shadowLv: 14,
    adds: [
      [...Array(4).fill(13), ...Array(20).fill(14)],
      [...Array(6).fill(13), ...Array(24).fill(14)],
      [...Array(7).fill(13), ...Array(29).fill(14)],
    ],
  },
};
