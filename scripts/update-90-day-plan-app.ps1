param(
  [Parameter(Mandatory = $true)]
  [string]$DocumentPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $DocumentPath)) {
  throw "No se encontro el documento: $DocumentPath"
}

$replacements = @(
  @{
    Old = "Registrar ventas y gastos, revisar costos y cuidar el dinero."
    New = "Revisar en la app las ventas, gastos, costos y resultados; conciliar el dinero recibido y cuidar el flujo de efectivo."
  },
  @{
    Old = "Revisar el inventario al llegar, conocer el costo de cada bowl, mantener recetas claras y probar mejoras de comida."
    New = "Revisar y actualizar Inventario en la app al llegar, atender alertas de bajo stock, registrar mermas y temperaturas, costear cada bowl y probar mejoras."
  },
  @{
    Old = "Registrar el inventario al llegar, conocer el costo de cada bowl y lanzar dos marinados, aderezos o mejoras que funcionen bien."
    New = "Mantener Inventario actualizado en la app, conocer el costo de cada bowl y lanzar dos marinados, aderezos o mejoras que funcionen bien."
  },
  @{
    Old = "Ya existe una hoja para contar clientes."
    New = "Cada promoción usa un código o QR propio y sus pedidos se revisan en la app."
  },
  @{
    Old = "Revisar el inventario al llegar, conocer el costo de cada bowl, mantener una cocina ordenada y probar nuevas ideas que podamos preparar siempre igual."
    New = "Usar Inventario, Tareas, Temperaturas y Merma en la app para controlar la cocina, costear cada bowl y probar ideas que podamos preparar siempre igual."
  },
  @{
    Old = "Al 3 de noviembre, registrar el inventario al inicio de cada jornada, conocer el costo de preparar cada bowl, tener por escrito las recetas principales, probar seis marinados, aderezos o mejoras, elegir tres y poner dos en venta o en uso."
    New = "Al 3 de noviembre, revisar Inventario en la app al inicio de cada jornada, costear cada bowl, documentar recetas, probar seis mejoras, elegir tres y poner dos en venta o en uso."
  },
  @{
    Old = "Crear una hoja de inventario de llegada y escribir las cantidades, porciones y pasos de las recetas principales."
    New = "Configurar Inventario en la app con artículo, sección, unidad, existencia, mínimo, costo, proveedor y relación con el menú; documentar porciones y recetas."
  },
  @{
    Old = "Al llegar, antes de preparar alimentos, Gabriel cuenta los ingredientes importantes y anota faltantes. Las porciones ya se pueden pesar."
    New = "Antes de preparar, Gabriel abre Inventario, revisa bajo stock, confirma existencias y actualiza faltantes. También completa Tareas y Temperaturas; las porciones se pesan."
  },
  @{
    Old = "Registrar el inventario en cada jornada, calcular el costo de cada bowl y probar dos ideas nuevas."
    New = "Actualizar Inventario cada jornada, registrar mercancía recibida y merma, calcular el costo de cada bowl y probar dos ideas nuevas."
  },
  @{
    Old = "Mantener el inventario diario, actualizar costos cuando cambie un precio y tener cuatro ideas probadas."
    New = "Mantener Inventario al día, recibir mercancía desde la app, actualizar el costo de compra y tener cuatro ideas probadas."
  },
  @{
    Old = "Completar seis pruebas, elegir tres y poner dos en uso, sin dejar de registrar inventario y costos."
    New = "Completar seis pruebas, elegir tres y poner dos en uso, sin dejar de actualizar Inventario, costos, temperaturas y merma en la app."
  },
  @{
    Old = "Inventarios hechos al llegar, antes de preparar"
    New = "Jornadas con Inventario revisado en la app al llegar"
  },
  @{
    Old = "Empezar a registrarlos"
    New = "Activar el registro en la app"
  },
  @{
    Old = "Registros de temperatura, limpieza y desperdicio llenados"
    New = "Temperaturas, tareas de limpieza y mermas registradas en la app"
  },
  @{
    Old = "Sumarlo del 5 al 19 ago"
    New = "Consultar Merma del 5 al 19 ago"
  }
)

