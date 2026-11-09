/**
 * 启动加载页：素材包显示平台真实百分比，游戏初始化等待首帧确认。
 * 不使用假进度或固定15秒失败；慢加载继续等待，真实失败按阶段提示并允许重试。
 * 主画布与游戏复用；启动失败重绘时恢复物理像素坐标，避免继承游戏缩放。
 */
'use strict';
const { getMainCanvas, ensureCanvasSize } = require('./game/canvas.js');
const Boot = require('./game/boot.js');
const LoadingFlow = require('./game/loading-flow.js');
const canvas = getMainCanvas();
ensureCanvasSize(canvas);
let ctx = null;
try { ctx = canvas && canvas.getContext('2d'); } catch (error) { /* 主入口会输出环境诊断。 */ }

function roundRect(x, y, w, h, radius) {
  const r = Math.min(radius, h / 2, w / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0); ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2); ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); ctx.closePath();
}

function draw(state) {
  // 首帧已经显示游戏画面，加载页不再覆盖它。
  if (!ctx || state.phase === 'ready') return;
  const w = canvas.width || 750, h = canvas.height || 1334, cx = w / 2;
  const failed = state.phase === 'failed', starting = state.phase === 'starting';
  const known = !starting && state.percent !== null;
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#14181d'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff7a2f'; ctx.font = `bold ${Math.round(w * .075)}px sans-serif`;
    ctx.fillText('圣坛裂痕', cx, h * .34);
    ctx.fillStyle = '#b8c9d3'; ctx.font = `${Math.round(w * .032)}px sans-serif`;
    const title = failed ? (state.failedStage === 'assets' ? '素材包加载失败' : '游戏启动失败')
      : starting ? '正在启动游戏…' : state.percent === 100 ? '正在准备游戏素材…' : '正在加载游戏素材…';
    ctx.fillText(title, cx, h * .42);
    const bw = w * .62, bh = Math.max(16, Math.round(h * .02)), bx = cx - bw / 2, by = h * .52;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    const gradient = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    gradient.addColorStop(0, '#ff8c3a'); gradient.addColorStop(1, '#ffca58'); ctx.fillStyle = gradient;
    if (known && state.percent > 0) {
      roundRect(bx, by, bw * state.percent / 100, bh, bh / 2); ctx.fill();
    } else if (!failed) {
      // 未收到百分比时用移动光带表达等待，不把动画伪装成下载进度。
      const phase = (Date.now() % 1600) / 1600;
      ctx.save(); roundRect(bx, by, bw, bh, bh / 2); ctx.clip();
      ctx.fillRect(bx - bw * .25 + phase * bw * 1.25, by, bw * .25, bh); ctx.restore();
    }
    ctx.fillStyle = '#e6eef4'; ctx.font = `bold ${Math.round(w * .045)}px sans-serif`;
    ctx.fillText(failed ? '点击屏幕重试' : known ? `${Math.round(state.percent)}%` : starting ? '初始化中' : '等待素材包连接', cx, by + bh + h * .045);
    ctx.fillStyle = '#b8c9d3'; ctx.font = `${Math.round(w * .028)}px sans-serif`;
    if (!failed && state.retry) ctx.fillText('暂未收到新进度 · 点击屏幕重试', cx, by + bh + h * .10);
    else if (!failed && state.slow) ctx.fillText('加载较慢，正在继续，请稍候', cx, by + bh + h * .10);
    else if (failed) ctx.fillText(state.failedStage === 'assets' ? '请稍后重试' : '请重试；若仍失败，请查看启动错误日志', cx, by + bh + h * .10);
  } finally { ctx.restore(); }
}

const flow = LoadingFlow.create({
  platform: typeof wx !== 'undefined' ? wx : null,
  boot: Boot,
  changed: draw,
  loadGame() {
    const previous = typeof GameGlobal !== 'undefined' ? GameGlobal.game : null;
    const GameMain = require('./game/main.js');
    if (typeof GameMain !== 'function') throw new Error('游戏主体未正确导出');
    // 首次require自动创建实例；首帧失败重试复用实例，避免重复注册触摸与音频。
    if (typeof GameGlobal === 'undefined') throw new Error('当前环境缺少游戏主域');
    if (!GameGlobal.game) GameGlobal.game = new GameMain();
    else if (GameGlobal.game === previous && previous._bootFailed) {
      previous._bootFailed = false; previous.lastTs = 0;
      requestAnimationFrame(previous.loop.bind(previous));
    }
  },
});
if (typeof wx !== 'undefined' && wx.onTouchStart) wx.onTouchStart(() => flow.retry());
else if (canvas && typeof canvas.addEventListener === 'function') canvas.addEventListener('touchstart', () => flow.retry());
flow.start();
