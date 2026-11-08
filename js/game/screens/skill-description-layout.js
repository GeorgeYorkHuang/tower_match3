'use strict';
// Canvas 字宽决定换行；不截断描述或隐藏数值。
function fitDescription(ctx, value, width, height) {
  const previousFont = ctx.font;
  try {
    for (let size = 21; size >= 12; size--) {
      ctx.font = `bold ${size}px sans-serif`;
      const lines = [];
      let line = '';
      for (const ch of String(value || '')) {
        if (ch === '\n') { lines.push(line); line = ''; continue; }
        if (line && ctx.measureText(line + ch).width > width) { lines.push(line); line = ch; }
        else line += ch;
      }
      if (line || !lines.length) lines.push(line);
      const lineHeight = size + 5;
      if (lines.length * lineHeight <= height) return { lines, size, lineHeight };
    }
    throw new Error('技能描述超出可用空间，请精简文案');
  } finally { ctx.font = previousFont; }
}
module.exports = { fitDescription };
