import Dexie, { type Table } from 'dexie';
import { upgradeLegacySettings } from './settings';
import { extractStreet } from './parser';
import {
  defaultSettings,
  type Session,
  type InventoryRecord,
  type Settings,
  type ScanHistory,
} from './models';

export class InventoryDatabase extends Dexie {
  sessions!: Table<Session, string>;
  records!: Table<InventoryRecord, string>;
  settings!: Table<Settings, string>;
  history!: Table<ScanHistory, string>;
  constructor(name = 'almoxarifado-local') {
    super(name);
    this.version(1).stores({
      sessions: 'id, updatedAt, status',
      records: 'id, sessionId, [sessionId+order], [sessionId+code+address]',
      settings: 'id',
      history: 'id, sessionId, [sessionId+timestamp]',
    });
    this.version(2)
      .stores({})
      .upgrade(async (transaction) => {
        const table = transaction.table<Settings, string>('settings');
        const settings = await table.get('main');
        if (settings) await table.put(upgradeLegacySettings(settings));
      });
    this.version(3)
      .stores({})
      .upgrade(async (transaction) => {
        const table = transaction.table<Settings, string>('settings');
        const settings = await table.get('main');
        if (settings) await table.put(upgradeLegacySettings(settings));
      });
    this.version(4)
      .stores({})
      .upgrade(async (transaction) => {
        const table = transaction.table<Settings, string>('settings');
        const settings = await table.get('main');
        if (settings && !settings.cameraCapture)
          await table.put({ ...settings, cameraCapture: 'button' });
      });
    this.version(5)
      .stores({})
      .upgrade(async (transaction) => {
        const table = transaction.table<Settings, string>('settings');
        const settings = await table.get('main');
        if (settings) await table.put(upgradeLegacySettings(settings));
      });
    this.version(6)
      .stores({})
      .upgrade(async (transaction) => {
        await transaction
          .table<Settings, string>('settings')
          .toCollection()
          .modify((settings) => {
            settings.readDescription ??= false;
            settings.autoGalao ??= false;
          });
        await transaction
          .table<Session, string>('sessions')
          .toCollection()
          .modify((session) => {
            session.activeGalao ??= '';
          });
      });
  }
}
export const db = new InventoryDatabase();
export async function initializeDatabase() {
  await db.open();
  if (!(await db.settings.get('main')))
    await db.settings.put(structuredClone(defaultSettings));
}
export async function createSession(name: string, mode: Settings['mode']) {
  if (!name.trim() || name.trim().length > 100)
    throw new Error('Informe um nome com até 100 caracteres.');
  const now = Date.now();
  const session: Session = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    status: 'active',
    notes: '',
    count: 0,
    nextOrder: 1,
    activeAddress: '',
    activeGalao: '',
    mode,
    pending: null,
    completedAddresses: [],
  };
  await db.sessions.add(session);
  return session;
}
export async function updateSession(
  id: string,
  changes: Partial<
    Pick<Session, 'name' | 'notes' | 'status' | 'mode' | 'completedAddresses'>
  >,
) {
  if (
    changes.name !== undefined &&
    (!changes.name.trim() || changes.name.length > 100)
  )
    throw new Error('Nome inválido.');
  await db.sessions.update(id, {
    ...changes,
    ...(changes.mode ? { pending: null } : {}),
    updatedAt: Date.now(),
  });
}
export async function deleteSession(id: string) {
  await db.transaction('rw', db.sessions, db.records, db.history, async () => {
    await db.records.where('sessionId').equals(id).delete();
    await db.history.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}
export async function duplicateSession(id: string) {
  return db.transaction('rw', db.sessions, db.records, async () => {
    const original = await db.sessions.get(id);
    if (!original) throw new Error('Levantamento não encontrado.');
    const copy = await createSession(
      `${original.name.slice(0, 90)} (cópia)`,
      original.mode,
    );
    const records = await db.records.where('sessionId').equals(id).toArray();
    await db.records.bulkAdd(
      records.map((r) => ({
        ...r,
        id: crypto.randomUUID(),
        sessionId: copy.id,
      })),
    );
    await db.sessions.update(copy.id, {
      count: records.length,
      nextOrder: original.nextOrder,
      notes: original.notes,
      activeAddress: original.activeAddress,
    });
    return copy;
  });
}
export async function removeRecords(sessionId: string, ids: string[]) {
  return db.transaction('rw', db.sessions, db.records, async () => {
    const records = (await db.records.bulkGet(ids)).filter(
      (r): r is InventoryRecord => !!r && r.sessionId === sessionId,
    );
    await db.records.bulkDelete(records.map((r) => r.id));
    await renumberBombonas(sessionId);
    await db.sessions.update(sessionId, {
      count: await db.records.where('sessionId').equals(sessionId).count(),
      updatedAt: Date.now(),
    });
    return records;
  });
}
export async function restoreRecords(records: InventoryRecord[]) {
  if (!records.length) return;
  await db.transaction('rw', db.records, db.sessions, async () => {
    const session = await db.sessions.get(records[0].sessionId);
    if (!session) throw new Error('O levantamento foi excluído.');
    for (const record of records)
      if (!(await db.records.get(record.id))) await db.records.add(record);
    await renumberBombonas(session.id);
    await db.sessions.update(session.id, {
      count: await db.records.where('sessionId').equals(session.id).count(),
      updatedAt: Date.now(),
    });
  });
}
export async function clearAllData() {
  await db.transaction(
    'rw',
    db.sessions,
    db.records,
    db.settings,
    db.history,
    async () => {
      await Promise.all([
        db.sessions.clear(),
        db.records.clear(),
        db.history.clear(),
        db.settings.clear(),
      ]);
      await db.settings.put(structuredClone(defaultSettings));
    },
  );
}
export function bombonaLabel(street: string, index: number) {
  return `${street}G${String(index).padStart(2, '0')}`;
}
/**
 * Automatic bombonas are numbered per street in reading order (R14G01,
 * R14G02…). Removing or moving records keeps each street contiguous.
 */
export async function renumberBombonas(sessionId: string) {
  const rows = await db.records
    .where('sessionId')
    .equals(sessionId)
    .sortBy('order');
  const groups = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (!row.galaoGroup) continue;
    const street = extractStreet(row.address);
    const streetGroups = groups.get(street) ?? new Map<string, string>();
    groups.set(street, streetGroups);
    if (!streetGroups.has(row.galaoGroup))
      streetGroups.set(
        row.galaoGroup,
        bombonaLabel(street, streetGroups.size + 1),
      );
    const galao = streetGroups.get(row.galaoGroup)!;
    if (row.galao !== galao) await db.records.update(row.id, { galao });
  }
}
