'use strict';
const root = 'assets/images/monsters/bosses/expansion/';
const carlos = { src: root + 'carlos-idle-v1.png', frames: 6, frameMs: 125 };
const velde = { src: root + 'velde-idle-v1.png', frames: 6,
  durations: [160, 170, 200, 200, 120, 120] };
module.exports = {
  lava_twins: carlos, lava_twins_twin: carlos,
  frost_twins: velde, frost_twins_twin: velde,
  lava_ignis: { src: root + 'ignis-idle-v1.png', frames: 6, frameMs: 167 },
  frost_skall: { src: root + 'skar-idle-v1.png', frames: 6, frameMs: 100 },
};
