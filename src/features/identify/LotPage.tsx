import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCheck,
  CircleCheck,
  CloudUpload,
  Container,
  Download,
  MapPin,
  Pencil,
  PenLine,
  Plus,
  RefreshCw,
  Scale,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  Confirm,
  ExcelIcon,
  Loading,
  Modal,
  MoreMenu,
  errorMessage,
  navigate,
  useNotice,
  type MenuItem,
} from '../../components/ui';
import { NotFound } from '../notfound/NotFound';
import type { FindItem, Settings } from '../../core/models';
import { itemLabel } from '../../core/identify';
import { formatKg } from '../../core/weight';
import {
  confirmItems,
  deleteItem,
  deleteLot,
  downloadPhoto,
  getLot,
  listItems,
  renameLot,
  returnItem,
  sendLot,
} from '../../cloud/api';
import type { CloudAuth } from '../../cloud/auth';
import {
  useBlobUrls,
  useCloud,
  usePending,
  usePhotoUrls,
} from '../../cloud/hooks';
import { discardEntry } from '../../cloud/outbox';
import {
  itemStatusLabel,
  lotStatusLabel,
  type CloudLot,
  type ItemStatus,
} from '../../cloud/types';
import { compressPhoto } from '../../services/photo';
import { fullDate, mergeItems, pendingLot, type ItemView } from './items';
import { OutboxBanner, saveOrShare } from './shared';
import { FindDialog } from './FindDialog';
import { CodeEntry } from './CodeEntry';

type Signed = Extract<CloudAuth, { status: 'in' }>;
type Filter = 'all' | ItemStatus;

export function WordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-.5 1.5L18.5 8H14a.5.5 0 0 1-.5-.5v-4ZM7.2 11h1.6l1.1 4.6 1.3-4.6h1.6l1.3 4.6 1.1-4.6h1.6l-1.9 7h-1.5L12 13.5 10.6 18H9.1l-1.9-7Z" />
    </svg>
  );
}

