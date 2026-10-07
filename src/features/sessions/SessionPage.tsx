import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ClipboardList,
  MapPin,
  Container,
  PencilLine,
  ScanLine,
  Undo2,
  AlertTriangle,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  db,
  bombonaLabel,
  removeRecords,
  renumberBombonas,
  restoreRecords,
  updateSession,
} from '../../core/database';
import type {
  InventoryRecord,
  Session,
  Settings,
  Source,
} from '../../core/models';
import {
  confirmDuplicate,
  nextBombonaNumber,
  processScan,
  setActiveGalao,
  setRecordDescription,
  type DuplicateCandidate,
  type ScanResult,
  type AddressChangeCandidate,
} from '../../core/scan-engine';
import { statistics } from '../../core/statistics';
import { extractStreet } from '../../core/parser';
import {
  errorMessage,
  ExcelIcon,
  Loading,
  Modal,
  navigate,
  useNotice,
  useTask,
} from '../../components/ui';
import { ScannerPanel } from '../scanner/ScannerPanel';
import { ManualDialog } from '../scanner/ManualDialog';
import { ExportDialog } from '../export/ExportDialog';
import { RecordsView } from '../records/RecordsView';
import { feedback } from '../../services/feedback';
import { discardFrame, readDescription } from '../../services/ocr';

