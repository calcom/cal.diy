function Get-LocalSetting([string]$key) {
  $line = Get-Content -LiteralPath ".env" | Where-Object { $_ -match "^$([regex]::Escape($key))=" } | Select-Object -First 1
  if (-not $line) { throw "Local .env has no $key" }
  return ($line -split "=", 2)[1].Trim([char[]]@('"', "'"))
}

$containerName = "caldiy-issue04-db"
$existing = docker ps --all --filter "name=^/$containerName`$" --format "{{.Names}}"
if ($LASTEXITCODE -ne 0) { throw "Cannot inspect Docker containers" }

if ($existing -contains $containerName) {
  $running = docker inspect --format "{{.State.Running}}" $containerName
  if ($LASTEXITCODE -ne 0) { throw "Cannot inspect Issue 04 database" }
  if ($running -eq "true") {
    Write-Output "Issue 04 database is already running on 127.0.0.1:5450"
    exit 0
  }
  $null = docker start $containerName
  if ($LASTEXITCODE -ne 0) { throw "Cannot start Issue 04 database" }
  Write-Output "Started existing Issue 04 database on 127.0.0.1:5450"
  exit 0
}

$null = docker image inspect postgres:17-alpine 2>$null
if ($LASTEXITCODE -ne 0) { throw "postgres:17-alpine is not available locally" }

$databaseUser = Get-LocalSetting "POSTGRES_USER"
$databasePassword = Get-LocalSetting "POSTGRES_PASSWORD"
$databaseName = Get-LocalSetting "POSTGRES_DB"

$null = docker run --detach --name $containerName `
  --publish "127.0.0.1:5450:5432" `
  --volume "caldiy-issue04-db-data:/var/lib/postgresql/data" `
  --env "POSTGRES_USER=$databaseUser" `
  --env "POSTGRES_PASSWORD=$databasePassword" `
  --env "POSTGRES_DB=$databaseName" `
  postgres:17-alpine
if ($LASTEXITCODE -ne 0) { throw "Cannot create Issue 04 database" }
Write-Output "Created Issue 04 database on 127.0.0.1:5450"