export function LotPage({
  id,
  auth,
  settings,
}: {
  id: string;
  auth: Signed;
  settings: Settings;
}) {
  const almox = auth.sector === 'almoxarifado';
  const lotQuery = useCloud(() => getLot(id), [id]),
    itemsQuery = useCloud(() => listItems(id), [id]);
  const pending = usePending(id);
  const notice = useNotice();
  const [editing, setEditing] = useState<ItemView | 'new' | null>(null),
    [deleting, setDeleting] = useState<ItemView | null>(null),
    [returning, setReturning] = useState<ItemView | null>(null),
    [coding, setCoding] = useState<string | null>(null),
    [exporting, setExporting] = useState(false),
    [renaming, setRenaming] = useState(false),
    [removingLot, setRemovingLot] = useState(false),
    [filter, setFilter] = useState<Filter>('all'),
    [busy, setBusy] = useState(false);
  const queuedLot = pending.find((e) => e.kind === 'lot');
  const lot: CloudLot | null =
    lotQuery.data ?? (queuedLot ? pendingLot(queuedLot) : null);
  const items = useMemo(
    () => mergeItems(id, itemsQuery.data ?? [], pending),
    [id, itemsQuery.data, pending],
  );
  const thumbs = usePhotoUrls(
    items
      .filter((i) => !i.pending)
      .map((i) => i.thumb_path ?? i.photos[0]?.path)
      .filter((p): p is string => !!p),
  );
  if (
    !queuedLot &&
    ((lotQuery.data === undefined && lotQuery.loading) ||
      (itemsQuery.data === undefined && itemsQuery.loading))
  )
    return <Loading text="Abrindo lote…" />;
  if (!lot)
    return (
      <NotFound
        title="Lote não encontrado"
        message={lotQuery.error || 'Ele pode ter sido excluído.'}
        actions={
          <button
            className="primary"
            onClick={() => navigate('/identificacao')}
          >
            <ArrowLeft />
            Voltar à Identificação
          </button>
        }
      />
    );
  const count = (status: ItemStatus) =>
    items.filter((i) => i.status === status).length;
  const toConfirm = items.filter(
    (i) => i.status === 'codificado' || i.status === 'sem_codigo',
  );
  const toCode = items.filter((i) => i.status === 'pendente' && !i.pending);
  const shown =
    filter === 'all' ? items : items.filter((i) => i.status === filter);
  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) notice(done, 'success');
    } catch (e) {
      notice(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const lotMenu: MenuItem[] = [
    { label: 'Renomear', icon: <Pencil />, onSelect: () => setRenaming(true) },
    ...(lot.confirmed_count === 0
      ? [
          {
            label: 'Excluir lote',
            icon: <Trash2 />,
            danger: true,
            onSelect: () => setRemovingLot(true),
          },
        ]
      : []),
  ];
  return (
    <main className="session-page page identify-page">
      <button className="back-link" onClick={() => navigate('/identificacao')}>
        <ArrowLeft />
        Identificação
      </button>
      <div className="page-heading session-heading">
        <div>
          <h1>{lot.name}</h1>
          <div className="lot-meta">
            <span className={`status lot-${lot.status}`}>
              {lotStatusLabel[lot.status]}
            </span>
            <span>
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </span>
            <span>
              Criado em {fullDate(lot.created_at)} por {lot.created_by}
            </span>
          </div>
        </div>
        <div className="heading-actions">
          <button
            className="btn-word"
            aria-label="Exportar lote"
            disabled={!items.length}
            onClick={() => setExporting(true)}
          >
            <Download />
            <span>Exportar</span>
          </button>
          {almox && lot.status === 'rascunho' && (
            <button
              className="accent"
              aria-label="Enviar para a Estrutura"
              disabled={
                busy || !items.length || !!queuedLot || pending.length > 0
              }
              title={pending.length ? 'Aguarde o envio das fotos' : undefined}
              onClick={() =>
                void run(
                  () => sendLot(lot.id),
                  'Lote enviado para a estrutura.',
                )
              }
            >
              <Send />
              <span>Enviar para a Estrutura</span>
            </button>
          )}
          {almox && toConfirm.length > 0 && (
            <button
              className="accent"
              aria-label={`Confirmar ${toConfirm.length}`}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const n = await confirmItems(toConfirm);
                  notice(
                    `${n} ${n === 1 ? 'item confirmado' : 'itens confirmados'}. Fotos reduzidas para miniatura.`,
                    'success',
                  );
                })
              }
            >
              <CheckCheck />
              <span>Confirmar {toConfirm.length}</span>
            </button>
          )}
          {!almox && toCode.length > 0 && (
            <button
              className="primary"
              aria-label="Preencher códigos"
              onClick={() => setCoding(toCode[0].id)}
            >
              <PenLine />
              <span>Preencher códigos</span>
            </button>
          )}
          {almox && (
            <button
              className="primary"
              aria-label="Adicionar produto"
              onClick={() => setEditing('new')}
            >
              <Camera />
              <span>Adicionar produto</span>
            </button>
          )}
          {almox && <MoreMenu label="Opções do lote" items={lotMenu} />}
        </div>
      </div>
      <OutboxBanner entries={pending} />
      {(lotQuery.error || itemsQuery.error) && (
        <div className="cloud-error" role="alert">
          <span>{lotQuery.error || itemsQuery.error}</span>
          <button
            onClick={() => {
              void lotQuery.reload();
              void itemsQuery.reload();
            }}
          >
            <RefreshCw />
            Tentar de novo
          </button>
        </div>
      )}
      {items.length > 0 && (
        <div className="list-toolbar">
          <div className="tabs" aria-label="Filtrar itens">
            {(
              [
                ['all', 'Todos', items.length],
                ['pendente', 'Pendentes', count('pendente')],
                ['codificado', 'Codificados', count('codificado')],
                ['sem_codigo', 'Sem código', count('sem_codigo')],
                ['confirmado', 'Confirmados', count('confirmado')],
              ] as const
            )
              .filter(([key, , n]) => key === 'all' || n > 0)
              .map(([key, label, n]) => (
                <button
                  key={key}
                  className={filter === key ? 'selected' : ''}
                  onClick={() => setFilter(key)}
                >
                  {label} <span>{n}</span>
                </button>
              ))}
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <section className="empty-state">
          <div className="empty-mark find-mark">
            <Camera size={44} />
          </div>
          {almox ? (
            <>
              <h2>Fotografe o primeiro produto sem código.</h2>
              <p>
                Até 4 fotos por produto, com bombona e peso. Depois envie o lote
                para a estrutura.
              </p>
              <button className="primary" onClick={() => setEditing('new')}>
                <Plus />
                Adicionar produto
              </button>
            </>
          ) : (
            <h2>Este lote ainda não tem itens.</h2>
          )}
        </section>
      ) : (
        <ol className="find-grid">
          {shown.map((item, index) => (
            <FindCard
              key={item.id}
              item={item}
              index={index}
              almox={almox}
              thumb={thumbs[item.thumb_path ?? item.photos[0]?.path ?? '']}
              onEdit={() => setEditing(item)}
              onDelete={() => setDeleting(item)}
              onCode={() => setCoding(item.id)}
              onConfirm={() =>
                void run(
                  () => confirmItems([item]),
                  `Item ${itemLabel(item.ord)} confirmado.`,
                )
              }
              onReturn={() => setReturning(item)}
            />
          ))}
          {almox && filter === 'all' && (
            <li>
              <button className="find-add" onClick={() => setEditing('new')}>
                <Plus />
                Próximo produto
              </button>
            </li>
          )}
        </ol>
      )}
      {editing && (
        <FindDialog
          lotId={lot.id}
          item={editing === 'new' ? null : editing}
          label={editing === 'new' ? '' : itemLabel(editing.ord)}
          previous={items.at(-1)}
          settings={settings}
          onClose={() => setEditing(null)}
        />
      )}
      {coding && (
        <CodeEntry
          items={items.filter((i) => i.status !== 'confirmado' && !i.pending)}
          startId={coding}
          settings={settings}
          onClose={() => setCoding(null)}
        />
      )}
      {deleting && (
        <Confirm
          title={`Excluir item ${itemLabel(deleting.ord)}?`}
          message="As fotos e os dados deste produto serão removidos do lote."
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            if (deleting.pending) await discardEntry(deleting.pending.id);
            if (itemsQuery.data?.some((i) => i.id === deleting.id))
              await deleteItem(deleting);
          }}
        />
      )}
      {removingLot && (
        <Confirm
          title="Excluir lote?"
          message={`“${lot.name}” e os ${items.length} itens serão excluídos para os dois setores.`}
          strong="EXCLUIR"
          onClose={() => setRemovingLot(false)}
          onConfirm={async () => {
            for (const entry of pending) await discardEntry(entry.id);
            if (lotQuery.data) await deleteLot(lot);
            navigate('/identificacao');
          }}
        />
      )}
      {renaming && <RenameLot lot={lot} onClose={() => setRenaming(false)} />}
      {returning && (
        <ReturnItem item={returning} onClose={() => setReturning(null)} />
      )}
      {exporting && (
        <ExportLot
          lot={lot}
          items={items}
          onClose={() => setExporting(false)}
        />
      )}
    </main>
  );
}