export function SessionPage({
  id,
  view,
  settings,
}: {
  id: string;
  view: string;
  settings: Settings;
}) {
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const records = useLiveQuery(
    () => db.records.where('sessionId').equals(id).sortBy('order'),
    [id],
  );
  const [manual, setManual] = useState(false),
    [exporting, setExporting] = useState(false),
    [finishing, setFinishing] = useState(false),
    [last, setLast] = useState<ScanResult | null>(null),
    [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null),
    [addressChange, setAddressChange] = useState<AddressChangeCandidate | null>(
      null,
    ),
    [resolvingAddress, setResolvingAddress] = useState(false),
    [resolvingDuplicate, setResolvingDuplicate] = useState(false),
    [readingText, setReadingText] = useState(''),
    [editingGalao, setEditingGalao] = useState(false);
  const pendingDuplicate = useRef<DuplicateCandidate | null>(null),
    pendingAddress = useRef<AddressChangeCandidate | null>(null),
    addressLock = useRef(false),
    scanQueue = useRef(Promise.resolve()),
    duplicateLock = useRef(false),
    sameGalaoRef = useRef(false),
    galaoJumpRef = useRef(0);
  const [sameGalao, setSameGalaoState] = useState(false),
    [galaoJump, setGalaoJumpState] = useState(0);
  function setGalaoJump(value: number) {
    galaoJumpRef.current = value;
    setGalaoJumpState(value);
  }
  function setSameGalao(value: boolean) {
    sameGalaoRef.current = value;
    setSameGalaoState(value);
    if (value) setGalaoJump(0);
  }
  const notice = useNotice(),
    task = useTask();
  const blocked =
    manual || exporting || finishing || !!duplicate || !!addressChange;
  function result(scan: ScanResult) {
    setLast(scan);
    feedback(scan.kind, settings);
    if (scan.record) setGalaoJump(0);
    if (scan.duplicate) {
      pendingDuplicate.current = scan.duplicate;
      setDuplicate(scan.duplicate);
    }
    if (scan.addressChange) {
      pendingAddress.current = scan.addressChange;
      setAddressChange(scan.addressChange);
    }
  }
  function describe(record: InventoryRecord, frame: HTMLCanvasElement) {
    setReadingText(record.id);
    void readDescription(frame, record.code)
      .then(async (text) => {
        if (!text) {
          notice('Descritivo não identificado. Enquadre a etiqueta inteira.');
          return;
        }
        await setRecordDescription(record.id, text);
        setLast((current) =>
          current?.record?.id === record.id
            ? { ...current, record: { ...current.record, description: text } }
            : current,
        );
      })
      .catch(() => notice('Leitura do descritivo indisponível.', 'error'))
      .finally(() =>
        setReadingText((current) => (current === record.id ? '' : current)),
      );
  }
  async function receive(
    raw: string,
    source: Source,
    frame?: HTMLCanvasElement,
  ) {
    scanQueue.current = scanQueue.current.then(async () => {
      if (pendingDuplicate.current || pendingAddress.current) {
        discardFrame(frame);
        notice(
          'Leitura pausada: resolva a confirmação e leia a próxima etiqueta novamente.',
        );
        return;
      }
      try {
        const scan = await processScan(id, raw, source, settings, undefined, {
          sameGalao: settings.autoGalao && sameGalaoRef.current,
          galaoJump: (settings.autoGalao && galaoJumpRef.current) || undefined,
        });
        result(scan);
        if (frame && scan.kind === 'product' && scan.record)
          describe(scan.record, frame);
        else discardFrame(frame);
      } catch (error) {
        discardFrame(frame);
        notice(errorMessage(error), 'error');
      }
    });
    await scanQueue.current;
  }
  async function resolveAddress(confirm: boolean) {
    const candidate = pendingAddress.current;
    if (!candidate || addressLock.current) return;
    addressLock.current = true;
    setResolvingAddress(true);
    try {
      if (confirm)
        result(
          await processScan(
            id,
            candidate.raw,
            candidate.source,
            settings,
            candidate,
          ),
        );
      else
        setLast({
          kind: 'waiting',
          message: 'Troca cancelada. Endereço mantido.',
          value: candidate.from,
        });
      pendingAddress.current = null;
      setAddressChange(null);
    } finally {
      addressLock.current = false;
      setResolvingAddress(false);
    }
  }
  async function resolveRepeat(add: boolean) {
    const candidate = pendingDuplicate.current;
    if (!candidate || duplicateLock.current) return;
    duplicateLock.current = true;
    setResolvingDuplicate(true);
    try {
      if (add) result(await confirmDuplicate(candidate, settings));
      else {
        if (candidate.paired)
          await db.sessions.update(id, {
            pending: null,
            updatedAt: Date.now(),
          });
        setLast({
          kind: 'waiting',
          message: 'Repetição ignorada. Continue a leitura.',
        });
      }
      pendingDuplicate.current = null;
      setDuplicate(null);
    } finally {
      duplicateLock.current = false;
      setResolvingDuplicate(false);
    }
  }
  async function undo() {
    if (session?.status === 'archived') {
      notice('Desarquive o levantamento antes de editar.');
      return;
    }
    const latest = await db.records
      .where('[sessionId+order]')
      .between([id, 0], [id, Infinity])
      .last();
    if (!latest) {
      notice('Nenhum registro para desfazer.');
      return;
    }
    const removed = await removeRecords(id, [latest.id]);
    notice('Último registro removido.', 'info', {
      label: 'Restaurar',
      run: () => void task(() => restoreRecords(removed)),
    });
  }
  const actions = useRef({ undo, export: () => setExporting(true) });
  actions.current = { undo, export: () => setExporting(true) };
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable]',
        ) ||
        document.querySelector('dialog[open]')
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void actions.current.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        actions.current.export();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        navigate(`/session/${id}/records`);
        setTimeout(
          () =>
            document.querySelector<HTMLInputElement>('#record-search')?.focus(),
          100,
        );
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [id]);
  if (!records) return <Loading />;
  if (!session)
    return (
      <main className="page">
        <h1>Levantamento não encontrado</h1>
        <p>Ele pode ter sido excluído neste dispositivo.</p>
        <button onClick={() => navigate('/')}>
          <ArrowLeft />
          Voltar aos levantamentos
        </button>
      </main>
    );
  const stats = statistics(records),
    currentCount = records.filter(
      (r) => r.address === session.activeAddress,
    ).length,
    bombona = settings.autoGalao
      ? nextBombonaPreview(
          records,
          session.activeAddress,
          sameGalao,
          settings.galaoStart ?? 1,
          galaoJump,
        )
      : null,
    galaoCount = session.activeGalao
      ? records.filter((r) => r.galao === session.activeGalao).length
      : 0;
  const scanner = view !== 'records' && session.status !== 'archived';
  return (
    <main className="session-page page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft />
        Levantamentos
      </button>
      <div className="page-heading session-heading">
        <div>
          <h1>{session.name}</h1>
          <p>
            {stats.total} registros <span>·</span> {stats.addresses} endereços{' '}
            <span>·</span> {stats.streets} ruas
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="btn-sheet"
            aria-label="Exportar levantamento"
            onClick={() => setExporting(true)}
          >
            <ExcelIcon />
            <span>Exportar</span>
          </button>
          <button
            className="primary"
            aria-label="Finalizar levantamento"
            disabled={session.status === 'archived'}
            onClick={() => setFinishing(true)}
          >
            <CheckCheck />
            <span>Finalizar</span>
          </button>
        </div>
      </div>
      <div className="session-tabs tabs">
        <button
          className={scanner ? 'selected' : ''}
          disabled={session.status === 'archived'}
          onClick={() => navigate(`/session/${id}/scanner`)}
        >
          <ScanLine />
          Leitura
        </button>
        <button
          className={!scanner ? 'selected' : ''}
          onClick={() => navigate(`/session/${id}/records`)}
        >
          <ClipboardList />
          Registros <span>{records.length}</span>
        </button>
        <span className="saved-indicator">
          <Check />
          Salvo no dispositivo
        </span>
      </div>
      {scanner ? (
        <>
          <div className="workspace">
            <div className="active-address">
              <div className="address-heading">
                <span>
                  <MapPin />
                  Endereço atual
                </span>
                {session.activeAddress && (
                  <button
                    className="icon-button"
                    aria-label="Marcar endereço como concluído"
                    aria-pressed={session.completedAddresses.includes(
                      session.activeAddress,
                    )}
                    onClick={() =>
                      void task(() =>
                        updateSession(id, {
                          completedAddresses:
                            session.completedAddresses.includes(
                              session.activeAddress,
                            )
                              ? session.completedAddresses.filter(
                                  (a) => a !== session.activeAddress,
                                )
                              : [
                                  ...session.completedAddresses,
                                  session.activeAddress,
                                ],
                        }),
                      )
                    }
                  >
                    <CheckCircle2 />
                  </button>
                )}
              </div>
              <strong
                className={`address-value mono ${!session.activeAddress ? 'no-address' : ''}`}
              >
                {session.activeAddress || 'Leia um endereço'}
              </strong>
              <div className="address-detail">
                <span>
                  {session.activeAddress
                    ? `${currentCount} itens neste endereço`
                    : 'Depois, leia os produtos desta posição.'}
                </span>
                {session.completedAddresses.includes(session.activeAddress) && (
                  <span className="completed-label">
                    <Check />
                    Concluído
                  </span>
                )}
              </div>
              <div className="bombona-switch">
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings.autoGalao}
                    disabled={blocked}
                    onChange={(e) => {
                      const autoGalao = e.target.checked;
                      setSameGalao(false);
                      void task(() =>
                        db.settings.update('main', { autoGalao }),
                      );
                    }}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  Bombonas automáticas
                </label>
                {settings.autoGalao && (
                  <label className="bombona-start">
                    Começar em G
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      value={settings.galaoStart ?? 1}
                      onChange={(e) => {
                        const galaoStart = Math.min(
                          999,
                          Math.max(1, Math.trunc(Number(e.target.value)) || 1),
                        );
                        void task(async () => {
                          await db.settings.update('main', { galaoStart });
                          await db.transaction(
                            'rw',
                            db.records,
                            db.settings,
                            () => renumberBombonas(id),
                          );
                        });
                      }}
                    />
                  </label>
                )}
              </div>
              {bombona !== null ? (
                <div className="galao-bar">
                  <span className="galao-label">
                    <Container />
                    {sameGalao
                      ? 'Mesmo galão'
                      : galaoJump
                        ? 'Próximo galão (salto)'
                        : 'Próximo galão'}
                  </span>
                  <strong
                    className={`galao-value mono ${bombona ? '' : 'empty'}`}
                  >
                    {bombona || 'Leia um endereço'}
                  </strong>
                  <label className="galao-jump">
                    Pular para G
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      className="mono"
                      placeholder="—"
                      value={galaoJump || ''}
                      disabled={blocked}
                      aria-label="Pular o próximo galão para o número"
                      onChange={(e) => {
                        const value = Math.min(
                          999,
                          Math.max(0, Math.trunc(Number(e.target.value)) || 0),
                        );
                        if (value) setSameGalao(false);
                        setGalaoJump(value);
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div className="galao-bar">
                  <span className="galao-label">
                    <Container />
                    Galão
                  </span>
                  {editingGalao ? (
                    <form
                      className="galao-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = new FormData(e.currentTarget).get(
                          'galao',
                        );
                        void task(async () => {
                          await setActiveGalao(id, String(value ?? ''));
                          setEditingGalao(false);
                        });
                      }}
                    >
                      <input
                        name="galao"
                        aria-label="Galão atual"
                        className="mono"
                        autoFocus
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={32}
                        placeholder="Ex.: R16G01"
                        defaultValue={session.activeGalao}
                      />
                      <button className="primary" aria-label="Salvar galão">
                        <Check />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Cancelar galão"
                        onClick={() => setEditingGalao(false)}
                      >
                        <X />
                      </button>
                    </form>
                  ) : (
                    <>
                      <strong
                        className={`galao-value mono ${session.activeGalao ? '' : 'empty'}`}
                      >
                        {session.activeGalao || 'Nenhum'}
                      </strong>
                      {session.activeGalao && (
                        <span className="galao-count">{galaoCount} itens</span>
                      )}
                      <button
                        className="text-button"
                        disabled={blocked}
                        onClick={() => setEditingGalao(true)}
                      >
                        {session.activeGalao ? 'Trocar' : 'Definir'}
                      </button>
                      {session.activeGalao && (
                        <button
                          className="icon-button"
                          aria-label="Remover galão"
                          disabled={blocked}
                          onClick={() =>
                            void task(() => setActiveGalao(id, ''))
                          }
                        >
                          <X />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="mode-select">
                <label htmlFor="session-mode">Modo de leitura</label>
                <select
                  id="session-mode"
                  value={session.mode}
                  disabled={blocked}
                  onChange={(e) =>
                    void task(() =>
                      updateSession(id, {
                        mode: e.target.value as Session['mode'],
                      }),
                    )
                  }
                >
                  <option value="fixed">Endereço fixo</option>
                  <option value="product-address">
                    Pareado · produto → endereço
                  </option>
                  <option value="address-product">
                    Pareado · endereço → produto
                  </option>
                </select>
              </div>
              {session.mode !== 'fixed' && (
                <div className="pair-status">
                  <strong>{expected(session)}</strong>
                  {session.pending && (
                    <>
                      <code>{session.pending.value}</code>
                      <button
                        onClick={() =>
                          void task(() =>
                            db.sessions.update(id, {
                              pending: null,
                              updatedAt: Date.now(),
                            }),
                          )
                        }
                      >
                        <X />
                        Cancelar par
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="operation-feedback">
              <div
                className={`scan-feedback ${last?.kind ?? 'ready'}`}
                role="status"
                aria-live="polite"
              >
                {last?.kind === 'error' ? (
                  <AlertTriangle />
                ) : last?.kind === 'product' ? (
                  <CheckCircle2 />
                ) : (
                  <ScanLine />
                )}
                <div>
                  <strong>
                    {last?.message ?? 'Seu levantamento está pronto'}
                  </strong>
                  {last?.value ? (
                    <code>{last.value}</code>
                  ) : (
                    <p>
                      Leia o endereço, o galão (opcional) e depois os produtos.
                    </p>
                  )}
                  {last?.record && (
                    <span className="mono">
                      {last.record.address}
                      {last.record.galao ? ` · ${last.record.galao}` : ''}
                    </span>
                  )}
                  {last?.record?.description ? (
                    <span className="feedback-description">
                      {last.record.description}
                    </span>
                  ) : (
                    readingText &&
                    last?.record?.id === readingText && (
                      <span className="feedback-description reading">
                        Lendo descritivo…
                      </span>
                    )
                  )}
                </div>
              </div>
              {duplicate && (
                <div className="duplicate-warning" role="alert">
                  <strong>Este item já foi registrado neste endereço.</strong>
                  <code>{duplicate.code}</code>
                  <code>{duplicate.address}</code>
                  <div>
                    <button
                      disabled={resolvingDuplicate}
                      onClick={() => void task(() => resolveRepeat(false))}
                    >
                      Ignorar
                    </button>
                    <button
                      className="primary"
                      disabled={resolvingDuplicate}
                      onClick={() => void task(() => resolveRepeat(true))}
                    >
                      Adicionar novamente
                    </button>
                  </div>
                </div>
              )}
            </div>
            <ScannerPanel
              settings={settings}
              blocked={blocked}
              onScan={receive}
              sameGalao={
                settings.autoGalao
                  ? { active: sameGalao, set: setSameGalao }
                  : undefined
              }
            />
            <div className="scan-side">
              <div className="quick-actions">
                <button onClick={() => setManual(true)} disabled={blocked}>
                  <PencilLine />
                  Entrada manual
                </button>
                <button
                  onClick={() => void task(undo)}
                  disabled={!records.length}
                >
                  <Undo2 />
                  Desfazer
                </button>
              </div>
              <div className="recent-scans">
                <div className="section-heading">
                  <h2>Últimos registros</h2>
                  <span>{records.length} no total</span>
                </div>
                {records.length ? (
                  <ol>
                    {records
                      .slice(-4)
                      .reverse()
                      .map((record) => (
                        <li key={record.id}>
                          <Check />
                          <div>
                            <code>{record.code}</code>
                            <span className="mono">
                              {record.address}
                              {record.galao ? ` · ${record.galao}` : ''}
                            </span>
                            {record.description && (
                              <span className="recent-description">
                                {record.description}
                              </span>
                            )}
                          </div>
                          <span className="scan-order">
                            {record.order.toString().padStart(2, '0')}
                          </span>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="recent-empty">
                    Os produtos aparecem aqui assim que forem registrados.
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() => navigate(`/session/${id}/records`)}
                >
                  Ver todos os registros
                  <ClipboardList />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <RecordsView session={session} records={records} settings={settings} />
      )}
      {manual && (
        <ManualDialog
          session={session}
          settings={settings}
          onClose={() => setManual(false)}
          onResult={result}
        />
      )}{' '}
      {addressChange && (
        <Modal
          title="Trocar endereço?"
          onClose={() => {
            if (!addressLock.current) void task(() => resolveAddress(false));
          }}
        >
          <p>
            As leituras estão pausadas. Confirme a posição antes de continuar.
          </p>
          <div className="address-change-codes">
            <div>
              <span>Endereço atual</span>
              <code>{addressChange.from}</code>
            </div>
            <div>
              <span>Novo endereço</span>
              <code>{addressChange.to}</code>
            </div>
          </div>
          <p className="helper">
            Os registros já salvos mantêm seus endereços.
          </p>
          <div className="modal-actions wrap">
            <button
              disabled={resolvingAddress}
              onClick={() => void task(() => resolveAddress(false))}
            >
              Manter endereço
            </button>
            <button
              className="primary"
              disabled={resolvingAddress}
              onClick={() => void task(() => resolveAddress(true))}
            >
              {resolvingAddress ? 'Salvando…' : 'Confirmar troca'}
            </button>
          </div>
        </Modal>
      )}
      {exporting && (
        <ExportDialog
          session={session}
          defaultFormat={settings.exportFormat}
          onClose={() => setExporting(false)}
        />
      )}{' '}
      {finishing && (
        <Modal
          title="Finalizar levantamento"
          onClose={() => setFinishing(false)}
        >
          <p>Confira o resumo de {session.name}.</p>
          <dl className="finish-stats">
            <div>
              <dt>Produtos registrados</dt>
              <dd>{stats.total}</dd>
            </div>
            <div>
              <dt>Endereços encontrados</dt>
              <dd>{stats.addresses}</dd>
            </div>
            <div>
              <dt>Ruas encontradas</dt>
              <dd>{stats.streets}</dd>
            </div>
            <div>
              <dt>Possíveis duplicados</dt>
              <dd>{stats.duplicates}</dd>
            </div>
          </dl>
          {session.pending && (
            <p className="form-error">
              Há um par incompleto. Conclua ou cancele o par antes de finalizar.
            </p>
          )}
          <div className="modal-actions wrap">
            <button onClick={() => setFinishing(false)}>
              Continuar editando
            </button>
            <button
              className="btn-sheet"
              onClick={() => {
                setFinishing(false);
                setExporting(true);
              }}
            >
              <ExcelIcon />
              Exportar Excel
            </button>
            <button
              className="primary"
              disabled={!!session.pending}
              onClick={() =>
                void task(async () => {
                  await updateSession(id, { status: 'completed' });
                  setFinishing(false);
                  navigate('/');
                  notice('Levantamento concluído e salvo.', 'success');
                })
              }
            >
              <Check />
              Concluir
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function nextBombonaPreview(
  records: InventoryRecord[],
  address: string,
  same: boolean,
  start: number,
  jump: number,
) {
  const street = extractStreet(address);
  if (!address || street === 'Sem rua') return '';
  const rows = records.filter(
    (r) => r.galaoGroup && extractStreet(r.address) === street,
  );
  const last = rows.at(-1);
  if (same && last?.galao) return last.galao;
  return bombonaLabel(
    street,
    nextBombonaNumber(rows, street, start, jump || undefined),
  );
}
function expected(session: Session) {
  const type = session.pending
    ? session.pending.type === 'product'
      ? 'endereço'
      : 'produto'
    : session.mode === 'product-address'
      ? 'produto'
      : 'endereço';
  return `Aguardando ${type}`;
}
