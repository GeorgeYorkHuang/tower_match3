/**
 * 怪物状态表现缓存：限制每帧 GPU 像素读回和逐像素合成的次数。
 * 共享相同怪物帧的状态图；繁忙时复用已生成帧，新状态先绘制轻量提示。
 * 此模块不推进状态时长，不访问游戏随机数，不修改怪物或结算结果。
 */
'use strict';
const { core: C, effects } = require('./pixelfx-debuff-runtime.js');
const BUDGET = require('../../config/performance.js').debuff;
const actors = new Map(), renders = new Map(), latest = new Map(), pending = new Map();
let handled = new WeakMap(), frameId = 0, actorReads = 0, disabled = false;
let actorCanvas = null, scratch = null;
const counters = { builds: 0, reads: 0, reused: 0, fallback: 0 };

function surface(w, h) {
  if (typeof wx === 'undefined') return null;
  const canvas = wx.createOffscreenCanvas
    ? wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
    : wx.createCanvas ? wx.createCanvas() : null;
  if (canvas) { canvas.width = w; canvas.height = h; }
  return canvas;
}

function trim(map, max) {
  while (map.size > max) map.delete(map.keys().next().value);
}

function touch(map, key) {
  const value = map.get(key);
  if (value) { map.delete(key); map.set(key, value); }
  return value;
}

function actorOf(img, crop) {
  const key = (img.src || 'image') + ':' + [crop.x, crop.y, crop.w, crop.h].join(',');
  const cached = touch(actors, key);
  if (cached) return cached;
  if (disabled || actorReads >= BUDGET.actorReadsPerFrame) return null;
  actorReads++; counters.reads++;
  actorCanvas = actorCanvas || surface(48, 48);
  if (!actorCanvas) return null;
  const ctx = actorCanvas.getContext('2d');
  ctx.clearRect(0, 0, 48, 48);
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, 48, 48);
  // 同一批像素同时用于轮廓和冰缓染色，不重复 getImageData。
  const ice = ctx.getImageData(0, 0, 48, 48), rgba = ice.data;
  let left = 48, right = -1, top = 48, bottom = -1;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    if (rgba[(y * 48 + x) * 4 + 3] > 80) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return null;
  const w = 32, h = Math.max(2, Math.min(48, Math.round((bottom - top + 1) * 32 / (right - left + 1))));
  const data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.round(left + x * (right - left) / (w - 1));
    const sy = Math.round(top + y * (bottom - top) / (h - 1));
    const i = (sy * 48 + sx) * 4, j = y * w + x;
    data[j] = rgba[i + 3] > 80 ? 1 : 0;
    pixels[j] = (rgba[i + 3] << 24) | (rgba[i + 2] << 16) | (rgba[i + 1] << 8) | rgba[i];
  }
  const actor = { mask: { w, h, data }, pixels, x: -16, y: -h, w, h, k: 2, head: [0, -h], chest: [0, -h / 2] };
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) continue;
    const light = (rgba[i] * .2126 + rgba[i + 1] * .7152 + rgba[i + 2] * .0722) / 255;
    const shade = .48 + .52 * light;
    rgba[i] = rgba[i] * .2 + 145 * shade * .8;
    rgba[i + 1] = rgba[i + 1] * .2 + 211 * shade * .8;
    rgba[i + 2] = rgba[i + 2] * .2 + 255 * shade * .8;
  }
  const tinted = surface(48, 48);
  if (!tinted) return null;
  tinted.getContext('2d').putImageData(ice, 0, 0);
  const value = { actor, key, left, right, top, bottom, tinted };
  actors.set(key, value); trim(actors, BUDGET.actorCache);
  return value;
}

function selected(e) {
  const ids = [], dots = e.dots || [];
  if (dots.some(d => d.type === 'burn' && d.ttl > 0)) ids.push('status/burning');
  if (dots.some(d => d.type === 'poison' && d.ttl > 0)) ids.push('status/poisoned');
  if (e.bleedT > 0) ids.push('status/bleeding');
  if (e.frozen > 0) ids.push('ice/freeze');
  if (e._vineT > 0) ids.push('nature/root-snare');
  if (e.paralyzed > 0) ids.push('lightning/electrified');
  return ids;
}

function frameOf(id, seconds) {
  const phase = id === 'nature/root-snare' ? .9 + seconds % .6
    : id === 'ice/freeze' ? Math.min(1.4, .5 + seconds % 1) : seconds % effects[id].meta.duration;
  return Math.floor(phase * 15);
}

