# Compatibility entrypoint. Native installation has one implementation.
$ErrorActionPreference = "Stop"
Write-Host "setup.ps1 now delegates to scripts\install.ps1 (native awenOps + awenAgent)."
Write-Host "For Docker, follow docs/deployment-recovery.md."
& (Join-Path $PSScriptRoot "scripts\install.ps1") @args
exit $LASTEXITCODE
