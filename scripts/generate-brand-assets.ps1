# Genera los assets de marca (iconos PWA + imagen Open Graph) con la identidad
# del dash: fondo ink, panel angular rojo, V blanca y tipografía pesada.
# Uso: powershell -File scripts/generate-brand-assets.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root 'public\icons'
$ogDir = Join-Path $root 'public\og'
New-Item -ItemType Directory -Force $iconsDir, $ogDir | Out-Null

$ink = [System.Drawing.Color]::FromArgb(15, 25, 35)
$red = [System.Drawing.Color]::FromArgb(255, 70, 85)
$bone = [System.Drawing.Color]::FromArgb(236, 232, 225)
$mute = [System.Drawing.Color]::FromArgb(147, 164, 179)
$line = [System.Drawing.Color]::FromArgb(38, 56, 74)
$white = [System.Drawing.Color]::White
$panelBg = [System.Drawing.Color]::FromArgb(27, 42, 58)
$texture = [System.Drawing.Color]::FromArgb(14, 236, 232, 225)

function Draw-Panel([System.Drawing.Graphics]$g, [double]$size, [double]$margin) {
  $cut = $size * 0.06
  $pts = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new([float]$margin, [float]$margin),
    [System.Drawing.PointF]::new([float]($size - $margin), [float]$margin),
    [System.Drawing.PointF]::new([float]($size - $margin - $cut), [float]($size - $margin)),
    [System.Drawing.PointF]::new([float]$margin, [float]($size - $margin))
  )
  $g.FillPolygon([System.Drawing.SolidBrush]::new($red), $pts)
}

function Draw-V([System.Drawing.Graphics]$g, [double]$size, [double]$em) {
  $font = [System.Drawing.Font]::new('Arial Black', [float]$em, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = [System.Drawing.StringFormat]::new()
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = [System.Drawing.RectangleF]::new(0, 0, [float]$size, [float]$size)
  $g.DrawString('V', $font, [System.Drawing.SolidBrush]::new($white), $rect, $fmt)
  $font.Dispose()
}

function Save-Icon([int]$size, [string]$file, [bool]$maskable) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($ink)
  $ratio = 0.15
  if ($maskable) { $ratio = 0.24 }
  $margin = $size * $ratio
  Draw-Panel $g $size $margin
  $em = $size * 0.4
  if ($maskable) { $em = $size * 0.34 }
  Draw-V $g $size $em
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Save-Icon 192 (Join-Path $iconsDir 'icon-192.png') $false
Save-Icon 512 (Join-Path $iconsDir 'icon-512.png') $false
Save-Icon 512 (Join-Path $iconsDir 'icon-maskable-512.png') $true
Save-Icon 180 (Join-Path $iconsDir 'apple-touch-icon.png') $true

# ---------- Open Graph 1200x630 ----------
$W = 1200
$H = 630
$bmp = [System.Drawing.Bitmap]::new($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear($ink)

# trama diagonal sutil (misma del body)
$pen = [System.Drawing.Pen]::new($texture, 1)
for ($x = -$H; $x -lt $W + $H; $x += 27) {
  $g.DrawLine($pen, $x, 0, $x + $H, $H)
}
$pen.Dispose()

# panel angular rojo con la V
$panel = [System.Drawing.Bitmap]::new(430, 430)
$pg = [System.Drawing.Graphics]::FromImage($panel)
$pg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$pg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$pg.Clear([System.Drawing.Color]::Transparent)
Draw-Panel $pg 430 0
Draw-V $pg 430 175
$g.DrawImage($panel, 90, 100)
$pg.Dispose()
$panel.Dispose()

# título ValoIA (IA en rojo)
$fTitle = [System.Drawing.Font]::new('Arial Black', 108, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Valo', $fTitle, [System.Drawing.SolidBrush]::new($bone), 570, 150)
$sizeValo = $g.MeasureString('Valo', $fTitle)
$g.DrawString('IA', $fTitle, [System.Drawing.SolidBrush]::new($red), 570 + $sizeValo.Width - 10, 150)

$fSub = [System.Drawing.Font]::new('Arial', 34, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Panel de rendimiento - Valorant', $fSub, [System.Drawing.SolidBrush]::new($mute), 575, 290)

# chips
$fChip = [System.Drawing.Font]::new('Arial', 24, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$x = 575
foreach ($chip in @('RANKED', 'RR', 'IMPACTO', 'AUDITORIA')) {
  $s = $g.MeasureString($chip, $fChip)
  $w = $s.Width + 34
  $rect = [System.Drawing.RectangleF]::new([float]$x, 370, [float]$w, 54)
  $g.FillRectangle([System.Drawing.SolidBrush]::new($panelBg), $rect)
  $g.DrawRectangle([System.Drawing.Pen]::new($line, 2), [float]$x, 370, [float]$w, 54)
  $g.DrawString($chip, $fChip, [System.Drawing.SolidBrush]::new($bone), $x + 17, 382)
  $x += $w + 14
}

$fUrl = [System.Drawing.Font]::new('Arial', 26, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('valoia.duckdns.org', $fUrl, [System.Drawing.SolidBrush]::new($mute), 575, 500)

$bmp.Save((Join-Path $ogDir 'valoia-og.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

Write-Output "Assets generados:"
Get-ChildItem $iconsDir, $ogDir | ForEach-Object { " - $($_.FullName) ($([math]::Round($_.Length / 1KB)) KB)" }
