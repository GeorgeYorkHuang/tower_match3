$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot=Split-Path $PSScriptRoot -Parent
$sourceRoot=Join-Path $projectRoot 'art/boss_lava_frost_w40_w60'
$targetRoot=Join-Path $projectRoot 'assets/images/monsters/bosses/expansion'
$manifest=Get-Content (Join-Path $sourceRoot 'boss-art-manifest.json') -Raw | ConvertFrom-Json
$records=@()
foreach($name in @('ignis-core','skar-freeze','skar-shellbreak','carlos-resonance','carlos-reignite',
  'ignis-eruption','ignis-charge','skar-coldwind','skar-shadowfission')) {
  $entry=$manifest.resources|Where-Object {$_.name -eq $name}
  $sources=@();$left=384;$top=384;$right=0;$bottom=0
  try {
    foreach($f in $entry.frame_list){
      $im=[System.Drawing.Bitmap]::FromFile((Join-Path $sourceRoot $f.file));$sources+=,$im
      for($y=0;$y -lt 384;$y++){for($x=0;$x -lt 384;$x++){
        if($im.GetPixel($x,$y).A -gt 8){$left=[Math]::Min($left,$x);$top=[Math]::Min($top,$y);$right=[Math]::Max($right,$x+1);$bottom=[Math]::Max($bottom,$y+1)}
      }}
    }
    # Shared crop across the sequence preserves relative effect size and anchor.
    $w=$right-$left;$h=$bottom-$top;$scale=112.0/[Math]::Max($w,$h)
    $dw=[int][Math]::Round($w*$scale);$dh=[int][Math]::Round($h*$scale)
    $strip=New-Object System.Drawing.Bitmap ($sources.Count*128),128
    $g=[System.Drawing.Graphics]::FromImage($strip)
    try {
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      for($i=0;$i -lt $sources.Count;$i++){
        $dest=[System.Drawing.Rectangle]::new(($i*128+[int]((128-$dw)/2)),([int]((128-$dh)/2)),$dw,$dh)
        $g.DrawImage($sources[$i],$dest,$left,$top,$w,$h,[System.Drawing.GraphicsUnit]::Pixel)
      }
      $target=Join-Path $targetRoot ($name+'-v1.png')
      $strip.Save($target,[System.Drawing.Imaging.ImageFormat]::Png)
      $records+=[pscustomobject]@{name=$name;frames=$sources.Count;bytes=(Get-Item $target).Length;sourceCrop=@($left,$top,$w,$h)}
    } finally {$g.Dispose();$strip.Dispose()}
  } finally {foreach($im in $sources){$im.Dispose()}}
}
$records|ConvertTo-Json|Set-Content (Join-Path $sourceRoot 'runtime-skill-build.json') -Encoding UTF8
$records|Format-Table name,frames,bytes
