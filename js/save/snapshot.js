'use strict';
// Copy save data at ownership boundaries; never pass live Meta/Run objects here.
function copySaveData(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? new Array(value.length) : {};
  seen.set(value, result);
  for (const key of Object.keys(value)) {
    Object.defineProperty(result, key, {value:copySaveData(value[key],seen),enumerable:true,writable:true,configurable:true});
  }
  return result;
}
module.exports = { copySaveData };
