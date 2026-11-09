/**
 * 启动加载状态：只显示平台真实进度，分开处理素材包下载与游戏首帧。
 * 慢加载不直接判失败；请求代号隔离重试后的旧回调，已下载的包无需重复下载。
 */
'use strict';
function create(options) {
  const now = options.now || Date.now;
  const schedule = options.setTimeout || setTimeout;
  const repeat = options.setInterval || setInterval;
  const stop = options.clearInterval || clearInterval;
  const logger = options.logger || console;
  let attempt = 0, timer = null, packageReady = false, lastActivity = now();
  const state = { phase: 'idle', percent: null, slow: false, retry: false, failedStage: null, error: null };

  function notify() { options.changed({ ...state }); }
  function stopTimer() { if (timer !== null) { stop(timer); timer = null; } }
  function active(id, phase) { return id === attempt && state.phase === phase; }
  function tick() {
    if (state.phase !== 'assets' && state.phase !== 'starting') return;
    const idle = now() - lastActivity;
    state.slow = idle >= 15000;
    // 允许主动重试没有进展的下载，但不把等待误报成平台加载失败。
    state.retry = state.phase === 'assets' && idle >= 60000;
    notify();
  }
  function failed(id, stage, error) {
    if (id !== attempt || state.phase === 'ready' || state.phase === 'failed') return;
    state.phase = 'failed'; state.failedStage = stage; state.error = error;
    state.slow = false; state.retry = true; stopTimer();
    logger.error(stage === 'assets' ? '[圣坛裂痕] 素材包加载失败：' : '[圣坛裂痕] 游戏启动失败：', error);
    notify();
  }
  function startGame(id) {
    if (!active(id, 'starting')) return;
    options.boot.begin({
      ready() {
        if (!active(id, 'starting')) return;
        state.phase = 'ready'; state.percent = 100; state.slow = false; state.retry = false;
        stopTimer(); notify();
      },
      fail(error) { if (active(id, 'starting')) failed(id, 'starting', error); },
    });
    try { options.loadGame(); }
    catch (error) { options.boot.fail(error); }
  }
  function prepareGame(id) {
    packageReady = true; state.phase = 'starting'; state.percent = null;
    state.slow = false; state.retry = false; lastActivity = now(); notify();
    // 给加载文案一次呈现机会；不把固定等待时间当作实际加载进度。
    schedule(() => startGame(id), 0);
  }
  function start() {
    const id = ++attempt;
    stopTimer(); state.phase = packageReady ? 'starting' : 'assets'; state.percent = null;
    state.slow = false; state.retry = false; state.failedStage = null; state.error = null;
    lastActivity = now(); notify(); timer = repeat(tick, 250);
    if (packageReady) { prepareGame(id); return; }
    const callbacks = {
      name: 'assets',
      success() { if (active(id, 'assets')) prepareGame(id); },
      fail(error) { if (active(id, 'assets')) failed(id, 'assets', error); },
    };
    let task;
    try {
      if (!options.platform || typeof options.platform.loadSubpackage !== 'function') throw new Error('当前环境不支持素材包加载');
      task = options.platform.loadSubpackage(callbacks);
    } catch (error) { failed(id, 'assets', error); return; }
    if (task && typeof task.onProgressUpdate === 'function' && active(id, 'assets')) {
      try {
        task.onProgressUpdate(result => {
          if (!active(id, 'assets') || !result || !Number.isFinite(result.progress)) return;
          const progress = Math.max(0, Math.min(100, result.progress));
          if (state.percent === null || progress > state.percent) {
            state.percent = progress; state.slow = false; state.retry = false; lastActivity = now(); notify();
          }
        });
      } catch (error) {
        // 缺少进度回调仍可以靠success/fail完成加载；不编造百分比。
        logger.warn('[圣坛裂痕] 素材包进度监听不可用：', error);
      }
    }
  }
  function retry() { if (state.retry) start(); }
  return { start, retry, state: () => ({ ...state }) };
}
module.exports = { create };
