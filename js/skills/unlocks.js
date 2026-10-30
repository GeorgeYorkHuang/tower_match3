'use strict';
const CONFIG = require('../config.js');
// Apply to the supplied profile only. Prices and defaults have one config source.
  function skillUnlocked(meta, slot, id) {
    const un = meta.skillUnlocks[slot];
    const defs = CONFIG.SKILL_UNLOCK.defaults[slot] || [];
    return defs.includes(id) || !!(un && un.includes(id));
  }

  function unlockSkill(meta, slot, id) {
    const price = CONFIG.SKILL_UNLOCK.price[slot];
    if (meta.skillUnlocked(slot, id)) return { ok: false, reason: 'owned' };
    if (meta.gold < price) return { ok: false, reason: 'gold' };
    meta.gold -= price;
    if (!meta.skillUnlocks[slot]) meta.skillUnlocks[slot] = (CONFIG.SKILL_UNLOCK.defaults[slot] || []).slice();
    meta.skillUnlocks[slot].push(id);
    return { ok: true };
  }
module.exports = { skillUnlocked, unlockSkill };
