import { rr, type Uf, type Municipio } from '../api';
import { baixar, campo, h, limpar, mostrarErro, opcoes, renderJson } from '../ui';

interface Consulta {
  id: string;
  nome: string;
  caminho: string;
  params: Array<{ chave: string; rotulo: string; tipo: 'data' | 'texto' | 'uf' | 'municipio'; padrao?: string }>;
}

const DATA = { chave: 'data', rotulo: 'Data de referência', tipo: 'data' as const };

const CONSULTAS: Consulta[] = [
  { id: 'cst', nome: 'CST de CBS/IBS (com classificações)', caminho: 'dados-abertos/situacoes-tributarias/cbs-ibs', params: [DATA] },
  { id: 'cclass', nome: 'Classificações tributárias de CBS/IBS (cClassTrib)', caminho: 'dados-abertos/classificacoes-tributarias/cbs-ibs', params: [DATA] },
  { id: 'cst-is', nome: 'CST do Imposto Seletivo', caminho: 'dados-abertos/situacoes-tributarias/imposto-seletivo', params: [DATA] },
  { id: 'cclass-is', nome: 'Classificações do Imposto Seletivo', caminho: 'dados-abertos/classificacoes-tributarias/imposto-seletivo', params: [DATA] },
  { id: 'ncm', nome: 'NCM — consulta pelo código', caminho: 'dados-abertos/ncm', params: [{ chave: 'ncm', rotulo: 'NCM (8 dígitos)', tipo: 'texto', padrao: '22030000' }, DATA] },
  { id: 'ncm-lista', nome: 'NCM vigentes', caminho: 'dados-abertos/ncm/vigentes', params: [DATA] },
  { id: 'nbs', nome: 'NBS — consulta pelo código', caminho: 'dados-abertos/nbs', params: [{ chave: 'nbs', rotulo: 'NBS (9 dígitos)', tipo: 'texto', padrao: '122011200' }, DATA] },
  { id: 'nbs-lista', nome: 'NBS — lista', caminho: 'dados-abertos/nbs/lista', params: [DATA] },
  { id: 'fund', nome: 'Fundamentações legais', caminho: 'dados-abertos/fundamentacoes-legais', params: [DATA] },
  { id: 'al-uniao', nome: 'Alíquota de referência — União', caminho: 'dados-abertos/aliquota-uniao', params: [DATA] },
  { id: 'al-uf', nome: 'Alíquota de referência — UF', caminho: 'dados-abertos/aliquota-uf', params: [{ chave: 'codigoUf', rotulo: 'UF', tipo: 'uf' }, DATA] },
  { id: 'al-mun', nome: 'Alíquota de referência — município', caminho: 'dados-abertos/aliquota-municipio', params: [{ chave: 'codigoUf', rotulo: 'UF', tipo: 'uf' }, { chave: 'codigoMunicipio', rotulo: 'Município', tipo: 'municipio' }, DATA] },
  { id: 'redutores', nome: 'Redutores de compra governamental', caminho: 'dados-abertos/redutores-compra-governamental', params: [] },
  { id: 'transf-cbs', nome: 'Transferências de CBS', caminho: 'dados-abertos/transferencias-cbs', params: [] },
  { id: 'transf-ibs', nome: 'Transferências de IBS', caminho: 'dados-abertos/transferencias-ibs', params: [] },
  { id: 'dfe', nome: 'Grupos de DF-e', caminho: 'dados-abertos/dfe/grupos', params: [] },
];

