const L = require('F:/workspace/towerdefence/js/config.js').LAYOUT;
const STATUS_H = 140, AREA_X = L.actionArea.x, AREA_Y = STATUS_H, AREA_W = L.actionArea.w, ENTRY_H = L.entryBand.h, WALL_H = L.wall.h;
const AREA_H = L.actionArea.h - 68 - WALL_H;
const WALL_Y = AREA_Y + AREA_H;
const TOWER_ROW_Y = WALL_Y;
const BOARD_Y = TOWER_ROW_Y + L.towerRow.h;
const cell = L.boardCell.size;
const boardW = L.boardCell.cols * cell;
const boardH = L.boardCell.rows * cell;
const boardX = (750 - boardW) / 2;
const slotY = TOWER_ROW_Y + 5;
const barY = TOWER_ROW_Y + L.towerRow.h - 14;
const funcY = BOARD_Y + L.boardArea.h;
console.log(JSON.stringify({
  AREA_H, WALL_Y, TOWER_ROW_Y, BOARD_Y, slotY, barY,
  boardX, boardW, boardH, boardBottom: BOARD_Y + boardH,
  funcY, canvasBottom: funcY + L.funcBar.h, funcBarH: L.funcBar.h,
  boardCols: L.boardCell.cols, boardRows: L.boardCell.rows, cell
}, null, 1));
