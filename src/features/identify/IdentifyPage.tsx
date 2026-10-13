import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Camera,
  Container,
  Download,
  MapPin,
  Pencil,
  Plus,
  Scale,
  Share2,
  Trash2,
} from 'lucide-react';
import { db } from '../../core/database';
import { itemLabel, removeFind } from '../../core/identify';
import type { FindItem, FindLot, Settings } from '../../core/models';
import { formatKg } from '../../core/weight';
import {
  Confirm,
  Loading,
  Modal,
  MoreMenu,
  errorMessage,
  navigate,
  useNotice,
} from '../../components/ui';
import { downloadBlob } from '../../services/download';
import { FindDialog } from './FindDialog';

export function WordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-.5 1.5L18.5 8H14a.5.5 0 0 1-.5-.5v-4ZM7.2 11h1.6l1.1 4.6 1.3-4.6h1.6l1.3 4.6 1.1-4.6h1.6l-1.9 7h-1.5L12 13.5 10.6 18H9.1l-1.9-7Z" />
    </svg>
  );
}

export function IdentifyPage({
  id,
  settings,
}: {
  id: string;
  settings: Settings;
}) {
  const lot = useLiveQuery(() => db.lots.get(id), [id], null);
  const items = useLiveQuery(
    () =>
      db.finds
        .where('[lotId+order]')
        .between([id, 0], [id, Infinity])
        .toArray(),
    [id],
  );
  const [editing, setEditing] = useState<FindItem | 'new' | null>(null),
    [deleting, setDeleting] = useState<FindItem | null>(null),
    [exporting, setExporting] = useState(false);
  if (lot === null || !items) return <Loading />;
  if (!lot)
    return (
      <main className="page">
        <h1>Lote não encontrado</h1>
        <button className="back-link" onClick={() => navigate('/')}>
          <ArrowLeft />
          Levantamentos
        </button>
      </main>
    );
  const photos = items.reduce((n, i) => n + i.photos.length, 0);
  const labelOf = (item: FindItem) => itemLabel(items.indexOf(item) + 1);
  return (
    <main className="session-page page identify-page">
      <button className="back-link" onClick={() => navigate('/?tab=identify')}>
        <ArrowLeft />
        Identificação
      </button>
      <div className="page-heading session-heading">
        <div>
          <h1>{lot.name}</h1>
          <p>
            {items.length} {items.length === 1 ? 'produto' : 'produtos'}{' '}
            <span>·</span> {photos} {photos === 1 ? 'foto' : 'fotos'}
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="btn-word"
            aria-label="Exportar para identificação"
            disabled={!items.length}
            onClick={() => setExporting(true)}
          >
            <WordIcon />
            <span>Exportar</span>
          </button>
          <button
            className="primary"
            aria-label="Adicionar produto"
            onClick={() => setEditing('new')}
          >
            <Camera />
            <span>Adicionar produto</span>
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <section className="empty-state">
          <div className="empty-mark find-mark">
            <Camera size={44} />
          </div>
          <h2>Fotografe o primeiro produto sem código.</h2>
          <p>
            Até 4 fotos por produto, com bombona e peso. O documento sai pronto
            para o setor responsável escrever cada código.
          </p>
          <button className="primary" onClick={() => setEditing('new')}>
            <Plus />
            Adicionar produto
          </button>
        </section>
      ) : (
        <ol className="find-grid">
          {items.map((item, index) => (
            <FindCard
              key={item.id}
              item={item}
              label={labelOf(item)}
              index={index}
              onEdit={() => setEditing(item)}
              onDelete={() => setDeleting(item)}
            />
          ))}
          <li>
            <button className="find-add" onClick={() => setEditing('new')}>
              <Plus />
              Próximo produto
            </button>
          </li>
        </ol>
      )}
      {editing && (
        <FindDialog
          lotId={lot.id}
          item={editing === 'new' ? null : editing}
          label={editing === 'new' ? '' : labelOf(editing)}
          previous={items.at(-1)}
          settings={settings}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Confirm
          title={`Excluir item ${labelOf(deleting)}?`}
          message="As fotos e dados deste produto serão removidos do lote."
          onClose={() => setDeleting(null)}
          onConfirm={() => removeFind(deleting)}
        />
      )}
      {exporting && (
        <ExportFinds
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
  label,
  index,
  onEdit,
  onDelete,
}: {
  item: FindItem;
  label: string;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const urls = useMemo(
    () => item.photos.map((p) => URL.createObjectURL(p.blob)),
    [item.photos],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <li
      className="find-card"
      style={{ '--i': Math.min(index, 10) } as CSSProperties}
    >
      <button
        className={`find-photos-preview n${Math.min(urls.length, 4)}`}
        aria-label={`Editar item ${label}`}
        onClick={onEdit}
      >
        {urls.map((url, i) => (
          <img key={url} src={url} alt="" loading="lazy" data-i={i} />
        ))}
      </button>
      <div className="find-body">
        <div className="find-top">
          <span className="find-number">
            Item <strong>{label}</strong>
          </span>
          <MoreMenu
            label={`Opções do item ${label}`}
            items={[
              { label: 'Editar', icon: <Pencil />, onSelect: onEdit },
              {
                label: 'Excluir',
                icon: <Trash2 />,
                danger: true,
                onSelect: onDelete,
              },
            ]}
          />
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
            <dd className={item.weight ? 'mono' : 'empty'}>
              {item.weight ? formatKg(item.weight) : '—'}
            </dd>
          </div>
        </dl>
        {item.note && <p className="find-note">{item.note}</p>}
        <p className="find-code-slot">
          CODIGO : <span />
        </p>
      </div>
    </li>
  );
}

function ExportFinds({
  lot,
  items,
  onClose,
}: {
  lot: FindLot;
  items: FindItem[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<'' | 'download' | 'share'>(''),
    [error, setError] = useState('');
  const notice = useNotice();
  const canShare =
    typeof navigator.canShare === 'function' &&
    navigator.canShare({
      files: [new File([''], 'a.docx', { type: DOCX })],
    });
  async function run(mode: 'download' | 'share') {
    setBusy(mode);
    setError('');
    try {
      const { createFindDocument, findFilename } =
        await import('../../services/identify-export');
      const blob = await createFindDocument(lot, items),
        name = findFilename(lot);
      if (mode === 'share') {
        try {
          await navigator.share({
            files: [new File([blob], name, { type: DOCX })],
            title: lot.name,
          });
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          throw e;
        }
      } else downloadBlob(blob, name);
      notice('Documento pronto para identificação.', 'success');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal title="Enviar para identificação" onClose={onClose}>
      <div className="export-summary find-export">
        <span className="find-export__icon">
          <WordIcon />
        </span>
        <div>
          <strong>Documento Word (.docx)</strong>
          <p className="helper">
            {items.length} {items.length === 1 ? 'produto' : 'produtos'} com
            fotos, endereço, bombona e peso. Cada item traz o campo{' '}
            <b>CODIGO :</b> para o setor preencher e devolver.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose} disabled={!!busy}>
          Cancelar
        </button>
        {canShare && (
          <button disabled={!!busy} onClick={() => void run('share')}>
            <Share2 />
            {busy === 'share' ? 'Gerando…' : 'Compartilhar'}
          </button>
        )}
        <button
          className="primary"
          disabled={!!busy}
          onClick={() => void run('download')}
        >
          <Download />
          {busy === 'download' ? 'Gerando…' : 'Baixar documento'}
        </button>
      </div>
    </Modal>
  );
}
const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
