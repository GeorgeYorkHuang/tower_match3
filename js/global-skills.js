/** Compatibility facade for catalog, loadout and runtime. */
'use strict';
const { POOL, get } = require('./skills/global-catalog.js');
const { slots } = require('./skills/global-loadout.js');
const { tick, cast } = require('./skills/global-runtime.js');
module.exports = { POOL, get, slots, tick, cast };
