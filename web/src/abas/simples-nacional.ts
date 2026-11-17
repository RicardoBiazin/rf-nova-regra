import { sn, ApiError, type Modo } from '../api';
import { EXEMPLO_SN, montarOperacaoSN, moeda, resumirSN, type FormSN, type ItemSN } from '../payload';
import { baixar, campo, h, limpar, mostrarErro, opcoes, renderJson } from '../ui';

interface Atividade {
  codigo: string;
  descricao: string;
  rotuloAnexo: string;
  disponivel: boolean;
  tpDocsAdmissiveis: string[];
}

const URL_RELEASES = 'https://github.com/RicardoBiazin/rf-nova-regra/releases/latest';

function itemVazio(): ItemSN {
  return { cAtivSN: '01', cClassTrib: '000001', baseCalculo: '', valorImpostoSeletivo: '0.00', pIBSSN: '', pCBSSN: '' };
}

export function abaSimplesNacional(modo: Modo): HTMLElement {
  if (modo === 'web') {
    return h('section', { class: 'card' },
      h('h2', {}, 'Simples Nacional'),
      h('div', { class: 'aviso' },
        'A calculadora do Simples Nacional não tem API pública da Receita e por isso roda apenas no aplicativo desktop, ',
        'que embute o serviço oficial e funciona offline.'),
      h('div', { class: 'acoes' },
        h('a', { class: 'btn', href: URL_RELEASES, target: '_blank', rel: 'noopener noreferrer', style: 'text-decoration:none' }, 'Baixar o aplicativo desktop')));
  }

  const form: FormSN = { data: '2027-03-10', tpDoc: '55', CRT: '1', tpRegimeIBSCBS: '', tpEnteGov: '', itens: [itemVazio()] };
  let atividades: Atividade[] = [];
  let ultimaResposta: unknown = null;

  const inData = h('input', { type: 'date', value: form.data });
  const selTpDoc = h('select', {}, h('option', { value: '55' }, '55 — NF-e'), h('option', { value: '65' }, '65 — NFC-e'));
  const selCrt = h('select', {},
    h('option', { value: '1' }, '1 — Simples Nacional'),
    h('option', { value: '2' }, '2 — Simples (excesso de sublimite)'),
    h('option', { value: '3' }, '3 — Regime Normal'));
  const selRegime = h('select', {}, h('option', { value: '' }, '—'), h('option', { value: '2' }, '2 — apuração por fora (CRT 3)'));
  const selEnte = h('select', {},
    h('option', { value: '' }, '— (sem compra governamental)'),
    h('option', { value: '1' }, '1 — União'), h('option', { value: '2' }, '2 — Estado'),
    h('option', { value: '3' }, '3 — Distrito Federal'), h('option', { value: '4' }, '4 — Município'));
  const corpoItens = h('tbody', {});
  const saida = h('div', {});
  const listaAtiv = h('div', {});
  const filtroAtiv = h('input', { placeholder: 'Filtrar atividades…', 'aria-label': 'Filtrar atividades' });
  const jsonArea = h('textarea', { spellcheck: false, 'aria-label': 'JSON da operação' });
  const painelJson = h('div', { class: 'ocultar' });
  const btnCalcular = h('button', { class: 'btn', type: 'button' }, 'Calcular');

  inData.addEventListener('change', () => { form.data = inData.value; void carregarAtividades(); });
  selTpDoc.addEventListener('change', () => (form.tpDoc = selTpDoc.value));
  selCrt.addEventListener('change', () => (form.CRT = selCrt.value));
  selRegime.addEventListener('change', () => (form.tpRegimeIBSCBS = selRegime.value));
  selEnte.addEventListener('change', () => (form.tpEnteGov = selEnte.value));

  async function carregarAtividades(): Promise<void> {
    try {
      atividades = await sn.get<Atividade[]>('simples-nacional/atividades', { data: form.data });
      desenharItens();
      desenharAtividades();
    } catch (e) {
      limpar(listaAtiv);
      mostrarErro(listaAtiv, `Não foi possível carregar as atividades: ${(e as Error).message}`);
    }
  }

  function entrada<K extends keyof ItemSN>(it: ItemSN, chave: K, extra: Record<string, string> = {}): HTMLInputElement {
    const el = h('input', { value: it[chave], ...extra });
    el.addEventListener('input', () => (it[chave] = el.value as ItemSN[K]));
    return el;
  }

  function desenharItens(): void {
    limpar(corpoItens);
    form.itens.forEach((it, i) => {
      const selAtiv = h('select', {});
      opcoes(selAtiv, atividades.length ? atividades.map((a): [string, string] => [a.codigo, `${a.codigo} — ${a.descricao.slice(0, 70)}`]) : [[it.cAtivSN, it.cAtivSN]], it.cAtivSN);
      it.cAtivSN = selAtiv.value;
      selAtiv.addEventListener('change', () => (it.cAtivSN = selAtiv.value));
      const btnDel = h('button', { class: 'mini', type: 'button', 'aria-label': `Remover item ${i + 1}` }, '✕');
      btnDel.addEventListener('click', () => {
        form.itens.splice(i, 1);
        if (form.itens.length === 0) form.itens.push(itemVazio());
        desenharItens();
      });
      corpoItens.append(h('tr', {},
        h('td', {}, String(i + 1)),
        h('td', {}, selAtiv),
        h('td', {}, entrada(it, 'cClassTrib', { size: '8' })),
        h('td', {}, entrada(it, 'baseCalculo', { inputmode: 'decimal' })),
        h('td', {}, entrada(it, 'valorImpostoSeletivo', { inputmode: 'decimal' })),
        h('td', {}, entrada(it, 'pIBSSN', { inputmode: 'decimal', placeholder: '%' })),
        h('td', {}, entrada(it, 'pCBSSN', { inputmode: 'decimal', placeholder: '%' })),
        h('td', {}, btnDel)));
    });
  }

  function desenharAtividades(): void {
    const f = filtroAtiv.value.trim().toLowerCase();
    const linhas = atividades
      .filter((a) => !f || a.codigo.includes(f) || a.descricao.toLowerCase().includes(f))
      .map((a) => ({ código: a.codigo, descrição: a.descricao, anexo: a.rotuloAnexo, documentos: a.tpDocsAdmissiveis.join(', '), disponível: a.disponivel ? 'sim' : 'não' }));
    limpar(listaAtiv);
    listaAtiv.append(linhas.length ? renderJson(linhas) : h('p', { class: 'memoria' }, 'Nenhuma atividade.'));
  }
  filtroAtiv.addEventListener('input', desenharAtividades);

  async function calcular(payload: unknown): Promise<void> {
    btnCalcular.disabled = true;
    limpar(saida);
    saida.append(h('p', { class: 'memoria' }, 'Calculando…'));
    try {
      const resp = await sn.post<Record<string, unknown>>('observabilidade/simples-nacional', payload);
      ultimaResposta = resp;
      desenharResultado(resp);
    } catch (e) {
      mostrarErro(saida, e instanceof ApiError ? e.message : String(e));
    } finally {
      btnCalcular.disabled = false;
    }
  }

  function desenharResultado(resp: Record<string, unknown>): void {
    const r = resumirSN(resp);
    limpar(saida);
    const total = (rot: string, v?: string) => h('div', { class: 'total' }, h('div', { class: 'rot' }, rot), h('div', { class: 'val' }, moeda(v)));
    saida.append(h('div', { class: 'totais' },
      total('Receita bruta', r.totais.vRBSNtot), total('IBS (Simples)', r.totais.vIBSSNtot), total('CBS (Simples)', r.totais.vCBSSNtot),
      total('Imposto Seletivo', r.totais.totalIs), total('Total de tributos', r.totais.totalTributos)));
    saida.append(h('div', { class: 'tabela-rolagem' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Situação'), h('th', {}, 'Receita bruta'),
        h('th', { class: 'num' }, 'Base'), h('th', { class: 'num' }, 'IBS'), h('th', { class: 'num' }, 'CBS'), h('th', { class: 'num' }, 'IS'), h('th', { class: 'num' }, 'Total'))),
      h('tbody', {}, r.itens.map((l) => h('tr', {},
        h('td', {}, String(l.n)),
        h('td', { class: l.estado === 'CALCULADO' ? 'ok' : 'est-erro' }, l.estado),
        h('td', {}, l.tpRBSN ?? '—'),
        h('td', { class: 'num' }, moeda(l.vBC)), h('td', { class: 'num' }, moeda(l.vIBSSN)), h('td', { class: 'num' }, moeda(l.vCBSSN)),
        h('td', { class: 'num' }, moeda(l.vIS)), h('td', { class: 'num' }, moeda(l.totalItem))))))));
    for (const l of r.itens) {
      for (const e of l.erros) {
        const det = h('span', {});
        const btn = h('button', { class: 'mini', type: 'button' }, 'o que significa?');
        btn.addEventListener('click', async () => {
          try {
            const d = await sn.get<{ titulo?: string; descricao?: string }>('observabilidade/simples-nacional/erros', { codigo: e.code });
            det.textContent = ` ${d.titulo ?? ''} — ${d.descricao ?? ''}`;
          } catch (err) {
            det.textContent = ` ${(err as Error).message}`;
          }
        });
        saida.append(h('div', { class: 'erro' }, `Item ${l.n} · ${e.code} · ${e.title}\n${e.detail}`, ' ', btn, det));
      }
      if (l.estado === 'NAO_CALCULADO' && l.erros.length === 0) {
        saida.append(h('div', { class: 'aviso' }, `Item ${l.n} não foi calculado: atividade ausente, fora de vigência ou inadmissível para o tipo de documento.`));
      }
    }
    const btnExp = h('button', { class: 'btn sec', type: 'button' }, 'Exportar resposta (JSON)');
    btnExp.addEventListener('click', () => baixar('calculo-simples-nacional.json', JSON.stringify(ultimaResposta, null, 2), 'application/json'));
    saida.append(h('div', { class: 'acoes' }, btnExp));
  }

  btnCalcular.addEventListener('click', () => {
    if (form.itens.some((i) => i.cClassTrib.trim() === '')) {
      mostrarErro(saida, 'Informe o cClassTrib de todos os itens.');
      return;
    }
    void calcular(montarOperacaoSN(form));
  });
  const btnAdd = h('button', { class: 'btn sec', type: 'button' }, '+ Item');
  btnAdd.addEventListener('click', () => { form.itens.push(itemVazio()); desenharItens(); });
  const btnJson = h('button', { class: 'btn sec', type: 'button' }, 'JSON avançado');
  btnJson.addEventListener('click', () => {
    if (painelJson.classList.toggle('ocultar') === false && !jsonArea.value) jsonArea.value = JSON.stringify(montarOperacaoSN(form), null, 2);
  });
  const btnExemplo = h('button', { class: 'btn sec', type: 'button' }, 'Carregar exemplo');
  btnExemplo.addEventListener('click', () => { jsonArea.value = JSON.stringify(EXEMPLO_SN, null, 2); painelJson.classList.remove('ocultar'); });
  const btnJsonForm = h('button', { class: 'btn sec', type: 'button' }, 'Preencher com o formulário');
  btnJsonForm.addEventListener('click', () => (jsonArea.value = JSON.stringify(montarOperacaoSN(form), null, 2)));
  const btnJsonCalc = h('button', { class: 'btn', type: 'button' }, 'Calcular este JSON');
  btnJsonCalc.addEventListener('click', () => {
    try { void calcular(JSON.parse(jsonArea.value)); } catch { mostrarErro(saida, 'JSON inválido.'); }
  });
  painelJson.append(jsonArea, h('div', { class: 'acoes' }, btnJsonForm, btnJsonCalc));

  desenharItens();
  void carregarAtividades();

  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Simples Nacional — IBS e CBS'),
      h('div', { class: 'grade' }, campo('Data do fato gerador', inData), campo('Tipo de documento', selTpDoc), campo('CRT do emitente', selCrt),
        campo('Regime IBS/CBS', selRegime), campo('Ente governamental', selEnte)),
      h('div', { class: 'tabela-rolagem', style: 'margin-top:12px' }, h('table', { class: 'itens' },
        h('thead', {}, h('tr', {}, ['#', 'Atividade (cAtivSN)', 'cClassTrib', 'Base (R$)', 'IS (R$)', 'Alíq. IBS %', 'Alíq. CBS %', ''].map((t) => h('th', {}, t)))),
        corpoItens)),
      h('div', { class: 'acoes' }, btnCalcular, btnAdd, btnExemplo, btnJson),
      painelJson),
    h('section', { class: 'card' }, h('h2', {}, 'Resultado'), saida),
    h('section', { class: 'card' }, h('h2', {}, 'Atividades vigentes na data'), h('div', { class: 'acoes', style: 'margin:0 0 10px' }, filtroAtiv), listaAtiv),
  );
}
