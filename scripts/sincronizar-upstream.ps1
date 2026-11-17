# Traz as atualizações da Receita: sincroniza cada fork com o upstream e puxa para upstream\<nome> via git subtree.
# Rode com a árvore limpa; depois rode os testes (npm test, scripts\build-java.ps1, npm run test:e2e) antes de publicar.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location $raiz
if (git status --porcelain) { throw 'árvore suja: faça commit ou stash antes' }

$forks = @(
  @{ pasta = 'regime-regular';   repo = 'calculadora-rtc-regime-regular' },
  @{ pasta = 'simples-nacional'; repo = 'calculadora-rtc-simples-nacional' },
  @{ pasta = 'gerador-danfse';   repo = 'calculadora-rtc-gerador-danfse' }
)
foreach ($f in $forks) {
  "== $($f.repo)"
  gh repo sync "RicardoBiazin/$($f.repo)" --branch main
  if ($LASTEXITCODE -ne 0) { throw "gh repo sync falhou em $($f.repo)" }
  git subtree pull --prefix "upstream/$($f.pasta)" "https://github.com/RicardoBiazin/$($f.repo)" main --squash -m "chore: atualiza upstream/$($f.pasta) a partir da Receita"
  if ($LASTEXITCODE -ne 0) { throw "subtree pull falhou em $($f.pasta)" }
}
'Concluído. Rode os testes antes de publicar.'
