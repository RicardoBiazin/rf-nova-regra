# Compila o DANFSe em WebAssembly para web/public.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$pub = Join-Path $raiz 'web\public'
New-Item -ItemType Directory -Force $pub | Out-Null
Push-Location (Join-Path $raiz 'upstream\gerador-danfse')
try {
  $env:GOOS = 'js'; $env:GOARCH = 'wasm'
  go build -trimpath -ldflags '-s -w' -o (Join-Path $pub 'danfse.wasm') ./cmd/danfse-wasm
  if ($LASTEXITCODE -ne 0) { throw 'go build wasm falhou' }
  Remove-Item Env:GOOS, Env:GOARCH
  $goroot = (go env GOROOT)
  $wexec = @("$goroot\lib\wasm\wasm_exec.js", "$goroot\misc\wasm\wasm_exec.js") | Where-Object { Test-Path $_ } | Select-Object -First 1
  Copy-Item $wexec (Join-Path $pub 'wasm_exec.js') -Force
} finally { Pop-Location; Remove-Item Env:GOOS, Env:GOARCH -ErrorAction SilentlyContinue }
"OK: $((Get-Item (Join-Path $pub 'danfse.wasm')).Length/1MB) MB"
