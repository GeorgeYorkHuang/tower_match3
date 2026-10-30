'use strict';
const { POOL } = require('./global-catalog.js');
// Normalize old/invalid/duplicate selections into two unique skill IDs.
function slots(value) {
 const raw=value&&value.slots || ['shuffle','refill'];
 const result=[];for(let i=0;i<2;i++){const id=raw[i];result.push(POOL.some(d=>d.id===id)&&!result.includes(id)?id:POOL.find(d=>!result.includes(d.id)).id);}return result;
}

module.exports = { slots };
