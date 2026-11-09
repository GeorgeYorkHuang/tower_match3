/** 加载页与主循环的首帧握手；正常战斗中的异常不再交给加载页处理。 */
'use strict';
let pending = null;
function begin(callbacks) { pending = callbacks; }
function ready(game) {
  if (!pending) return false;
  const callbacks = pending; pending = null;
  callbacks.ready(game);
  return true;
}
function fail(error) {
  if (!pending) return false;
  const callbacks = pending; pending = null;
  callbacks.fail(error);
  return true;
}
module.exports = { begin, ready, fail };
