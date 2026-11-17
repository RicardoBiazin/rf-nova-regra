// Proxy do Regime Regular para a API pública da Receita (piloto-cbs.tributos.gov.br).
// A API oficial não envia CORS; a tela fala com /api/rr/* (mesma origem) e esta função repassa.
import { alvoRR, LIMITE_CORPO } from '../../shared/allowlist.mjs';

const BASE = process.env.RR_BASE_URL ?? 'https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo';

function erro(status: number, titulo: string, detalhe: string): Response {
  return new Response(JSON.stringify({ title: titulo, status, detail: detalhe }), {
    status,
    headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
  });
}

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^\/api\/rr\//, '');
  const alvo = alvoRR(sub, req.method);
  if (!alvo) return erro(403, 'Caminho não permitido', 'Este caminho não é repassado pelo proxy.');

  let corpo: ArrayBuffer | undefined;
  if (req.method === 'POST') {
    const declarado = Number(req.headers.get('content-length') ?? 0);
    if (declarado > LIMITE_CORPO) return erro(413, 'Corpo grande demais', 'Limite de 1 MB.');
    corpo = await req.arrayBuffer();
    if (corpo.byteLength > LIMITE_CORPO) return erro(413, 'Corpo grande demais', 'Limite de 1 MB.');
  }

  const cabecalhos: Record<string, string> = { accept: req.headers.get('accept') ?? 'application/json' };
  const tipo = req.headers.get('content-type');
  if (tipo) cabecalhos['content-type'] = tipo;

  try {
    const resp = await fetch(`${BASE}${alvo}${url.search}`, {
      method: req.method,
      headers: cabecalhos,
      body: corpo,
      signal: AbortSignal.timeout(25_000),
    });
    const saida = new Headers();
    saida.set('content-type', resp.headers.get('content-type') ?? 'application/json');
    saida.set('cache-control', req.method === 'GET' ? 'public, max-age=300' : 'no-store');
    return new Response(await resp.arrayBuffer(), { status: resp.status, headers: saida });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return erro(
      timeout ? 504 : 502,
      'API da Receita indisponível',
      timeout ? 'Tempo esgotado (25 s).' : 'Falha ao contatar a API oficial.',
    );
  }
};

export const config = { path: '/api/rr/*' };
