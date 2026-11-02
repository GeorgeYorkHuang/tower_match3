'use strict';

// Two quadratic Bézier arcs joined with a continuous tangent at the apex.
// The return arc continues around the outside on the opposite side instead
// of retracing the outbound path.
function position(path, p) {
  const returning = p > 0.5;
  const q = returning ? (p - 0.5) * 2 : p * 2;
  const inv = 1 - q;
  if (returning) {
    return {
      x: inv * inv * path.tx + 2 * inv * q * path.rcx + q * q * path.sx,
      y: inv * inv * path.ty + 2 * inv * q * path.rcy + q * q * path.sy,
    };
  }
  return {
    x: inv * inv * path.sx + 2 * inv * q * path.cx + q * q * path.tx,
    y: inv * inv * path.sy + 2 * inv * q * path.cy + q * q * path.ty,
  };
}

// Choose a quadratic control point so the outbound curve passes through the
// predicted target location at qHit, before the apex.
function controlPoint(start, hit, apex, qHit) {
  const inv = 1 - qHit;
  const denom = 2 * inv * qHit;
  return {
    x: (hit.x - inv * inv * start.x - qHit * qHit * apex.x) / denom,
    y: (hit.y - inv * inv * start.y - qHit * qHit * apex.y) / denom,
  };
}

module.exports = { position, controlPoint };
