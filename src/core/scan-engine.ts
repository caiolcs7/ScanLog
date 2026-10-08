import { bombonaLabel, bombonaNumbers, db, renumberBombonas } from './database';
import type { InventoryRecord, Session, Settings, Source } from './models';
import { extractStreet, normalizeGalao, parseGalao, parseScan } from './parser';
import { catalogWeight } from './weight';

export type DuplicateCandidate = {
  code: string;
  address: string;
  source: Source;
  raw?: string;
  sessionId: string;
  paired: boolean;
  /** Automatic bombonas: keep the previous record's bombona. */
  sameGalao?: boolean;
  /** Automatic bombonas: the next bombona jumps to this number. */
  galaoJump?: number;
};
export type ScanResult = {
  kind:
    | 'address'
    | 'galao'
    | 'product'
    | 'waiting'
    | 'error'
    | 'duplicate'
    | 'address-change';
  message: string;
  value?: string;
  record?: InventoryRecord;
  duplicate?: DuplicateCandidate;
  addressChange?: AddressChangeCandidate;
};
export type AddressChangeCandidate = {
  sessionId: string;
  raw: string;
  source: Source;
  from: string;
  to: string;
  mode: Session['mode'];
  pending: Session['pending'];
};
export function pairTransition(
  session: Session,
  type: 'address' | 'product',
  value: string,
  source: Source,
  raw?: string,
) {
  if (session.mode === 'fixed')
    return type === 'address'
      ? { address: value }
      : session.activeAddress
        ? { pair: { code: value, address: session.activeAddress, source, raw } }
        : { error: 'Leia um endereço antes de adicionar produtos.' };
  const first = session.mode === 'product-address' ? 'product' : 'address';
  if (!session.pending)
    return type === first
      ? { pending: { type, value, source, raw } }
      : {
          error: `Aguardando ${first === 'product' ? 'produto' : 'endereço'} para iniciar o par.`,
        };
  if (type === session.pending.type)
    return {
      error: `Aguardando ${type === 'product' ? 'endereço' : 'produto'}. Conclua ou cancele o par atual.`,
    };
  return {
    pair: {
      code: type === 'product' ? value : session.pending.value,
      address: type === 'address' ? value : session.pending.value,
      source: type === 'product' ? source : session.pending.source,
      raw: type === 'product' ? raw : session.pending.raw,
    },
  };
}
export async function appendRecord(
  candidate: DuplicateCandidate,
  settings: Settings,
  force = false,
): Promise<ScanResult> {
  const session = await db.sessions.get(candidate.sessionId);
  if (!session || session.status === 'archived')
    throw new Error('Abra um levantamento ativo para registrar.');
  if (
    settings.duplicates &&
    !force &&
    candidate.code !== 'VAZIO' &&
    (await db.records
      .where('[sessionId+code+address]')
      .equals([session.id, candidate.code, candidate.address])
      .count())
  )
    return {
      kind: 'duplicate',
      message: 'Este item já foi registrado neste endereço.',
      duplicate: candidate,
    };
  const bombona = settings.autoGalao
    ? await nextBombona(
        session.id,
        candidate.address,
        !!candidate.sameGalao,
        settings.galaoStart ?? 1,
        candidate.galaoJump,
      )
    : null;
  const galao = bombona?.galao ?? session.activeGalao;
  const weight = session.weighted ? catalogWeight(candidate.code) : undefined;
  const record: InventoryRecord = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    code: candidate.code,
    address: candidate.address,
    timestamp: Date.now(),
    order: session.nextOrder,
    source: candidate.source,
    ...(galao ? { galao } : {}),
    ...(bombona ? { galaoGroup: bombona.group } : {}),
    ...(bombona?.jump ? { galaoJump: bombona.jump } : {}),
    ...(settings.saveRaw && candidate.raw ? { rawScan: candidate.raw } : {}),
    ...(weight ? { weight } : {}),
  };
  await db.records.add(record);
  await db.sessions.update(session.id, {
    count: session.count + 1,
    nextOrder: session.nextOrder + 1,
    updatedAt: Date.now(),
    status: 'active',
    ...(candidate.paired
      ? { pending: null, activeAddress: candidate.address }
      : {}),
  });
  return {
    kind: 'product',
    message: 'Produto registrado',
    value: record.code,
    record,
  };
}
async function history(
  sessionId: string,
  source: Source,
  raw: string,
  normalized: string,
  outcome: string,
  settings: Settings,
) {
  await db.history.add({
    id: crypto.randomUUID(),
    sessionId,
    source,
    timestamp: Date.now(),
    normalized: normalized.slice(0, 128),
    outcome: outcome.slice(0, 240),
    ...(settings.saveRaw ? { raw: raw.slice(0, 2048) } : {}),
  });
}
export async function processScan(
  sessionId: string,
  raw: string,
  source: Source,
  settings: Settings,
  approvedChange?: AddressChangeCandidate,
  options: { sameGalao?: boolean; galaoJump?: number } = {},
): Promise<ScanResult> {
  return db.transaction('rw', db.sessions, db.records, db.history, async () => {
    const session = await db.sessions.get(sessionId);
    if (!session || session.status === 'archived')
      throw new Error('Levantamento indisponível.');
    if (
      approvedChange &&
      (approvedChange.from !== session.activeAddress ||
        approvedChange.mode !== session.mode ||
        JSON.stringify(approvedChange.pending) !==
          JSON.stringify(session.pending))
    )
      throw new Error(
        'O levantamento mudou durante a confirmação. Cancele e leia o endereço novamente.',
      );
    const galao = parseGalao(raw);
    if (galao) {
      await db.sessions.update(sessionId, {
        activeGalao: galao,
        updatedAt: Date.now(),
      });
      const message =
        session.activeGalao && session.activeGalao !== galao
          ? `Galão alterado: ${session.activeGalao} → ${galao}`
          : 'Galão selecionado';
      await history(sessionId, source, raw, galao, message, settings);
      return { kind: 'galao', message, value: galao };
    }
    const scan = parseScan(raw, settings.rules);
    let result: ScanResult;
    if (!scan.valid || scan.type === 'unknown')
      result = { kind: 'error', message: scan.error ?? 'Código inválido.' };
    else {
      const transition = pairTransition(
        session,
        scan.type,
        scan.normalized,
        source,
        settings.saveRaw ? raw : undefined,
      );
      if (transition.error)
        result = { kind: 'error', message: transition.error };
      else if (
        scan.type === 'address' &&
        session.activeAddress &&
        session.activeAddress !== scan.normalized &&
        !(
          approvedChange?.to === scan.normalized &&
          approvedChange.sessionId === sessionId
        )
      ) {
        result = {
          kind: 'address-change',
          message: 'Confirme a troca de endereço para continuar.',
          addressChange: {
            sessionId,
            raw,
            source,
            from: session.activeAddress,
            to: scan.normalized,
            mode: session.mode,
            pending: session.pending,
          },
        };
      } else if (transition.address) {
        await db.sessions.update(sessionId, {
          activeAddress: transition.address,
          updatedAt: Date.now(),
        });
        result = {
          kind: 'address',
          message:
            session.activeAddress &&
            session.activeAddress !== transition.address
              ? `Endereço alterado: ${session.activeAddress} → ${transition.address}`
              : 'Endereço selecionado',
          value: transition.address,
        };
      } else if (transition.pending) {
        await db.sessions.update(sessionId, {
          pending: transition.pending,
          updatedAt: Date.now(),
        });
        result = {
          kind: 'waiting',
          message: `Agora leia ${scan.type === 'product' ? 'o endereço' : 'o produto'}.`,
          value: scan.normalized,
        };
      } else if (transition.pair)
        result = await appendRecord(
          {
            ...transition.pair,
            sessionId,
            paired: session.mode !== 'fixed',
            sameGalao: options.sameGalao,
            galaoJump: options.galaoJump,
          },
          settings,
        );
      else throw new Error('Não foi possível associar a leitura.');
      if (scan.warnings.length)
        result.message += ` · ${scan.warnings.join(' ')}`;
    }
    await history(
      sessionId,
      source,
      raw,
      scan.normalized,
      result.message,
      settings,
    );
    return result;
  });
}
export async function confirmDuplicate(
  candidate: DuplicateCandidate,
  settings: Settings,
) {
  return db.transaction('rw', db.sessions, db.records, db.history, async () => {
    const result = await appendRecord(candidate, settings, true);
    await history(
      candidate.sessionId,
      candidate.source,
      candidate.raw ?? candidate.code,
      candidate.code,
      'Repetição adicionada pelo operador',
      settings,
    );
    return result;
  });
}
export async function addManual(
  sessionId: string,
  code: string,
  address: string,
  settings: Settings,
) {
  const specialCode =
    code === 'SEM CODIGO' || code === 'VAZIO' ? code : undefined;
  const product = specialCode ? undefined : parseScan(code, settings.rules),
    location = parseScan(address, settings.rules);
  if (product && (product.type !== 'product' || !product.valid))
    throw new Error(product.error ?? 'Informe um código de produto válido.');
  if (location.type !== 'address' || !location.valid)
    throw new Error(location.error ?? 'Informe um endereço válido.');
  return db.transaction('rw', db.sessions, db.records, db.history, async () => {
    const result = await appendRecord(
      {
        sessionId,
        code: specialCode ?? product!.normalized,
        address: location.normalized,
        source: 'manual',
        raw: code,
        paired: false,
      },
      settings,
    );
    await history(
      sessionId,
      'manual',
      code,
      specialCode ?? product!.normalized,
      result.message,
      settings,
    );
    return result;
  });
}
export async function editRecords(
  sessionId: string,
  ids: string[],
  address: string,
  settings: Settings,
  code?: string,
  galao?: string,
) {
  const galaoValue = galao === undefined ? undefined : normalizeGalao(galao);
  const location = parseScan(address, settings.rules),
    product = code === undefined ? undefined : parseScan(code, settings.rules);
  if (location.type !== 'address' || !location.valid)
    throw new Error('Endereço fora do padrão configurado.');
  if (product && (product.type !== 'product' || !product.valid))
    throw new Error('Código fora do padrão configurado.');
  await db.transaction('rw', db.sessions, db.records, db.settings, async () => {
    for (const id of ids) {
      const row = await db.records.get(id);
      if (row?.sessionId === sessionId)
        await db.records.update(id, {
          address: location.normalized,
          source: 'manual',
          ...(product ? { code: product.normalized } : {}),
          ...(galaoValue !== undefined
            ? { galao: galaoValue || undefined, galaoGroup: undefined }
            : {}),
        });
    }
    await renumberBombonas(sessionId);
    await db.sessions.update(sessionId, { updatedAt: Date.now() });
  });
}
export async function setActiveGalao(sessionId: string, raw: string) {
  const activeGalao = normalizeGalao(raw);
  await db.sessions.update(sessionId, { activeGalao, updatedAt: Date.now() });
  return activeGalao;
}
export async function setRecordDescription(id: string, description: string) {
  const value = description.trim().slice(0, 300);
  if (value) await db.records.update(id, { description: value });
}
/** Next automatic bombona for the street of an address (or the current one). */
export async function nextBombona(
  sessionId: string,
  address: string,
  same: boolean,
  start = 1,
  jump?: number,
) {
  const street = extractStreet(address);
  if (street === 'Sem rua') return null;
  const rows = (
    await db.records.where('sessionId').equals(sessionId).sortBy('order')
  ).filter((r) => r.galaoGroup && extractStreet(r.address) === street);
  const last = rows.at(-1);
  if (same && last?.galaoGroup && last.galao)
    return { galao: last.galao, group: last.galaoGroup, jump: undefined };
  const n = nextBombonaNumber(rows, street, start, jump);
  return {
    galao: bombonaLabel(street, n),
    group: crypto.randomUUID(),
    jump: jump === n ? jump : undefined,
  };
}
/** Number of the next new bombona of a street, honoring a requested jump. */
export function nextBombonaNumber(
  rows: InventoryRecord[],
  street: string,
  start = 1,
  jump?: number,
) {
  const next = (bombonaNumbers(rows, start).last.get(street) ?? start - 1) + 1;
  return Math.max(jump ?? 0, next);
}
