#!/usr/bin/env pwsh
# Build native image + deploy to AWS Lambda.
# Reads secrets from .env, passes them to SAM as parameter overrides.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path .env)) {
    Write-Error ".env not found in $PSScriptRoot"
    exit 1
}

$envVars = @{}
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+?)\s*$') {
        $envVars[$Matches[1]] = $Matches[2]
    }
}

foreach ($key in 'ANTHROPIC_API_KEY','SUPABASE_DB_URL','SUPABASE_DB_USER','SUPABASE_DB_PASSWORD','APP_PASSWORD') {
    if (-not $envVars.ContainsKey($key)) {
        Write-Error "Missing $key in .env"
        exit 1
    }
}

Write-Host "==> Building native image (3-6 min)..." -ForegroundColor Cyan
mvn clean package -Pnative "-Dquarkus.native.container-build=true" "-Dquarkus.native.builder-image=quay.io/quarkus/ubi9-quarkus-mandrel-builder-image:jdk-25"
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

Write-Host "==> Deploying to AWS..." -ForegroundColor Cyan
$env:SAM_CLI_TELEMETRY = "0"
$paramOverrides = @(
    "AnthropicApiKey=$($envVars['ANTHROPIC_API_KEY'])",
    "SupabaseUrl=$($envVars['SUPABASE_DB_URL'])",
    "SupabaseUser=$($envVars['SUPABASE_DB_USER'])",
    "SupabasePassword=$($envVars['SUPABASE_DB_PASSWORD'])",
    "AppPassword=$($envVars['APP_PASSWORD'])"
) -join ' '

sam deploy -t sam.native.yaml --profile nutri --no-confirm-changeset --parameter-overrides $paramOverrides
if ($LASTEXITCODE -ne 0) { Write-Error "Deploy failed"; exit 1 }

Write-Host "==> Done." -ForegroundColor Green
