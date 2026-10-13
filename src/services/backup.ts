import { z } from 'zod';
import { db } from '../core/database';
import {
  historySchema,
  recordSchema,
  sessionSchema,
  settingsSchema,
} from '../core/models';
import { validateRules } from '../core/parser';
import { upgradeLegacySettings, withFixedRules } from '../core/settings';

export const backupSchema = z.object({
  format: z.literal('almoxarifado-backup'),
  version: z.literal(1),
  exportedAt: z.string(),
  sessions: z.array(sessionSchema).max(10000),
  records: z.array(recordSchema).max(1000000),
  settings: settingsSchema,
  history: z.array(historySchema).max(1000000),
});
export type Backup = z.infer<typeof backupSchema>;
export async function createBackup(): Promise<Backup> {
  return db.transaction(
    'r',
    db.sessions,
    db.records,
    db.settings,
    db.history,
    async () => ({
      format: 'almoxarifado-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: await db.sessions.toArray(),
      records: await db.records.toArray(),
      settings: (await db.settings.get('main'))!,
      history: await db.history.toArray(),
    }),
  );
}
export function validateBackup(input: unknown): Backup {
  const result = backupSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      'Backup inválido ou de versão não suportada. Nenhum dado foi alterado.',
    );
  const backup = result.data;
  validateRules(backup.settings.rules);
  const sessionIds = new Set(backup.sessions.map((s) => s.id));
  if (
    sessionIds.size !== backup.sessions.length ||
    new Set(backup.records.map((r) => r.id)).size !== backup.records.length ||
    new Set(backup.history.map((r) => r.id)).size !== backup.history.length
  )
    throw new Error('Backup contém identificadores repetidos.');
  if (
    [...backup.records, ...backup.history].some(
      (r) => !sessionIds.has(r.sessionId),
    )
  )
    throw new Error('Backup contém registros sem levantamento.');
  if (
    backup.records.some(
      (r) =>
        !/^[A-Z0-9._/-]+$/.test(r.code) || !/^[A-Z0-9._/-]+$/.test(r.address),
    )
  )
    throw new Error('Backup contém códigos ou endereços não normalizados.');
  return backup;
}
export async function importBackup(input: unknown, restoreSettings: boolean) {
  const backup = validateBackup(input);
  await db.transaction(
    'rw',
    db.sessions,
    db.records,
    db.settings,
    db.history,
    async () => {
      const mapping = new Map(
        backup.sessions.map((s) => [s.id, crypto.randomUUID()]),
      );
      for (const session of backup.sessions) {
        const rows = backup.records.filter((r) => r.sessionId === session.id);
        await db.sessions.add({
          ...session,
          id: mapping.get(session.id)!,
          name: `${session.name.slice(0, 85)} (restaurado)`,
          count: rows.length,
          nextOrder: rows.reduce((max, r) => Math.max(max, r.order + 1), 1),
        });
      }
      await db.records.bulkAdd(
        backup.records.map((r) => ({
          ...r,
          id: crypto.randomUUID(),
          sessionId: mapping.get(r.sessionId)!,
        })),
      );
      await db.history.bulkAdd(
        backup.history.map((h) => ({
          ...h,
          id: crypto.randomUUID(),
          sessionId: mapping.get(h.sessionId)!,
        })),
      );
      if (restoreSettings)
        await db.settings.put(
          withFixedRules(upgradeLegacySettings(backup.settings)),
        );
    },
  );
  return backup.sessions.length;
}
