/**
 * loading.js —— 启动加载页 + 分包加载（v1.16.128）
 * 流程：进入游戏即显示加载页（标题+进度条+百分比）→ wx.loadSubpackage('assets') 加载素材分包
 * → 加载完成(100%)后才 require 游戏主体（main.js 顶层副作用会 new GameMain 并启动渲染循环）；
 * 失败时显示"点击重试"，重新发起分包加载。
 * 主画布复用：先取并缓存主画布（canvas.js getMainCanvas），游戏主体 initCanvas 复用同一画布。
 */
const { getMainCanvas, ensureCanvasSize } = require('./game/canvas.js');

const _c = getMainCanvas();
ensureCanvasSize(_c);
const cvs = _c || null;
let ctx = null;
if (cvs) {
  try { ctx = cvs.getContext('2d'); } catch (e) { ctx = null; }
}
const W = cvs ? cvs.width : 750;
const H = cvs ? cvs.height : 1334;

let curProgress = 0;
let loadingFailed = false;

function rrect(x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  // 深色底 + 火纹标题
  ctx.fillStyle = '#14181d';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff7a2f';
  ctx.font = `bold ${Math.round(W * 0.075)}px sans-serif`;
  ctx.fillText('深窟远征', cx, H * 0.34);
  ctx.fillStyle = '#8fa3b5';
  ctx.font = `${Math.round(W * 0.03)}px sans-serif`;
  ctx.fillText('正在加载游戏素材…', cx, H * 0.42);

  // 进度条胶囊（圆角）
  const bw = W * 0.62;
  const bh = Math.max(16, Math.round(H * 0.02));
  const bx = cx - bw / 2;
  const by = H * 0.52;
  const r = bh / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rrect(bx, by, bw, bh, r);
  ctx.fill();
  const ratio = Math.max(0, Math.min(1, curProgress / 100));
  if (ratio > 0) {
    const gw = bw * ratio;
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#ff8c3a');
    grad.addColorStop(1, '#ffb03a');
    ctx.fillStyle = grad;
    rrect(bx, by, gw, bh, r);
    ctx.fill();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    rrect(bx, by, gw, bh * 0.45, r);
    ctx.fill();
  }

  ctx.fillStyle = '#e6eef4';
  ctx.font = `bold ${Math.round(W * 0.045)}px sans-serif`;
  ctx.fillText(loadingFailed ? '加载失败' : `${Math.round(curProgress)}%`, cx, by + bh + H * 0.045);
  if (loadingFailed) {
    ctx.fillStyle = '#ffb03a';
    ctx.font = `bold ${Math.round(W * 0.04)}px sans-serif`;
    ctx.fillText('点击屏幕重试', cx, by + bh + H * 0.10);
  }
  if (typeof wx !== 'undefined' && wx.onCanvasTouchStart && !loadingFailed) {
    // 基础库较新环境：小游戏默认监听 touchstart（wx.onTouchStart）
  }
}

function startGame() {
  try {
    require('./game/main.js');
  } catch (err) {
    console.error('[深窟远征] 游戏主体启动失败：', err);
    loadingFailed = true;
    curProgress = 0;
    draw();
  }
}

function loadAssets() {
  loadingFailed = false;
  curProgress = 0;
  draw();
  const cb = {
    name: 'assets',
    success: () => { curProgress = 100; draw(); startGame(); },
    fail: (err) => {
      console.error('[深窟远征] 分包 assets 加载失败：', err);
      loadingFailed = true;
      draw();
    },
    onProgressUpdate: (res) => {
      // v1.17.9c 非负钳制：个别环境 progress 可能返回负值/非数，避免加载页显示负数
      if (res && typeof res.progress === 'number') { curProgress = Math.max(0, Math.min(100, res.progress)); draw(); }
    },
  };
  let task = null;
  try {
    task = wx.loadSubpackage(cb);
  } catch (e) {
    // 基础库过旧不支持：标记失败让用户重试（或兼容降级）
    console.error('[深窟远征] wx.loadSubpackage 不可用：', e);
    loadingFailed = true;
    draw();
    return;
  }
  if (task && typeof task.onProgressUpdate === 'function') {
    try { task.onProgressUpdate(cb.onProgressUpdate); } catch (e) {}
  }
}

/* 失败重试：点击屏幕重新加载分包 */
if (typeof wx !== 'undefined' && wx.onTouchStart) {
  wx.onTouchStart(() => {
    if (loadingFailed) loadAssets();
  });
} else if (typeof cvs !== 'undefined' && cvs && typeof cvs.addEventListener === 'function') {
  cvs.addEventListener('touchstart', () => { if (loadingFailed) loadAssets(); });
}

// 立即开始
loadAssets();
