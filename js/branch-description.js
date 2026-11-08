/** 分支说明只读取对应升级档；不把后续升级总说明带进本次选择。 */
'use strict';
function current(def, branch, level) {
  const key = branch.toLowerCase(), tiers = def[key + 'p'];
  if (Array.isArray(tiers) && tiers.length) return tiers[Math.min(tiers.length - 1, Math.max(0, level || 0))] || '';
  return String(def[key] || '').split(/[；;]\s*升级[：:]/)[0].replace(/^[^：:]+[：:]/, '');
}
function upgrades(def, branch) {
  const tiers = def[branch.toLowerCase() + 'p'];
  return Array.isArray(tiers) ? tiers.slice(1, 3) : [];
}
module.exports = { current, upgrades };
