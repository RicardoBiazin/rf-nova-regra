# Changelog

Formato: [Mantenha um Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento: [SemVer](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-11-17

### Adicionado
- Tela única com Regime Regular, Simples Nacional, DANFSe, Consultas e XML.
- Versão web (Netlify): Regime Regular pela API pública da Receita via proxy com lista branca; DANFSe em WebAssembly; Simples Nacional com aviso (só no desktop).
- Versão desktop (Electron, Windows): serviços Java da Receita e banco SQLite embutidos, JRE mínimo (jlink), tudo em 127.0.0.1.
- Código dos três projetos da Receita importado em `upstream/` (git subtree), sem alterações.
- Testes unitários (vitest) e teste ponta a ponta do desktop.
