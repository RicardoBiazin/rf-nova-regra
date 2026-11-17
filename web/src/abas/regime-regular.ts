import { rr, ApiError, type Uf, type Municipio } from '../api';
import { EXEMPLO_RR, montarOperacaoRR, moeda, resumirRR, type FormRR, type ItemRR, type ItemIS } from '../payload';
import { baixar, campo, h, limpar, mostrarErro, opcoes } from '../ui';

function itemVazio(): ItemRR {
  return {
    tipoCodigo: 'ncm', codigo: '', cst: '000', cClassTrib: '000001', baseCalculo: '', quantidade: '', unidade: '',
    cbs: '8.8', ibsUf: '0.05', ibsMun: '0.05', is: null,
  };
}

function isVazio(): ItemIS {
  return { cst: '000', cClassTrib: '000001', baseCalculo: '', quantidade: '', unidade: '', impostoInformado: '', adValorem: '' };
}

export function abaRegimeRegular(): HTMLElement {
  const hoje = new Date().toISOString().slice(0, 10);
  const form: FormRR = { data: '2027-03-10', uf: 'RS', municipio: '4314902', itens: [itemVazio()] };
  let ultimaResposta: unknown = null;

  const inData = h('input', { type: 'date', value: form.data || hoje });
  const selUf = h('select', {});
  const selMun = h('select', {});
  const corpoItens = h('tbody', {});
  const saida = h('div', {});
  const jsonArea = h('textarea', { spellcheck: false, 'aria-label': 'JSON da operação' });
  const painelJson = h('div', { class: 'ocultar' });
  const btnCalcular = h('button', { class: 'btn', type: 'button' }, 'Calcular');

  async function carregarUfs(): Promise<void> {
    try {
      const ufs = await rr.get<Uf[]>('dados-abertos/ufs');
      opcoes(selUf, ufs.map((u) => [u.sigla, `${u.sigla} — ${u.nome}`]), form.uf);
      await carregarMunicipios(false);
    } catch (e) {
      mostrarErro(saida, `Não foi possível carregar as UFs: ${(e as Error).message}`);
    }
  }

  async function carregarMunicipios(trocouUf: boolean): Promise<void> {
    try {
      const ms = await rr.get<Municipio[]>('dados-abertos/ufs/municipios', { siglaUf: selUf.value });
      const atual = trocouUf ? String(ms[0]?.codigo ?? '') : form.municipio;
      opcoes(selMun, ms.map((m) => [String(m.codigo), m.nome]), atual);
      form.municipio = selMun.value;
    } catch {
      /* mantém lista anterior */
    }
  }

  selUf.addEventListener('change', () => {
    form.uf = selUf.value;
    void carregarMunicipios(true);
  });
  selMun.addEventListener('change', () => (form.municipio = selMun.value));
  inData.addEventListener('change', () => (form.data = inData.value));

  function entrada<K extends keyof ItemRR>(it: ItemRR, chave: K, extra: Record<string, string> = {}): HTMLInputElement {
    const el = h('input', { value: String(it[chave] ?? ''), ...extra });
    el.addEventListener('input', () => ((it as unknown as Record<string, string>)[chave as string] = el.value));
    return el;
  }

  function entradaIS(is: ItemIS, chave: keyof ItemIS, rotulo: string): HTMLElement {
    const el = h('input', { value: is[chave] });
    el.addEventListener('input', () => (is[chave] = el.value));
    return campo(rotulo, el);
  }

  function desenharItens(): void {
    limpar(corpoItens);
    form.itens.forEach((it, i) => {
      const selTipo = h('select', {}, h('option', { value: 'ncm' }, 'NCM'), h('option', { value: 'nbs' }, 'NBS'));
      selTipo.value = it.tipoCodigo;
      selTipo.addEventListener('change', () => (it.tipoCodigo = selTipo.value as 'ncm' | 'nbs'));
      const btnIS = h('button', { class: 'mini', type: 'button', title: 'Imposto Seletivo' }, it.is ? 'IS ✓' : 'IS');
      btnIS.addEventListener('click', () => {
        it.is = it.is ? null : isVazio();
        desenharItens();
      });
      const btnDel = h('button', { class: 'mini', type: 'button', 'aria-label': `Remover item ${i + 1}` }, '✕');
      btnDel.addEventListener('click', () => {
        form.itens.splice(i, 1);
        if (form.itens.length === 0) form.itens.push(itemVazio());
        desenharItens();
      });
      corpoItens.append(
        h(
          'tr',
          {},
          h('td', {}, String(i + 1)),
          h('td', {}, selTipo),
          h('td', {}, entrada(it, 'codigo', { placeholder: it.tipoCodigo === 'ncm' ? '8 dígitos' : '9 dígitos' })),
          h('td', {}, entrada(it, 'cst', { size: '4' })),
          h('td', {}, entrada(it, 'cClassTrib', { size: '8' })),
          h('td', {}, entrada(it, 'baseCalculo', { inputmode: 'decimal' })),
          h('td', {}, entrada(it, 'quantidade', { inputmode: 'decimal' })),
          h('td', {}, entrada(it, 'unidade', { size: '4' })),
          h('td', {}, entrada(it, 'cbs', { inputmode: 'decimal' })),
          h('td', {}, entrada(it, 'ibsUf', { inputmode: 'decimal' })),
          h('td', {}, entrada(it, 'ibsMun', { inputmode: 'decimal' })),
          h('td', {}, h('div', { class: 'acoes', style: 'margin:0' }, btnIS, btnDel)),
        ),
      );
      if (it.is) {
        corpoItens.append(
          h(
            'tr',
            {},
            h('td', { colspan: 12 }, h('div', { class: 'grade' },
              entradaIS(it.is, 'cst', 'CST do IS'),
              entradaIS(it.is, 'cClassTrib', 'cClassTrib do IS'),
              entradaIS(it.is, 'baseCalculo', 'Base do IS'),
              entradaIS(it.is, 'quantidade', 'Quantidade (IS)'),
              entradaIS(it.is, 'unidade', 'Unidade (IS)'),
              entradaIS(it.is, 'impostoInformado', 'IS informado'),
              entradaIS(it.is, 'adValorem', 'Alíquota ad valorem (%)'),
            )),
          ),
        );
      }
    });
  }

  async function calcular(payload: unknown): Promise<void> {
    btnCalcular.disabled = true;
    limpar(saida);
    saida.append(h('p', { class: 'memoria' }, 'Calculando…'));
    try {
      const resp = await rr.post<Record<string, unknown>>('observabilidade/regime-geral', payload);
      ultimaResposta = resp;
      desenharResultado(resp);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      mostrarErro(saida, msg);
    } finally {
      btnCalcular.disabled = false;
    }
  }

  function desenharResultado(resp: Record<string, unknown>): void {
    const r = resumirRR(resp);
    limpar(saida);
    const total = (rot: string, v?: string) => h('div', { class: 'total' }, h('div', { class: 'rot' }, rot), h('div', { class: 'val' }, moeda(v)));
    saida.append(
      h('div', { class: 'totais' },
        total('Base IBS/CBS', r.totais.vBC), total('CBS', r.totais.vCBS), total('IBS', r.totais.vIBS), total('Imposto Seletivo', r.totais.vIS)),
    );
    const tabela = h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Item'), h('th', {}, 'Situação'),
        h('th', { class: 'num' }, 'Base'), h('th', { class: 'num' }, 'CBS'), h('th', { class: 'num' }, 'IBS UF'),
        h('th', { class: 'num' }, 'IBS Mun.'), h('th', { class: 'num' }, 'IBS'), h('th', { class: 'num' }, 'IS'))),
      h('tbody', {}, r.itens.map((l) => h('tr', {},
        h('td', {}, String(l.n)),
        h('td', { class: l.erros.length ? 'est-erro' : 'ok' }, l.estado),
        h('td', { class: 'num' }, moeda(l.vBC)), h('td', { class: 'num' }, moeda(l.vCBS)),
        h('td', { class: 'num' }, moeda(l.vIBSUF)), h('td', { class: 'num' }, moeda(l.vIBSMun)),
        h('td', { class: 'num' }, moeda(l.vIBS)), h('td', { class: 'num' }, moeda(l.vIS))))),
    );
    saida.append(h('div', { class: 'tabela-rolagem' }, tabela));

    for (const l of r.itens) {
      for (const e of l.erros) {
        const det = h('span', {});
        const btn = h('button', { class: 'mini', type: 'button' }, 'o que significa?');
        btn.addEventListener('click', async () => {
          try {
            const d = await rr.get<{ titulo?: string; descricao?: string }>('observabilidade/erros', { codigo: e.code });
            det.textContent = ` ${d.titulo ?? ''} — ${d.descricao ?? ''}`;
          } catch (err) {
            det.textContent = ` ${(err as Error).message}`;
          }
        });
        saida.append(h('div', { class: 'erro' }, `Item ${l.n} · ${e.code} · ${e.title}\n${e.detail}`, ' ', btn, det));
      }
      if (l.memoria.length) {
        saida.append(h('details', {}, h('summary', {}, `Memória de cálculo do item ${l.n}`), l.memoria.map((m) => h('p', { class: 'memoria' }, m))));
      }
    }
    const btnExp = h('button', { class: 'btn sec', type: 'button' }, 'Exportar resposta (JSON)');
    btnExp.addEventListener('click', () => baixar('calculo-regime-regular.json', JSON.stringify(ultimaResposta, null, 2), 'application/json'));
    saida.append(h('div', { class: 'acoes' }, btnExp));
  }

  btnCalcular.addEventListener('click', () => {
    if (form.itens.some((i) => i.cClassTrib.trim() === '')) {
      mostrarErro(saida, 'Informe o cClassTrib de todos os itens.');
      return;
    }
    void calcular(montarOperacaoRR(form));
  });

  const btnAdd = h('button', { class: 'btn sec', type: 'button' }, '+ Item');
  btnAdd.addEventListener('click', () => {
    form.itens.push(itemVazio());
    desenharItens();
  });
  const btnExemplo = h('button', { class: 'btn sec', type: 'button' }, 'Carregar exemplo (4 itens)');
  btnExemplo.addEventListener('click', () => {
    jsonArea.value = JSON.stringify(EXEMPLO_RR, null, 2);
    painelJson.classList.remove('ocultar');
  });
  const btnJson = h('button', { class: 'btn sec', type: 'button' }, 'JSON avançado');
  btnJson.addEventListener('click', () => {
    if (painelJson.classList.toggle('ocultar') === false && !jsonArea.value) {
      jsonArea.value = JSON.stringify(montarOperacaoRR(form), null, 2);
    }
  });
  const btnJsonForm = h('button', { class: 'btn sec', type: 'button' }, 'Preencher com o formulário');
  btnJsonForm.addEventListener('click', () => (jsonArea.value = JSON.stringify(montarOperacaoRR(form), null, 2)));
  const btnJsonCalc = h('button', { class: 'btn', type: 'button' }, 'Calcular este JSON');
  btnJsonCalc.addEventListener('click', () => {
    try {
      void calcular(JSON.parse(jsonArea.value));
    } catch {
      mostrarErro(saida, 'JSON inválido.');
    }
  });
  painelJson.append(jsonArea, h('div', { class: 'acoes' }, btnJsonForm, btnJsonCalc));

  desenharItens();
  void carregarUfs();

  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Regime Regular — CBS, IBS e Imposto Seletivo'),
      h('div', { class: 'grade' }, campo('Data do fato gerador', inData), campo('UF', selUf), campo('Município', selMun)),
      h('div', { class: 'tabela-rolagem', style: 'margin-top:12px' },
        h('table', { class: 'itens' },
          h('thead', {}, h('tr', {}, ['#', 'Tipo', 'Código', 'CST', 'cClassTrib', 'Base (R$)', 'Qtd.', 'Un.', 'CBS %', 'IBS UF %', 'IBS Mun. %', ''].map((t) => h('th', {}, t)))),
          corpoItens)),
      h('div', { class: 'acoes' }, btnCalcular, btnAdd, btnExemplo, btnJson),
      painelJson),
    h('section', { class: 'card' }, h('h2', {}, 'Resultado'), saida),
  );
}
