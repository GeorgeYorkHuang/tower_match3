/**
 * Boss 表现模块：圣坛 20 波「缠根司祭·萝赛」(altar_rosea)（v1 · W 交付）
 *
 * 职责单一：消费逻辑侧的只读状态（phase / shieldLayers / x / y / elapsed）与一次性事件，
 * 绘制技能表现层。**只绘制**：不修改血量/护甲/召唤/掉落，不持有 Run/Combat，
 * 不读棋盘，不调用 Math.random（确定性哈希，避免打乱逻辑侧 RNG 顺序）。
 *
 * 表现清单（对应任务卡）：
 *   1) 藤甲吸收环：shieldLayers>0 时金色藤环（层数=弧段数，随 elapsed 缓转）
 *   2) 1—3 层标志：Boss 头顶小方块（实心=现有层数）
 *   3) 0.5s 破壳停顿/花瓣爆开：triggerBurst() 后 0.5s 内花瓣爆散 + 扩散环，自动结束
 *   4) 两侧幼芽召唤入口：triggerSummon('left'|'right') 后 0.8s 藤蔓旋涡 + 上升芽点
 *   5) P2 红金/嫩绿轮廓变化：phase>=2 时双层呼吸轮廓（外红金/内嫩绿）
 *
 * 遮挡约束：所有效果以 Boss 为中心、半径 ≤ 1.6×size，禁止全屏持续遮挡三消盘。
 *
 * 接线契约（验收后由 Codex 接入；当前仅预览器消费）：
 *   const fx = RoseaFx.create();
 *   // 每帧（战斗推进，暂停时不推进）：
 *   fx.sync({ phase: e.phase, shieldLayers: e.shieldLayers, x: e.x, y: e.y, size: e.size, elapsed: run.elapsed });
 *   fx.step(dt);
 *   // 事件入口（逻辑侧判定命中时调用）：
 *   fx.triggerBurst();            // S2 藤壳炸裂瞬间
 *   fx.triggerSummon('left');     // 幼芽生成侧
 *   // 渲染层（Boss 本体帧之后、血条之前）：
 *   fx.drawTo(ctx);
 *   // 退出战斗 / 重开：
 *   fx.reset();
 */
'use strict';

var DEFAULT_CONF = {
  ring: { radiusRatio: 0.62, width: 3, color: '#d9a53f', rotSpeed: 0.4, gapDeg: 18 },
  pips: { count: 3, size: 7, gap: 5, yRatio: 0.78, on: '#e8b64c', off: 'rgba(255,255,255,0.22)' },
  rim: { outer: '#ff8c5a', inner: '#b9e77e', outerRatio: 0.68, innerRatio: 0.58, width: 2.5, pulse: 0.35 },
  burst: { duration: 0.5, petals: 14, colors: ['#f2a0b5', '#e77e9c', '#b9e77e'], ringColor: 'rgba(255,220,180,0.9)', maxRadiusRatio: 1.35 },
  summon: { duration: 0.8, color: '#7fb069', offsetRatio: 1.15, radiusRatio: 0.34 },
};

