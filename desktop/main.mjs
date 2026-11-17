// Aplicativo desktop: sobe os dois serviços Java da Receita (Regime Regular e Simples Nacional) em
// 127.0.0.1, serve a tela e repassa /api/rr/* e /api/sn/* para eles. Tudo local, sem internet.
import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alvoRR, alvoSN, LIMITE_CORPO } from '../shared/allowlist.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const E2E = process.env.RFNR_E2E === '1';

app.setPath('userData', path.join(app.getPath('appData'), 'RF_nova_regra'));

const recursos = app.isPackaged ? process.resourcesPath : path.join(raiz, 'build');
const webDir = path.join(app.isPackaged ? app.getAppPath() : raiz, 'web', 'dist');
const dbDir = path.join(recursos, 'db');
const javaExe = ['jre', 'bin', 'java.exe'].reduce((p, s) => path.join(p, s), recursos);
const java = fs.existsSync(javaExe) ? javaExe : 'java';
const logDir = path.join(app.getPath('userData'), 'logs');

const filhos = [];
let servidor = null;
let janela = null;
let encerrando = false;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' blob:; object-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function portaLivre() {
  return new Promise((ok, falha) => {
    const s = net.createServer();
    s.once('error', falha);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

function dormir(ms) { return new Promise((r) => setTimeout(r, ms)); }

function obterJson(porta, caminho) {
  return new Promise((ok, falha) => {
    const req = http.get({ host: '127.0.0.1', port: porta, path: caminho, timeout: 3000 }, (res) => {
      let corpo = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (corpo += d));
      res.on('end', () => (res.statusCode === 200 ? ok(corpo) : falha(new Error(`HTTP ${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', falha);
  });
}

function iniciarJava(nome, jar, porta) {
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.openSync(path.join(logDir, `${nome}.log`), 'w');
  const dbUrl = `jdbc:sqlite:file:${path.join(dbDir, 'calculadora-pro.db').replaceAll('\\', '/')}?mode=ro&date_class=TEXT&date_string_format=yyyy-MM-dd`;
  const args = [
    '-Xmx384m', '-XX:+UseSerialGC', '-Dfile.encoding=UTF-8',
    '-jar', path.join(recursos, 'jars', jar),
    '--spring.profiles.active=offline',
    `--server.port=${porta}`, '--server.address=127.0.0.1', '--management.server.port=-1',
    `--application.db.download.target-dir=${dbDir.replaceAll('\\', '/')}`,
    `--spring.datasource.url=${dbUrl}`,
  ];
  const proc = spawn(java, args, { cwd: app.getPath('userData'), stdio: ['ignore', log, log], windowsHide: true });
  proc.on('error', (e) => fs.writeSync(log, `\nFalha ao iniciar: ${e.message}\n`));
  filhos.push(proc);
  return proc;
}

async function aguardar(proc, porta, caminho, limiteMs = 150_000) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (proc.exitCode !== null) throw new Error(`o serviço encerrou (código ${proc.exitCode})`);
    try { return await obterJson(porta, caminho); } catch { await dormir(700); }
  }
  throw new Error('tempo esgotado aguardando o serviço');
}

function encaminhar(req, res, porta, alvo, search) {
  const cabecalhos = { accept: req.headers.accept ?? 'application/json' };
  if (req.headers['content-type']) cabecalhos['content-type'] = req.headers['content-type'];
  const saida = http.request(
    { host: '127.0.0.1', port: porta, path: alvo + search, method: req.method, headers: cabecalhos, timeout: 60_000 },
    (resp) => {
      res.writeHead(resp.statusCode ?? 502, {
        'content-type': resp.headers['content-type'] ?? 'application/json',
        'cache-control': 'no-store',
      });
      resp.pipe(res);
    },
  );
  saida.on('timeout', () => saida.destroy(new Error('timeout')));
  saida.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/problem+json' });
    res.end(JSON.stringify({ title: 'Serviço de cálculo indisponível', status: 502, detail: 'O serviço local não respondeu.' }));
  });
  req.pipe(saida);
}

function erroJson(res, status, titulo, detalhe) {
  res.writeHead(status, { 'content-type': 'application/problem+json', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ title: titulo, status, detail: detalhe }));
}

function criarServidor(portas, versoes) {
  return new Promise((ok, falha) => {
    const srv = http.createServer((req, res) => {
      const { port } = srv.address();
      const host = req.headers.host ?? '';
      if (host !== `127.0.0.1:${port}`) return erroJson(res, 403, 'Host inválido', 'Requisição recusada.');
      const origem = req.headers.origin;
      if (req.method !== 'GET' && origem && origem !== `http://127.0.0.1:${port}`) return erroJson(res, 403, 'Origem inválida', 'Requisição recusada.');

      const u = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'no-referrer');

      if (u.pathname === '/api/info') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(JSON.stringify({ modo: 'desktop', versoes }));
      }
      for (const [prefixo, funcao, porta] of [['/api/rr/', alvoRR, portas.rr], ['/api/sn/', alvoSN, portas.sn]]) {
        if (!u.pathname.startsWith(prefixo)) continue;
        const alvo = funcao(u.pathname.slice(prefixo.length), req.method);
        if (!alvo) return erroJson(res, 403, 'Caminho não permitido', 'Este caminho não é repassado.');
        if (Number(req.headers['content-length'] ?? 0) > LIMITE_CORPO) return erroJson(res, 413, 'Corpo grande demais', 'Limite de 1 MB.');
        return encaminhar(req, res, porta, alvo, u.search);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return erroJson(res, 405, 'Método não permitido', req.method ?? '');

      let rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
      const arquivo = path.resolve(webDir, rel);
      if (arquivo !== webDir && !arquivo.startsWith(webDir + path.sep)) return erroJson(res, 403, 'Negado', 'Caminho inválido.');
      fs.readFile(arquivo, (err, dados) => {
        if (err) return erroJson(res, 404, 'Não encontrado', rel);
        res.writeHead(200, {
          'content-type': MIME[path.extname(arquivo).toLowerCase()] ?? 'application/octet-stream',
          'content-security-policy': CSP,
          'x-frame-options': 'DENY',
        });
        res.end(req.method === 'HEAD' ? undefined : dados);
      });
    });
    srv.once('error', falha);
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

function paginaMensagem(titulo, corpo) {
  const html = `<!doctype html><meta charset=utf-8><title>RF Nova Regra</title><body style="font-family:system-ui;background:#11161c;color:#e6ecf2;display:grid;place-items:center;height:100vh;margin:0"><div style="max-width:560px;padding:24px"><h2>${titulo}</h2><p style="color:#93a3b3;white-space:pre-wrap">${corpo}</p></div>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function matarFilhos() {
  for (const p of filhos) {
    if (p.pid && p.exitCode === null) {
      try { execFile('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {}); } catch { /* já encerrado */ }
    }
  }
}

async function subir() {
  const [pRr, pSn] = [await portaLivre(), await portaLivre()];
  const rr = iniciarJava('regime-regular', 'regime-regular.jar', pRr);
  const sn = iniciarJava('simples-nacional', 'simples-nacional.jar', pSn);
  const [vRr, vSn] = await Promise.all([
    aguardar(rr, pRr, '/api/calculadora/dados-abertos/versao'),
    aguardar(sn, pSn, '/api/versao'),
  ]);
  const versoes = { regimeRegular: JSON.parse(vRr).versaoApp, simplesNacional: JSON.parse(vSn).versaoApp, base: JSON.parse(vRr).versaoDb };
  servidor = await criarServidor({ rr: pRr, sn: pSn }, versoes);
  return servidor.address().port;
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, backgroundColor: '#11161c', title: 'RF Nova Regra', show: !E2E,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  janela.setMenuBarVisibility(false);
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('data:')) {
      e.preventDefault();
      if (/^https:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  void janela.loadURL(paginaMensagem('Iniciando o cálculo…', 'Subindo os serviços locais da Receita. Na primeira abertura pode levar até um minuto.'));
  return janela;
}

if (!E2E && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });
  app.on('before-quit', () => { encerrando = true; matarFilhos(); });
  app.on('window-all-closed', () => app.quit());
  process.on('exit', matarFilhos);

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    if (!E2E) criarJanela();
    try {
      const porta = await subir();
      if (E2E) {
        fs.writeFileSync(process.env.RFNR_E2E_FILE ?? path.join(raiz, 'build', 'e2e-port.txt'), String(porta));
        return;
      }
      if (!encerrando) await janela.loadURL(`http://127.0.0.1:${porta}/`);
    } catch (e) {
      const msg = `${e.message}\n\nLogs em: ${logDir}`;
      if (E2E) {
        fs.writeFileSync(process.env.RFNR_E2E_FILE ?? path.join(raiz, 'build', 'e2e-port.txt'), `ERRO ${msg}`);
        return;
      }
      if (janela && !janela.isDestroyed()) await janela.loadURL(paginaMensagem('Não foi possível iniciar', msg));
      else dialog.showErrorBox('RF Nova Regra', msg);
    }
  });
}
