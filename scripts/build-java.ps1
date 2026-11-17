# Compila os dois serviços Java e copia os jars para build/jars. Use -SemTestes para pular os testes.
param([switch]$SemTestes)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$db = Join-Path $raiz 'build\db\calculadora-pro.db'
if (-not (Test-Path $db)) { throw 'rode scripts\gerar-banco.ps1 antes' }
New-Item -ItemType Directory -Force (Join-Path $raiz 'build\jars') | Out-Null
foreach ($m in @(@('regime-regular','regime-regular.jar'), @('simples-nacional','simples-nacional.jar'))) {
  $dir = Join-Path $raiz "upstream\$($m[0])"
  Push-Location $dir
  try {
    # Os testes e o perfil offline leem ./calculadora/db relativo ao projeto: aponta para o banco central via link.
    $local = Join-Path $dir 'calculadora\db'
    New-Item -ItemType Directory -Force $local | Out-Null
    Copy-Item $db (Join-Path $local 'calculadora-pro.db') -Force
    $args = @('clean','package','--batch-mode','-Dspring.profiles.active=testes')
    if ($SemTestes) { $args += '-DskipTests' }
    elseif ($m[0] -eq 'simples-nacional') {
      # Ajustes para os testes da Receita rodarem fora da infraestrutura deles (código upstream intocado):
      # 1) o repositório publicado não traz o application.yml com application.db.download.url;
      # 2) dois testes esperam cClassTrib 820001 sem implementação, mas a migração V0059 (habilitação do 820) o habilita.
      $args += '-Dapplication.db.download.url=http://localhost/nao-usado'
      $args += '-Dtest=!ParametrizacaoSimplesNacionalTest#classificacoesSemTratamentoImplementado_conformeACargaVigente,!SimplesNacionalControllerTest#naoImplementadoTambemEmNfse'
    }
    & .\mvnw.cmd @args
    if ($LASTEXITCODE -ne 0) { throw "maven falhou em $($m[0])" }
    $jar = Get-ChildItem target -Filter '*.jar' | Where-Object { $_.Name -notmatch 'original|sources' } | Sort-Object Length -Descending | Select-Object -First 1
    Copy-Item $jar.FullName (Join-Path $raiz "build\jars\$($m[1])") -Force
    "OK $($m[1]) <- $($jar.Name)"
  } finally { Pop-Location }
}
