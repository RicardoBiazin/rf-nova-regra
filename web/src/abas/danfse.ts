import { baixar, h, limpar, mostrarErro } from '../ui';

// O DANFSe roda 100% no navegador (Go compilado para WebAssembly); o XML não sai do computador.

interface DanfseWasm {
  ready: boolean;
  error: string;
  gerarPdf: (jsonRequisicao: string) => { pdf?: string; size?: number; error?: string };
}

declare global {
  interface Window {
    Go?: new () => { importObject: WebAssembly.Imports; run: (i: WebAssembly.Instance) => Promise<void> };
    danfseWasm?: DanfseWasm;
  }
}

let carregamento: Promise<DanfseWasm> | null = null;

function carregarScript(src: string): Promise<void> {
  return new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => falha(new Error(`Falha ao carregar ${src}`));
    document.head.append(s);
  });
}

export function carregarWasm(): Promise<DanfseWasm> {
  if (carregamento) return carregamento;
  carregamento = (async () => {
    await carregarScript('/wasm_exec.js');
    if (!window.Go) throw new Error('wasm_exec.js inválido.');
    const go = new window.Go();
    const resp = await fetch('/danfse.wasm');
    if (!resp.ok) throw new Error('danfse.wasm não encontrado.');
    const { instance } = await WebAssembly.instantiateStreaming(resp, go.importObject);
    void go.run(instance);
    for (let i = 0; i < 100; i++) {
      if (window.danfseWasm) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const api = window.danfseWasm;
    if (!api) throw new Error('Módulo DANFSe não inicializou.');
    if (api.error) throw new Error(api.error);
    return api;
  })().catch((e) => {
    carregamento = null;
    throw e;
  });
  return carregamento;
}

export function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function abaDanfse(): HTMLElement {
  let xml = '';
  let nomeBase = 'danfse';
  let urlPdf: string | null = null;

  const entrada = h('input', { type: 'file', accept: '.xml,text/xml,application/xml', class: 'ocultar', id: 'arq-danfse' });
  const solta = h('div', { class: 'solta', tabindex: '0', role: 'button', 'aria-label': 'Selecionar XML da NFS-e' },
    'Solte aqui o XML da NFS-e ou clique para escolher');
  const info = h('p', { class: 'memoria' }, 'Nenhum arquivo selecionado.');
  const selStc = h('select', {},
    h('option', { value: '0' }, '0 — NFS-e válida'),
    h('option', { value: '1' }, '1 — Substituída'),
    h('option', { value: '2' }, '2 — Cancelada'));
  const chkCanhoto = h('input', { type: 'checkbox', checked: true });
  const btnGerar = h('button', { class: 'btn', type: 'button', disabled: true }, 'Gerar DANFSe');
  const saida = h('div', {});

  async function lerArquivo(f: File): Promise<void> {
    if (f.size > 5 * 1024 * 1024) {
      mostrarErro(saida, 'O XML excede o limite de 5 MiB.');
      return;
    }
    xml = await f.text();
    nomeBase = f.name.replace(/\.xml$/i, '') || 'danfse';
    info.textContent = `${f.name} — ${(f.size / 1024).toFixed(1)} KiB`;
    btnGerar.disabled = false;
    limpar(saida);
  }

  const btnExemplo = h('button', { class: 'btn sec', type: 'button' }, 'Usar XML de exemplo');
  btnExemplo.addEventListener('click', async () => {
    const r = await fetch('/exemplo-nfse.xml');
    await lerArquivo(new File([await r.text()], 'exemplo-nfse.xml', { type: 'application/xml' }));
  });

  solta.addEventListener('click', () => entrada.click());
  solta.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') entrada.click(); });
  entrada.addEventListener('change', () => { const f = entrada.files?.[0]; if (f) void lerArquivo(f); });
  solta.addEventListener('dragover', (e) => { e.preventDefault(); solta.classList.add('sobre'); });
  solta.addEventListener('dragleave', () => solta.classList.remove('sobre'));
  solta.addEventListener('drop', (e) => {
    e.preventDefault();
    solta.classList.remove('sobre');
    const f = e.dataTransfer?.files?.[0];
    if (f) void lerArquivo(f);
  });

  btnGerar.addEventListener('click', async () => {
    btnGerar.disabled = true;
    limpar(saida);
    saida.append(h('p', { class: 'memoria' }, 'Carregando o gerador e montando o PDF…'));
    try {
      const api = await carregarWasm();
      const r = api.gerarPdf(JSON.stringify({ xml, stc: Number(selStc.value), canhoto: chkCanhoto.checked }));
      if (r.error || !r.pdf) throw new Error(r.error ?? 'Falha ao gerar o PDF.');
      const bytes = base64ParaBytes(r.pdf);
      if (urlPdf) URL.revokeObjectURL(urlPdf);
      urlPdf = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const btnBaixar = h('button', { class: 'btn sec', type: 'button' }, `Baixar PDF (${(bytes.length / 1024).toFixed(0)} KiB)`);
      btnBaixar.addEventListener('click', () => baixar(`${nomeBase}-danfse.pdf`, bytes as BlobPart, 'application/pdf'));
      limpar(saida);
      saida.append(h('div', { class: 'acoes', style: 'margin:0 0 10px' }, btnBaixar), h('iframe', { class: 'pdf', src: urlPdf, title: 'Prévia do DANFSe' }));
    } catch (e) {
      mostrarErro(saida, (e as Error).message);
    } finally {
      btnGerar.disabled = false;
    }
  });

  return h('section', { class: 'card' },
    h('h2', {}, 'DANFSe — PDF a partir do XML da NFS-e'),
    h('p', { class: 'memoria' }, 'Gerado no seu navegador (WebAssembly): o XML não é enviado a nenhum servidor.'),
    entrada, solta, info,
    h('div', { class: 'grade', style: 'margin-top:10px' },
      h('label', { class: 'campo' }, 'Situação da nota', selStc),
      h('label', { class: 'campo' }, 'Canhoto', h('span', {}, chkCanhoto, ' incluir canhoto'))),
    h('div', { class: 'acoes' }, btnGerar, btnExemplo),
    saida);
}
