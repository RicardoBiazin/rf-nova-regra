import './style.css';
import { carregarInfo, rr, type VersaoBase } from './api';
import { abaConsultas } from './abas/consultas';
import { abaDanfse } from './abas/danfse';
import { abaRegimeRegular } from './abas/regime-regular';
import { abaSimplesNacional } from './abas/simples-nacional';
import { abaXml } from './abas/xml';
import { h, limpar } from './ui';

function tema(): void {
  try {
    const t = localStorage.getItem('tema');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch { /* sem armazenamento */ }
}

async function iniciar(): Promise<void> {
  tema();
  const info = await carregarInfo();
  const app = document.getElementById('app')!;

  const seloBase = h('span', { class: 'selo' }, 'base: …');
  const btnTema = h('button', { class: 'mini', type: 'button', title: 'Alternar tema claro/escuro' }, '◐');
  btnTema.addEventListener('click', () => {
    const escuro = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const novo = escuro ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem('tema', novo); } catch { /* ignora */ }
  });

  const topo = h('header', { class: 'topo' },
    h('h1', {}, 'RF Nova Regra'),
    h('span', { class: 'selo' }, 'Reforma Tributária do Consumo'),
    h('div', { class: 'meta' },
      seloBase,
      h('span', { class: 'selo destaque' }, info.modo === 'desktop' ? 'desktop · offline' : 'web · API da Receita'),
      h('span', { class: 'selo' }, `v${info.versaoApp}`),
      btnTema));

  const abas: Array<{ id: string; nome: string; criar: () => HTMLElement }> = [
    { id: 'rr', nome: 'Regime Regular', criar: abaRegimeRegular },
    { id: 'sn', nome: 'Simples Nacional', criar: () => abaSimplesNacional(info.modo) },
    { id: 'danfse', nome: 'DANFSe', criar: abaDanfse },
    { id: 'consultas', nome: 'Consultas', criar: abaConsultas },
    { id: 'xml', nome: 'XML', criar: abaXml },
  ];

  const nav = h('nav', { class: 'abas', role: 'tablist' });
  const conteudo = h('main', {});
  const cache = new Map<string, HTMLElement>();

  function abrir(id: string): void {
    for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.id === id));
    limpar(conteudo);
    let el = cache.get(id);
    if (!el) {
      el = abas.find((a) => a.id === id)!.criar();
      cache.set(id, el);
    }
    conteudo.append(el);
    try { sessionStorage.setItem('aba', id); } catch { /* ignora */ }
    history.replaceState(null, '', `#${id}`);
  }

  for (const a of abas) {
    const b = h('button', { role: 'tab', type: 'button', 'data-id': a.id }, a.nome);
    b.addEventListener('click', () => abrir(a.id));
    nav.append(b);
  }

  const rodape = h('footer', { class: 'rodape' },
    'Projeto não oficial, sem vínculo com a Receita Federal do Brasil. ',
    info.modo === 'web'
      ? 'Os cálculos do Regime Regular usam a API pública da Receita (ambiente piloto). Resultados são simulações, sem valor fiscal. '
      : 'Os cálculos usam o código dos projetos da Receita embutido no aplicativo, com banco local. Resultados são simulações, sem valor fiscal. ',
    h('a', { href: 'https://github.com/RicardoBiazin/rf-nova-regra', target: '_blank', rel: 'noopener noreferrer' }, 'Código-fonte (MIT)'));

  app.append(topo, nav, conteudo, rodape);

  let inicial = location.hash.slice(1);
  if (!abas.some((a) => a.id === inicial)) {
    try { inicial = sessionStorage.getItem('aba') ?? ''; } catch { inicial = ''; }
  }
  abrir(abas.some((a) => a.id === inicial) ? inicial : 'rr');

  try {
    const v = await rr.get<VersaoBase>('dados-abertos/versao');
    seloBase.textContent = `base ${v.versaoDb} · ${v.dataVersaoDb}`;
    seloBase.title = v.descricaoVersaoDb;
  } catch {
    seloBase.textContent = 'base: indisponível';
  }
}

void iniciar();
