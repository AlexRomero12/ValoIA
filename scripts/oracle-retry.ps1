# Crea la VM Ampere A1 (Always Free) reintentando hasta que haya capacidad.
# Solo recursos Always Free: A1.Flex 1-2 OCPU (max 2/12), boot 50 GB, subred publica.
#
# Requisitos:
#   1) OCI CLI configurado (oci setup config / ~/.oci/config) + API key en la consola
#   2) Una subred PUBLICA en tu VCN
#
# Uso:
#   powershell -File scripts/oracle-retry.ps1
#   powershell -File scripts/oracle-retry.ps1 -Ocpus 2 -MemoryGB 12 -WaitSeconds 120

param(
  [string]$DisplayName = 'valoia',
  [int]$Ocpus = 1,
  [int]$MemoryGB = 6,
  [int]$BootGB = 50,
  [string]$SshPublicKeyPath = '',
  [int]$WaitSeconds = 90,
  [string]$SubnetId = '',
  [string]$CompartmentId = ''
)

$ErrorActionPreference = 'Continue'
$env:SUPPRESS_LABEL_WARNING = 'True'
$OutputEncoding = [System.Text.Encoding]::ASCII

# --- oci.exe (pip --user puede dejarlo fuera del PATH) ---
$OCI = 'oci'
if (-not (Get-Command oci -ErrorAction SilentlyContinue)) {
  $candidates = @(
    "$env:APPDATA\Python\Python312\Scripts\oci.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\Scripts\oci.exe"
  )
  $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $found) { Write-Error "No encuentro oci.exe. Instala con: python -m pip install --user oci-cli"; exit 1 }
  $OCI = $found
}

function OciJson([string[]]$CliArgs) {
  $out = & $OCI @CliArgs 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $out.Trim() }
  return ($out | ConvertFrom-Json)
}

# --- Config / tenancy ---
$configPath = "$env:USERPROFILE\.oci\config"
if (-not (Test-Path $configPath)) {
  Write-Error "Falta $configPath. Ejecuta 'oci setup config' primero."
  exit 1
}
$configText = Get-Content $configPath -Raw
if (-not $CompartmentId) {
  if ($configText -match '(?m)^tenancy=(\S+)') { $CompartmentId = $Matches[1] } else { Write-Error "No pude leer tenancy del config"; exit 1 }
}

# --- Llave publica SSH ---
if (-not $SshPublicKeyPath) {
  $SshPublicKeyPath = Get-ChildItem "$env:USERPROFILE\Downloads\ssh-key-*.pub", "$env:USERPROFILE\.ssh\*.pub" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $SshPublicKeyPath -or -not (Test-Path $SshPublicKeyPath)) {
  Write-Error "No encuentro la llave publica SSH. Pasala con -SshPublicKeyPath 'C:\ruta\ssh-key.pub'"
  exit 1
}
$sshPub = (Get-Content $SshPublicKeyPath -Raw).Trim()
Write-Output "Llave SSH: $SshPublicKeyPath"

# --- Availability domain e imagen Ubuntu 24.04 aarch64 ---
Write-Output "Buscando availability domain e imagen Ubuntu 24.04 (aarch64)..."
$ads = OciJson @('iam', 'availability-domain', 'list', '--compartment-id', $CompartmentId)
$ad = $ads.data | Select-Object -First 1 -ExpandProperty name
if (-not $ad) { Write-Error "No hay availability domains"; exit 1 }

$images = OciJson @('compute', 'image', 'list', '--compartment-id', $CompartmentId, '--shape', 'VM.Standard.A1.Flex', '--operating-system', 'Canonical Ubuntu', '--all')
$image = $images.data |
  Where-Object { $_.'display-name' -like 'Canonical-Ubuntu-24.04-aarch64-*' } |
  Sort-Object { $_.'time-created' } -Descending |
  Select-Object -First 1
if (-not $image) { Write-Error "No encontre imagen Canonical Ubuntu 24.04 aarch64"; exit 1 }
Write-Output "AD: $ad"
Write-Output "Imagen: $($image.'display-name')"

