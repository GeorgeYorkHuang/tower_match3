/**
 * v5.6.9 火柱技能 · 资源清单与选帧播放拆分（D美工/工程师 第二批）
 * 从 js/game/render.js fxPillar / _fxPillarProc 机械提取【数据与选帧层】：
 *   资源路径清单、8 帧时间轴、帧选择、尺寸锚点换算、判定提示环参数、上升火星参数。
 * 伤害时间（combat.js pillarWaves.t=0.6 与 F3 立柱同帧）零改动。
 * render.js 原方法保留（Codex 接入时把内联常量替换为本模块调用即可）。
 * 纯函数、零依赖（不 require render.js，避免循环）。
 */
const ASSETS = {
  1: 'assets/images/fx/firepillar/anim_firepillar_01.png',
  2: 'assets/images/fx/firepillar/anim_firepillar_02.png',
  3: 'assets/images/fx/firepillar/anim_firepillar_03.png',
  4: 'assets/images/fx/firepillar/anim_firepillar_04.png',
  5: 'assets/images/fx/firepillar/anim_firepillar_05.png',
  6: 'assets/images/fx/firepillar/anim_firepillar_06.png',
  7: 'assets/images/fx/firepillar/anim_firepillar_07.png',
  8: 'assets/images/fx/firepillar/anim_firepillar_08.png',
};

/** v1.17.25 帧动画参数：8 帧 512×640 透明底贴图（75° 俯视） */
const N = 8;
const AR = 640 / 512;
const ANCHOR = 0.74; // 贴图内火圈椭圆中心约在 0.74H 处，对齐落点 (cx, cy)

/** 8 帧时间轴（秒，帧起始时刻）：圈落印→汇聚→立柱→拔高→满高→抵边→崩解→余烬 */
const TL = [0, 0.18, 0.60, 0.78, 1.08, 1.36, 1.68, 1.97];

/** 按时间轴选帧：返回 1..8（t<TL[i+1] 取 i+1；末帧持续到 dur）；t 已 clamp 到 [0,dur] */
function frameIndex(t, dur) {
  let fi = N;
  for (let i = 0; i < N; i++) {
    if (t < TL[i + 1]) { fi = i + 1; break; }
  }
  return fi;
}

/** 尺寸与锚点换算：宽 = 2R×1.10（R=120→264px），高 = 宽×640/512；对齐落点 (cx, cy) */
function layout(cx, cy, R) {
  const W = Math.max(24, R * 2.2);
  const H = W * AR;
  return { W, H, bx: cx - W / 2, by: cy - H * ANCHOR };
}

/**
 * 判定提示细环（0~0.6s 由 0 扩到 R，之后短暂渐隐；1.5px 细线不填充，精确标伤害范围）
 * t >= 1.0 返回 null（不绘制）；否则返回 {k, fade, radius}
 */
function warnRing(t, R) {
  if (t >= 1.0) return null;
  const k = Math.min(1, t / 0.6);
  const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  return { k, fade, radius: 10 + k * (R - 10) };
}

/** 上升火星参数（6 粒，0.6s 起与柱体伴生）；返回 [{x,y,r,color,alpha}] */
function sparkSpec(cx, cy, dur, seed, W, H, t) {
  const out = [];
  if (t <= 0.6) return out;
  const k = (t - 0.6) / (dur - 0.6);
  for (let i = 0; i < 6; i++) {
    const s = ((i * 6173 + seed * 9) % 89) / 89;
    out.push({
      x: cx + (s - 0.5) * W * 0.14,
      y: cy - (0.1 + s * 0.75) * H * 0.5 - Math.sin(t * 22 + i + seed) * 8,
      r: 2 + s * 3,
      color: s < 0.5 ? '#ff7043' : '#ffd24a',
      alpha: (1 - k) * (0.4 + s * 0.4),
    });
  }
  return out;
}

module.exports = { ASSETS, N, AR, ANCHOR, TL, frameIndex, layout, warnRing, sparkSpec };
