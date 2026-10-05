import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/core/models';
import {
  cleanText,
  extractStreet,
  parseScan,
  validatePattern,
} from '../src/core/parser';
const rules = defaultSettings.rules;
describe('central parser', () => {
  it.each([
    'ITPFPHM510ESAI4',
    'ITPRCSEM03AI4',
    'ITARSRM003AI4',
    'MPC149M050P6',
    'MPC148M020GN',
    'STPC148M0020N',
    'ITCP001M0016A',
  ])('classifies product %s', (value) =>
    expect(parseScan(value, rules)).toMatchObject({
      valid: true,
      type: 'product',
      normalized: value,
    }),
  );
  it.each([
    'ML12345',
    'MI12345',
    'MPCABC01',
    'STC003',
    'MPL012',
    'ZX123',
    'RXYZ123',
    'R12345',
    'AB',
  ])('accepts other product families without an IT whitelist: %s', (value) =>
    expect(parseScan(value, rules)).toMatchObject({
      valid: true,
      type: 'product',
      normalized: value,
    }),
  );
  it('normalizes Ml to ML without confusing the letter L with I', () => {
    expect(parseScan(' Ml12345\r\n', rules).normalized).toBe('ML12345');
    expect(parseScan('Mi12345', rules).normalized).toBe('MI12345');
  });
  it.each([
    'R01A1C02DP01',
    'R01A1C04DP03',
    'R01A1C03DP03',
    'R02A1C01EP02',
    'R07A1GHBEG01',
    'R07A1AVFEG01',
    'R12A10XYZ99',
  ])('keeps each R address classified as a location: %s', (value) =>
    expect(parseScan(value, rules)).toMatchObject({
      valid: true,
      type: 'address',
      normalized: value,
    }),
  );
  it('removes the site prefix encoded before a complete address', () =>
    expect(parseScan('A1;R02A1C01EP02', rules)).toMatchObject({
      valid: true,
      type: 'address',
      normalized: 'R02A1C01EP02',
      warnings: ['Prefixo da etiqueta de endereço removido.'],
    }));
  it.each(['R01A1C03DP02', 'R14B77', 'R14B077'])(
    'preserves address %s',
    (value) =>
      expect(parseScan(value, rules)).toMatchObject({
        valid: true,
        type: 'address',
        normalized: value,
      }),
  );
  it('normalizes whitespace, case and Unicode', () =>
    expect(parseScan('  ｉｔpfphm510esai4 \r\n', rules).normalized).toBe(
      'ITPFPHM510ESAI4',
    ));
  it('removes controls and invisibles', () =>
    expect(
      parseScan('\u001d\u001e\u0002ITPF\u200bPHM510ESAI4\u0003', rules)
        .normalized,
    ).toBe('ITPFPHM510ESAI4'));
  it('handles controls before an AIM identifier', () =>
    expect(parseScan('\u0002]d2ITPFPHM510ESAI4\u0003', rules).normalized).toBe(
      'ITPFPHM510ESAI4',
    ));
  it.each([']d1', ']d2', ']Q3', ']C1'])(
    'strips recognized AIM prefix %s',
    (prefix) =>
      expect(parseScan(prefix + 'ITPFPHM510ESAI4', rules).type).toBe('product'),
  );
  it.each(['https://example.com', '', 'IT🙈123'])(
    'rejects incompatible input %s',
    (value) => expect(parseScan(value, rules).valid).toBe(false),
  );
  it.each(['RANDOM', 'R14', 'R14B', 'ITPF...'])(
    'does not impose a product-prefix whitelist: %s',
    (value) =>
      expect(parseScan(value, rules)).toMatchObject({
        valid: true,
        type: 'product',
        normalized: value,
      }),
  );
  it.each([
    ['(251)MPC149M050P6(37)1', 'MPC149M050P6'],
    ['(251)MPC148M020GN(37)1', 'MPC148M020GN'],
    ['(251)STPC148M0020N(37)1', 'STPC148M0020N'],
    ['(251)ITCP001M0016A(37)1', 'ITCP001M0016A'],
    ['251MPC149M050P6\u001d371', 'MPC149M050P6'],
    ['\u001d251MPC149M050P6\u001d371', 'MPC149M050P6'],
    ['251MPC149M050P6<GS>371', 'MPC149M050P6'],
  ])('extracts GS1 product payload from %s', (raw, normalized) =>
    expect(parseScan(raw, rules)).toMatchObject({
      valid: true,
      type: 'product',
      normalized,
      warnings: ['Identificadores GS1 removidos.'],
    }),
  );
  it('unwraps compact GS1 output only when scanner controls prove framing', () =>
    expect(parseScan('\u0002251MPC149M050P6371\u0003', rules)).toMatchObject({
      valid: true,
      type: 'product',
      normalized: 'MPC149M050P6',
    }));
  it('unwraps only a complete configured wrapper', () => {
    const configured = {
      ...rules,
      wrappers: [{ prefix: '251', suffix: '371' }],
    };
    expect(parseScan('251ITPFPHM510ESAI4371', configured).normalized).toBe(
      'ITPFPHM510ESAI4',
    );
    expect(parseScan('251ITPFPHM510ESAI4', configured).normalized).toBe(
      '251ITPFPHM510ESAI4',
    );
  });
  it('does not change legitimate numeric endings', () =>
    expect(
      parseScan('IT251ABC371', {
        ...rules,
        wrappers: [{ prefix: '251', suffix: '371' }],
      }).normalized,
    ).toBe('IT251ABC371'));
  it('honors an explicitly configured complete wrapper', () =>
    expect(
      parseScan('251ITABC371', {
        ...rules,
        productPatterns: ['^[A-Z0-9]{3,64}$'],
        wrappers: [{ prefix: '251', suffix: '371' }],
      }),
    ).toMatchObject({ valid: true, type: 'product', normalized: 'ITABC' }));
  it('gives complete addresses precedence over a broad product rule', () =>
    expect(
      parseScan('R14B77', { ...rules, productPatterns: ['^[A-Z0-9]{3,64}$'] })
        .type,
    ).toBe('address'));
  it('pads B only when enabled and only for simple addresses', () => {
    expect(parseScan('R14B77', rules).normalized).toBe('R14B77');
    expect(parseScan('R14B77', { ...rules, padB: true }).normalized).toBe(
      'R14B077',
    );
    expect(parseScan('R01A1C03DP02', { ...rules, padB: true }).normalized).toBe(
      'R01A1C03DP02',
    );
  });
  it.each([
    ['R01A1C03DP02', 'R01'],
    ['R14B077', 'R14'],
    ['SETORA', 'Sem rua'],
  ])('extracts street without mutation', (value, street) =>
    expect(extractStreet(value)).toBe(street),
  );
  it.each(['(a+)+$', '^A.*$', '^A[0-9]{1,999999}$', 'IT'])(
    'rejects unsafe rule %s',
    (pattern) => expect(validatePattern(pattern)).toBe(false),
  );
  it('limits payload lengths', () =>
    expect(parseScan('IT' + 'A'.repeat(3000), rules).valid).toBe(false));
  it('normalizes query', () => expect(cleanText(' it pf ')).toBe('ITPF'));
});
