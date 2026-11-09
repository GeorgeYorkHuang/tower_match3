/** 装饰粒子的绘制窗口。仅选择可见粒子，不删除事件或改变随机数序列。 */
'use strict';
const ALL = Object.freeze({ first: -1, count: Infinity });
function select(list, maxPoints) {
  let remaining = Math.max(0, Math.floor(maxPoints));
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    if (f.type !== 'particle' || f.t < 0) continue;
    const points = Math.max(0, Math.ceil(f.n || 6));
    if (points >= remaining) return { first: i, count: remaining };
    remaining -= points;
  }
  return ALL;
}
module.exports = { select };
