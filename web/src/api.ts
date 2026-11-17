// Cliente único: sempre caminhos relativos de mesma origem (/api/rr, /api/sn).
// Web: Netlify repassa para a API da Receita. Desktop: servidor local repassa para os jars.

export type Modo = 'web' | 'desktop';

export interface InfoApp {
  modo: Modo;
  versaoApp: string;
  versoes?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  corpo: unknown;
  constructor(status: number, mensagem: string, corpo: unknown) {
    super(mensagem);
    this.status = status;
    this.corpo = corpo;
  }
}

function mensagemDoCorpo(status: number, corpo: unknown): string {
  if (corpo && typeof corpo === 'object') {
    const c = corpo as Record<string, unknown>;
    const partes = [c.title, c.detail].filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (Array.isArray(c.errors)) {
      for (const e of c.errors as Array<Record<string, unknown>>) {
        const d = [e.title, e.detail].filter((x) => typeof x === 'string').join(': ');
        if (d) partes.push(d);
      }
    }
    if (partes.length) return partes.join(' — ');
  }
  return `Erro HTTP ${status}`;
}

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Sem conexão com o serviço de cálculo.', null);
  }
  const texto = await resp.text();
  let corpo: unknown = texto;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    /* corpo não é JSON */
  }
  if (!resp.ok) throw new ApiError(resp.status, mensagemDoCorpo(resp.status, corpo), corpo);
  return corpo as T;
}

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

function servico(prefixo: '/api/rr' | '/api/sn') {
  return {
    get: <T = unknown>(caminho: string, params?: Record<string, string | number | undefined>) =>
      chamar<T>(`${prefixo}/${caminho}${qs(params)}`),
    post: <T = unknown>(caminho: string, corpo: unknown, params?: Record<string, string | number | undefined>) =>
      chamar<T>(`${prefixo}/${caminho}${qs(params)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
      }),
    postTexto: <T = unknown>(
      caminho: string,
      corpo: string,
      tipoConteudo: string,
      params?: Record<string, string | number | undefined>,
    ) =>
      chamar<T>(`${prefixo}/${caminho}${qs(params)}`, {
        method: 'POST',
        headers: { 'content-type': tipoConteudo },
        body: corpo,
      }),
  };
}

export const rr = servico('/api/rr');
export const sn = servico('/api/sn');

export async function carregarInfo(): Promise<InfoApp> {
  const versaoApp = __APP_VERSION__;
  try {
    const resp = await fetch('/api/info');
    if (resp.ok && (resp.headers.get('content-type') ?? '').includes('json')) {
      const j = (await resp.json()) as Partial<InfoApp>;
      if (j.modo === 'desktop') return { modo: 'desktop', versaoApp, versoes: j.versoes };
    }
  } catch {
    /* sem /api/info: é a versão web */
  }
  return { modo: 'web', versaoApp };
}

export interface Uf { sigla: string; nome: string; codigo: number }
export interface Municipio { codigo: number; nome: string }
export interface VersaoBase { versaoApp: string; versaoDb: string; descricaoVersaoDb: string; dataVersaoDb: string; ambiente: string }
