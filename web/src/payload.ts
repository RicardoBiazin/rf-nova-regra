// Funções puras: montam os payloads das APIs a partir dos formulários e resumem as respostas.

export interface ItemIS {
  cst: string;
  cClassTrib: string;
  baseCalculo: string;
  quantidade: string;
  unidade: string;
  impostoInformado: string;
  adValorem: string;
}

export interface ItemRR {
  tipoCodigo: 'ncm' | 'nbs';
  codigo: string;
  cst: string;
  cClassTrib: string;
  baseCalculo: string;
  quantidade: string;
  unidade: string;
  cbs: string;
  ibsUf: string;
  ibsMun: string;
  is: ItemIS | null;
}

export interface FormRR {
  data: string;
  uf: string;
  municipio: string;
  itens: ItemRR[];
}

export interface ItemSN {
  cAtivSN: string;
  cClassTrib: string;
  baseCalculo: string;
  valorImpostoSeletivo: string;
  pIBSSN: string;
  pCBSSN: string;
}

export interface FormSN {
  data: string;
  tpDoc: string;
  CRT: string;
  tpRegimeIBSCBS: string;
  tpEnteGov: string;
  itens: ItemSN[];
}

/** Converte "1.234,56" ou "12.5" em número; vazio ou inválido vira undefined. */
export function numero(txt: string | undefined): number | undefined {
  if (txt === undefined) return undefined;
  const t = txt.trim();
  if (t === '') return undefined;
  const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : undefined;
}

/** Decimal em texto com ponto (formato esperado pela API do Simples Nacional). */
export function decimalTexto(txt: string | undefined, padrao?: string): string | undefined {
  const n = numero(txt);
  if (n === undefined) return padrao;
  return String(n);
}

function podar<T extends Record<string, unknown>>(obj: T): T {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === '') continue;
    saida[k] = v;
  }
  return saida as T;
}

export function novoId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function montarOperacaoRR(f: FormRR, id: string = novoId()): Record<string, unknown> {
  const municipio = numero(f.municipio);
  const itens = f.itens.map((it, i) => {
    const base: Record<string, unknown> = {
      numero: i + 1,
      [it.tipoCodigo]: it.codigo.trim() || undefined,
      cst: it.cst.trim(),
      cClassTrib: it.cClassTrib.trim(),
      baseCalculo: numero(it.baseCalculo),
      quantidade: numero(it.quantidade),
      unidade: it.unidade.trim() || undefined,
    };
    const aliquotas: Record<string, unknown> = {
      cbs: numero(it.cbs),
      ibsEstadual: numero(it.ibsUf),
      ibsMunicipal: numero(it.ibsMun),
    };
    if (it.is) {
      base.impostoSeletivo = podar({
        cst: it.is.cst.trim(),
        cClassTrib: it.is.cClassTrib.trim(),
        baseCalculo: numero(it.is.baseCalculo),
        quantidade: numero(it.is.quantidade),
        unidade: it.is.unidade.trim() || undefined,
        impostoInformado: numero(it.is.impostoInformado),
      });
      const adValorem = numero(it.is.adValorem);
      if (adValorem !== undefined) aliquotas.impostoSeletivo = { adValorem };
    }
    base.aliquotasNominais = podar(aliquotas);
    return podar(base);
  });
  return podar({
    id,
    versao: '1.0.0',
    dhFatoGerador: f.data ? `${f.data}T10:00:00-03:00` : undefined,
    municipio,
    uf: f.uf,
    itens,
  });
}

export function montarOperacaoSN(f: FormSN, id: string = novoId()): Record<string, unknown> {
  return podar({
    id,
    versao: '1.0.0',
    data: f.data,
    tpDoc: f.tpDoc,
    CRT: f.CRT,
    tpRegimeIBSCBS: f.tpRegimeIBSCBS,
    tpEnteGov: f.tpEnteGov,
    itens: f.itens.map((it, i) =>
      podar({
        numero: i + 1,
        cAtivSN: it.cAtivSN,
        cClassTrib: it.cClassTrib.trim(),
        baseCalculo: decimalTexto(it.baseCalculo),
        valorImpostoSeletivo: decimalTexto(it.valorImpostoSeletivo, '0.00'),
        pIBSSN: decimalTexto(it.pIBSSN),
        pCBSSN: decimalTexto(it.pCBSSN),
      }),
    ),
  });
}

// ---------- resumos das respostas ----------

export interface ErroApi {
  code: string;
  title: string;
  detail: string;
  pointer?: string;
}

export interface LinhaRR {
  n: number;
  estado: string;
  vBC?: string;
  vIBSUF?: string;
  vIBSMun?: string;
  vIBS?: string;
  vCBS?: string;
  vIS?: string;
  memoria: string[];
  erros: ErroApi[];
}

