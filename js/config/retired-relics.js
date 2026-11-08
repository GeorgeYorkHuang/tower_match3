'use strict';
// Old IDs are retained only for one-way save migration and defensive runtime filtering.
module.exports=Object.freeze(Object.keys(require('./red-relics.js').legacy));
