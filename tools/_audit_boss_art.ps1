Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public class AtlasAudit {
 public static object Scan(string path) {using(var b=new Bitmap(path)){var d=b.LockBits(new Rectangle(0,0,b.Width,b.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);byte[] buf=new byte[Math.Abs(d.Stride)*b.Height];Marshal.Copy(d.Scan0,buf,0,buf.Length);b.UnlockBits(d);long zero=0,opaque=0,gray=0;for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++){int i=y*Math.Abs(d.Stride)+x*4;int a=buf[i+3];if(a==0)zero++;if(a==255)opaque++;int r=buf[i+2],g=buf[i+1],bl=buf[i];if(a>240&&r>170&&Math.Abs(r-g)<4&&Math.Abs(r-bl)<4)gray++;}return new {name=System.IO.Path.GetFileName(path),w=b.Width,h=b.Height,zeroPct=Math.Round(100.0*zero/(b.Width*b.Height),2),opaquePct=Math.Round(100.0*opaque/(b.Width*b.Height),2),lightGrayPct=Math.Round(100.0*gray/(b.Width*b.Height),2)};}}
}
"@ -ReferencedAssemblies System.Drawing
$rows=Get-ChildItem art/boss_lava_frost_w40_w60 -Filter '*-alpha.png' | ForEach-Object {[AtlasAudit]::Scan($_.FullName)}
$rows | ConvertTo-Json | Set-Content art/boss_lava_frost_w40_w60/acceptance-pixel-audit.json -Encoding UTF8
$rows | Format-Table -AutoSize
