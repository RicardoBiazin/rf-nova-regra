// Auxiliares de DOM sem framework.

type Atributos = Record<string, string | number | boolean | EventListener | undefined>;
type Filho = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Atributos = {},
  ...filhos: Array<Filho | Filho[]>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value') (el as unknown as HTMLInputElement).value = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export function limpar(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function campo(rotulo: string, input: HTMLElement): HTMLLabelElement {
  return h('label', { class: 'campo' }, rotulo, input);
}

export function opcoes(select: HTMLSelectElement, itens: Array<[string, string]>, selecionado?: string): void {
  limpar(select);
  for (const [valor, texto] of itens) {
    const o = h('option', { value: valor }, texto);
    if (valor === selecionado) o.selected = true;
    select.append(o);
  }
}

export function baixar(nome: string, conteudo: BlobPart, tipo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = h('a', { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function mostrarErro(destino: HTMLElement, msg: string): void {
  limpar(destino);
  destino.append(h('div', { class: 'erro', role: 'alert' }, msg));
}

/** Renderiza JSON: lista de objetos rasos vira tabela; o resto vira <pre>. */
export function renderJson(valor: unknown): HTMLElement {
  if (Array.isArray(valor) && valor.length > 0 && valor.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
    const colunas = Array.from(new Set(valor.flatMap((o) => Object.keys(o as object))));
    const rasa = (valor as Array<Record<string, unknown>>).every((o) =>
      colunas.every((c) => o[c] === null || o[c] === undefined || typeof o[c] !== 'object'),
    );
    if (rasa) {
      return h(
        'div',
        { class: 'tabela-rolagem' },
        h(
          'table',
          {},
          h('thead', {}, h('tr', {}, colunas.map((c) => h('th', {}, c)))),
          h(
            'tbody',
            {},
            (valor as Array<Record<string, unknown>>).map((o) =>
              h('tr', {}, colunas.map((c) => h('td', {}, o[c] === null || o[c] === undefined ? '' : String(o[c])))),
            ),
          ),
        ),
      );
    }
  }
  return h('pre', {}, typeof valor === 'string' ? valor : JSON.stringify(valor, null, 2));
}