export function abaConsultas(): HTMLElement {
  const sel = h('select', {});
  opcoes(sel, CONSULTAS.map((c): [string, string] => [c.id, c.nome]));
  const camposDiv = h('div', { class: 'grade' });
  const saida = h('div', {});
  const filtro = h('input', { placeholder: 'Filtrar resultado…', 'aria-label': 'Filtrar resultado' });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Consultar');
  const btnExp = h('button', { class: 'btn sec ocultar', type: 'button' }, 'Exportar JSON');
  let ultimo: unknown = null;
  let valores: Record<string, string> = {};
  let ufs: Uf[] = [];

  async function carregarUfs(): Promise<void> {
    if (ufs.length) return;
    try { ufs = await rr.get<Uf[]>('dados-abertos/ufs'); } catch { /* aparece no erro da consulta */ }
  }

  async function desenharCampos(): Promise<void> {
    const c = CONSULTAS.find((x) => x.id === sel.value)!;
    valores = {};
    limpar(camposDiv);
    if (c.params.some((p) => p.tipo === 'uf' || p.tipo === 'municipio')) await carregarUfs();
    for (const p of c.params) {
      if (p.tipo === 'data') {
        valores[p.chave] = '2027-03-10';
        const el = h('input', { type: 'date', value: valores[p.chave] });
        el.addEventListener('change', () => (valores[p.chave] = el.value));
        camposDiv.append(campo(p.rotulo, el));
      } else if (p.tipo === 'texto') {
        valores[p.chave] = p.padrao ?? '';
        const el = h('input', { value: valores[p.chave] });
        el.addEventListener('input', () => (valores[p.chave] = el.value.trim()));
        camposDiv.append(campo(p.rotulo, el));
      } else if (p.tipo === 'uf') {
        const el = h('select', {});
        opcoes(el, ufs.map((u): [string, string] => [String(u.codigo), `${u.sigla} — ${u.nome}`]), '43');
        valores[p.chave] = el.value;
        el.addEventListener('change', () => { valores[p.chave] = el.value; void recarregarMunicipios(); });
        camposDiv.append(campo(p.rotulo, el));
      } else {
        const el = h('select', { id: 'sel-mun-consulta' });
        camposDiv.append(campo(p.rotulo, el));
        void recarregarMunicipios();
      }
    }
  }

  async function recarregarMunicipios(): Promise<void> {
    const el = document.getElementById('sel-mun-consulta') as HTMLSelectElement | null;
    if (!el) return;
    const uf = ufs.find((u) => String(u.codigo) === valores.codigoUf);
    if (!uf) return;
    try {
      const ms = await rr.get<Municipio[]>('dados-abertos/ufs/municipios', { siglaUf: uf.sigla });
      opcoes(el, ms.map((m): [string, string] => [String(m.codigo), m.nome]));
      valores.codigoMunicipio = el.value;
      el.onchange = () => (valores.codigoMunicipio = el.value);
    } catch { /* ignora */ }
  }

  function desenharResultado(): void {
    limpar(saida);
    if (ultimo === null) return;
    const f = filtro.value.trim().toLowerCase();
    let v = ultimo;
    if (f && Array.isArray(v)) v = v.filter((x) => JSON.stringify(x).toLowerCase().includes(f));
    if (Array.isArray(v)) saida.append(h('p', { class: 'memoria' }, `${v.length} registro(s)`));
    saida.append(renderJson(v));
  }

  btn.addEventListener('click', async () => {
    const c = CONSULTAS.find((x) => x.id === sel.value)!;
    const params: Record<string, string> = {};
    for (const p of c.params) if (p.chave !== 'codigoUf' || c.id === 'al-uf') params[p.chave] = valores[p.chave];
    if (c.id === 'al-mun') delete params.codigoUf;
    btn.disabled = true;
    limpar(saida);
    saida.append(h('p', { class: 'memoria' }, 'Consultando…'));
    try {
      ultimo = await rr.get(c.caminho, params);
      btnExp.classList.remove('ocultar');
      desenharResultado();
    } catch (e) {
      ultimo = null;
      btnExp.classList.add('ocultar');
      mostrarErro(saida, (e as Error).message);
    } finally {
      btn.disabled = false;
    }
  });
  btnExp.addEventListener('click', () => baixar(`consulta-${sel.value}.json`, JSON.stringify(ultimo, null, 2), 'application/json'));
  sel.addEventListener('change', () => { ultimo = null; limpar(saida); btnExp.classList.add('ocultar'); void desenharCampos(); });
  filtro.addEventListener('input', desenharResultado);
  void desenharCampos();

  return h('section', { class: 'card' },
    h('h2', {}, 'Consultas às tabelas oficiais (dados abertos)'),
    h('div', { class: 'grade' }, campo('Consulta', sel)),
    h('div', { style: 'margin-top:12px' }, camposDiv),
    h('div', { class: 'acoes' }, btn, filtro, btnExp),
    saida);
}
