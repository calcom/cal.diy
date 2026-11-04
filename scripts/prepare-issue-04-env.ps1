if (Test-Path -LiteralPath ".env") {
  throw "Local .env already exists; keep its current values and configure it manually."
}

$composeLines = @(Get-Content -LiteralPath "docker-compose.yml")
function Get-ComposeValue([string]$key) {
  $line = $composeLines | Where-Object { $_ -match "^\s*- $([regex]::Escape($key))=" } | Select-Object -First 1
  if (-not $line) { throw "docker-compose.yml has no $key" }
  return ($line -split "=", 2)[1]
}

$databaseUser = Get-ComposeValue "POSTGRES_USER"
$databasePassword = Get-ComposeValue "POSTGRES_PASSWORD"
$databaseName = Get-ComposeValue "POSTGRES_DB"
$databaseUrl = "postgresql://${databaseUser}:${databasePassword}@database:5432/${databaseName}"
$settings = @{
  DATABASE_URL = $databaseUrl
  DATABASE_DIRECT_URL = $databaseUrl
  DATABASE_HOST = "database"
  POSTGRES_USER = $databaseUser
  POSTGRES_PASSWORD = $databasePassword
  POSTGRES_DB = $databaseName
  NEXT_PUBLIC_WEBAPP_URL = "http://localhost:3000"
  NEXTAUTH_URL = "http://localhost:3000"
  NEXTAUTH_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  CALENDSO_ENCRYPTION_KEY = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  JWT_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  CRON_API_KEY = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  CALCOM_TELEMETRY_DISABLED = "1"
}

$lines = @(Get-Content -LiteralPath ".env.example")
foreach ($key in $settings.Keys) {
  $pattern = "^$([regex]::Escape($key))="
  $replacement = "$key=$($settings[$key])"
  if ($lines -match $pattern) {
    $lines = @($lines | ForEach-Object { if ($_ -match $pattern) { $replacement } else { $_ } })
  } else {
    $lines += $replacement
  }
}

$lines | Set-Content -LiteralPath ".env" -Encoding utf8
Write-Output "Created ignored .env with local test secrets. Values were not printed."
