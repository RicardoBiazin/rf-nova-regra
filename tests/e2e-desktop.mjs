// Teste ponta a ponta do desktop: abre o Electron sem janela (RFNR_E2E=1), espera os dois jars e confere
// cálculo, atividades, lista branca e DANFSe (WASM executado no Node). Requer build/jars, build/db e web/dist.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electron = require('electron');
const arqPorta = path.join(os.tmpdir(), `rfnr-e2e-${process.pid}.txt`);
const env = { ...process.env, RFNR_E2E: '1', RFNR_E2E_FILE: arqPorta };
delete env.ELECTRON_RUN_AS_NODE;

let falhas = 0;
function confere(nome, cond, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}${cond ? '' : ' ' + extra}`);
  if (!cond) falhas++;
}

// RFNR_EXE aponta para o aplicativo empacotado (release\win-unpacked\RF Nova Regra.exe); sem ele usa o Electron de desenvolvimento.
const exe = process.env.RFNR_EXE;
const proc = spawn(exe ?? electron, exe ? [] : [raiz], { cwd: raiz, env, stdio: 'ignore', windowsHide: true });
function encerrar() {
  try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* já saiu */ }
  try { fs.rmSync(arqPorta, { force: true }); } catch { /* ignora */ }
}
process.on('exit', encerrar);

async function esperarPorta() {
  const fim = Date.now() + 200_000;
  while (Date.now() < fim) {
    if (fs.existsSync(arqPorta)) {
      const t = fs.readFileSync(arqPorta, 'utf8').trim();
      if (t) return t;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('tempo esgotado esperando o desktop subir os serviços');
}

try {
  const conteudo = await esperarPorta();
  if (conteudo.startsWith('ERRO')) throw new Error(conteudo);
  const base = `http://127.0.0.1:${conteudo}`;
  console.log(`desktop no ar em ${base}`);

  const get = async (p, init) => {
    const r = await fetch(base + p, init);
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, corpo: j, tipo: r.headers.get('content-type') ?? '' };
  };

  const info = await get('/api/info');
  confere('/api/info diz desktop', info.corpo.modo === 'desktop' && info.corpo.versoes?.base?.startsWith('V'), JSON.stringify(info.corpo));

  const pagina = await get('/');
  confere('tela servida com CSP', pagina.status === 200 && String(pagina.corpo).includes('RF Nova Regra'));

  const versao = await get('/api/rr/dados-abertos/versao');
  confere('RR versão da base', versao.status === 200 && /^V\d+/.test(versao.corpo.versaoDb), JSON.stringify(versao.corpo));

  const exemplo = JSON.parse(fs.readFileSync(path.join(raiz, 'tests', 'fixtures', 'operacao-rr.json'), 'utf8'));
  const calc = await get('/api/rr/observabilidade/regime-geral', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(exemplo),
  });
  const objs = calc.corpo.objetos ?? [];
  confere('RR item 3 CBS = 42.24', objs[2]?.tribCalc?.IBSCBS?.gIBSCBS?.gCBS?.vCBS === '42.24', JSON.stringify(objs[2]));
  confere('RR item 4 = REG-011', objs[3]?.erros?.[0]?.code === 'REG-011', JSON.stringify(objs[3]));
  confere('RR total CBS = 56.76', calc.corpo.total?.tribCalc?.IBSCBSTot?.gCBS?.vCBS === '56.76');

  const ativ = await get('/api/sn/simples-nacional/atividades?data=2027-03-10');
  confere('SN atividades', ativ.status === 200 && Array.isArray(ativ.corpo) && ativ.corpo.length > 5, String(ativ.status));

  const snCalc = await get('/api/sn/observabilidade/simples-nacional', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'e2e', versao: '1.0.0', data: '2027-03-10', tpDoc: '55', CRT: '1',
      itens: [{ numero: 1, cAtivSN: '01', cClassTrib: '000001', baseCalculo: '1000.00', valorImpostoSeletivo: '0.00', pIBSSN: '0.10', pCBSSN: '0.90' }] }),
  });
  confere('SN cálculo total = 10.00', snCalc.corpo.total?.totalTributos === '10.00', JSON.stringify(snCalc.corpo));

  confere('lista branca: caminho fora → 403', (await get('/api/rr/actuator/env')).status === 403);
  const crudo = (caminho, headers = {}) => new Promise((ok) => {
    const rq = http.request({ host: '127.0.0.1', port: Number(conteudo), path: caminho, method: 'GET', headers }, (rs) => { rs.resume(); ok(rs.statusCode); });
    rq.on('error', () => ok(0));
    rq.end();
  });
  confere('lista branca: .. nunca chega ao serviço', [403, 404].includes(await crudo('/api/rr/dados-abertos/../../actuator')));
  confere('lista branca: %2e → 403', (await crudo('/api/rr/dados-abertos/%2e%2e/x')) === 403);
  confere('estático: travessia → 403/404', [403, 404].includes(await crudo('/..%2f..%2fpackage.json')));
  confere('lista branca: SN POST em atividades → 403', (await get('/api/sn/simples-nacional/atividades', { method: 'POST' })).status === 403);
  confere('Host trocado → 403', (await crudo('/api/info', { host: 'evil.test' })) === 403);

  // DANFSe: executa o mesmo WASM da tela dentro do Node.
  const wasmExec = fs.readFileSync(path.join(raiz, 'web', 'public', 'wasm_exec.js'), 'utf8');
  vm.runInThisContext(wasmExec);
  const go = new globalThis.Go();
  const wasm = fs.readFileSync(path.join(raiz, 'web', 'public', 'danfse.wasm'));
  const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
  void go.run(instance);
  for (let i = 0; i < 100 && !globalThis.danfseWasm; i++) await new Promise((r) => setTimeout(r, 50));
  const xml = fs.readFileSync(path.join(raiz, 'tests', 'fixtures', 'nfse-exemplo.xml'), 'utf8');
  const r = globalThis.danfseWasm.gerarPdf(JSON.stringify({ xml, stc: 0, canhoto: true }));
  const pdf = r.pdf ? Buffer.from(r.pdf, 'base64') : Buffer.alloc(0);
  confere('DANFSe gera PDF', pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 2000, r.error ?? `${pdf.length} bytes`);
} catch (e) {
  console.log(`FALHA ${e.message}`);
  falhas++;
} finally {
  encerrar();
}
console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
