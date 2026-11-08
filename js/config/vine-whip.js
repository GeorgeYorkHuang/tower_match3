/**
 * 毒棒的 Vine whip 表现配置：常驻呼吸与实际攻击共用根部和图集。
 * Vine whip 是素材名称；毒藤技能继续使用其原有表现，不读取此配置。
 */
'use strict';
const DIR = 'assets/images/towers/fx/vine-whip-v1/';

module.exports = {
  idle: { src: DIR + 'vine-idle.png', duration: 2.4, fps: 20 },
  attack: { src: DIR + 'vine-attack.png', duration: 1.4, fps: 20 },
  pivot: { x: 68, y: 122 },
  frameSize: { w: 232, h: 140 },
  scale: 1.1,
  rootOffsetY: 8,
  fadeSeconds: 0.35,
  attackPlayback: { maximum: 0.75, ratio: 0.75 },
};