# --- Subred publica ---
if (-not $SubnetId) {
  Write-Output "Buscando una subred publica..."
  $subnets = OciJson @('network', 'subnet', 'list', '--compartment-id', $CompartmentId, '--all')
  $public = $subnets.data | Where-Object { -not $_.'prohibit-public-ip-on-vnic' } | Select-Object -First 1
  if (-not $public) {
    Write-Error "No hay subred publica. Crea una en la consola: Networking -> VCN -> Create Subnet -> marca 'Public Subnet'. Luego reintenta o pasala con -SubnetId."
    exit 1
  }
  $SubnetId = $public.id
  Write-Output "Subred: $($public.'display-name')"
} else {
  Write-Output "Subred (indicada): $SubnetId"
}

$shapeFile = Join-Path $env:TEMP 'valo-shape.json'
$metaFile = Join-Path $env:TEMP 'valo-metadata.json'
$shapeConfig = @{ ocpus = $Ocpus; memoryInGBs = $MemoryGB } | ConvertTo-Json -Compress
$metadata = @{ ssh_authorized_keys = $sshPub } | ConvertTo-Json -Compress
Set-Content -Path $shapeFile -Value $shapeConfig -Encoding ascii -NoNewline
Set-Content -Path $metaFile -Value $metadata -Encoding ascii -NoNewline
$shapeUri = 'file://' + ($shapeFile -replace '\\', '/')
$metaUri = 'file://' + ($metaFile -replace '\\', '/')

Write-Output ""
Write-Output "Intentando crear '$DisplayName' (A1.Flex $Ocpus OCPU / $MemoryGB GB) hasta que haya capacidad..."
Write-Output "Deja esta ventana abierta; reintenta cada $WaitSeconds s. Ctrl+C para cancelar."
Write-Output ""

$attempt = 0
while ($true) {
  $attempt++
  $stamp = Get-Date -Format 'HH:mm:ss'
  $launch = @(
    'compute', 'instance', 'launch',
    '--compartment-id', $CompartmentId,
    '--availability-domain', $ad,
    '--display-name', $DisplayName,
    '--shape', 'VM.Standard.A1.Flex',
    '--shape-config', $shapeUri,
    '--image-id', $image.id,
    '--subnet-id', $SubnetId,
    '--assign-public-ip', 'true',
    '--boot-volume-size-in-gbs', "$BootGB",
    '--metadata', $metaUri,
    '--wait-for-state', 'RUNNING',
    '--wait-interval-seconds', '10'
  )
  $out = & $OCI @launch 2>&1 | Out-String
  $code = $LASTEXITCODE

  if ($code -eq 0) {
    Write-Output "[$stamp] Intento ${attempt}: creada. Buscando IP publica..."
    $instance = ($out | ConvertFrom-Json).data
    Start-Sleep -Seconds 15
    try {
      $vnics = OciJson @('compute', 'instance', 'list-vnics', '--instance-id', $instance.id)
      $ip = $vnics.data | Select-Object -First 1 -ExpandProperty 'public-ip'
    } catch { $ip = '' }
    Write-Output ""
    Write-Output "=================================================="
    Write-Output " VM creada: $DisplayName"
    Write-Output " OCID: $($instance.id)"
    if ($ip) { Write-Output " IP publica: $ip" } else { Write-Output " IP publica: (miralo en la consola: Instances - valoia)" }
    Write-Output "=================================================="
    Write-Output "Siguiente paso: docs/despliegue.md (puertos, DNS, SSH y despliegue)."
    break
  }

  if ($out -match 'Out.?of.?host.?capacity|OutOfCapacity|InternalError') {
    Write-Output "[$stamp] Intento ${attempt}: sin capacidad todavia. Reintento en $WaitSeconds s..."
    Start-Sleep -Seconds $WaitSeconds
    continue
  }

  Write-Output ""
  Write-Output "[$stamp] Intento ${attempt}: error distinto, no reintento:"
  Write-Output $out.Trim()
  exit 1
}
