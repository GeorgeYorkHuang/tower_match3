// 六种局内消耗品图标，统一100×100坐标；Canvas绘制、透明底。
'use strict';
function shopItemIcon(ctx, id, x, y, size, tint) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = '#263846'; ctx.beginPath(); ctx.arc(50, 50, 43, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = tint; ctx.lineWidth = 2; ctx.stroke();
  const gradient = ctx.createLinearGradient(25, 15, 72, 87);
  gradient.addColorStop(0, '#fff4d7'); gradient.addColorStop(0.45, tint); gradient.addColorStop(1, '#65797c');
  ctx.fillStyle = gradient; ctx.strokeStyle = '#f5edda'; ctx.lineWidth = 2.5;
  if (id === 'atk' || id === 'spd' || id === 'burst') {
    ctx.beginPath(); ctx.moveTo(40, 19); ctx.lineTo(60, 19); ctx.lineTo(60, 34);
    ctx.bezierCurveTo(82, 48, 80, 79, 65, 83); ctx.lineTo(35, 83);
    ctx.bezierCurveTo(20, 79, 18, 48, 40, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#654c3d'; ctx.fillRect(37, 15, 26, 8);
    ctx.strokeStyle = '#fff8d9'; ctx.lineWidth = 4;
    if (id === 'atk') {
      ctx.beginPath(); ctx.moveTo(38, 72); ctx.lineTo(62, 45); ctx.lineTo(59, 59); ctx.moveTo(35, 63); ctx.lineTo(46, 74); ctx.stroke();
    } else if (id === 'spd') {
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(36, 51 + i * 10); ctx.quadraticCurveTo(65, 40 + i * 10, 65 - i * 5, 54 + i * 10); ctx.stroke(); }
    } else {
      ctx.fillStyle = '#fff4c7'; ctx.beginPath(); ctx.moveTo(53, 40); ctx.lineTo(36, 62); ctx.lineTo(49, 62); ctx.lineTo(44, 78); ctx.lineTo(65, 53); ctx.lineTo(53, 53); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tint; ctx.lineWidth = 3; for (const dx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(50 + dx * 35, 30); ctx.lineTo(50 + dx * 42, 21); ctx.stroke(); }
    }
  } else if (id === 'energy') {
    ctx.beginPath(); ctx.moveTo(50, 15); ctx.lineTo(75, 40); ctx.lineTo(64, 77); ctx.lineTo(43, 86); ctx.lineTo(24, 51); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e7fbff'; ctx.beginPath(); ctx.moveTo(50, 17); ctx.lineTo(43, 52); ctx.lineTo(64, 77); ctx.moveTo(24, 51); ctx.lineTo(43, 52); ctx.lineTo(75, 40); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(22, 40); ctx.lineTo(22, 24); ctx.lineTo(34, 24); ctx.lineTo(34, 35); ctx.lineTo(45, 35); ctx.lineTo(45, 24); ctx.lineTo(57, 24); ctx.lineTo(57, 35); ctx.lineTo(68, 35); ctx.lineTo(68, 24); ctx.lineTo(80, 24); ctx.lineTo(80, 76); ctx.lineTo(22, 76); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = id === 'rescue' ? '#e5657b' : '#5f9a6a'; ctx.beginPath(); ctx.arc(51, 58, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff7e4'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(51, 48); ctx.lineTo(51, 68); ctx.moveTo(41, 58); ctx.lineTo(61, 58); ctx.stroke();
  }
  ctx.restore();
}
module.exports = { shopItemIcon };
