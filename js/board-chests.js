// 棋盘宝箱纯逻辑；棋盘格只保存id，不引用Game/Meta/掉落实体。
'use strict';
function isChest(v) { return !!v && typeof v === 'object' && v.s === 'chest'; }
function preserve(old, grid) {
  if (old) old.forEach((row,r)=>row.forEach((v,c)=>{if(isChest(v)&&grid[r]&&c<grid[r].length)grid[r][c]=v;}));
  return grid;
}
function collect(grid, cells) {
  const cleared = new Set(cells.map(([r,c])=>r+','+c)), found=[];
  grid.forEach((row,r)=>row.forEach((v,c)=>{
    if(isChest(v)&&[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc])=>cleared.has(rr+','+cc)))found.push({id:v.id,r,c});
  }));
  for(const p of found){grid[p.r][p.c]=null;cells.push([p.r,p.c]);}
  return found;
}
module.exports={isChest,preserve,collect};
