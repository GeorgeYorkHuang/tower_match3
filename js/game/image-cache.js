/**
 * 图片引用缓存。跨页面释放未复用的图片，并回收闲置纹理引用。
 * 预算是软上限：当前绘制仍需使用的图片不会反复淘汰、加载。
 * 删除缓存只解除本模块的引用，不清空图片src，避免破坏其他持有者。
 */
'use strict';
function create(options) {
  const entries = new Map();
  const clock = options.clock || Date.now;
  let frame = 0, now = clock(), scope = 'startup', transitionAt = -1, decoded = 0;
  const counters = { created: 0, released: 0 };
  const grace = options.graceFrames == null ? 2 : options.graceFrames;

  function release(key, entry) {
    if (entries.get(key) !== entry) return;
    entries.delete(key); decoded -= entry.bytes;
    if (entry.image) { entry.image.onload = null; entry.image.onerror = null; }
    entry.image = null; counters.released++;
  }

  function sweep() {
    for (const [key, entry] of entries) {
      if ((entry.scope !== scope && frame - entry.usedFrame > grace)
        || (frame - entry.usedFrame > grace && now - entry.usedAt >= options.idleMs)) release(key, entry);
    }
    if (decoded <= options.maxBytes) return;
    const idle = [...entries].filter(([,e]) => frame - e.usedFrame > grace)
      .sort((a,b) => a[1].usedAt - b[1].usedAt || a[1].usedFrame - b[1].usedFrame);
    for (const [key, entry] of idle) {
      if (decoded <= options.maxBytes) break;
      release(key, entry);
    }
  }

  function beginFrame(nextScope) {
    frame++; now = clock();
    if (nextScope !== scope) { scope = nextScope; transitionAt = frame + grace + 1; }
    if (frame === transitionAt || frame % (options.sweepEveryFrames || 60) === 0) sweep();
  }

  function load(src) {
    let entry = entries.get(src);
    if (entry) {
      entry.usedAt = now; entry.usedFrame = frame; entry.scope = scope;
      return entry.failed ? null : entry.image;
    }
    entry = { image: null, bytes: 0, usedAt: now, usedFrame: frame, scope, failed: false };
    entries.set(src, entry);
    let img;
    try { img = options.createImage(); } catch (error) { entry.failed = true; return null; }
    if (!img) { entry.failed = true; return null; }
    entry.image = img; counters.created++;
    img.onload = () => {
      // 被释放的旧请求不得重新写回缓存，也不能覆盖同路径的新请求。
      if (entries.get(src) !== entry) return;
      const bytes = Math.max(0, Number(img.width) || 0) * Math.max(0, Number(img.height) || 0) * 4;
      decoded += bytes - entry.bytes; entry.bytes = bytes;
    };
    img.onerror = () => {
      if (entries.get(src) !== entry) return;
      decoded -= entry.bytes; entry.bytes = 0; entry.failed = true; entry.image = null;
      img.onload = null; img.onerror = null;
    };
    try { img.src = src; } catch (error) { if (img.onerror) img.onerror(error); }
    return entry.failed ? null : img;
  }

  function clear() { for (const [key, entry] of entries) release(key, entry); }
  function stats() {
    return { count: entries.size, decodedBytes: decoded, maxBytes: options.maxBytes,
      overBudget: decoded > options.maxBytes, scope, ...counters };
  }
  return { load, beginFrame, clear, stats };
}
module.exports = { create };