function FindCard({
  item,
  index,
  almox,
  thumb,
  onEdit,
  onDelete,
  onCode,
  onConfirm,
  onReturn,
}: {
  item: ItemView;
  index: number;
  almox: boolean;
  thumb?: string;
  onEdit: () => void;
  onDelete: () => void;
  onCode: () => void;
  onConfirm: () => void;
  onReturn: () => void;
}) {
  const label = itemLabel(item.ord);
  const blobs = useMemo(
    () => (item.pending ? [item.draftPhotos[0]?.blob] : []),
    [item.pending, item.draftPhotos],
  );
  const [local] = useBlobUrls(blobs);
  const src = local || thumb;
  const confirmed = item.status === 'confirmado';
  const coded = item.status === 'codificado' || item.status === 'sem_codigo';
  const menu: MenuItem[] = almox
    ? [
        ...(!confirmed
          ? [{ label: 'Editar', icon: <Pencil />, onSelect: onEdit }]
          : []),
        ...(coded
          ? [
              {
                label: 'Devolver à estrutura',
                icon: <Undo2 />,
                onSelect: onReturn,
              },
            ]
          : []),
        ...(!confirmed
          ? [
              {
                label: 'Excluir',
                icon: <Trash2 />,
                danger: true,
                onSelect: onDelete,
              },
            ]
          : []),
      ]
    : !confirmed
      ? [{ label: 'Preencher código', icon: <PenLine />, onSelect: onCode }]
      : [];
  const expires = item.thumb_expires_at
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
        new Date(item.thumb_expires_at),
      )
    : '';
  return (
    <li
      className={`find-card item-${item.status}`}
      style={{ '--i': Math.min(index, 10) } as CSSProperties}
    >
      <button
        className="find-photos-preview n1"
        aria-label={
          almox ? `Editar item ${label}` : `Preencher código do item ${label}`
        }
        disabled={confirmed}
        onClick={almox ? onEdit : onCode}
      >
        {src ? (
          <img src={src} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="find-photo-missing">
            {item.thumb_path || item.photos.length ? '' : 'Foto removida'}
          </span>
        )}
        {item.photos.length > 1 && (
          <span className="photo-count">{item.photos.length} fotos</span>
        )}
      </button>
      <div className="find-body">
        <div className="find-top">
          <span className="find-number">
            Item <strong>{label}</strong>
          </span>
          <span className={`status item-${item.status}`}>
            {item.pending ? (
              <>
                <CloudUpload />
                Enviando
              </>
            ) : (
              itemStatusLabel[item.status]
            )}
          </span>
          {menu.length > 0 && (
            <MoreMenu label={`Opções do item ${label}`} items={menu} />
          )}
        </div>
        <dl className="find-facts">
          <div>
            <dt>
              <MapPin />
              Endereço
            </dt>
            <dd className={item.address ? 'mono' : 'empty'}>
              {item.address ?? 'Sem endereço'}
            </dd>
          </div>
          <div>
            <dt>
              <Container />
              Bombona
            </dt>
            <dd className={item.bombona ? 'mono' : 'empty'}>
              {item.bombona ?? '—'}
            </dd>
          </div>
          <div>
            <dt>
              <Scale />
              Peso
            </dt>
            <dd className={item.weight_g ? 'mono' : 'empty'}>
              {item.weight_g ? formatKg(item.weight_g) : '—'}
            </dd>
          </div>
        </dl>
        {item.note && <p className="find-note">{item.note}</p>}
        <p className={`find-code-slot ${item.code ? 'filled' : ''}`}>
          CODIGO : <span className="mono">{item.code ?? ''}</span>
        </p>
        {item.code_note && (
          <p className="find-note code-note">
            {item.status === 'pendente' ? 'Devolvido: ' : 'Estrutura: '}
            {item.code_note}
          </p>
        )}
        <ul className="find-trail">
          <li>
            Cadastrado em {fullDate(item.created_at)} por {item.created_by}
          </li>
          {item.coded_at && (
            <li>
              {item.status === 'sem_codigo' ? 'Sem código' : 'Codificado'} em{' '}
              {fullDate(item.coded_at)} por {item.coded_by}
            </li>
          )}
          {item.confirmed_at && (
            <li>
              Confirmado em {fullDate(item.confirmed_at)} por{' '}
              {item.confirmed_by}
            </li>
          )}
          {confirmed && expires && (
            <li className="find-expire">
              Foto reduzida, será apagada em {expires}.
            </li>
          )}
        </ul>
        {almox && coded && (
          <button className="find-confirm" onClick={onConfirm}>
            <CircleCheck />
            Confirmar
          </button>
        )}
        {!almox && item.status === 'pendente' && !item.pending && (
          <button className="find-confirm" onClick={onCode}>
            <PenLine />
            Preencher código
          </button>
        )}
      </div>
    </li>
  );
}

