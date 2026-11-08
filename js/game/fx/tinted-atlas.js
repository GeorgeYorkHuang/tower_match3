'use strict';
const ATLASES = require('../../config/tinted-atlases.js');
// Precolored transparent images avoid device-specific canvas compositing.
function createTintedAtlas(loadImg) {
  return function draw(ctx, src, color, x, y, w, h, crop) {
    const variant = ATLASES[src + '|' + String(color).toLowerCase()];
    let img = loadImg && loadImg(variant || src);
    // Keep the original transparent effect visible while a color variant loads.
    if ((!img || !img.width || !img.height) && variant) img = loadImg && loadImg(src);
    if (!img || !img.width || !img.height) return false;
    if (crop) ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, x, y, w, h);
    else ctx.drawImage(img, x, y, w, h);
    return true;
  };
}
module.exports = { createTintedAtlas };
