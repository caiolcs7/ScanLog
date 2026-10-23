import { describe, expect, it } from 'vitest';
import type { Cotacao, Fornecedor, Material } from '../src/painel/api';
import {
  cambio,
  dinheiro,
  emReais,
  lerNumero,
  local,
  paraCampo,
  peso,
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
    expect(local('R07A1G05')).toBe('R07 · A1 · G05');
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
});

describe('painel: códigos das ruas', () => {
  it('traz os 1.393 códigos únicos, válidos e com localização', () => {
    expect(ruas).toHaveLength(1393);
    const codigos = new Set(ruas.map((r) => r.codigo));
    expect(codigos.size).toBe(1393);
    for (const r of ruas) {
      expect(r.codigo).toMatch(/^[A-Z0-9][A-Z0-9./_-]{0,39}$/);
      expect(r.locais.length).toBeGreaterThan(0);
    }
  });
});
