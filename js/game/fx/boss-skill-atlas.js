'use strict';
const ROOT = 'assets/images/monsters/bosses/expansion/';
const FRAMES = { 'ignis-core': 5, 'skar-freeze': 3, 'skar-shellbreak': 4,
  'carlos-resonance': 3, 'carlos-reignite': 3 };
function draw(ctx, load, name, frame, x, y, size, alpha = 1) {
  const count = FRAMES[name];
  if (!count) return false;
  const img = load(ROOT + name + '-v1.png');
  if (!img || !img.width) return false;
  const f = Math.max(0, Math.min(count - 1, Math.floor(frame)));
  ctx.save();
  try {
    ctx.globalAlpha *= alpha;
    ctx.drawImage(img, f * img.width / count, 0, img.width / count, img.height,
      x - size / 2, y - size / 2, size, size);
  } finally { ctx.restore(); }
  return true;
}
module.exports = { draw, FRAMES };
