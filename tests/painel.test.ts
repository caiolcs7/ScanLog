import { describe, expect, it } from 'vitest';
import type { Cotacao, Fornecedor, Material } from '../src/painel/api';
import {
  cambio,
  dinheiro,
  emReais,
  lerNumero,
  local,
  oferta,
  ofertas,
  paraCampo,
  peso,
  temFornecedor,
  temPreco,
  vaga,
} from '../src/painel/format';
import { diferencas } from '../src/painel/mudanca';
import ruas from '../src/painel/ruas.json';

const sem = (t: string) => t.replace(/\u00a0/g, ' ');

describe('painel: números', () => {
  it('lê preço no jeito brasileiro e no jeito com ponto', () => {
    expect(lerNumero('1.234,56')).toBe(1234.56);
    expect(lerNumero('12,5')).toBe(12.5);
    expect(lerNumero('0.75')).toBe(0.75);
    expect(lerNumero('R$ 3,10')).toBe(3.1);
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('12a')).toBeNaN();
    expect(lerNumero('-3')).toBeNaN();
  });
  it('volta o valor para o campo sem separador de milhar', () => {
    expect(paraCampo(1234.5)).toBe('1234,5');
    expect(paraCampo(null)).toBe('');
  });
  it('mostra dinheiro, peso e localização', () => {
    expect(sem(dinheiro(12.5, 'USD'))).toBe('US$ 12,50');
    expect(sem(dinheiro(0.1234, 'CNY'))).toBe('¥ 0,1234');
    expect(peso(18)).toBe('18 g');
    expect(peso(1500)).toBe('1,5 kg');
    expect(peso(0.3)).toBe('0,3 g');
    expect(local('R07A1G05')).toBe('R07 · A1 · G05');
  });
  it('lê o endereço de prateleira', () => {
    expect(local('R18A1C06DP02')).toBe('R18 · A1 · Col 06 · Dir · Prat 02');
    expect(local('R18A2CASEP10')).toBe('R18 · A2 · Col CAS · Esq · Prat 10');
    expect(vaga('R18A1C06DP02')).toMatchObject({ andar: 'A1', letra: 'S' });
    expect(vaga('R07A1G05')).toMatchObject({ andar: 'A1', letra: 'G' });
  });
});

describe('painel: câmbio', () => {
  const cot: Cotacao[] = [
    { moeda: 'USD', data: '2026-10-21', valor: 5.1 },
    { moeda: 'USD', data: '2026-10-22', valor: 5.2 },
    { moeda: 'CNY', data: '2026-10-22', valor: 0.72 },
  ];
  it('usa a cotação mais recente de cada moeda', () => {
    const c = cambio(cot);
    expect(c.USD).toEqual({ valor: 5.2, data: '2026-10-22' });
    expect(c.BRL.valor).toBe(1);
    const m = { preco: 10, moeda: 'USD' } as Material;
    expect(emReais(m, c)).toBeCloseTo(52);
    expect(emReais({ preco: null, moeda: null } as Material, c)).toBeNull();
  });
});

describe('painel: dois fornecedores', () => {
  const base = {
    fornecedor_id: null,
    preco: null,
    moeda: null,
    fornecedor2_id: null,
    preco2: null,
    moeda2: null,
  } as const;
  const c = cambio([{ moeda: 'USD', data: '2026-10-22', valor: 5 }]);
  it('conta o preço do 1; sem ele, o do 2', () => {
    const dois = {
      ...base,
      preco: 10,
      moeda: 'USD',
      preco2: 8,
      moeda2: 'BRL',
    } as const;
    expect(oferta(dois)).toMatchObject({ n: 1, preco: 10 });
    expect(emReais(dois, c)).toBe(50);
    const so2 = {
      ...base,
      fornecedor_id: 1,
      preco2: 8,
      moeda2: 'BRL',
    } as const;
    expect(oferta(so2)).toMatchObject({ n: 2, preco: 8 });
    expect(emReais(so2, c)).toBe(8);
    expect(temPreco(base)).toBe(false);
    expect(ofertas(base)).toHaveLength(0);
  });
  it('acha o fornecedor em qualquer um dos dois', () => {
    const m = { ...base, fornecedor_id: 1, fornecedor2_id: 2 };
    expect(temFornecedor(m, 1)).toBe(true);
    expect(temFornecedor(m, 2)).toBe(true);
    expect(temFornecedor(m, 3)).toBe(false);
  });
});

describe('painel: histórico', () => {
  const porId = new Map<number, Fornecedor>([
    [1, { id: 1, nome: 'WEG', origem: 'nacional' } as Fornecedor],
  ]);
  it('descreve só o que mudou', () => {
    const antes = {
      preco: null,
      moeda: null,
      fornecedor_id: null,
      quantidade: 4,
    };
    const depois = {
      preco: 2.5,
      moeda: 'USD' as const,
      fornecedor_id: 1,
      quantidade: 4,
    };
    expect(
      diferencas(antes, depois, porId).map((l) => ({
        ...l,
        para: sem(l.para),
      })),
    ).toEqual([
      { campo: 'Preço', de: '—', para: 'US$ 2,50' },
      { campo: 'Fornecedor', de: '—', para: 'WEG' },
    ]);
  });
  it('descreve o fornecedor 2', () => {
    expect(
      diferencas(
        { fornecedor2_id: null, preco2: null, moeda2: null },
        { fornecedor2_id: 1, preco2: 4, moeda2: 'BRL' },
        porId,
      ).map((l) => ({ ...l, para: sem(l.para) })),
    ).toEqual([
      { campo: 'Preço 2', de: '—', para: 'R$ 4,00' },
      { campo: 'Fornecedor 2', de: '—', para: 'WEG' },
    ]);
  });
});

describe('painel: códigos das ruas', () => {
  it('traz os códigos únicos, válidos e com localização', () => {
    expect(ruas.length).toBeGreaterThan(2500);
    const codigos = new Set(ruas.map((r) => r.codigo));
    expect(codigos.size).toBe(ruas.length);
    for (const r of ruas) {
      expect(r.codigo).toMatch(/^[A-Z0-9][A-Z0-9./_-]{0,39}$/);
      expect(r.locais.length).toBeGreaterThan(0);
      for (const l of r.locais) expect(l).toMatch(/^R\d{2}A[12][A-Z0-9]+$/);
    }
  });
  it('só tem fornecedor 2 se tem o 1, e os dois são diferentes', () => {
    const origem = ['nacional', 'internacional'];
    for (const r of ruas as {
      fornecedor?: string;
      forn_origem?: string;
      fornecedor2?: string;
      forn2_origem?: string;
    }[]) {
      if (r.fornecedor2) {
        expect(r.fornecedor).toBeTruthy();
        expect(r.fornecedor2.toUpperCase()).not.toBe(
          r.fornecedor!.toUpperCase(),
        );
        expect(origem).toContain(r.forn2_origem);
      }
      if (r.fornecedor) expect(origem).toContain(r.forn_origem);
    }
  });
});
