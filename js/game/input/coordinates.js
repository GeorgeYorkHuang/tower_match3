'use strict';
// Inverse of the renderer transform. No game construction or cached window dimensions.
function toLogic(game, c, cx, cy) {
    const scale = game.scale > 0 ? game.scale : 1;
    // Inverse of render's setTransform(scale,0,0,scale,0,0), including unused screen space.
    if (game._touchSpace === 'canvas' && c.getBoundingClientRect) {
      const rect = c.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return {
        x: (cx - rect.left) * c.width / rect.width / scale,
        y: (cy - rect.top) * c.height / rect.height / scale,
      };
    }
    try {
      const info = typeof wx !== 'undefined' && (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync ? wx.getSystemInfoSync() : null);
      if (info && info.windowWidth > 0 && info.windowHeight > 0) return {
        x: cx * c.width / info.windowWidth / scale,
        y: cy * c.height / info.windowHeight / scale,
      };
    } catch (e) {}
    return { x: cx / scale, y: cy / scale };
}
module.exports = { toLogic };