export interface ResumoRR {
  itens: LinhaRR[];
  totais: { vBC?: string; vIBS?: string; vCBS?: string; vIS?: string };
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function coletarMemorias(no: unknown, acc: string[] = []): string[] {
  if (no && typeof no === 'object') {
    for (const [k, v] of Object.entries(no as Obj)) {
      if (k === 'memoriaCalculo' && typeof v === 'string' && v) acc.push(v);
      else coletarMemorias(v, acc);
    }
  }
  return acc;
}

export function resumirRR(resp: Obj): ResumoRR {
  const itens: LinhaRR[] = (resp.objetos ?? []).map((o: Obj): LinhaRR => {
    const g = o.tribCalc?.IBSCBS?.gIBSCBS;
    return {
      n: o.nObj,
      estado: o.estadoItem,
      vBC: g?.vBC,
      vIBSUF: g?.gIBSUF?.vIBSUF,
      vIBSMun: g?.gIBSMun?.vIBSMun,
      vIBS: g?.vIBS,
      vCBS: g?.gCBS?.vCBS,
      vIS: o.tribCalc?.IS?.vIS,
      memoria: coletarMemorias(o.tribCalc),
      erros: (o.erros ?? []).map((e: Obj) => ({ code: e.code, title: e.title, detail: e.detail, pointer: e.pointer })),
    };
  });
  const t = resp.total?.tribCalc;
  return {
    itens,
    totais: {
      vBC: t?.IBSCBSTot?.vBCIBSCBS,
      vIBS: t?.IBSCBSTot?.gIBS?.vIBS,
      vCBS: t?.IBSCBSTot?.gCBS?.vCBS,
      vIS: t?.ISTot?.vIS,
    },
  };
}

export interface LinhaSN {
  n: number;
  estado: string;
  vBC?: string;
  vIBSSN?: string;
  vCBSSN?: string;
  vIS?: string;
  totalItem?: string;
  tpRBSN?: string;
  erros: ErroApi[];
}

export interface ResumoSN {
  itens: LinhaSN[];
  totais: { vRBSNtot?: string; vIBSSNtot?: string; vCBSSNtot?: string; totalIs?: string; totalTributos?: string };
}

export function resumirSN(resp: Obj): ResumoSN {
  const itens: LinhaSN[] = (resp.objetos ?? []).map((o: Obj): LinhaSN => {
    const t = o.tribCalc;
    return {
      n: o.nObj,
      estado: o.estadoItem,
      vBC: t?.vBC,
      vIBSSN: t?.vIBSSN,
      vCBSSN: t?.vCBSSN,
      vIS: t?.IS?.valor,
      totalItem: t?.totalItem,
      tpRBSN: t?.tpRBSNDescricao,
      erros: (o.erros ?? []).map((e: Obj) => ({ code: e.code, title: e.title, detail: e.detail, pointer: e.pointer })),
    };
  });
  const tot = resp.total ?? {};
  return {
    itens,
    totais: {
      vRBSNtot: tot.vRBSNtot,
      vIBSSNtot: tot.vIBSSNtot,
      vCBSSNtot: tot.vCBSSNtot,
      totalIs: tot.totalIs,
      totalTributos: tot.totalTributos,
    },
  };
}

/** Formata um decimal em texto ("1234.5") como moeda pt-BR sem símbolo. */
export function moeda(v: string | number | undefined | null): string {
  if (v === undefined || v === null || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const EXEMPLO_RR: Record<string, unknown> = {
  id: '6194602ea71cbf9431c236de4409d920',
  versao: '1.0.0',
  dhFatoGerador: '2027-03-10T10:00:00-03:00',
  municipio: 4314902,
  uf: 'RS',
  itens: [
    {
      numero: 1, ncm: '10063021', cst: '200', cClassTrib: '200003', baseCalculo: 100.0, quantidade: 20, unidade: 'KG',
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
    },
    {
      numero: 2, ncm: '22030000', cst: '000', cClassTrib: '000001', quantidade: 12, unidade: 'LT',
      impostoSeletivo: { cst: '000', cClassTrib: '000001', baseCalculo: 150.0, quantidade: 12, unidade: 'LT', impostoInformado: 15.0 },
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05, impostoSeletivo: { adValorem: 10.0 } },
    },
    {
      numero: 3, nbs: '122011200', cst: '200', cClassTrib: '200028', baseCalculo: 1200.0,
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
    },
    {
      numero: 4, ncm: '02013000', cst: '200', cClassTrib: '200035', baseCalculo: 80.0,
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
    },
  ],
};

export const EXEMPLO_SN: Record<string, unknown> = {
  id: 'exemplo-sn-1',
  versao: '1.0.0',
  data: '2027-03-10',
  tpDoc: '55',
  CRT: '1',
  itens: [
    { numero: 1, cAtivSN: '01', cClassTrib: '000001', baseCalculo: '1000.00', valorImpostoSeletivo: '0.00', pIBSSN: '0.10', pCBSSN: '0.90' },
  ],
};
