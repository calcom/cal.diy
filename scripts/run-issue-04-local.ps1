param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$YarnArguments
)

if (-not $YarnArguments) {
  throw "Pass a Yarn command, for example: prisma migrate deploy"
}

$databaseLine = Get-Content -LiteralPath ".env" | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1
if (-not $databaseLine) {
  throw "Local .env has no DATABASE_URL"
}

$databaseUrl = ($databaseLine -replace "^DATABASE_URL=", "").Trim([char[]]@('"', "'"))
if (-not $databaseUrl.Contains("@database:5432/")) {
  throw "Expected the Issue 04 Docker database host in .env"
}

$env:DATABASE_URL = $databaseUrl.Replace("@database:5432/", "@127.0.0.1:5450/")
$env:DATABASE_DIRECT_URL = $env:DATABASE_URL

$nodeExecutable = if ($env:ISSUE04_NODE_EXECUTABLE) { $env:ISSUE04_NODE_EXECUTABLE } else { "node" }
if ($env:ISSUE04_NODE_EXECUTABLE) {
  if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw "ISSUE04_NODE_EXECUTABLE does not exist" }
  $env:PATH = "$(Split-Path -Parent $nodeExecutable);$env:PATH"
}

& $nodeExecutable ".yarn/releases/yarn-4.12.0.cjs" @YarnArguments
exit $LASTEXITCODE
