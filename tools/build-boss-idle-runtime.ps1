$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot=Split-Path $PSScriptRoot -Parent
$sourceRoot=Join-Path $projectRoot 'art/boss_lava_frost_w40_w60'
$targetRoot=Join-Path $projectRoot 'assets/images/monsters/bosses/expansion'
New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
$records=@()
foreach($boss in @('carlos','velde','ignis','skar')) {
  $version=if($boss -eq 'velde'){'frames'}else{'frames-v3'}
  $sourceDir=Join-Path $sourceRoot ($version+'/'+$boss+'-idle')
  $strip=New-Object System.Drawing.Bitmap 768,128
  $g=[System.Drawing.Graphics]::FromImage($strip)
  try {
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    for($i=1;$i -le 6;$i++) {
      $src=[System.Drawing.Image]::FromFile((Join-Path $sourceDir ('frame_'+$i.ToString('00')+'.png')))
      try {
        if($src.Width -ne 384 -or $src.Height -ne 384){throw 'Expected 384px source frame'}
        # Frame-level padding, not whole-atlas resize: avoid neighboring frame sampling.
        $g.DrawImage($src,[System.Drawing.Rectangle]::new(($i-1)*128+8,8,112,112),0,0,384,384,[System.Drawing.GraphicsUnit]::Pixel)
      } finally {$src.Dispose()}
    }
    $target=Join-Path $targetRoot ($boss+'-idle-v1.png')
    $strip.Save($target,[System.Drawing.Imaging.ImageFormat]::Png)
    $records += [pscustomobject]@{boss=$boss;source=$sourceDir;file=$target;frames=6;frameSize=128;bytes=(Get-Item $target).Length}
  } finally {$g.Dispose();$strip.Dispose()}
}
$total=($records|Measure-Object bytes -Sum).Sum
if($total -gt 1MB){throw "Idle atlas budget exceeded: $total"}
$records|ConvertTo-Json|Set-Content (Join-Path $sourceRoot 'runtime-idle-build.json') -Encoding UTF8
$records|Format-Table boss,bytes
Write-Output "Total bytes: $total"
