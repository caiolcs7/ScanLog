import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { InventoryDatabase } from '../src/core/database';
import {
  defaultSettings,
  type Session,
  type InventoryRecord,
} from '../src/core/models';
import { parseScan } from '../src/core/parser';

describe('upgrade from the published database v1', () => {
  it.each([2, 3])(
    'adds the safe capture default to a published v%s database without altering custom rules',
    async (version) => {
      const name = `migration-v2-${crypto.randomUUID()}`;
      const legacy = new Dexie(name);
      legacy.version(version).stores({
        sessions: 'id, updatedAt, status',
        records: 'id, sessionId, [sessionId+order], [sessionId+code+address]',
        settings: 'id',
        history: 'id, sessionId, [sessionId+timestamp]',
      });
      const { cameraCapture: _capture, ...settings } =
        structuredClone(defaultSettings);
      expect(_capture).toBe('button');
      settings.rules.productPatterns = ['^MPC[A-Z0-9]+$'];
      await legacy.table('settings').put(settings);
      legacy.close();
      const updated = new InventoryDatabase(name);
      try {
        await updated.open();
        expect(await updated.settings.get('main')).toEqual({
          ...settings,
          cameraCapture: 'button',
        });
      } finally {
        await updated.delete();
      }
    },
  );
  it.each([
    {
      name: 'original IT default',
      patterns: ['^IT[A-Z0-9]{3,62}$'],
      expand: true,
    },
    {
      name: 'custom product rules',
      patterns: ['^MPC[A-Z0-9]{1,64}$'],
      expand: false,
    },
  ])(
    'preserves inventory and preferences with $name',
    async ({ patterns, expand }) => {
      const name = `migration-${crypto.randomUUID()}`;
      const legacy = new Dexie(name);
      // This is the schema shipped before the multi-prefix release.
      legacy.version(1).stores({
        sessions: 'id, updatedAt, status',
        records: 'id, sessionId, [sessionId+order], [sessionId+code+address]',
        settings: 'id',
        history: 'id, sessionId, [sessionId+timestamp]',
      });
      const settings = structuredClone(defaultSettings);
      settings.rules.productPatterns = patterns;
      settings.rules.addressPatterns = [
        '^R[0-9]{2,3}A[0-9]{1,3}C[0-9]{1,3}DP[0-9]{1,3}$',
        '^R[0-9]{2,3}B[0-9]{1,3}$',
      ];
      settings.rules.padB = true;
      settings.rules.wrappers = [{ prefix: '251', suffix: '371' }];
      settings.theme = 'dark';
      settings.sound = false;
      const session: Session = {
        id: crypto.randomUUID(),
        name: 'Rua R01 preservada',
        createdAt: 1,
        updatedAt: 2,
        status: 'active',
        notes: 'Conferência em andamento',
        count: 1,
        nextOrder: 2,
        activeAddress: 'R01A1C02DP01',
        activeGalao: '',
        mode: 'product-address',
        pending: { type: 'product', value: 'ITABC02', source: 'hid' },
        completedAddresses: ['R01A1C01DP01'],
        weighted: false,
      };
      const record: InventoryRecord = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        code: 'ITABC01',
        address: 'R01A1C02DP01',
        timestamp: 2,
        order: 1,
        source: 'hid',
      };
      const { cameraCapture: _capture, ...oldSettings } = settings;
      expect(_capture).toBe('button');
      await legacy.table('settings').put(oldSettings);
      await legacy.table('sessions').put(session);
      await legacy.table('records').put(record);
      legacy.close();

      const updated = new InventoryDatabase(name);
      try {
        await updated.open();
        expect(updated.verno).toBe(7);
        expect(await updated.sessions.get(session.id)).toEqual(session);
        expect(await updated.records.get(record.id)).toEqual(record);
        const saved = (await updated.settings.get('main'))!;
        expect(saved).toEqual({
          ...settings,
          rules: {
            ...settings.rules,
            productPatterns: expand
              ? defaultSettings.rules.productPatterns
              : patterns,
            addressPatterns: defaultSettings.rules.addressPatterns,
          },
        });
        expect(parseScan('ML12345', saved.rules).valid).toBe(expand);
        expect(parseScan('MPCABC01', saved.rules).type).toBe('product');
        updated.close();
        await updated.open();
        expect(await updated.records.count()).toBe(1);
      } finally {
        await updated.delete();
      }
    },
  );

  it('upgrades a v4 database with the published address defaults to the expanded address family', async () => {
    const name = `migration-v5-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(4).stores({
      sessions: 'id, updatedAt, status',
      records: 'id, sessionId, [sessionId+order], [sessionId+code+address]',
      settings: 'id',
      history: 'id, sessionId, [sessionId+timestamp]',
    });
    const settings = structuredClone(defaultSettings);
    settings.rules.addressPatterns = [
      '^R[0-9]{2,3}A[0-9]{1,3}C[0-9]{1,3}DP[0-9]{1,3}$',
      '^R[0-9]{2,3}B[0-9]{1,3}$',
    ];
    await legacy.table('settings').put(settings);
    legacy.close();

    const updated = new InventoryDatabase(name);
    try {
      await updated.open();
      expect(updated.verno).toBe(7);
      const saved = (await updated.settings.get('main'))!;
      expect(saved.rules.addressPatterns).toEqual(
        defaultSettings.rules.addressPatterns,
      );
      expect(parseScan('R07A1GHBEG01', saved.rules)).toMatchObject({
        valid: true,
        type: 'address',
        normalized: 'R07A1GHBEG01',
      });
      expect(parseScan('R07A1AVFEG01', saved.rules)).toMatchObject({
        valid: true,
        type: 'address',
        normalized: 'R07A1AVFEG01',
      });
    } finally {
      await updated.delete();
    }
  });
});
