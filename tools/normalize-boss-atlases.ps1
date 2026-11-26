$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies @([Drawing.Bitmap].Assembly.Location,[Drawing.Rectangle].Assembly.Location,(Join-Path $PSHOME 'System.Private.Windows.GdiPlus.dll'),(Join-Path C:\Users\kindf\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell 'System.Private.Windows.Core.dll')) -TypeDefinition @"
using System;using System.Drawing;using System.Drawing.Imaging;
public class Atlas256 {public static void Build(string src,string dst,int cols,int rows,int count){
using(var im=new Bitmap(src)){
int l=99999,t=99999,r=0,b=0;
for(int i=0;i<count;i++){int x0=(int)Math.Round((i%cols)*im.Width/(double)cols),x1=(int)Math.Round((i%cols+1)*im.Width/(double)cols);int y0=(int)Math.Round((i/cols)*im.Height/(double)rows),y1=(int)Math.Round((i/cols+1)*im.Height/(double)rows);
for(int y=y0;y<y1;y++)for(int x=x0;x<x1;x++)if(im.GetPixel(x,y).A>8){l=Math.Min(l,x-x0);t=Math.Min(t,y-y0);r=Math.Max(r,x-x0+1);b=Math.Max(b,y-y0+1);}}
if(r<=l||b<=t)throw new Exception(src);
int w=r-l,h=b-t;double s=224.0/Math.Max(w,h);int dw=(int)Math.Round(w*s),dh=(int)Math.Round(h*s);
using(var output=new Bitmap(count*256,256))using(var g=Graphics.FromImage(output)){g.Clear(Color.Transparent);g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
for(int i=0;i<count;i++){int x0=(int)Math.Round((i%cols)*im.Width/(double)cols),y0=(int)Math.Round((i/cols)*im.Height/(double)rows);g.DrawImage(im,new Rectangle(i*256+(256-dw)/2,(256-dh)/2,dw,dh),x0+l,y0+t,w,h,GraphicsUnit.Pixel);}output.Save(dst,ImageFormat.Png);}}}}
"@
$r=Split-Path $PSScriptRoot -Parent;$base="$r/assets/images/monsters/bosses";$out="$base/normalized256";New-Item -ItemType Directory -Force $out|Out-Null
$jobs=@(@('altar_rosea/models-v2.png',3,1,3),@('altar_galvin/float-v1.png',4,2,8),@('altar_galvin/twin-float-v1.png',4,2,8),@('altar_vera/hover-v1.png',4,2,8),@('lava-ridge/shell-cycle-v1.png',8,1,8),@('frost-alpha/charge-cycle-v2.png',8,1,8))
Get-ChildItem "$base/expansion" -Filter *.png|ForEach-Object{$im=[Drawing.Image]::FromFile($_.FullName);$n=[int]($im.Width/$im.Height);$im.Dispose();$jobs+=,@("expansion/$($_.Name)",$n,1,$n)}
$records=@();foreach($j in $jobs){$name=($j[0]-replace '/','-');[Atlas256]::Build("$base/$($j[0])","$out/$name",$j[1],$j[2],$j[3]);$records+= [pscustomobject]@{source=$j[0];target="normalized256/$name";frames=$j[3];frameSize=256}}
$records|ConvertTo-Json|Set-Content "$out/manifest.json" -Encoding utf8
Write-Output "Converted $($records.Count) atlases"