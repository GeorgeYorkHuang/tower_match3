Add-Type -AssemblyName System.Drawing
$root='F:\workspace\towerdefence\art\boss_lava_frost_w40_w60'
$out=Join-Path $root 'runtime-candidates'
New-Item -ItemType Directory -Force -Path $out | Out-Null
foreach($boss in @('carlos','velde','ignis','skar')) {
 # v3 重制版优先；velde 本轮未重制，继续使用 frames/velde-idle
 $v3=Join-Path $root ('frames-v3/'+$boss+'-idle')
 $dir=if(Test-Path $v3){$v3}else{Join-Path $root ('frames/'+$boss+'-idle')}
 Write-Host ("["+$boss+"] source: "+$dir)
 $strip=New-Object System.Drawing.Bitmap 768,128
 $g=[System.Drawing.Graphics]::FromImage($strip)
 $g.Clear([System.Drawing.Color]::Transparent)
 $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
 $g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality
 for($i=1;$i -le 6;$i++) {
  $src=[System.Drawing.Image]::FromFile((Join-Path $dir ('frame_'+$i.ToString('00')+'.png')))
  $g.DrawImage($src,[System.Drawing.Rectangle]::new(($i-1)*128,0,128,128),0,0,$src.Width,$src.Height,[System.Drawing.GraphicsUnit]::Pixel)
  $src.Dispose()
 }
 $g.Dispose();$strip.Save((Join-Path $out ($boss+'-idle-128.png')),[System.Drawing.Imaging.ImageFormat]::Png);$strip.Dispose()
}
Get-ChildItem $out -Filter '*.png' | Select-Object Name,Length
$sum=(Get-ChildItem $out -Filter '*.png' | Measure-Object Length -Sum).Sum
Write-Host ("total bytes: "+$sum)
