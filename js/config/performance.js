/** 战斗表现预算。只约束绘制和缓存，不参与伤害、攻速或出怪计算。 */
'use strict';
module.exports = Object.freeze({
  // 优先保留新命中产生的装饰粒子，弹道与技能主体不受此上限影响。
  particlePointsPerFrame: 240,
  imageCache: Object.freeze({
    maxBytes: 64 * 1024 * 1024,
    idleMs: 20000,
    graceFrames: 2,
    sweepEveryFrames: 60,
  }),
  debuff: Object.freeze({
    actorCache: 96,
    frameCache: 160,
    pending: 96,
    // 每帧最多读回一个新轮廓、合成一张状态图，避免后期集中阻塞。
    actorReadsPerFrame: 1,
    buildsPerFrame: 1,
    staleRequestFrames: 8,
  }),
});
