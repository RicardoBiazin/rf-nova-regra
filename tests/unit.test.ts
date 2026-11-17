import { describe, expect, it } from 'vitest';
import { alvoRR, alvoSN } from '../shared/allowlist.mjs';
import {
  decimalTexto, montarOperacaoRR, montarOperacaoSN, moeda, numero, resumirRR, resumirSN,
  type FormRR, type FormSN,
} from '../web/src/payload';

describe('numero / decimalTexto', () => {
  it('aceita ponto, vírgula e milhar pt-BR', () => {
    expect(numero('12.5')).toBe(12.5);
    expect(numero('1.234,56')).toBe(1234.56);
    expect(numero('  ')).toBeUndefined();
    expect(numero('abc')).toBeUndefined();
  });
  it('decimalTexto usa ponto e padrão', () => {
    expect(decimalTexto('1,5')).toBe('1.5');
    expect(decimalTexto('', '0.00')).toBe('0.00');
    expect(decimalTexto('')).toBeUndefined();
  });
});

describe('montarOperacaoRR', () => {
  const form: FormRR = {
    data: '2027-03-10', uf: 'RS', municipio: '4314902',
    itens: [
      { tipoCodigo: 'ncm', codigo: '10063021', cst: '200', cClassTrib: '200003', baseCalculo: '100', quantidade: '20', unidade: 'KG', cbs: '8.8', ibsUf: '0.05', ibsMun: '0.05', is: null },
      {
        tipoCodigo: 'nbs', codigo: '', cst: '000', cClassTrib: '000001', baseCalculo: '', quantidade: '12', unidade: 'LT', cbs: '8,8', ibsUf: '0.05', ibsMun: '0.05',
        is: { cst: '000', cClassTrib: '000001', baseCalculo: '150', quantidade: '12', unidade: 'LT', impostoInformado: '15', adValorem: '10' },
      },
    ],
  };
  it('monta o payload esperado pela API', () => {
    const p = montarOperacaoRR(form, 'abc') as any;
    expect(p.id).toBe('abc');
    expect(p.dhFatoGerador).toBe('2027-03-10T10:00:00-03:00');
    expect(p.municipio).toBe(4314902);
    expect(p.uf).toBe('RS');
    expect(p.itens[0]).toEqual({
      numero: 1, ncm: '10063021', cst: '200', cClassTrib: '200003', baseCalculo: 100, quantidade: 20, unidade: 'KG',
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
    });
  });
  it('omite código vazio e base vazia, inclui IS', () => {
    const it2 = (montarOperacaoRR(form) as any).itens[1];
    expect(it2.nbs).toBeUndefined();
    expect(it2.baseCalculo).toBeUndefined();
    expect(it2.aliquotasNominais.cbs).toBe(8.8);
    expect(it2.aliquotasNominais.impostoSeletivo).toEqual({ adValorem: 10 });
    expect(it2.impostoSeletivo).toEqual({ cst: '000', cClassTrib: '000001', baseCalculo: 150, quantidade: 12, unidade: 'LT', impostoInformado: 15 });
  });
  it('gera id de 32 hex quando não informado', () => {
    expect((montarOperacaoRR(form) as any).id).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('montarOperacaoSN', () => {
  const form: FormSN = {
    data: '2027-03-10', tpDoc: '55', CRT: '1', tpRegimeIBSCBS: '', tpEnteGov: '',
    itens: [{ cAtivSN: '01', cClassTrib: '000001', baseCalculo: '1000', valorImpostoSeletivo: '', pIBSSN: '0,10', pCBSSN: '0.90' }],
  };
  it('usa decimais como texto e zera o IS vazio', () => {
    const p = montarOperacaoSN(form, 'x') as any;
    expect(p).toMatchObject({ id: 'x', data: '2027-03-10', tpDoc: '55', CRT: '1' });
    expect(p.tpRegimeIBSCBS).toBeUndefined();
    expect(p.itens[0]).toEqual({ numero: 1, cAtivSN: '01', cClassTrib: '000001', baseCalculo: '1000', valorImpostoSeletivo: '0.00', pIBSSN: '0.1', pCBSSN: '0.9' });
  });
});

describe('resumos', () => {
  it('resumirRR extrai valores, erros e memória', () => {
    const r = resumirRR({
      objetos: [
        { nObj: 1, estadoItem: 'CALCULO_SIMULADO', tribCalc: { IBSCBS: { gIBSCBS: { vBC: '100.00', gIBSUF: { vIBSUF: '0.05', memoriaCalculo: 'm1' }, gIBSMun: { vIBSMun: '0.05' }, vIBS: '0.10', gCBS: { vCBS: '8.80' } } } } },
        { nObj: 2, estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ code: 'REG-011', title: 't', detail: 'd' }] },
      ],
      total: { tribCalc: { IBSCBSTot: { vBCIBSCBS: '100.00', gIBS: { vIBS: '0.10' }, gCBS: { vCBS: '8.80' } }, ISTot: { vIS: '1.00' } } },
    });
    expect(r.itens[0]).toMatchObject({ n: 1, vCBS: '8.80', vIBS: '0.10', memoria: ['m1'] });
    expect(r.itens[1].erros[0].code).toBe('REG-011');
    expect(r.totais).toEqual({ vBC: '100.00', vIBS: '0.10', vCBS: '8.80', vIS: '1.00' });
  });
  it('resumirSN extrai totais e itens', () => {
    const r = resumirSN({
      objetos: [{ nObj: 1, estadoItem: 'CALCULADO', tribCalc: { vBC: '1000.00', vIBSSN: '1.00', vCBSSN: '9.00', IS: { valor: '0.00' }, totalItem: '10.00', tpRBSNDescricao: 'Receita bruta - interna' } }],
      total: { vRBSNtot: '1000.00', totalTributos: '10.00' },
    });
    expect(r.itens[0]).toMatchObject({ vIBSSN: '1.00', vCBSSN: '9.00', totalItem: '10.00' });
    expect(r.totais.totalTributos).toBe('10.00');
  });
  it('resumos toleram resposta vazia', () => {
    expect(resumirRR({}).itens).toEqual([]);
    expect(resumirSN({}).itens).toEqual([]);
  });
});

describe('moeda', () => {
  it('formata pt-BR e trata ausentes', () => {
    expect(moeda('1234.5')).toBe('1.234,50');
    expect(moeda(undefined)).toBe('—');
    expect(moeda('')).toBe('—');
  });
});

describe('lista branca do proxy', () => {
  it('RR permite os caminhos de negócio', () => {
    expect(alvoRR('regime-geral', 'POST')).toBe('/api/calculadora/regime-geral');
    expect(alvoRR('observabilidade/regime-geral', 'POST')).toBe('/api/calculadora/observabilidade/regime-geral');
    expect(alvoRR('dados-abertos/ufs', 'GET')).toBe('/api/calculadora/dados-abertos/ufs');
    expect(alvoRR('xml/validate', 'POST')).toBe('/api/calculadora/xml/validate');
    expect(alvoRR('pedagio', 'POST')).toBe('/api/calculadora/pedagio');
  });
  it('RR recusa métodos, travessia e caminhos fora', () => {
    expect(alvoRR('regime-geral', 'DELETE')).toBeNull();
    expect(alvoRR('regime-geral', 'PUT')).toBeNull();
    expect(alvoRR('actuator/env', 'GET')).toBeNull();
    expect(alvoRR('dados-abertos/../x', 'GET')).toBeNull();
    expect(alvoRR('dados-abertos/%2e%2e/x', 'GET')).toBeNull();
    expect(alvoRR('dados-abertos//x', 'GET')).toBeNull();
    expect(alvoRR('/dados-abertos/ufs', 'GET')).toBeNull();
    expect(alvoRR('dados-abertos\\ufs', 'GET')).toBeNull();
    expect(alvoRR('regime-geral-x', 'GET')).toBeNull();
    expect(alvoRR('', 'GET')).toBeNull();
    expect(alvoRR('a'.repeat(400), 'GET')).toBeNull();
  });
  it('SN respeita método por rota', () => {
    expect(alvoSN('versao', 'GET')).toBe('/api/versao');
    expect(alvoSN('versao', 'POST')).toBeNull();
    expect(alvoSN('simples-nacional/atividades', 'GET')).toBe('/api/calculadora/simples-nacional/atividades');
    expect(alvoSN('simples-nacional/atividades/01', 'GET')).toBe('/api/calculadora/simples-nacional/atividades/01');
    expect(alvoSN('simples-nacional/atividades', 'POST')).toBeNull();
    expect(alvoSN('observabilidade/simples-nacional', 'POST')).toBe('/api/calculadora/observabilidade/simples-nacional');
    expect(alvoSN('observabilidade/simples-nacional', 'GET')).toBeNull();
    expect(alvoSN('observabilidade/simples-nacional/erros', 'GET')).toBe('/api/calculadora/observabilidade/simples-nacional/erros');
    expect(alvoSN('actuator', 'GET')).toBeNull();
  });
});
