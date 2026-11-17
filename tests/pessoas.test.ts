import { describe, expect, it } from 'vitest';
import { suggestLogin } from '../src/cloud/pessoas';
import { personEmail } from '../src/cloud/auth';

describe('usuário das pessoas do almoxarifado', () => {
  it('sugere o primeiro nome, sem acento e minúsculo', () => {
    expect(suggestLogin('Ilídio Nascimento Alves')).toBe('ilidio');
    expect(suggestLogin('  JOÃO  ')).toBe('joao');
  });
  it('evita usuário repetido ou reservado', () => {
    expect(suggestLogin('Paulo', ['paulo'])).toBe('paulo2');
    expect(suggestLogin('Admin')).toBe('admin2');
    expect(suggestLogin('Zé')).toBe('ze');
  });
  it('monta o e-mail da conta pelo usuário digitado', () => {
    expect(personEmail(' Ilidio ')).toBe('ilidio@scanlog.app');
    expect(() => personEmail('ilídio')).toThrow();
    expect(() => personEmail('a b')).toThrow();
  });
});
