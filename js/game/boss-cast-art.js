'use strict';
const ROOT = 'assets/images/monsters/bosses/expansion/';
function once(q, event, name, frames, duration) {
  const age = event ? q.elapsed - event.at : -1;
  if (age < 0 || age >= duration - 1e-9) return null;
  return { src: ROOT + name + '-v1.png', frames,
    frameFor: () => Math.min(frames - 1, Math.floor(age / duration * frames)) };
}
function select(q, e) {
  if (!q || q.finished || !e.isBoss || e.bossId !== q.id) return null;
  if (q.id === 'lava_ignis') {
    const interrupted = once(q, q.interruptVisual, 'ignis-eruption', 5, .6);
    if (interrupted) return { ...interrupted, frameFor: () => 4 };
    if (Number.isFinite(q.castEnd)) {
      const duration = require('../config/boss-expansion.js').lava_ignis.castDuration;
      const age = Math.max(0, duration - (q.castEnd - q.elapsed));
      return { src: ROOT + 'ignis-charge-v1.png', frames: 6,
        frameFor: () => Math.min(5, Math.floor(age / duration * 6)) };
    }
    return once(q, q.heatVisual, 'ignis-eruption', 5, .8);
  }
  if (q.id === 'frost_skall') return once(q, q.shadowVisual, 'skar-shadowfission', 5, .6)
    || once(q, q.windVisual, 'skar-coldwind', 6, .8);
  return null;
}
function sourcesFor(id) {
  const names = id === 'lava_ignis' ? ['ignis-eruption', 'ignis-charge']
    : id === 'frost_skall' ? ['skar-coldwind', 'skar-shadowfission'] : [];
  return names.map(name => ROOT + name + '-v1.png');
}
module.exports = { select, sourcesFor };