function build(request) {
  const { info, id, frameNo, pair } = request, key = pair + '|' + frameNo;
  if (renders.has(key)) { touch(renders, key); latest.set(pair, key); return; }
  const inst = C.createFx(effects[id], { actor: info.actor, x: 64, y: 96 });
  if (!scratch) scratch = { frame: C.createFrame(128, 128), bytes: new Uint8ClampedArray(128 * 128 * 4) };
  const frame = C.clearFrame(scratch.frame);
  for (let t = 0; t < frameNo / 15; t += 1 / 30) inst.update(Math.min(1 / 30, frameNo / 15 - t));
  inst.draw(frame);
  if (id === 'lightning/electrified') frame.light.fill(0);
  C.composite(frame, scratch.bytes, null);
  // 图缓存到达上限后循环利用旧画布，避免持续创建 GPU 纹理。
  let canvas;
  if (renders.size >= BUDGET.frameCache) {
    const oldest = renders.keys().next().value;
    canvas = renders.get(oldest); renders.delete(oldest);
  } else canvas = surface(128, 128);
  if (!canvas) return;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(128, 128);
  image.data.set(scratch.bytes); ctx.putImageData(image, 0, 0);
  renders.set(key, canvas); latest.set(pair, key); trim(latest, BUDGET.pending);
  counters.builds++;
}

/** 每次怪物层开始绘制时只推进一次，按队列顺序公平生成，避免后排怪物饥饿。 */
function beginFrame() {
  frameId++; actorReads = 0;
  if (disabled) return;
  let built = 0;
  for (const [pair, request] of pending) {
    pending.delete(pair);
    if (frameId - request.seen > BUDGET.staleRequestFrames) continue;
    try { build(request); } catch (error) { disabled = true; break; }
    if (++built >= BUDGET.buildsPerFrame) break;
  }
}

function cachedFrame(info, id, seconds) {
  const pair = info.key + '|' + id, frameNo = frameOf(id, seconds), key = pair + '|' + frameNo;
  const exact = touch(renders, key);
  if (exact) { latest.set(pair, key); trim(latest, BUDGET.pending); pending.delete(pair); return exact; }
  if (!disabled) {
    // 队满时保留已等待的请求，避免不断插入新请求挤掉队首。
    if (pending.has(pair) || pending.size < BUDGET.pending) pending.set(pair, { info, id, frameNo, pair, seen: frameId });
  }
  const previous = touch(renders, latest.get(pair));
  if (previous) counters.reused++;
  return previous || null;
}

// 缓存尚未生成或设备不支持像素读回时，状态仍立即可见；不调用 Math.random。
function fallback(ctx, id, x, y, size, now) {
  counters.fallback++;
  const alpha = ctx.globalAlpha;
  const color = { 'status/burning': '#ff9e42', 'status/poisoned': '#59dd83', 'status/bleeding': '#ec6664',
    'ice/freeze': '#b8edff', 'nature/root-snare': '#68cc6f', 'lightning/electrified': '#ffdf65', 'ice/slow': '#85d8ff' }[id];
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color;
  if (id === 'ice/freeze' || id === 'nature/root-snare' || id === 'ice/slow') {
    ctx.globalAlpha *= .65; ctx.lineWidth = Math.max(1.5, size * .04);
    ctx.beginPath(); ctx.ellipse(x + size / 2, y + size * .58, size * .44, size * .48, 0, 0, Math.PI * 2); ctx.stroke();
  } else for (let i = 0; i < 3; i++) {
    const phase = now / 400 + i * 2.094;
    ctx.globalAlpha = alpha * .6;
    ctx.beginPath(); ctx.arc(x + size * (.5 + .3 * Math.cos(phase)), y + size * (.6 + .22 * Math.sin(phase)), Math.max(1.4, size * .045), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function draw(ctx, img, crop, e, x, y, size, now) {
  handled.set(e, false);
  const ids = selected(e), ice = e._iceSlowT > 0 && !(e.frozen > 0);
  if (!ids.length && !ice) { handled.set(e, true); return; }
  let info = null;
  try { info = actorOf(img, crop); } catch (error) { disabled = true; }
  if (ice) {
    if (info) ctx.drawImage(info.tinted, x, y, size, size);
    else fallback(ctx, 'ice/slow', x, y, size, now);
  }
  const scale = info ? size * (info.right - info.left + 1) / 48 / 32 : 0;
  const cx = info ? x + (info.left + info.right + 1) / 96 * size : 0;
  const feet = info ? y + (info.bottom + 1) / 48 * size : 0;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  try {
    for (const id of ids) {
      const canvas = info ? cachedFrame(info, id, now / 1000) : null;
      if (canvas) ctx.drawImage(canvas, cx - 64 * scale, feet - 96 * scale, 128 * scale, 128 * scale);
      else fallback(ctx, id, x, y, size, now);
    }
    handled.set(e, true);
  } finally { ctx.restore(); }
}

function ready(e) { return handled.get(e) === true; }
function clear() {
  actors.clear(); renders.clear(); latest.clear(); pending.clear(); handled = new WeakMap();
  actorCanvas = null; scratch = null; disabled = false; frameId = 0; actorReads = 0;
  for (const key of Object.keys(counters)) counters[key] = 0;
}
function stats() { return { ...counters, actors: actors.size, frames: renders.size, pending: pending.size, disabled }; }
module.exports = { draw, ready, selected, beginFrame, clear, stats };
