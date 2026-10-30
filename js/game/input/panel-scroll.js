'use strict';
// 全局技能配置面板滚动（v1.17.45）：与圣遗物页同一套匀减速惯性运动参数（config/relic-scroll.js）。
// 滚动状态挂在 game.menuPanel.scrollY（面板关闭即废弃）；拖拽/速度状态挂 game._panelDrag / _panelScrollVelocity。
const MOTION = require('../../config/relic-scroll.js');
function active(game) { return game.state === 'menu' && game.menuPanel && game.menuPanel.type === 'globalCfg'; }
function viewport(game) { return game.renderer && game.renderer._globalCfgViewport; }
function maximum(game) { return Math.max(0, (game.renderer && game.renderer._globalCfgMaxScroll) || 0); }
function clamp(value, max) { return Math.max(0, Math.min(value, max)); }
function insideViewport(vp, p) { return vp && p && p.x >= vp.x && p.x <= vp.x + vp.w && p.y >= vp.y && p.y <= vp.y + vp.h; }
function createPanelScroller({ now = () => Date.now() } = {}) {
  function stop(game) { game._panelScrollVelocity = 0; }
  /** 触点在面板视口内 → 开始拖拽并返回 true（调用方据此跳过立即点击分发） */
  function begin(game, p) {
    const vp = viewport(game);
    if (!active(game) || !insideViewport(vp, p)) return false;
    stop(game);
    const panel = game.menuPanel;
    const position = clamp(panel.scrollY || 0, maximum(game));
    panel.scrollY = position;
    game._panelDrag = { y0: p.y, scroll0: position, moved: false, p,
      samples: [{ time: now(), position }], velocity: 0, direction: 0 };
    return true;
  }
  function move(game, p) {
    const d = game._panelDrag;
    if (!d) return;
    if (!active(game)) { cancel(game); return; }
    if (Math.abs(p.y - d.y0) > MOTION.dragThreshold) d.moved = true;
    if (!d.moved) return;
    const time = now(), position = clamp(d.scroll0 - (p.y - d.y0), maximum(game));
    game.menuPanel.scrollY = position;
    const samples = d.samples;
    const direction = Math.sign(position - samples[samples.length - 1].position);
    if (direction && d.direction && direction !== d.direction) samples.splice(0, samples.length - 1);
    if (direction) d.direction = direction;
    if (time === samples[samples.length - 1].time) samples[samples.length - 1].position = position;
    else samples.push({ time, position });
    while (samples.length > 1 && time - samples[0].time > MOTION.velocityWindowMs) samples.shift();
    const first = samples[0], elapsed = time - first.time;
    d.velocity = elapsed > 0 ? (position - first.position) * 1000 / elapsed : 0;
  }
  function end(game) {
    const d = game._panelDrag;
    game._panelDrag = null;
    stop(game);
    if (!d) return null;
    if (active(game) && d.moved && now() - d.samples[d.samples.length - 1].time <= MOTION.releaseTimeoutMs) {
      const velocity = clamp(Math.abs(d.velocity), MOTION.maximumVelocity) * Math.sign(d.velocity);
      const panel = game.menuPanel, position = clamp(panel.scrollY || 0, maximum(game)), max = maximum(game);
      if (Math.abs(velocity) >= MOTION.minimumVelocity && !(position <= 0 && velocity < 0) && !(position >= max && velocity > 0)) {
        game._panelScrollVelocity = velocity;
      }
    }
    return d;
  }
  function cancel(game) { game._panelDrag = null; stop(game); }
  function update(game, dt) {
    if (!active(game)) { cancel(game); return; }
    if (game._panelDrag) return;
    const velocity = game._panelScrollVelocity || 0;
    if (!velocity || !Number.isFinite(dt) || dt <= 0) return;
    const sign = Math.sign(velocity), speed = Math.abs(velocity);
    const elapsed = Math.min(dt, speed / MOTION.deceleration);
    const position = clamp((game.menuPanel.scrollY || 0) + velocity * elapsed - sign * MOTION.deceleration * elapsed * elapsed / 2, maximum(game));
    game.menuPanel.scrollY = position;
    game._panelScrollVelocity = sign * Math.max(0, speed - MOTION.deceleration * elapsed);
    if (position <= 0 || position >= maximum(game)) stop(game);
  }
  return { begin, move, end, cancel, stop, update };
}
module.exports = { createPanelScroller, ...createPanelScroller() };
