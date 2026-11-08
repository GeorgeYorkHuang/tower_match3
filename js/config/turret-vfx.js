/** 召唤炮台图集配置：常驻待机与开火后坐，共用固定底座锚点。 */
'use strict';
const DIR = 'assets/images/towers/fx/turret-v2/';

module.exports = {
  idle: { src: DIR + 'turret-idle.png', fps: 20, duration: 2.4 },
  fire: { src: DIR + 'turret-fire.png', fps: 20, duration: 0.8 },
  frameSize: { w: 224, h: 128 },
  pivot: { x: 60, y: 112 },
  scale: 1.15,
  fadeSeconds: 0.35,
  firePlayback: { maximum: 0.8, ratio: 0.85 },
};
