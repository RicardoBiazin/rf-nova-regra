// Lista branca compartilhada pelo proxy do Netlify (web) e pelo servidor local do Electron (desktop).
// Os caminhos recebidos são os que vêm depois de /api/rr/ ou /api/sn/.

const PREFIXOS_RR = ['observabilidade/', 'base-calculo/', 'xml/', 'dados-abertos/', 'nfse/'];
const EXATOS_RR = ['regime-geral', 'pedagio'];

function normalizar(sub) {
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 300) return null;
  if (/%/.test(sub)) return null; // nenhum caminho legítimo precisa de escape
  if (sub.startsWith('/') || sub.includes('..') || sub.includes('//') || sub.includes('\\')) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(sub)) return null;
  return sub;
}

/** Caminho alvo no serviço Regime Regular ("/api/calculadora/...") ou null se não permitido. */
export function alvoRR(sub, metodo) {
  if (metodo !== 'GET' && metodo !== 'POST') return null;
  const s = normalizar(sub);
  if (!s) return null;
  if (EXATOS_RR.includes(s) || PREFIXOS_RR.some((p) => s.startsWith(p))) return `/api/calculadora/${s}`;
  return null;
}

/** Caminho alvo no serviço Simples Nacional ("/api/...") ou null se não permitido. */
export function alvoSN(sub, metodo) {
  if (metodo !== 'GET' && metodo !== 'POST') return null;
  const s = normalizar(sub);
  if (!s) return null;
  if (s === 'versao' || s === 'versao/status') return metodo === 'GET' ? `/api/${s}` : null;
  if (s === 'simples-nacional/atividades' || /^simples-nacional\/atividades\/[A-Za-z0-9]+$/.test(s)) {
    return metodo === 'GET' ? `/api/calculadora/${s}` : null;
  }
  if (s === 'observabilidade/simples-nacional') return metodo === 'POST' ? `/api/calculadora/${s}` : null;
  if (s === 'observabilidade/simples-nacional/erros') return metodo === 'GET' ? `/api/calculadora/${s}` : null;
  return null;
}

export const LIMITE_CORPO = 1024 * 1024; // 1 MB
