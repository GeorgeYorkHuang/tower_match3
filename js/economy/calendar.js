'use strict';
function todayStr(nowMs) {
  const d = new Date(nowMs || Date.now());
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
module.exports = { todayStr };
