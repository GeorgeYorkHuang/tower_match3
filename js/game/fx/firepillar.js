/**
 * v1.17.36 火柱技能 · 分层资源与选帧（owner 新素材：地面火环 6 帧 + 火龙卷 6 帧）
 * 拆分动机：owner 要求【地面效果画在怪物下层、火柱本体画在怪物上层】，
 * 因此一套特效拆成两个 f.type：pillarBase（下层通道 fxGround）/ pillar（上层通道 fx）。
 *
 * 【下层 pillarBase】512×512 地面火环，内容居中 → 椭圆中心 = 锚点 (cx, cy)
 * 【上层 pillar】    512×768 火龙卷，内容水平居中、底边贴画布底 → 底边 = 锚点 (cx, cy)
 *
 * 时间轴（dur = 2.4s，与 pillarBalance.effectDuration 一致）：
 *   0.00~0.60  地面火环起旋 + 判定提示环扩张（伤害结算 pillarWaves.t=0.6 命中）
 *   0.55       火柱自地面涌出（与伤害同帧），0.55~0.85 拔高
 *   0.85~1.90  柱体满高持续（6 帧 12fps 循环 ≈ 2.6 圈）
 *   1.90~2.40  崩解收束（缩小 + 渐隐）
 * 伤害时间与 Nadu 状态毫秒不动地沿用旧版：delay 0.6s、伤害/余烬逻辑不变。
 * 纯函数、零依赖（不 require render.js，避免循环）。
 */

/** 上层：火柱本体 6 帧 */
const ASSETS = {
  1: 'assets/images/towers/fx/firepillar/anim_firepillar_01.png',
  2: 'assets/images/towers/fx/firepillar/anim_firepillar_02.png',
  3: 'assets/images/towers/fx/firepillar/anim_firepillar_03.png',
  4: 'assets/images/towers/fx/firepillar/anim_firepillar_04.png',
  5: 'assets/images/towers/fx/firepillar/anim_firepillar_05.png',
  6: 'assets/images/towers/fx/firepillar/anim_firepillar_06.png',
};

/** 下层：地面火环 6 帧 */
const ASSETS_BASE = {
  1: 'assets/images/towers/fx/firepillar/anim_firepillar_base_01.png',
  2: 'assets/images/towers/fx/firepillar/anim_firepillar_base_02.png',
  3: 'assets/images/towers/fx/firepillar/anim_firepillar_base_03.png',
  4: 'assets/images/towers/fx/firepillar/anim_firepillar_base_04.png',
  5: 'assets/images/towers/fx/firepillar/anim_firepillar_base_05.png',
  6: 'assets/images/towers/fx/firepillar/anim_firepillar_base_06.png',
};

const N = 6;                 // 火柱本体帧数
const N_BASE = 6;            // 地面火环帧数
const FPS = 12;              // 循环帧率（与旧 8 帧序列一致的观感）
const AR = 768 / 512;        // 火柱贴图宽高比（512×768）
const AR_BASE = 1;           // 地面贴图正方形（512×512）
/** 火柱横向宽度 = 判定半径 × 系数（R=120 → 216px，比火环直径 264px 略窄，柱体在环内） */
const WIDTH_K = 1.8;
/** 火柱出现在 0.55s（伤害结算 0.6s 前一帧），拔高到 0.85s */
const RISE_T = 0.55;
const RISE_WINDOW = 0.30;
/** 崩解：dur-0.5 → dur */
const FALL_WINDOW = 0.50;

/** 柱体可见区间 alpha / 高度系数（t 已 clamp 到 [0,dur]） */
function pillarShape(t, dur) {
  if (t < RISE_T) return null;
  const fallStart = Math.max(RISE_T + RISE_WINDOW, dur - FALL_WINDOW);
  if (t < fallStart) {
    const k = Math.min(1, (t - RISE_T) / RISE_WINDOW);
    return { scale: 0.18 + 0.82 * k, alpha: Math.min(1, k * 1.6) };
  }
  const k = Math.min(1, (t - fallStart) / Math.max(0.001, dur - fallStart));
  return { scale: 1 - 0.9 * k, alpha: 1 - k };
}

/** 火柱本体选帧：1..6，按 FPS 循环（相对升起到期时间轴，起喷时从 1 帧开始顺时针播放） */
function frameIndex(t, dur) {
  const rel = Math.max(0, t - RISE_T);
  return (Math.floor(rel * FPS) % N) + 1;
}

/** 地面火环选帧 + 显隐 alpha：起旋即可见，末尾 0.4s 渐隐 */
function baseShape(t, dur) {
  if (t < 0.04) return null;
  const fadeIn = Math.min(1, t / 0.12);
  const outStart = Math.max(0.2, dur - 0.4);
  const fadeOut = t < outStart ? 1 : Math.max(0, 1 - (t - outStart) / Math.max(0.001, dur - outStart));
  return { alpha: fadeIn * fadeOut, index: (Math.floor(t * FPS) % N_BASE) + 1 };
}

/** 火柱本体尺寸换算（底边贴锚点 cy，并用 scale 控制拔高/崩解） */
function layout(cx, cy, R, shape) {
  const W = Math.max(24, R * WIDTH_K);
  const H = W * AR * (shape ? shape.scale : 1);
  return { W, H, bx: cx - W / 2, by: cy - H + 6 };   // +6：柱脚压入地面火环中心
}

/** 地面火环尺寸换算：正方形，中心对齐锚点 */
function layoutBase(cx, cy, R) {
  const W = Math.max(24, R * 2.2);
  const H = W * AR_BASE;
  return { W, H, bx: cx - W / 2, by: cy - H / 2 };
}

/**
 * 判定提示细环（0~0.6s 由 0 扩到 R，之后短暂渐隐；1.5px 细线不填充，精确标伤害范围）
 * t >= 1.0 返回 null（不绘制）
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

module.exports = {
  ASSETS, ASSETS_BASE, N, N_BASE, FPS, AR, AR_BASE,
  RISE_T, RISE_WINDOW, FALL_WINDOW,
  frameIndex, pillarShape, baseShape, layout, layoutBase, warnRing, sparkSpec,
};
