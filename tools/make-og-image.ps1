<#
.SYNOPSIS
  Regenerates assets/images/og-default.jpg — the 1200x630 image shown when a
  page without its own `image:` is shared on LinkedIn, X, Slack, etc.
  Run it again whenever you change the site title or tagline.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\make-og-image.ps1 -Title "The Architect's Handbook" -Url "subhtech09.github.io/Tech-Blogging"
#>
param(
  [string]$Title   = 'The Architect''s Handbook',
  [string]$Tagline = ('Data architecture  {0}  Data engineering  {0}  AI engineering' -f [char]0x00B7),
  [string]$Url     = 'subhtech09.github.io/Tech-Blogging'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function C([string]$hex, [int]$a = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B)
}
function Txt($g, $text, $x, $y, $font, $color) {
  $b = New-Object System.Drawing.SolidBrush($color)
  $g.DrawString($text, $font, $b, [float]$x, [float]$y)
  $b.Dispose()
}
function Glow($g, $cx, $cy, $r, $color) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(($cx - $r), ($cy - $r), (2 * $r), (2 * $r))
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $brush.CenterColor = $color
  $brush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))
  $g.FillPath($brush, $path)
  $brush.Dispose(); $path.Dispose()
}

$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'

# Soft mint-to-sky background
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point(0, 0)), (New-Object System.Drawing.Point($W, $H)), (C '#E3F7EE'), (C '#E6F2FC'))
$g.FillRectangle($bg, 0, 0, $W, $H); $bg.Dispose()

Glow $g 1080 40 420 (C '#5AAEE9' 90)
Glow $g 80 640 380 (C '#5FCB9B' 90)

# Blueprint grid
$gridPen = New-Object System.Drawing.Pen((C '#2E8FD6' 22), 1)
for ($x = 0; $x -le $W; $x += 40) { $g.DrawLine($gridPen, $x, 0, $x, $H) }
for ($y = 0; $y -le $H; $y += 40) { $g.DrawLine($gridPen, 0, $y, $W, $y) }
$gridPen.Dispose()

# Logo mark (the 32px SVG scaled x3)
$s = 3; $ox = 80; $oy = 140
$p = New-Object System.Drawing.Drawing2D.GraphicsPath
$rr = 8 * $s; $d = $rr * 2; $lw = 32 * $s
$p.AddArc($ox, $oy, $d, $d, 180, 90); $p.AddArc($ox + $lw - $d, $oy, $d, $d, 270, 90)
$p.AddArc($ox + $lw - $d, $oy + $lw - $d, $d, $d, 0, 90); $p.AddArc($ox, $oy + $lw - $d, $d, $d, 90, 90); $p.CloseFigure()
$logoBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point($ox, $oy)), (New-Object System.Drawing.Point(($ox + $lw), ($oy + $lw))), (C '#34B27F'), (C '#2E8FD6'))
$g.FillPath($logoBrush, $p); $logoBrush.Dispose(); $p.Dispose()
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, (2.2 * $s))
$pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
$g.DrawLines($pen, [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF(($ox + 9 * $s), ($oy + 10.5 * $s))), (New-Object System.Drawing.PointF(($ox + 15.5 * $s), ($oy + 10.5 * $s))), (New-Object System.Drawing.PointF(($ox + 22.5 * $s), ($oy + 16 * $s)))))
$g.DrawLines($pen, [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF(($ox + 9 * $s), ($oy + 21.5 * $s))), (New-Object System.Drawing.PointF(($ox + 15.5 * $s), ($oy + 21.5 * $s))), (New-Object System.Drawing.PointF(($ox + 22.5 * $s), ($oy + 16 * $s)))))
$pen.Dispose()
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
foreach ($c in @(@(8.5, 10.5, 2.5), @(8.5, 21.5, 2.5), @(23, 16, 3))) {
  $cr = $c[2] * $s
  $g.FillEllipse($white, ($ox + $c[0] * $s - $cr), ($oy + $c[1] * $s - $cr), (2 * $cr), (2 * $cr))
}
$white.Dispose()

# Title — shrink until it fits the canvas
$size = 80
do {
  $titleFont = New-Object System.Drawing.Font('Segoe UI', [float]$size, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $tw = $g.MeasureString($Title, $titleFont).Width
  if ($tw -gt ($W - 150)) { $titleFont.Dispose(); $size -= 2 }
} while ($tw -gt ($W - 150) -and $size -gt 36)
Txt $g $Title 72 270 $titleFont (C '#0B1824')
$titleFont.Dispose()

$tagFont = New-Object System.Drawing.Font('Segoe UI Semibold', [float]30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
Txt $g $Tagline 80 390 $tagFont (C '#11704B'); $tagFont.Dispose()
$urlFont = New-Object System.Drawing.Font('Consolas', [float]24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
Txt $g $Url 80 530 $urlFont (C '#52677A'); $urlFont.Dispose()

# Mint-to-sky bar along the bottom
$bar = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point(0, 0)), (New-Object System.Drawing.Point($W, 0)), (C '#5FCB9B'), (C '#5AAEE9'))
$g.FillRectangle($bar, 0, ($H - 10), $W, 10); $bar.Dispose()

$out = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\images\og-default.jpg'
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]90)
$bmp.Save($out, $codec, $ep)
$g.Dispose(); $bmp.Dispose()
Write-Host "Wrote $out"
