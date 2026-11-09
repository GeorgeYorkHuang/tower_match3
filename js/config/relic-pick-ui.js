/** 圣遗物三选一品质外观；粒子数量与时长集中配置，均为一次性弹出演出。 */
'use strict';
module.exports = {
  r: {
    label: 'R', edge: '#69baff', inner: '#2f638d', light: '#bce3ff',
    top: '#172d46', bottom: '#101c2c', buttonTop: '#254765', buttonBottom: '#152c43',
    glow: 'rgba(86,173,255,0.22)', particles: 0, duration: 0, flashMs: 0,
  },
  sr: {
    label: 'SR', edge: '#ba83ff', inner: '#704a99', light: '#eddaff',
    top: '#30203f', bottom: '#1c142b', buttonTop: '#513469', buttonBottom: '#31203f',
    glow: 'rgba(181,118,255,0.24)', particles: 8, duration: 850, flashMs: 280,
  },
  ssr: {
    label: 'SSR', edge: '#ffcf55', inner: '#b8842f', light: '#fff0b7',
    top: '#3e3016', bottom: '#241b0f', buttonTop: '#62481d', buttonBottom: '#3c2b11',
    glow: 'rgba(255,204,73,0.32)', particles: 48, duration: 1250, flashMs: 420,
  },
};
