/**
 * canvas.js —— 主画布获取与尺寸适配（CommonJS）
 * 环境防御：新版小游戏基础库不暴露全局 canvas，需用 wx.createCanvas() 获取主画布；
 * 画布尺寸为 0 时按系统屏幕信息初始化。返回 { canvas, ctx }，失败返回 null（含诊断日志）。
 * v1.16.128 分包加载页：首次取得的主画布缓存到 GameGlobal.__mainCanvas，
 * 加载页与游戏主循环共用同一块主画布（wx.createCanvas 二次调用会返回离屏画布，必须复用）。
 */
function getMainCanvas() {
  if (typeof GameGlobal !== 'undefined' && GameGlobal.__mainCanvas) return GameGlobal.__mainCanvas;
  let c = null;
  if (typeof canvas !== 'undefined') c = canvas;
  else if (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) c = GameGlobal.canvas;
  else if (typeof wx !== 'undefined' && wx.createCanvas) {
    try { c = wx.createCanvas(); } catch (e) { c = null; } // 首次调用返回主画布
  }
  if (c && typeof GameGlobal !== 'undefined') GameGlobal.__mainCanvas = c;
  return c;
}

function ensureCanvasSize(c) {
  if (c && (!c.width || !c.height)) {
    // canvas 尺寸为 0（部分环境/真机异常）时按系统屏幕信息初始化
    try {
      const info = (typeof wx !== 'undefined' && wx.getSystemInfoSync) ? wx.getSystemInfoSync() : null;
      if (info) {
        c.width = info.windowWidth * (info.pixelRatio || 1);
        c.height = info.windowHeight * (info.pixelRatio || 1);
      }
    } catch (e) {}
  }
  return c;
}

function initCanvas() {
  const canvas = getMainCanvas();
  ensureCanvasSize(canvas);
  const ctx = canvas ? canvas.getContext('2d') : null;
  if (!ctx) {
    if (typeof console !== 'undefined') {
      console.error('[消消防线] 运行环境诊断：', JSON.stringify({
        hasCanvas: typeof canvas !== 'undefined',
        hasGameGlobalCanvas: (typeof GameGlobal !== 'undefined' && !!GameGlobal.canvas),
        hasWx: typeof wx !== 'undefined',
        hasSharedCanvas: (typeof GameGlobal !== 'undefined' && !!GameGlobal.sharedCanvas),
        canCreateCanvas: (typeof wx !== 'undefined' && typeof wx.createCanvas),
        canCreateAudio: (typeof wx !== 'undefined' && typeof wx.createInnerAudioContext),
      }));
      console.error(
        '[消消防线] 未找到 canvas：本游戏只能在微信小游戏主域（主包 game.js 入口）运行。\n' +
        '  可能原因：项目根被配置为开放数据域(openDataContext)，或主游戏代码被放进了子域目录。\n' +
        '  排行榜子域请使用 sharedCanvas 单独编写，不要加载主游戏代码。'
      );
    }
    return null;
  }
  return { canvas, ctx };
}

module.exports = { initCanvas, getMainCanvas, ensureCanvasSize };
