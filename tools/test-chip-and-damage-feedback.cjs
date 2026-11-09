/** 真机图标回退与伤害数字分段轨迹回归，不读写微信账号存档。 */
const assert = require('assert');
const chipPath = require.resolve('../js/game/icons/chip-skin.js');
const { createBoardLayer } = require('../js/game/layers/board.js');
const Numbers = require('../js/game/fx/damage-numbers.js');
const Feedback = require('../js/game/fx/combat-feedback.js');
const savedWx = global.wx, savedDocument = global.document, savedRandom = Math.random;
const eps = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

try {
  delete global.document;
  const source = { width: 2, height: 2 };
  for (const failure of ['missing', 'throws', 'readback', 'empty', 'bad-buffer', 'upload', 'target']) {
    delete require.cache[chipPath];
    const skin = require(chipPath);
    let attempts = 0;
    const offscreen = { width: 2, height: 2, getContext() { return {
      drawImage() {},
      getImageData() {
        if (failure === 'readback') throw Error('device readback unavailable');
        const data = new Uint8ClampedArray(failure === 'bad-buffer' ? 4 : 16);
        if (failure !== 'empty') for (let i = 0; i < data.length; i += 4) data.set([120, 220, 250, 255], i);
        return { data };
      },
      putImageData() { if (failure === 'upload') throw Error('device upload unavailable'); },
    }; } };
    global.wx = failure === 'missing' ? {} : { createOffscreenCanvas() {
      attempts++; if (failure === 'throws') throw Error('unsupported'); return offscreen;
    } };
    skin.configure({ loadImage: () => source });
    const drawn = [], ctx = { drawImage(img) {
      if (failure === 'target' && img === offscreen) throw Error('offscreen draw unsupported');
      drawn.push(img);
    } };
    for (const s of ['row', 'col', 'cross', 'split', 'rand']) {
      assert(skin.drawTint(ctx, skin.specialSrc({ s, c: 'blue' }), 0, 0, 50, 50));
    }
    assert(skin.drawTint(ctx, skin.specialSrc({ s: 'split', sub: true, c: 'green' }), 0, 0, 50, 50));
    assert.equal(drawn.length, 6);
    assert(drawn.every(img => img === source), failure + ': must draw original glyph');
    assert(attempts <= 1, 'Device failures must not repeat expensive pixel reads every frame');
  }

  delete require.cache[chipPath];
  const skin = require(chipPath);
  let creates = 0, loaded = false;
  const pixels = new Uint8ClampedArray([90, 220, 245, 180]);
  const canvas = { width: 1, height: 1, getContext() { return {
    drawImage() {}, getImageData: () => ({ data: pixels }), putImageData() {},
  }; } };
  global.wx = { createOffscreenCanvas() { creates++; return canvas; } };
  skin.configure({ loadImage: () => loaded ? { width: 1, height: 1 } : null });
  const draws = [], ctx = { drawImage(img) { draws.push(img); } };
  const src = skin.specialSrc({ s: 'row', c: 'red' });
  assert.equal(skin.drawTint(ctx, src, 0, 0, 50, 50), false);
  loaded = true;
  assert(skin.drawTint(ctx, src, 0, 0, 50, 50));
  assert(skin.drawTint(ctx, src, 0, 0, 50, 50));
  assert.equal(creates, 1); assert.equal(pixels[3], 180);
  assert(draws.every(img => img === canvas));

  // 原图尚未加载时，所有功能都必须有矢量兜底，不只是子雷。
  const noop = () => {};
  const paint = new Proxy({ globalAlpha: 1 }, { get: (o, k) => k in o ? o[k] : noop });
  let marks = 0, subs = 0;
  const host = { _specialBlockMark() { marks++; } };
  const layer = createBoardLayer({
    drawImg: (c, path) => Object.values(skin.BASES).includes(path), IMG_SRC: {}, BOARD_IMG: {},
    COLOR_FILL: {}, ChipSkin: skin, subBlockGlyph() { subs++; }, easeOutCubic: x => x,
  });
  for (const s of ['row', 'col', 'cross', 'split', 'rand']) layer.drawCell.call(host, paint, 0, 0, 60, { s, c: 'red' }, 0, 0, null);
  layer.drawCell.call(host, paint, 0, 0, 60, { s: 'split', sub: true, c: 'red' }, 0, 0, null);
  assert.equal(marks, 5); assert.equal(subs, 1);

  Math.random = () => { throw Error('Visuals must not consume combat RNG'); };
  for (const kind of ['hit', 'dot', 'crit']) {
    const n = Numbers.create();
    n.push({ enemyId: 1, x: 300, y: 400, sourceKey: 'electric', amount: 42, kind });
    const start = n.visible()[0]; eps(start.x, 300); eps(start.y, 400);
    n.step(0.12);
    const rising = n.visible()[0]; assert(rising.x > 300 && rising.y < 400);
    n.step(0.12);
    const peak = n.visible()[0]; assert.equal(peak.alpha, 1);
    for (let i = 0; i < 5; i++) {
      n.step(0.1); const held = n.visible()[0];
      eps(held.x, peak.x); eps(held.y, peak.y); assert.equal(held.alpha, 1); assert.equal(held.color, peak.color);
    }
    n.step(0.1);
    const falling = n.visible()[0];
    assert(falling.x > peak.x && falling.y > peak.y && falling.alpha < 1);
    n.step(1); assert.equal(n.visible().length, 0);
  }
  for (const fps of [30, 60, 120]) {
    const n = Numbers.create(); n.push({ enemyId: 2, x: 100, y: 200, amount: 20, sourceKey: 'fire' });
    let peak;
    for (let frame = 1; frame <= fps; frame++) {
      n.step(1 / fps); const v = n.visible()[0];
      const t = frame / fps;
      if (t > 0.24 + 1e-6 && t < 0.74 - 1e-6) {
        if (!peak) peak = v;
        eps(v.x, peak.x); eps(v.y, peak.y); assert.equal(v.alpha, 1);
      }
    }
  }
  const numbers = Numbers.create(), enemy = { id: 9, x: 123, y: 456, hp: 80 };
  Feedback.recordDamage({ game: { dmgNumbers: numbers } }, enemy, 100, 'fire');
  eps(numbers.visible()[0].x, enemy.x); eps(numbers.visible()[0].y, enemy.y);
  assert.equal(numbers.visible()[0].text, '20'); assert.equal(enemy.hp, 80);
  const stacked = Numbers.create();
  stacked.push({ enemyId: 3, x: 50, y: 70, amount: 20 });
  stacked.push({ enemyId: 3, x: 50, y: 70, amount: 30 });
  assert(stacked.visible().every(v => v.x === 50 && v.y === 70), 'Stacking must not move the origin');
  console.log('PASS: device canvas/readback/empty-buffer/draw failures preserve all special glyphs; tint cache and alpha; all-shape fallbacks; exact center origin; 0.5s opaque stationary hold; parabolic fall/fade at30/60/120Hz; no combat RNG or HP changes.');
} finally {
  if (savedWx === undefined) delete global.wx; else global.wx = savedWx;
  if (savedDocument === undefined) delete global.document; else global.document = savedDocument;
  Math.random = savedRandom;
}