/* 确定性伪随机：把序号打散到 [-1,1] */
function jitter(seq) {
  var h = (seq * 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return ((h % 2000) / 1000) - 1;
}

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

function create(opts) {
  opts = opts || {};
  var conf = opts.config || DEFAULT_CONF;

  // 只读状态（逻辑侧每帧 sync 覆盖）
  var st = { phase: 1, shieldLayers: 0, x: 0, y: 0, size: 96, elapsed: 0, visible: false };

  // 一次性表现事件（只记触发时刻，由 step 推进寿命）
  var burstAge = -1;                 // >=0 表示爆壳表现进行中
  var summons = [];                  // [{side, age}]
  var seq = 0;
  var stats = { bursts: 0, summons: 0 };

  /** 每帧同步逻辑只读状态（浅拷贝消费，不持有引用） */
  function sync(s) {
    if (!s) return;
    if (s.phase != null) st.phase = (s.phase >= 2 ? 2 : 1);
    if (s.shieldLayers != null) st.shieldLayers = Math.max(0, Math.min(3, s.shieldLayers | 0));
    if (s.x != null) st.x = s.x;
    if (s.y != null) st.y = s.y;
    if (s.size != null) st.size = Math.max(1, s.size);
    if (s.elapsed != null) st.elapsed = Math.max(0, s.elapsed);
    st.visible = true;
  }

  /** 推进表现寿命（暂停时不调用） */
  function step(dt) {
    if (!(dt > 0)) return;
    if (burstAge >= 0) {
      burstAge += dt;
      if (burstAge >= conf.burst.duration) burstAge = -1;
    }
    for (var i = summons.length - 1; i >= 0; i--) {
      summons[i].age += dt;
      if (summons[i].age >= conf.summon.duration) summons.splice(i, 1);
    }
  }

  /** S2 藤壳炸裂瞬间调用（0.5s 花瓣爆开表现，自动结束） */
  function triggerBurst() {
    burstAge = 0;
    seq++;
    stats.bursts++;
  }

  /** 幼芽召唤入口：side = 'left' | 'right' */
  function triggerSummon(side) {
    summons.push({ side: side === 'right' ? 'right' : 'left', age: 0, seed: seq++ });
    stats.summons++;
  }

  /** 渲染层调用：画技能表现层（在 Boss 本体帧之后、血条之前） */
  function drawTo(ctx) {
    if (!st.visible) return;
    var x = st.x, y = st.y, size = st.size, t = st.elapsed;

    // 1) 藤甲吸收环（层数 = 弧段数）
    if (st.shieldLayers > 0) {
      var r = size * conf.ring.radiusRatio;
      var rot = t * conf.ring.rotSpeed;
      var segs = st.shieldLayers;
      var span = (Math.PI * 2 - segs * (conf.ring.gapDeg * Math.PI / 180)) / segs;
      ctx.lineWidth = conf.ring.width;
      ctx.strokeStyle = conf.ring.color;
      ctx.globalAlpha = 0.85;
      for (var i = 0; i < segs; i++) {
        var a0 = rot + i * (span + conf.ring.gapDeg * Math.PI / 180);
        ctx.beginPath();
        ctx.arc(x, y - size * 0.05, r, a0, a0 + span);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 2) P2 双层呼吸轮廓（外红金 / 内嫩绿）
    if (st.phase >= 2) {
      var pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.8);
      var alpha = 0.25 + conf.rim.pulse * 0.35 * pulse;
      ctx.lineWidth = conf.rim.width;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = conf.rim.outer;
      ctx.beginPath();
      ctx.ellipse(x, y - size * 0.45, size * conf.rim.outerRatio * (0.5 + 0.06 * pulse), size * conf.rim.outerRatio * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = conf.rim.inner;
      ctx.beginPath();
      ctx.ellipse(x, y - size * 0.45, size * conf.rim.innerRatio * (0.5 + 0.06 * (1 - pulse)), size * conf.rim.innerRatio * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 3) 破壳花瓣爆开（0.5s，确定性角度）
    if (burstAge >= 0) {
      var p = clamp01(burstAge / conf.burst.duration);
      var n = conf.burst.petals;
      for (var k = 0; k < n; k++) {
        var ang = (k / n) * Math.PI * 2 + jitter(seq * 31 + k) * 0.35;
        var dist = size * (0.25 + conf.burst.maxRadiusRatio * p) * (0.75 + 0.25 * Math.abs(jitter(seq * 17 + k)));
        var px = x + Math.cos(ang) * dist;
        var py = y - size * 0.45 + Math.sin(ang) * dist * 0.72;
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = conf.burst.colors[k % conf.burst.colors.length];
        ctx.beginPath();
        ctx.ellipse(px, py, size * 0.07, size * 0.045, ang, 0, Math.PI * 2);
        ctx.fill();
      }
      // 扩散环（前 40%）
      if (p < 0.4) {
        ctx.globalAlpha = 1 - p / 0.4;
        ctx.strokeStyle = conf.burst.ringColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y - size * 0.45, size * (0.35 + 0.9 * (p / 0.4)), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 4) 两侧幼芽召唤入口（0.8s 藤蔓旋涡 + 上升芽点）
    for (var s = 0; s < summons.length; s++) {
      var sm = summons[s];
      var q = clamp01(sm.age / conf.summon.duration);
      var sx = x + (sm.side === 'right' ? 1 : -1) * size * conf.summon.offsetRatio;
      var sy = y - size * 0.2;
      ctx.globalAlpha = 1 - q;
      ctx.strokeStyle = conf.summon.color;
      ctx.lineWidth = 2.5;
      // 双旋涡弧
      for (var a = 0; a < 2; a++) {
        var a0 = sm.age * 3.2 + a * Math.PI;
        ctx.beginPath();
        ctx.arc(sx, sy, size * conf.summon.radiusRatio, a0, a0 + Math.PI * 0.9);
        ctx.stroke();
      }
      // 上升芽点（3 个，确定性）
      for (var d = 0; d < 3; d++) {
        var j = jitter(sm.seed * 13 + d);
        var rise = q * size * 0.5;
        ctx.fillStyle = conf.summon.color;
        ctx.beginPath();
        ctx.arc(sx + j * size * 0.18, sy - rise - d * size * 0.08, size * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * P2 轮廓变化辅助（可选）：把本体帧染上红金/嫩绿描边后绘制。
   * 需要 opts.createCanvas 工厂（微信 wx.createOffscreenCanvas / 浏览器 document.createElement）；
   * 无画布工厂时返回 false（降级为不染色，仅 drawTo 的 rim 轮廓）。
   */
  var tintCache = null;
  function drawTintedFrame(ctx, img, frameIndex, frameW, frameH, dx, dy, dw, dh, createCanvas) {
    if (!img || !createCanvas) return false;
    var key = img.src || img;
    if (!tintCache || tintCache.img !== img) tintCache = { img: img, canvases: {} };
    var cvs = tintCache.canvases[frameIndex];
    if (!cvs) {
      cvs = createCanvas(frameW, frameH);
      if (!cvs || !cvs.getContext) return false;
      var g = cvs.getContext('2d');
      g.drawImage(img, frameIndex * frameW, 0, frameW, frameH, 0, 0, frameW, frameH);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = st.phase >= 2 ? 'rgba(255,140,90,0.35)' : 'rgba(185,231,126,0.25)';
      g.fillRect(0, 0, frameW, frameH);
      tintCache.canvases[frameIndex] = cvs;
    }
    ctx.drawImage(cvs, dx, dy, dw, dh);
    return true;
  }

  /** 退出战斗 / 重开 */
  function reset() {
    burstAge = -1;
    summons.length = 0;
    st.visible = false;
  }

  function statsOf() { return { bursts: stats.bursts, summons: stats.summons, summonsActive: summons.length, bursting: burstAge >= 0 }; }

  return {
    sync: sync, step: step, drawTo: drawTo,
    triggerBurst: triggerBurst, triggerSummon: triggerSummon,
    drawTintedFrame: drawTintedFrame, reset: reset, stats: statsOf, config: conf,
    state: st,
  };
}

module.exports = { create, DEFAULT_CONF, jitter };
