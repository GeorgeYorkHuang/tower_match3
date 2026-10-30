'use strict';
// UI motion only: logical pixels, seconds and logical pixels/second squared.
module.exports = {
  dragThreshold: 12,
  velocityWindowMs: 100,
  releaseTimeoutMs: 100,
  minimumVelocity: 30,
  maximumVelocity: 3000,
  deceleration: 2400,
};
