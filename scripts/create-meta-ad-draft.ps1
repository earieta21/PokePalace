param(
  [string]$GraphVersion = "v26.0"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot "backend\.env"
$imagePath = Join-Path $projectRoot "output\menu\portada-poke-palace-google.png"
$campaignName = "Poke Palace | Trafico local | 2026-08-04"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "No se encontro backend/.env"
}
if (-not (Test-Path -LiteralPath $imagePath)) {
  throw "No se encontro la imagen del anuncio"
}

$settings = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    $settings[$parts[0].Trim()] = $parts[1].Trim()
  }
}

foreach ($required in @(
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_PAGE_ID",
  "META_INSTAGRAM_ACCOUNT_ID"
)) {
  if (-not $settings[$required]) {
    throw "Falta $required en backend/.env"
  }
}

$token = $settings["META_ACCESS_TOKEN"]
$adAccountId = $settings["META_AD_ACCOUNT_ID"]
$pageId = $settings["META_PAGE_ID"]
$instagramId = $settings["META_INSTAGRAM_ACCOUNT_ID"]
$baseUrl = "https://graph.facebook.com/$GraphVersion"
$headers = @{ Authorization = "Bearer $token" }
Add-Type -AssemblyName System.Net.Http
$httpClient = New-Object System.Net.Http.HttpClient
$httpClient.DefaultRequestHeaders.Authorization =
  New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)

function Invoke-MetaGet {
  param([Parameter(Mandatory)][string]$Path)
  Invoke-RestMethod -Method Get -Headers $headers -Uri "$baseUrl/$Path"
}

function Invoke-MetaPost {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][hashtable]$Body
  )
  $pairs = New-Object 'System.Collections.Generic.List[System.Collections.Generic.KeyValuePair[string,string]]'
  foreach ($entry in $Body.GetEnumerator()) {
    $pairs.Add((New-Object 'System.Collections.Generic.KeyValuePair[string,string]' ($entry.Key, [string]$entry.Value)))
  }
  $content = New-Object System.Net.Http.FormUrlEncodedContent -ArgumentList (,$pairs)
  $response = $httpClient.PostAsync("$baseUrl/$Path", $content).GetAwaiter().GetResult()
  $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    throw "Meta rechazo POST $Path`: $responseBody"
  }
  $responseBody | ConvertFrom-Json
}

function Invoke-MetaImageUpload {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$FilePath
  )
  $multipart = New-Object System.Net.Http.MultipartFormDataContent
  $fileContent = [System.Net.Http.ByteArrayContent]::new([IO.File]::ReadAllBytes($FilePath))
  $fileContent.Headers.ContentType =
    New-Object System.Net.Http.Headers.MediaTypeHeaderValue("image/png")
  $multipart.Add($fileContent, "filename", [IO.Path]::GetFileName($FilePath))
  $response = $httpClient.PostAsync("$baseUrl/$Path", $multipart).GetAwaiter().GetResult()
  $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $multipart.Dispose()
  if (-not $response.IsSuccessStatusCode) {
    throw "Meta rechazo la imagen en $Path`: $responseBody"
  }
  $responseBody | ConvertFrom-Json
}

$encodedCampaignName = [uri]::EscapeDataString($campaignName)
$existing = Invoke-MetaGet -Path "$adAccountId/campaigns?fields=id,name,status&limit=100"
$duplicate = @($existing.data | Where-Object { $_.name -eq $campaignName })
if ($duplicate.Count -gt 1) {
  throw "Hay mas de una campana llamada '$campaignName'; revisa Ads Manager"
}

$created = [ordered]@{}

$campaignId = if ($duplicate.Count -eq 1) {
  $duplicate[0].id
} else {
  (Invoke-MetaPost -Path "$adAccountId/campaigns" -Body @{
    name = $campaignName
    objective = "OUTCOME_TRAFFIC"
    buying_type = "AUCTION"
    special_ad_categories = "[]"
    is_adset_budget_sharing_enabled = "false"
    status = "PAUSED"
  }).id
}
$created.campaign_id = $campaignId

