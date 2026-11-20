# RF Nova Regra

As três calculadoras da Reforma Tributária do Consumo (LC 214/2025) publicadas pela Receita Federal, reunidas numa tela só, em versão **web** e **desktop**:

| Calculadora | O que faz | Web | Desktop |
|---|---|---|---|
| **Regime Regular** | CBS, IBS e Imposto Seletivo; consultas às tabelas oficiais; gerar e validar XML do grupo | API pública da Receita (ambiente piloto) | Serviço oficial embutido, offline |
| **Simples Nacional** | IBS e CBS no Simples, catálogo de atividades | indisponível (a Receita não tem API pública) | Serviço oficial embutido, offline |
| **DANFSe** | PDF do DANFSe a partir do XML da NFS-e | no navegador (WebAssembly) | no aplicativo (WebAssembly) |

> **Projeto não oficial, sem vínculo com a Receita Federal do Brasil.** Os resultados são simulações, sem valor fiscal. O código da Receita está em `upstream/` e não foi alterado.

## Usar

- **Web:** acesse o site (endereço no repositório, em *About*).
- **Desktop (Windows):** baixe `RF-Nova-Regra-Setup-<versão>.exe` em [Releases](https://github.com/RicardoBiazin/rf-nova-regra/releases/latest). O instalador é por usuário (sem administrador) e traz tudo, inclusive o Java. O Windows pode avisar sobre editor desconhecido porque o instalador não é assinado.

Na web, a tela mostra a versão do aplicativo e a versão da base de dados da API usada. No desktop, a base é a do código importado (hoje V0059); a API piloto da Receita costuma estar à frente (V0066 em 17/11/2026).

## Como funciona

```
tela (web/)  ──/api/rr/*──►  web: função Netlify ──► API da Receita
                              desktop: servidor local ──► regime-regular.jar (127.0.0.1)
             ──/api/sn/*──►  web: aviso "só no desktop"
                              desktop: servidor local ──► simples-nacional.jar (127.0.0.1)
             DANFSe: danfse.wasm direto no navegador
```

- A tela só fala com caminhos da própria origem; um proxy com **lista branca** (`shared/allowlist.mjs`) repassa só os caminhos de negócio, só GET/POST, corpo até 1 MB.
- No desktop, os dois serviços Java escutam apenas em `127.0.0.1`, em portas livres sorteadas, com o mesmo banco SQLite somente leitura. Fechar a janela encerra os dois.
- O código da Receita entra por `git subtree` em `upstream/` (um commit por fork). `scripts/sincronizar-upstream.ps1` traz as atualizações.

## Desenvolver

Requisitos: Node 24+, JDK 21, Go 1.27+ (`winget install EclipseAdoptium.Temurin.21.JDK GoLang.Go`).

```powershell
npm install
powershell -File scripts\gerar-banco.ps1      # banco SQLite a partir das migrações (build\db)
powershell -File scripts\build-java.ps1       # jars (build\jars); -SemTestes pula os testes upstream
powershell -File scripts\build-wasm.ps1       # danfse.wasm + wasm_exec.js (web\public)
powershell -File scripts\build-jre.ps1        # JRE mínimo (build\jre)
npm run build                                 # tela (web\dist)
npm run desktop                               # abre o aplicativo em desenvolvimento
npm test                                      # testes unitários (vitest)
npm run test:e2e                              # desktop de verdade: cálculo, atividades, lista branca, DANFSe
npm run dist                                  # instalador em release\
```

### Testes da Receita (upstream) rodando aqui

`build-java.ps1` roda os testes dos dois serviços Java sem alterar o código deles. Dois ajustes de ambiente, ambos no script:
- Simples Nacional: o repositório publicado não traz o `application.yml`; o script passa `-Dapplication.db.download.url` e exclui 2 testes que esperam o cClassTrib 820001 sem implementação, enquanto a migração V0059 o habilita (153 de 155 testes rodam).
- DANFSe (Go): `TestRun_BindFalhaRetornaErroSemHang` assume o comportamento de porta ocupada do Linux e trava no Windows; use `go test -skip TestRun_BindFalhaRetornaErroSemHang ./...`.

`npm run dev` abre só a tela no Vite, com proxy para serviços Java já rodando em `127.0.0.1:18080` (Regime Regular) e `:18082` (Simples Nacional); ajuste com `RR_DEV_URL` e `SN_DEV_URL`.

Se a variável `ELECTRON_RUN_AS_NODE` estiver definida (acontece dentro do VS Code), o Electron não abre: `npm run desktop` já a remove.

## Publicar a web (Netlify)

`netlify.toml` define build, funções e cabeçalhos de segurança (CSP com `wasm-unsafe-eval`). `RR_BASE_URL` (opcional) troca a API de origem do proxy.

## Licença

MIT (veja [LICENSE](LICENSE)). O código em `upstream/` é da Receita Federal do Brasil, também MIT (veja [NOTICE.md](NOTICE.md)).
