param(
    [string]$BackgroundPath = "output/menu/poke-palace-menu-background.png",
    [string]$OutputPath = "output/menu/menu-poke-palace-google.png"
)

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param(
        [System.Drawing.RectangleF]$Rectangle,
        [float]$Radius
    )

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $arc = [System.Drawing.RectangleF]::new($Rectangle.X, $Rectangle.Y, $diameter, $diameter)

    $path.AddArc($arc, 180, 90)
    $arc.X = $Rectangle.Right - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $Rectangle.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $Rectangle.X
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-CenteredText {
    param(
        [System.Drawing.Graphics]$Graphics,
        [string]$Text,
        [System.Drawing.Font]$Font,
        [System.Drawing.Brush]$Brush,
        [float]$Y,
        [float]$CanvasWidth
    )

    $size = $Graphics.MeasureString($Text, $Font)
    $Graphics.DrawString($Text, $Font, $Brush, (($CanvasWidth - $size.Width) / 2), $Y)
}

function Draw-MenuItem {
    param(
        [System.Drawing.Graphics]$Graphics,
        [string]$Name,
        [string]$Price,
        [string]$Detail,
        [float]$X,
        [float]$Y,
        [float]$Width,
        [System.Drawing.Font]$NameFont,
        [System.Drawing.Font]$PriceFont,
        [System.Drawing.Font]$DetailFont,
        [System.Drawing.Brush]$PrimaryBrush,
        [System.Drawing.Brush]$DetailBrush,
        [System.Drawing.Pen]$LeaderPen
    )

    $nameSize = $Graphics.MeasureString($Name, $NameFont)
    $priceSize = $Graphics.MeasureString($Price, $PriceFont)
    $priceX = $X + $Width - $priceSize.Width
    $Graphics.DrawString($Name, $NameFont, $PrimaryBrush, $X, $Y)

    $leaderStart = $X + $nameSize.Width + 14
    $leaderEnd = $priceX - 14
    if ($leaderEnd -gt $leaderStart) {
        $Graphics.DrawLine($LeaderPen, $leaderStart, ($Y + 21), $leaderEnd, ($Y + 21))
    }

    $Graphics.DrawString($Price, $PriceFont, $PrimaryBrush, $priceX, $Y)
    if ($Detail) {
        $Graphics.DrawString($Detail, $DetailFont, $DetailBrush, $X, ($Y + 35))
    }
}

$resolvedBackground = (Resolve-Path -LiteralPath $BackgroundPath).Path
$resolvedOutputDirectory = (Resolve-Path -LiteralPath (Split-Path -Parent $OutputPath)).Path
$resolvedOutput = Join-Path $resolvedOutputDirectory (Split-Path -Leaf $OutputPath)

$source = [System.Drawing.Image]::FromFile($resolvedBackground)
$canvas = [System.Drawing.Bitmap]::new(1536, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$canvas.SetResolution(96, 96)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)

$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.DrawImage($source, 0, 0, 1536, 1024)

$green = [System.Drawing.ColorTranslator]::FromHtml("#4A7A5A")
$greenDark = [System.Drawing.ColorTranslator]::FromHtml("#31523D")
$greenSoft = [System.Drawing.ColorTranslator]::FromHtml("#78917D")
$peach = [System.Drawing.ColorTranslator]::FromHtml("#F4C2B0")
$cream = [System.Drawing.Color]::FromArgb(232, 255, 245, 239)
$detail = [System.Drawing.Color]::FromArgb(230, 77, 92, 82)

$panelBrush = [System.Drawing.SolidBrush]::new($cream)
$greenBrush = [System.Drawing.SolidBrush]::new($green)
$greenDarkBrush = [System.Drawing.SolidBrush]::new($greenDark)
$detailBrush = [System.Drawing.SolidBrush]::new($detail)
$peachBrush = [System.Drawing.SolidBrush]::new($peach)
$leaderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(95, $greenSoft), 1.5)
$rulePen = [System.Drawing.Pen]::new($green, 2)

$panelRect = [System.Drawing.RectangleF]::new(116, 82, 1304, 856)
$panelPath = New-RoundedRectanglePath -Rectangle $panelRect -Radius 34
$graphics.FillPath($panelBrush, $panelPath)

$titleFont = [System.Drawing.Font]::new("Georgia", 55, [System.Drawing.FontStyle]::Bold)
$sectionFont = [System.Drawing.Font]::new("Georgia", 27, [System.Drawing.FontStyle]::Bold)
$nameFont = [System.Drawing.Font]::new("Arial", 17, [System.Drawing.FontStyle]::Bold)
$priceFont = [System.Drawing.Font]::new("Arial", 17, [System.Drawing.FontStyle]::Bold)
$detailFont = [System.Drawing.Font]::new("Arial", 12.5, [System.Drawing.FontStyle]::Regular)
$houseNameFont = [System.Drawing.Font]::new("Arial", 16.5, [System.Drawing.FontStyle]::Bold)
$pillFont = [System.Drawing.Font]::new("Arial", 11.5, [System.Drawing.FontStyle]::Bold)
$footerFont = [System.Drawing.Font]::new("Arial", 13, [System.Drawing.FontStyle]::Regular)

