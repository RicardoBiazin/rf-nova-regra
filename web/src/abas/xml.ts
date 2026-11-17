import { rr } from '../api';
import { baixar, campo, h, limpar, mostrarErro, opcoes } from '../ui';

const TIPOS = ['nfe', 'nfce', 'nfse', 'cte', 'cte-simplificado', 'bpe', 'bpe-tm', 'nf3e'];

export function abaXml(): HTMLElement {
  const tipoGerar = h('select', {});
  opcoes(tipoGerar, TIPOS.map((t): [string, string] => [t, t]));
  const jsonRoc = h('textarea', { spellcheck: false, placeholder: 'Cole aqui o JSON do cálculo (formato ROC, como em upstream/regime-regular/src/test/resources/roc/)', 'aria-label': 'JSON ROC' });
  const saidaGerar = h('div', {});
  const btnGerar = h('button', { class: 'btn', type: 'button' }, 'Gerar XML');

  const tipoVal = h('select', {});
  opcoes(tipoVal, TIPOS.map((t): [string, string] => [t, t]));
  const subtipo = h('select', {}, h('option', { value: 'grupo' }, 'grupo'), h('option', { value: 'nota' }, 'nota'));
  const xmlArea = h('textarea', { spellcheck: false, placeholder: 'Cole aqui o XML do grupo de tributação ou da nota', 'aria-label': 'XML para validar' });
  const saidaVal = h('div', {});
  const btnValidar = h('button', { class: 'btn', type: 'button' }, 'Validar contra o XSD');

  btnGerar.addEventListener('click', async () => {
    limpar(saidaGerar);
    let corpo: unknown;
    try { corpo = JSON.parse(jsonRoc.value); } catch { mostrarErro(saidaGerar, 'JSON inválido.'); return; }
    btnGerar.disabled = true;
    try {
      const xml = await rr.post<string>('xml/generate', corpo, { tipo: tipoGerar.value });
      const texto = typeof xml === 'string' ? xml : JSON.stringify(xml, null, 2);
      const btnBaixar = h('button', { class: 'btn sec', type: 'button' }, 'Baixar XML');
      btnBaixar.addEventListener('click', () => baixar(`${tipoGerar.value}-grupo.xml`, texto, 'application/xml'));
      saidaGerar.append(h('div', { class: 'acoes' }, btnBaixar), h('pre', {}, texto));
    } catch (e) {
      mostrarErro(saidaGerar, (e as Error).message);
    } finally {
      btnGerar.disabled = false;
    }
  });

  btnValidar.addEventListener('click', async () => {
    limpar(saidaVal);
    if (!xmlArea.value.trim()) { mostrarErro(saidaVal, 'Cole o XML.'); return; }
    btnValidar.disabled = true;
    try {
      await rr.postTexto('xml/validate', xmlArea.value, 'application/xml', { tipo: tipoVal.value, subtipo: subtipo.value });
      saidaVal.append(h('p', { class: 'ok' }, 'XML válido.'));
    } catch (e) {
      mostrarErro(saidaVal, (e as Error).message);
    } finally {
      btnValidar.disabled = false;
    }
  });

  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Gerar XML do grupo de tributação'),
      h('div', { class: 'grade' }, campo('Tipo de documento', tipoGerar)),
      h('div', { style: 'margin-top:12px' }, jsonRoc),
      h('div', { class: 'acoes' }, btnGerar),
      saidaGerar),
    h('section', { class: 'card' },
      h('h2', {}, 'Validar XML'),
      h('div', { class: 'grade' }, campo('Tipo de documento', tipoVal), campo('Subtipo', subtipo)),
      h('div', { style: 'margin-top:12px' }, xmlArea),
      h('div', { class: 'acoes' }, btnValidar),
      saidaVal));
}
