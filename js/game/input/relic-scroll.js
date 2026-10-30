'use strict';
const MOTION = require('../../config/relic-scroll.js');
function active(game) { return game.state === 'menu' && game.menuTab === 'relic' && !game.menuPanel; }
function maximum(game) { return Math.max(0, game.renderer._relicMaxScroll || 0); }
function clamp(value, max) { return Math.max(0, Math.min(value, max)); }
function createRelicScroller({ now = () => Date.now() } = {}) {
  function stop(game) { game._relicScrollVelocity = 0; }
  function begin(game, p) {
    stop(game);
    const position = clamp(game.relicScroll || 0, maximum(game));
    game.relicScroll = position;
    game._relicDrag = { y0:p.y, scroll0:position, moved:false, p,
      samples:[{time:now(),position}], velocity:0 };
  }
  function move(game, p) {
    const d=game._relicDrag;
    if (!d) return;
    if (!active(game)) { cancel(game); return; }
    if (Math.abs(p.y-d.y0)>MOTION.dragThreshold) d.moved=true;
    if (!d.moved) return;
    const time=now(),position=clamp(d.scroll0-(p.y-d.y0),maximum(game));
    game.relicScroll=position;
    const samples=d.samples;
    const direction=Math.sign(position-samples[samples.length-1].position);
    if (direction && d.direction && direction!==d.direction) samples.splice(0,samples.length-1);
    if (direction) d.direction=direction;
    // Equal-time events update the last sample without introducing artificial speed.
    if (time===samples[samples.length-1].time) samples[samples.length-1].position=position;
    else samples.push({time,position});
    while(samples.length>1 && time-samples[0].time>MOTION.velocityWindowMs) samples.shift();
    const first=samples[0],elapsed=time-first.time;
    d.velocity=elapsed>0?(position-first.position)*1000/elapsed:0;
  }
  function end(game) {
    const d=game._relicDrag;game._relicDrag=null;stop(game);
    if (!d) return null;
    if (active(game) && d.moved && now()-d.samples[d.samples.length-1].time<=MOTION.releaseTimeoutMs) {
      const velocity=clamp(Math.abs(d.velocity),MOTION.maximumVelocity)*Math.sign(d.velocity);
      const position=game.relicScroll||0,max=maximum(game);
      if (Math.abs(velocity)>=MOTION.minimumVelocity && !(position<=0&&velocity<0) && !(position>=max&&velocity>0)) game._relicScrollVelocity=velocity;
    }
    return d;
  }
  function cancel(game) { game._relicDrag=null;stop(game); }
  function update(game, dt) {
    if (!active(game)) { cancel(game);return; }
    if (game._relicDrag) return;
    const velocity=game._relicScrollVelocity||0;
    if (!velocity || !Number.isFinite(dt) || dt<=0) return;
    const sign=Math.sign(velocity),speed=Math.abs(velocity);
    const elapsed=Math.min(dt,speed/MOTION.deceleration);
    const position=(game.relicScroll||0)+velocity*elapsed-sign*MOTION.deceleration*elapsed*elapsed/2;
    const max=maximum(game);
    game.relicScroll=clamp(position,max);
    game._relicScrollVelocity=sign*Math.max(0,speed-MOTION.deceleration*elapsed);
    if (position<=0 || position>=max) stop(game);
  }
  return { begin,move,end,cancel,stop,update };
}
module.exports = { createRelicScroller, ...createRelicScroller() };
