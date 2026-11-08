/**
 * talent-node-icons.js —— 天赋小图标：用 Canvas 路径绘制攻击、攻速、伤害、充能等属性符号。
 * 所有图形按 48×48 基准坐标绘制，由入口统一缩放，不依赖字体或位图。
 */
'use strict';
// 图标共用 48×48 坐标，大小和颜色由 draw 入口统一设置。
function poly(ctx, points, close = false) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
const painters = {
  attack(ctx) {
    poly(
      ctx,
      [
        [24, 3],
        [31, 13],
        [31, 29],
        [24, 34],
        [17, 29],
        [17, 13],
      ],
      true
    );
    poly(ctx, [
      [24, 7],
      [24, 29],
    ]);
    ctx.beginPath();
    ctx.moveTo(12, 32);
    ctx.quadraticCurveTo(24, 37, 36, 32);
    ctx.stroke();
    poly(ctx, [
      [24, 36],
      [24, 43],
    ]);
    poly(ctx, [
      [20, 44],
      [28, 44],
    ]);
  },
  speed(ctx) {
    ctx.beginPath();
    ctx.moveTo(5, 15);
    ctx.lineTo(29, 15);
    ctx.quadraticCurveTo(40, 15, 40, 8);
    ctx.quadraticCurveTo(40, 3, 35, 5);
    ctx.moveTo(5, 24);
    ctx.lineTo(36, 24);
    ctx.quadraticCurveTo(44, 24, 44, 30);
    ctx.quadraticCurveTo(44, 36, 38, 34);
    ctx.moveTo(10, 33);
    ctx.lineTo(26, 33);
    ctx.quadraticCurveTo(32, 33, 32, 39);
    ctx.moveTo(8, 41);
    ctx.lineTo(18, 41);
    ctx.stroke();
  },
  damage(ctx) {
    circle(ctx, 24, 24, 11);
    circle(ctx, 24, 24, 3);
    for (const line of [
      [
        [24, 4],
        [24, 10],
      ],
      [
        [24, 38],
        [24, 44],
      ],
      [
        [4, 24],
        [10, 24],
      ],
      [
        [38, 24],
        [44, 24],
      ],
      [
        [8, 8],
        [13, 13],
      ],
      [
        [35, 35],
        [40, 40],
      ],
      [
        [8, 40],
        [13, 35],
      ],
      [
        [35, 13],
        [40, 8],
      ],
    ])
      poly(ctx, line);
  },
  charge(ctx) {
    poly(
      ctx,
      [
        [24, 3],
        [39, 12],
        [39, 34],
        [24, 44],
        [9, 34],
        [9, 12],
      ],
      true
    );
    poly(
      ctx,
      [
        [27, 11],
        [17, 25],
        [25, 25],
        [21, 37],
        [33, 21],
        [25, 21],
      ],
      true
    );
  },
  skill(ctx) {
    poly(
      ctx,
      [
        [24, 3],
        [29, 18],
        [44, 24],
        [29, 30],
        [24, 45],
        [18, 30],
        [3, 24],
        [18, 18],
      ],
      true
    );
    circle(ctx, 24, 24, 4);
    poly(ctx, [
      [37, 5],
      [37, 13],
    ]);
    poly(ctx, [
      [33, 9],
      [41, 9],
    ]);
  },
  dot(ctx) {
    ctx.beginPath();
    ctx.moveTo(24, 4);
    ctx.quadraticCurveTo(37, 20, 37, 29);
    ctx.arc(24, 29, 13, 0, Math.PI);
    ctx.quadraticCurveTo(11, 20, 24, 4);
    ctx.closePath();
    ctx.stroke();
    poly(ctx, [
      [18, 26],
      [21, 29],
    ]);
    poly(ctx, [
      [30, 26],
      [27, 29],
    ]);
    ctx.beginPath();
    ctx.moveTo(20, 35);
    ctx.quadraticCurveTo(24, 32, 28, 35);
    ctx.stroke();
    poly(ctx, [
      [5, 10],
      [8, 14],
    ]);
    poly(ctx, [
      [40, 10],
      [43, 14],
    ]);
  },
  duration(ctx) {
    poly(ctx, [
      [12, 5],
      [36, 5],
    ]);
    poly(ctx, [
      [12, 43],
      [36, 43],
    ]);
    ctx.beginPath();
    ctx.moveTo(15, 5);
    ctx.lineTo(15, 14);
    ctx.quadraticCurveTo(15, 19, 24, 24);
    ctx.quadraticCurveTo(33, 29, 33, 34);
    ctx.lineTo(33, 43);
    ctx.moveTo(33, 5);
    ctx.lineTo(33, 14);
    ctx.quadraticCurveTo(33, 19, 24, 24);
    ctx.quadraticCurveTo(15, 29, 15, 34);
    ctx.lineTo(15, 43);
    ctx.stroke();
    poly(
      ctx,
      [
        [18, 12],
        [30, 12],
        [24, 19],
      ],
      true
    );
    poly(
      ctx,
      [
        [18, 38],
        [24, 31],
        [30, 38],
      ],
      true
    );
  },
};

function draw(ctx, kind, x, y, size, color) {
  const paint = painters[kind];
  if (!paint) return false;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  // 图形自身只维护基准路径，外部调整图标尺寸无需逐个修改坐标。
  ctx.scale(size / 48, size / 48);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  paint(ctx);
  ctx.restore();
  return true;
}

module.exports = { draw, kinds: Object.keys(painters) };
