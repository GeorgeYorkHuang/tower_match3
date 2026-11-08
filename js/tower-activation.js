'use strict';
// The portal is the single activation clock, including cascades and battle pauses.
const duration = 1;
const revealAt = 0.7;
function prepare(tower) {
  tower._activationManaged = true;
  tower._activationDelay = duration;
}
function start(tower) { if (tower) prepare(tower); }
function advance(tower, fx, dt) {
  fx.t += dt;
  if (tower) tower._activationDelay = Math.max(0, duration - fx.t);
}
function hidden(tower) {
  return !!(tower && tower._activationManaged && tower._activationDelay > duration - revealAt);
}
module.exports = { duration, revealAt, prepare, start, advance, hidden };
