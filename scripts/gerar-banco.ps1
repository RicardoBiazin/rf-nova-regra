# Gera build/db/calculadora-pro.db a partir das migrações do regime-regular (compartilhado com o Simples Nacional).
# O flyway-pro.conf usa caminhos relativos (./calculadora/db), então roda dentro do projeto e o banco é movido depois.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$alvo = Join-Path $raiz 'build\db\calculadora-pro.db'
New-Item -ItemType Directory -Force (Split-Path $alvo) | Out-Null
Push-Location (Join-Path $raiz 'upstream\regime-regular')
try {
  $local = '.\calculadora\db\calculadora-pro.db'
  New-Item -ItemType Directory -Force '.\calculadora\db' | Out-Null
  if (Test-Path $local) { Remove-Item $local -Force }
  & .\mvnw.cmd flyway:migrate "-Dflyway.configFiles=flyway\flyway-pro.conf" --batch-mode --errors
  if ($LASTEXITCODE -ne 0) { throw "flyway falhou ($LASTEXITCODE)" }
  if (-not (Test-Path $local)) { throw 'banco não foi criado' }
  Copy-Item $local $alvo -Force
} finally { Pop-Location }
"OK: $alvo ($([math]::Round((Get-Item $alvo).Length/1MB,1)) MB)"
