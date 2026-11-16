import { describe, expect, it } from 'vitest';
import { galaoVariants } from '../src/features/identify/LotList';

describe('busca pelo galão', () => {
  it('aceita G1 ou G01, qualquer caixa, com S', () => {
    const v = galaoVariants('r09g01s');
    expect(v).toEqual(
      expect.arrayContaining(['R09G01S', 'R09G1S', 'R9G01S', 'R9G1S']),
    );
    expect(v.every((x) => x.endsWith('S'))).toBe(true);
  });
  it('sem S pega o andar de baixo e o S', () => {
    expect(galaoVariants('R04G12')).toEqual(
      expect.arrayContaining(['R04G12', 'R04G12S']),
    );
  });
  it('texto comum não é galão', () => {
    expect(galaoVariants('Peças R04')).toEqual([]);
    expect(galaoVariants('')).toEqual([]);
  });
});