$word = $null
$document = $null
$changes = New-Object System.Collections.Generic.List[object]

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($DocumentPath, $false, $false)

  $replacementCounts = @{}
  $allMatches = New-Object System.Collections.Generic.List[object]
  foreach ($replacement in $replacements) {
    $replacementCounts[$replacement.Old] = 0
  }

  # First locate every match without editing. Table cells are handled
  # separately because Word's global Find can skip text near cell markers.
  for ($tableIndex = 1; $tableIndex -le $document.Tables.Count; $tableIndex += 1) {
    $table = $document.Tables.Item($tableIndex)
    $cells = $table.Range.Cells
    foreach ($cell in $cells) {
      $containerStart = $cell.Range.Start
      $containerText = $cell.Range.Text

      foreach ($replacement in $replacements) {
        $searchIndex = 0
        while ($searchIndex -lt $containerText.Length) {
          $matchIndex = $containerText.IndexOf($replacement.Old, $searchIndex, [System.StringComparison]::Ordinal)
          if ($matchIndex -lt 0) { break }

          $allMatches.Add([pscustomobject]@{
            Start = $containerStart + $matchIndex
            End = $containerStart + $matchIndex + $replacement.Old.Length
            New = $replacement.New
          })
          $replacementCounts[$replacement.Old] += 1
          $searchIndex = $matchIndex + $replacement.Old.Length
        }
      }

    }
  }

  for ($paragraphIndex = 1; $paragraphIndex -le $document.Paragraphs.Count; $paragraphIndex += 1) {
    $paragraph = $document.Paragraphs.Item($paragraphIndex)
    if ($paragraph.Range.Information(12)) {
      [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($paragraph)
      continue
    }

    $containerStart = $paragraph.Range.Start
    $containerText = $paragraph.Range.Text
    foreach ($replacement in $replacements) {
      $searchIndex = 0
      while ($searchIndex -lt $containerText.Length) {
        $matchIndex = $containerText.IndexOf($replacement.Old, $searchIndex, [System.StringComparison]::Ordinal)
        if ($matchIndex -lt 0) { break }

        $allMatches.Add([pscustomobject]@{
          Start = $containerStart + $matchIndex
          End = $containerStart + $matchIndex + $replacement.Old.Length
          New = $replacement.New
        })
        $replacementCounts[$replacement.Old] += 1
        $searchIndex = $matchIndex + $replacement.Old.Length
      }
    }
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($paragraph)
  }

  foreach ($replacement in $replacements) {
    $count = $replacementCounts[$replacement.Old]
    if ($count -lt 1) {
      throw "No se encontro el texto a reemplazar: $($replacement.Old)"
    }
    $changes.Add([pscustomobject]@{ Old = $replacement.Old; Replacements = $count })
  }

  # Apply from the end of the document so growing text cannot invalidate any
  # position that has not been edited yet.
  foreach ($match in @($allMatches | Sort-Object Start -Descending)) {
    $range = $document.Range($match.Start, $match.End)
    $range.Text = $match.New
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($range)
  }

  $document.Save()
  $pageCount = $document.ComputeStatistics(2)
  $paragraphCount = $document.Paragraphs.Count
  $tableCount = $document.Tables.Count
  $document.Close([ref]0)
  $document = $null
  $word.Quit()
  $word = $null

  [pscustomobject]@{
    Document = $DocumentPath
    ReplacementRules = $changes.Count
    Pages = $pageCount
    Paragraphs = $paragraphCount
    Tables = $tableCount
  } | ConvertTo-Json -Compress
}
finally {
  if ($document) {
    $document.Close([ref]0)
  }
  if ($word) {
    $word.Quit()
  }
  if ($document) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document)
  }
  if ($word) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
  [gc]::Collect()
  [gc]::WaitForPendingFinalizers()
}