$targeting = @{
  age_min = 18
  age_max = 55
  geo_locations = @{
    custom_locations = @(
      @{
        latitude = 32.455826
        longitude = -116.919307
        radius = 5
        distance_unit = "kilometer"
      }
    )
  }
  publisher_platforms = @("facebook", "instagram")
  targeting_automation = @{
    advantage_audience = 0
  }
} | ConvertTo-Json -Depth 8 -Compress

$adSetName = "Tijuana 5 km | Facebook + Instagram | 200 MXN"
$existingAdSets = Invoke-MetaGet -Path "$adAccountId/adsets?fields=id,name,campaign_id,status&limit=100"
$matchingAdSets = @($existingAdSets.data | Where-Object {
  $_.name -eq $adSetName -and $_.campaign_id -eq $campaignId
})
if ($matchingAdSets.Count -gt 1) {
  throw "Hay mas de un conjunto llamado '$adSetName'; revisa Ads Manager"
}
$adSetId = if ($matchingAdSets.Count -eq 1) {
  $matchingAdSets[0].id
} else {
  (Invoke-MetaPost -Path "$adAccountId/adsets" -Body @{
    name = $adSetName
    campaign_id = $campaignId
    daily_budget = "20000"
    billing_event = "IMPRESSIONS"
    optimization_goal = "LINK_CLICKS"
    bid_strategy = "LOWEST_COST_WITHOUT_CAP"
    destination_type = "WEBSITE"
    targeting = $targeting
    status = "PAUSED"
  }).id
}
$created.adset_id = $adSetId

$uploadedImage = Invoke-MetaImageUpload -Path "$adAccountId/adimages" -FilePath $imagePath
$imageRecord = @($uploadedImage.images.PSObject.Properties | ForEach-Object { $_.Value })[0]
if (-not $imageRecord.hash) {
  throw "Meta no devolvio el hash de la imagen"
}
$created.image_hash = $imageRecord.hash

$destinationUrl = "https://pokepalace.org/order"
$storySpec = @{
  page_id = $pageId
  instagram_user_id = $instagramId
  link_data = @{
    image_hash = $imageRecord.hash
    link = $destinationUrl
    message = "Antojo de algo fresco? Arma tu poke a tu gusto con salmon, atun, camaron, tofu y tus ingredientes favoritos. Visitanos en Plaza La Estacion o haz tu pedido para recoger. Jueves a martes, 11:00 a 21:00; miercoles cerrado."
    name = "Poke fresco, hecho a tu gusto"
    description = "Bowls desde 230 MXN | Ordena y recoge"
    call_to_action = @{
      type = "ORDER_NOW"
      value = @{ link = $destinationUrl }
    }
  }
} | ConvertTo-Json -Depth 10 -Compress

$creative = Invoke-MetaPost -Path "$adAccountId/adcreatives" -Body @{
  name = "Poke Palace | Bowl local | 2026-08-04"
  object_story_spec = $storySpec
  degrees_of_freedom_spec = (@{
    creative_features_spec = @{
      standard_enhancements = @{ enroll_status = "OPT_OUT" }
    }
  } | ConvertTo-Json -Depth 8 -Compress)
}
$created.creative_id = $creative.id

$ad = Invoke-MetaPost -Path "$adAccountId/ads" -Body @{
  name = "Poke Palace | Ordena ahora | Imagen 1"
  adset_id = $adSetId
  creative = (@{ creative_id = $creative.id } | ConvertTo-Json -Compress)
  status = "PAUSED"
}
$created.ad_id = $ad.id
$created.status = "PAUSED"
$created.daily_budget_mxn = 200

$httpClient.Dispose()
$created | ConvertTo-Json -Depth 4
