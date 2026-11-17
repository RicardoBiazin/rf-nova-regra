# Cria um JRE mínimo (jlink) em build\jre com os módulos que os dois serviços Spring Boot usam.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$saida = Join-Path $raiz 'build\jre'
$jdk = $env:JAVA_HOME
if (-not $jdk -or -not (Test-Path (Join-Path $jdk 'bin\jlink.exe'))) {
  $jlink = (Get-Command jlink -ErrorAction Stop).Source
  $jdk = Split-Path (Split-Path $jlink -Parent) -Parent
}
$modulos = 'java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql,java.transaction.xa,java.xml,java.xml.crypto,jdk.crypto.ec,jdk.management,jdk.unsupported,jdk.zipfs,jdk.net,jdk.naming.dns'
if (Test-Path $saida) { Remove-Item $saida -Recurse -Force }
& (Join-Path $jdk 'bin\jlink.exe') --add-modules $modulos --strip-debug --no-header-files --no-man-pages --compress zip-6 --output $saida
if ($LASTEXITCODE -ne 0) { throw 'jlink falhou' }
$tam = (Get-ChildItem $saida -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
"OK: $saida ($([math]::Round($tam)) MB)"