function RenameLot({ lot, onClose }: { lot: CloudLot; onClose: () => void }) {
  const [name, setName] = useState(lot.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Renomear lote" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await renameLot(lot.id, name);
            onClose();
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        <label>
          Nome do lote
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy || !name.trim()}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReturnItem({
  item,
  onClose,
}: {
  item: ItemView;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={`Devolver item ${itemLabel(item.ord)}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await returnItem(item, reason);
            onClose();
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        <p>
          O item volta para a estrutura como pendente
          {item.code ? `, e o código ${item.code} é descartado` : ''}.
        </p>
        <label>
          O que precisa ser revisto?
          <input
            autoFocus
            required
            maxLength={500}
            value={reason}
            placeholder="Ex.: código não confere com a peça"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy || !reason.trim()}>
            <Undo2 />
            Devolver
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Excel com o código novo ou Word com as fotos e o campo CODIGO. */
function ExportLot({
  lot,
  items,
  onClose,
}: {
  lot: CloudLot;
  items: ItemView[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<'' | 'xlsx' | 'docx'>(''),
    [error, setError] = useState('');
  const notice = useNotice();
  async function excel() {
    const { identifyXlsx, identifyFilename } =
      await import('../../services/identify-xlsx');
    await saveOrShare(
      await identifyXlsx(lot.name, [lot], items),
      identifyFilename(lot.name),
    );
  }
  async function word() {
    const { createFindDocument, findFilename } =
      await import('../../services/identify-export');
    const docItems: FindItem[] = [];
    for (const item of items) {
      const sources = item.draftPhotos.length
        ? item.draftPhotos
        : item.thumb_path
          ? [{ path: item.thumb_path, width: 0, height: 0 }]
          : [];
      const photos = [];
      for (const source of sources) {
        const blob =
          'blob' in source && source.blob
            ? source.blob
            : await downloadPhoto(source.path);
        // Miniaturas WebP viram JPEG: o Word não aceita WebP.
        photos.push(
          blob.type === 'image/jpeg' && source.width
            ? { blob, width: source.width, height: source.height }
            : await compressPhoto(blob),
        );
      }
      docItems.push({
        id: item.id,
        lotId: lot.id,
        order: item.ord,
        createdAt: Date.parse(item.created_at),
        photos,
        address: item.address ?? undefined,
        bombona: item.bombona ?? undefined,
        weight: item.weight_g ?? undefined,
        note: item.note ?? undefined,
        code: item.code ?? undefined,
      });
    }
    const blob = await createFindDocument(
      { name: lot.name, createdAt: Date.parse(lot.created_at) },
      docItems,
    );
    await saveOrShare(
      blob,
      findFilename({ name: lot.name, createdAt: Date.parse(lot.created_at) }),
    );
  }
  async function run(kind: 'xlsx' | 'docx') {
    setBusy(kind);
    setError('');
    try {
      await (kind === 'xlsx' ? excel() : word());
      notice(
        kind === 'xlsx' ? 'Planilha pronta.' : 'Documento pronto.',
        'success',
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal title="Exportar lote" onClose={onClose}>
      <div className="export-options">
        <button
          className="export-option"
          disabled={!!busy}
          onClick={() => void run('xlsx')}
        >
          <span className="export-option__icon excel">
            <ExcelIcon />
          </span>
          <span>
            <strong>{busy === 'xlsx' ? 'Gerando…' : 'Planilha Excel'}</strong>
            <small>
              Código novo, endereço, galão (bombona) e peso, igual ao
              levantamento.
            </small>
          </span>
        </button>
        <button
          className="export-option"
          disabled={!!busy}
          onClick={() => void run('docx')}
        >
          <span className="export-option__icon word">
            <WordIcon />
          </span>
          <span>
            <strong>{busy === 'docx' ? 'Gerando…' : 'Documento Word'}</strong>
            <small>
              Alternativa: 2 itens por página com fotos e o campo CODIGO.
            </small>
          </span>
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose} disabled={!!busy}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
