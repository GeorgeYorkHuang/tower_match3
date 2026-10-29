/**
 * v5.6.9 火墙技能 · 资源清单与选帧播放拆分（D美工/工程师 第二批）
 * 从 js/game/render.js fxFireWall / _fxFireWallProc 机械提取【数据与选帧层】：
 *   资源路径清单、帧数/FPS/宽高比、错相循环选帧、尺寸锚点换算、淡入淡出曲线、上升火花参数。
 * 伤害时间（combat.js fireWall dur / 结算节奏）零改动。
 * render.js 原方法保留（Codex 接入时把内联常量替换为本模块调用即可）。
 * 纯函数、零依赖（不 require render.js，避免循环）。
 */
const ASSETS = {
  1: 'assets/images/fx/firewall/anim_firewall_01.png',
  2: 'assets/images/fx/firewall/anim_firewall_02.png',
  3: 'assets/images/fx/firewall/anim_firewall_03.png',
  4: 'assets/images/fx/firewall/anim_firewall_04.png',
};

/** v1.17.17/18 帧动画参数：4 帧 512×160 透明底贴图，12fps 循环 */
const N = 4;
const FPS = 12;
const AR = 160 / 512;

/** 错相循环选帧（同屏多面火墙不同步）：返回 1..N */
function frameIndex(t, seed) {
  return ((Math.floor(t * FPS + seed * 1.7) % N + N) % N) + 1;
}

/** 尺寸与锚点换算：底边贴地面线，宽=墙宽，高按 512:160 */
function layout(cx, cy, w, h) {
  const FW = Math.max(24, w);
  const FH = Math.round(FW * AR);
  return { FW, FH, bx: cx - FW / 2, by: cy + h / 2 - FH };
}

/** 淡入淡出曲线：0~0.1 淡入，0.85~1 淡出，中间全亮 */
function fade(p) {
  return p < 0.1 ? p / 0.1 : (p > 0.85 ? (1 - p) / 0.15 : 1);
}

/** 上升火花参数（5 粒，代码层粒子：贴图给形，粒子给活）；返回 [{x,y,r,color,alpha}] */
function sparkSpec(cx, cy, seed, w, h, p, fadeVal) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const s = ((i * 8191 + seed * 7) % 89) / 89;
    out.push({
      x: cx - w / 2 + (s - 0.2) * w * 0.9,
      y: cy + h / 2 - (0.2 + s * 0.8) * h * 1.4 - Math.sin(p * 22 + i * 1.3) * 6,
      r: 1.6 + s * 2.4,
      color: s < 0.6 ? '#ff7043' : '#ffd24a',
      alpha: (0.3 + s * 0.5) * fadeVal,
    });
  }
  return out;
}

module.exports = { ASSETS, N, FPS, AR, frameIndex, layout, fade, sparkSpec };
