import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import bwipjs from 'bwip-js/node';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { parseScan } from '../src/core/parser';
import { defaultSettings } from '../src/core/models';
beforeAll(async () => {
  await prepareZXingModule({
    overrides: {
      wasmBinary: readFileSync(
        'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',
      ),
    },
    fireImmediately: true,
  });
});
describe('ZXing-C++ actual image decoding', () => {
  it.each([
    ['product-ml', 'ML12345'],
    ['product-mpc', 'MPCABC01'],
    ['product-stc', 'STC003'],
    ['product-mpl', 'MPL012'],
  ])(
    'decodes and classifies Data Matrix from family %s',
    async (name, code) => {
      const result = await readBarcodes(
        new Uint8Array(readFileSync(`tests/fixtures/${name}.png`)),
        { formats: ['DataMatrix'] },
      );
      expect(result).toHaveLength(1);
      expect(result[0].symbology).toBe('DataMatrix');
      expect(parseScan(result[0].text, defaultSettings.rules)).toMatchObject({
        valid: true,
        type: 'product',
        normalized: code,
      });
    },
  );
  it.each(['product', 'product-rotated', 'product-inverted'])(
    'decodes real Data Matrix fixture %s',
    async (name) => {
      const result = await readBarcodes(
        new Uint8Array(readFileSync(`tests/fixtures/${name}.png`)),
        {
          formats: ['DataMatrix'],
          tryHarder: true,
          tryInvert: true,
          tryRotate: true,
        },
      );
      expect(result).toHaveLength(1);
      expect(result[0].symbology).toBe('DataMatrix');
      expect(result[0].text).toBe('ITPFPHM510ESAI4');
      expect(result[0].isValid).toBe(true);
    },
  );
  it('decodes an address Data Matrix', async () => {
    const result = await readBarcodes(
      new Uint8Array(readFileSync('tests/fixtures/address.png')),
      { formats: ['DataMatrix'] },
    );
    expect(result[0].text).toBe('R01A1C03DP02');
  });
  it.each([
    ['product-gs1-real.jpg', 'MPC149M050P6'],
    ['product-mpc2-gs1-real.jpg', 'MPC148M020GN'],
    ['product-stpc-gs1-real.jpg', 'STPC148M0020N'],
    ['product-itcp-gs1-real.jpg', 'ITCP001M0016A'],
    ['address-prefixed-real.jpg', 'R02A1C01EP02'],
    ['container-real.jpg', 'EXTA1C010P00'],
  ])(
    'decodes and normalizes the real warehouse label %s',
    async (name, value) => {
      const result = await readBarcodes(
        new Uint8Array(readFileSync(`tests/fixtures/${name}`)),
        {
          formats: ['DataMatrix'],
          textMode: 'Plain',
          tryHarder: true,
          tryInvert: true,
          tryRotate: true,
        },
      );
      expect(result).toHaveLength(1);
      expect(parseScan(result[0].text, defaultSettings.rules)).toMatchObject({
        valid: true,
        normalized: value,
      });
    },
  );
  it('decodes the real container CT01 label as a location', async () => {
    const result = await readBarcodes(
      new Uint8Array(readFileSync('tests/fixtures/container-real.jpg')),
      { formats: ['DataMatrix'], tryHarder: true },
    );
    expect(result[0].text).toBe('A1;EXTA1C010P00');
    expect(parseScan(result[0].text, defaultSettings.rules)).toMatchObject({
      valid: true,
      type: 'address',
      normalized: 'EXTA1C010P00',
    });
  });
  it('decodes the C52A container Data Matrix', async () => {
    const png = await bwipjs.toBuffer({
      bcid: 'datamatrix',
      text: 'A1;EXTA2C52A0P00',
      scale: 6,
      padding: 10,
      backgroundcolor: 'FFFFFF',
    });
    const result = await readBarcodes(new Uint8Array(png), {
      formats: ['DataMatrix'],
    });
    expect(parseScan(result[0].text, defaultSettings.rules)).toMatchObject({
      valid: true,
      type: 'address',
      normalized: 'EXTA2C52A0P00',
    });
  });
  it('does not invent a reading from a blank image', async () =>
    expect(
      await readBarcodes(
        new Uint8Array(readFileSync('tests/fixtures/blank.png')),
        { formats: ['DataMatrix'] },
      ),
    ).toHaveLength(0));
  it.each([
    ['qr', 'QRCode'],
    ['code128', 'Code128'],
  ] as const)('also decodes %s', async (name, format) => {
    const result = await readBarcodes(
      new Uint8Array(readFileSync(`tests/fixtures/${name}.png`)),
      { formats: [format] },
    );
    expect(result[0].text).toBe('ITPFPHM510ESAI4');
  });
});
