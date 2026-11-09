/** 裁空图集适配：逻辑帧尺寸不变，仅把实际有像素的部分放回原位置。 */
'use strict';
function draw(ctx, image, x, y, width, height, frame) {
  if (frame.empty) return true;
  const p = frame.packed;
  if (!p || !image || !(image.width > 0) || !(image.height > 0)) return false;
  if (!(frame.w > 0) || !(frame.h > 0) || p.x < 0 || p.y < 0
    || p.x + p.w > image.width || p.y + p.h > image.height) return false;
  const sx = width / frame.w, sy = height / frame.h;
  ctx.drawImage(image, p.x, p.y, p.w, p.h,
    x + p.ox * sx, y + p.oy * sy, p.w * sx, p.h * sy);
  return true;
}
module.exports = { draw };
