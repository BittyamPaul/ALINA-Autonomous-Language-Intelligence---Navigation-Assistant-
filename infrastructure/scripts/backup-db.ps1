# ==============================================================================
# ALINA — Production SurrealDB Backup & Snapshot Pipeline (PowerShell)
# ==============================================================================
param(
  [string]$BackupDir = "./backups",
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$Endpoint = if ($env:SURREAL_ENDPOINT) { $env:SURREAL_ENDPOINT } else { "http://127.0.0.1:8000" }
$Namespace = if ($env:SURREAL_NAMESPACE) { $env:SURREAL_NAMESPACE } else { "alina" }
$Database = if ($env:SURREAL_DATABASE) { $env:SURREAL_DATABASE } else { "main" }
$User = if ($env:SURREAL_USERNAME) { $env:SURREAL_USERNAME } else { "root" }
$Pass = if ($env:SURREAL_PASSWORD) { $env:SURREAL_PASSWORD } else { "root" }

if (!(Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd_HHmmssZ")
$Prefix = "alina_backup_${Namespace}_${Database}_${Timestamp}"
$RawFile = Join-Path $BackupDir "${Prefix}.surql"
$GzFile = "${RawFile}.gz"
$ChecksumFile = "${GzFile}.sha256"

function Write-JsonLog([string]$Level, [string]$Message) {
  $iso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  $obj = @{
    timestamp = $iso
    level = $Level
    service = "alina-backup"
    message = $Message
  }
  Write-Output ($obj | ConvertTo-Json -Compress)
}

Write-JsonLog "INFO" "Starting SurrealDB backup for ${Namespace}/${Database} from ${Endpoint}"

# Determine method: surreal CLI or HTTP Export
$SurrealCmd = Get-Command surreal -ErrorAction SilentlyContinue
if ($SurrealCmd) {
  Write-JsonLog "INFO" "Executing surreal export via CLI..."
  & surreal export --conn $Endpoint --ns $Namespace --db $Database --user $User --pass $Pass $RawFile
} else {
  Write-JsonLog "INFO" "surreal CLI not in PATH; falling back to HTTP export API..."
  $BaseUrl = $Endpoint.TrimEnd("/rpc").TrimEnd("/")
  $ExportUrl = "${BaseUrl}/export"
  
  $Pair = "${User}:${Pass}"
  $Bytes = [System.Text.Encoding]::ASCII.GetBytes($Pair)
  $Base64 = [System.Convert]::ToBase64String($Bytes)

  $Headers = @{
    "Accept" = "application/octet-stream"
    "NS" = $Namespace
    "DB" = $Database
    "Authorization" = "Basic $Base64"
  }

  Invoke-WebRequest -Uri $ExportUrl -Headers $Headers -OutFile $RawFile -UseBasicParsing
}

if (!(Test-Path $RawFile) -or ((Get-Item $RawFile).Length -eq 0)) {
  Write-JsonLog "ERROR" "Backup export resulted in empty or non-existent file."
  exit 1
}

$RawSize = (Get-Item $RawFile).Length
Write-JsonLog "INFO" "Raw export successful (${RawSize} bytes). Compressing..."

# Compress to GZip using .NET IO.Compression
$InputStream = [System.IO.File]::OpenRead((Resolve-Path $RawFile).Path)
$OutputStream = [System.IO.File]::Create((Resolve-Path -Path $BackupDir).Path + "\${Prefix}.surql.gz")
$GzipStream = New-Object System.IO.Compression.GZipStream($OutputStream, [System.IO.Compression.CompressionLevel]::Optimal)
$InputStream.CopyTo($GzipStream)
$GzipStream.Close()
$OutputStream.Close()
$InputStream.Close()

Remove-Item $RawFile -Force

# Calculate SHA-256 Checksum
$ActualGzPath = (Resolve-Path -Path $BackupDir).Path + "\${Prefix}.surql.gz"
$Hash = (Get-FileHash -Path $ActualGzPath -Algorithm SHA256).Hash.ToLower()
$HashContent = "$Hash  $([System.IO.Path]::GetFileName($ActualGzPath))"
Set-Content -Path $ChecksumFile -Value $HashContent -NoNewline

Write-JsonLog "INFO" "Compressed snapshot ready: ${Prefix}.surql.gz with SHA-256 checksum."

# Prune old backups
$CutoffDate = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "alina_backup_*.surql.gz*" | Where-Object { $_.LastWriteTime -lt $CutoffDate } | Remove-Item -Force
Write-JsonLog "INFO" "Pruned backups older than $RetentionDays days."
Write-JsonLog "INFO" "Backup completed successfully."
