Add-Type -AssemblyName System.Drawing
foreach($name in @('w40-carlos-idle-6f-v2-alpha.png','w40-velde-idle-6f-v2-alpha.png','w60-ignis-idle-6f-v2-alpha.png','w60-skar-idle-6f-v2-alpha.png')){
$b=[System.Drawing.Bitmap]::FromFile((Join-Path 'F:\workspace\towerdefence\art\boss_lava_frost_w40_w60' $name))
$res=@();for($col=1;$col -lt 3;$col++){ $x=[int][Math]::Round($col*$b.Width/3);$n=0;for($y=0;$y -lt $b.Height;$y++){if($b.GetPixel($x,$y).A -gt 128){$n++}};$res+="x=$x : $n px" }; "$name interior-boundary-alpha>128: $($res -join '; ')";$b.Dispose()
}