Draw-CenteredText -Graphics $graphics -Text "Poke Palace" -Font $titleFont -Brush $greenDarkBrush -Y 105 -CanvasWidth 1536
$graphics.DrawLine($rulePen, 608, 190, 928, 190)
$graphics.FillEllipse($greenBrush, 760, 185, 8, 8)

$leftX = 205
$rightX = 806
$columnWidth = 520
$aAcute = [char]0x00E1
$eAcute = [char]0x00E9
$iAcute = [char]0x00ED
$oAcute = [char]0x00F3
$uAcute = [char]0x00FA
$middleDot = [char]0x00B7
$enDash = [char]0x2013

$graphics.DrawString("Arma tu Bowl", $sectionFont, $greenDarkBrush, $leftX, 222)
$graphics.DrawLine($rulePen, $leftX, 269, ($leftX + 205), 269)

Draw-MenuItem -Graphics $graphics -Name "Bowl Mediano" -Price "`$230" -Detail ("(1 o 2 prote" + $iAcute + "nas, 100 g)") -X $leftX -Y 292 -Width $columnWidth -NameFont $nameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen
Draw-MenuItem -Graphics $graphics -Name "Bowl Grande" -Price "`$250" -Detail ("(3 prote" + $iAcute + "nas, 120 g)") -X $leftX -Y 372 -Width $columnWidth -NameFont $nameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen
Draw-MenuItem -Graphics $graphics -Name ("Scoop Extra de Prote" + $iAcute + "na") -Price "`$40" -Detail "(40 g adicional)" -X $leftX -Y 452 -Width $columnWidth -NameFont $nameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen
Draw-MenuItem -Graphics $graphics -Name "Complemento Extra" -Price "`$15 c/u" -Detail ("(despu" + $eAcute + "s de los primeros 6 incluidos)") -X $leftX -Y 532 -Width $columnWidth -NameFont $nameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen

$graphics.DrawString("Bowls de la Casa", $sectionFont, $greenDarkBrush, $rightX, 222)
$pillRect = [System.Drawing.RectangleF]::new(1122, 228, 165, 35)
$pillPath = New-RoundedRectanglePath -Rectangle $pillRect -Radius 17
$graphics.FillPath($greenBrush, $pillPath)
$graphics.DrawString("TODOS  `$230", $pillFont, $peachBrush, 1140, 236)
$graphics.DrawLine($rulePen, $rightX, 269, ($rightX + 254), 269)

Draw-MenuItem -Graphics $graphics -Name ("Bowl de Salm" + $oAcute + "n Esmeralda") -Price "`$230" -Detail "" -X $rightX -Y 302 -Width $columnWidth -NameFont $houseNameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen
Draw-MenuItem -Graphics $graphics -Name ("Bowl Picante de At" + $uAcute + "n Crujiente") -Price "`$230" -Detail "" -X $rightX -Y 363 -Width $columnWidth -NameFont $houseNameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen
Draw-MenuItem -Graphics $graphics -Name ("Bowl Tropical de Camar" + $oAcute + "n") -Price "`$230" -Detail "" -X $rightX -Y 424 -Width $columnWidth -NameFont $houseNameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen

$graphics.DrawString("Bebidas", $sectionFont, $greenDarkBrush, $rightX, 512)
$graphics.DrawLine($rulePen, $rightX, 559, ($rightX + 125), 559)

Draw-MenuItem -Graphics $graphics -Name "Botella de Agua" -Price "`$20" -Detail "" -X $rightX -Y 580 -Width $columnWidth -NameFont $nameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen
Draw-MenuItem -Graphics $graphics -Name "Coca-Zero" -Price "`$30" -Detail "" -X $rightX -Y 631 -Width $columnWidth -NameFont $nameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen
Draw-MenuItem -Graphics $graphics -Name "Topochico" -Price "`$35" -Detail "" -X $rightX -Y 682 -Width $columnWidth -NameFont $nameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen
Draw-MenuItem -Graphics $graphics -Name ("Agua del D" + $iAcute + "a") -Price "`$35" -Detail "" -X $rightX -Y 733 -Width $columnWidth -NameFont $nameFont -PriceFont $priceFont -DetailFont $detailFont -PrimaryBrush $greenDarkBrush -DetailBrush $detailBrush -LeaderPen $leaderPen

$footerRuleY = 848
$graphics.DrawLine($rulePen, 220, $footerRuleY, 1316, $footerRuleY)
$footerText = "Poke Palace " + $middleDot + " Plaza La Estaci" + $oAcute + "n, Local 24, Tijuana " + $middleDot + " Abierto todos los d" + $iAcute + "as 11 AM " + $enDash + " 9 PM"
Draw-CenteredText -Graphics $graphics -Text $footerText -Font $footerFont -Brush $greenDarkBrush -Y 873 -CanvasWidth 1536

$canvas.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)

$pillPath.Dispose()
$panelPath.Dispose()
$footerFont.Dispose()
$pillFont.Dispose()
$houseNameFont.Dispose()
$detailFont.Dispose()
$priceFont.Dispose()
$nameFont.Dispose()
$sectionFont.Dispose()
$titleFont.Dispose()
$rulePen.Dispose()
$leaderPen.Dispose()
$peachBrush.Dispose()
$detailBrush.Dispose()
$greenDarkBrush.Dispose()
$greenBrush.Dispose()
$panelBrush.Dispose()
$graphics.Dispose()
$canvas.Dispose()
$source.Dispose()

Write-Output $resolvedOutput
