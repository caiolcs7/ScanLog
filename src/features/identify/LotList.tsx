import { useMemo, useState, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Camera,
  CloudUpload,
  Pencil,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
  Send,
} from 'lucide-react';
import {
  ExcelIcon,
  Loading,
  Modal,
  errorMessage,
  navigate,
  useNotice,
} from '../../components/ui';
import { db } from '../../core/database';
import { migrateLocalLots } from '../../core/identify';
import { listItemsOf, listLots } from '../../cloud/api';
import type { CloudAuth } from '../../cloud/auth';
import { useCloud, usePending } from '../../cloud/hooks';
import { queueLot } from '../../cloud/outbox';
import { lotStatusLabel, type CloudLot } from '../../cloud/types';
import { fullDate, pendingLot } from './items';
import { OutboxBanner, saveOrShare } from './shared';

type Signed = Extract<CloudAuth, { status: 'in' }>;
type Filter = 'open' | 'done';

export function LotList({ auth }: { auth: Signed }) {
  const almox = auth.sector === 'almoxarifado';
  const { data, error, loading, reload } = useCloud(listLots, []);
  const pending = usePending();
  const local = useLiveQuery(() => db.lots.count(), [], 0);
  const [filter, setFilter] = useState<Filter>('open'),
    [search, setSearch] = useState(''),
    [creating, setCreating] = useState(false),
    [sheet, setSheet] = useState(false);
  const lots = useMemo(() => {
    const cloud = data ?? [];
    const known = new Set(cloud.map((l) => l.id));
    const queued = pending
      .filter((e) => e.kind === 'lot' && !known.has(e.lotId))
      .map(pendingLot);
    return [...queued, ...cloud];
  }, [data, pending]);
  if (!data && loading) return <Loading text="Buscando lotes…" />;
  const open = lots.filter((l) => l.status !== 'confirmado'),
    done = lots.filter((l) => l.status === 'confirmado');
  const term = search.toLocaleLowerCase('pt-BR');
  const shown = (filter === 'open' ? open : done)
    .filter((l) => l.name.toLocaleLowerCase('pt-BR').includes(term))
    // A estrutura trabalha do mais antigo para o mais novo.
    .sort((a, b) =>
      !almox && filter === 'open'
        ? (a.sent_at ?? a.created_at).localeCompare(b.sent_at ?? b.created_at)
        : 0,
    );
  return (
    <main className="home page identify-home">
      <div className="page-heading">
        <div>
          <h1>Identificação</h1>
          <p>
            {almox
              ? 'Fotografe o produto sem código, envie para a estrutura e confira o retorno.'
              : 'Preencha o código de cada item enviado pelo almoxarifado.'}
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="btn-sheet"
            aria-label="Planilha"
            onClick={() => setSheet(true)}
            disabled={!data?.length}
          >
            <ExcelIcon />
            <span>Planilha</span>
          </button>
          {almox && (
            <button
              className="primary"
              aria-label="Nova identificação"
              onClick={() => setCreating(true)}
            >
              <Plus />
              <span>Nova identificação</span>
            </button>
          )}
        </div>
      </div>
      {almox && local > 0 && <LocalLots count={local} />}
      <OutboxBanner entries={pending} />
      {error && (
        <div className="cloud-error" role="alert">
          <span>{error}</span>
          <button onClick={() => void reload()}>
            <RefreshCw />
            Tentar de novo
          </button>
        </div>
      )}
      <div className="list-toolbar">
        <div className="tabs" aria-label="Filtrar lotes">
          <button
            className={filter === 'open' ? 'selected' : ''}
            onClick={() => setFilter('open')}
          >
            Em aberto <span>{open.length}</span>
          </button>
          <button
            className={filter === 'done' ? 'selected' : ''}
            onClick={() => setFilter('done')}
          >
            Concluídos <span>{done.length}</span>
          </button>
        </div>
        <div className="toolbar-end">
          {lots.length > 0 && (
            <div className="search-field">
              <Search />
              <input
                aria-label="Buscar lotes"
                placeholder="Buscar lote"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <button
            className="icon-button"
            aria-label="Atualizar"
            disabled={loading}
            onClick={() => void reload()}
          >
            <RefreshCw className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <Empty
          almox={almox}
          filter={filter}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <div className="session-list">
          {shown.map((lot, index) => (
            <LotRow
              key={lot.id}
              lot={lot}
              index={index}
              queued={pending.some((e) => e.lotId === lot.id)}
            />
          ))}
        </div>
      )}
      {creating && <NewLot onClose={() => setCreating(false)} />}
      {sheet && (
        <PeriodSheet lots={data ?? []} onClose={() => setSheet(false)} />
      )}
    </main>
  );
}

function LotRow({
  lot,
  index,
  queued,
}: {
  lot: CloudLot;
  index: number;
  queued: boolean;
}) {
  const open = () => navigate(`/identificacao/${lot.id}`);
  const progress = lot.item_count
    ? Math.round((lot.coded_count / lot.item_count) * 100)
    : 0;
  return (
    <article
      className="session-row find-lot"
      style={{ '--i': Math.min(index, 8) } as CSSProperties}
    >
      <div className="session-symbol">
        <ScanSearch />
      </div>
      <div className="session-info">
        <button className="session-title" onClick={open}>
          {lot.name}
        </button>
        <div className="session-meta">
          <span className={`status lot-${lot.status}`}>
            {lotStatusLabel[lot.status]}
          </span>
          <span>
            <strong>{lot.item_count}</strong>{' '}
            {lot.item_count === 1 ? 'item' : 'itens'}
            {lot.status !== 'rascunho' &&
              ` · ${lot.coded_count} codificado${lot.coded_count === 1 ? '' : 's'}`}
          </span>
          <span>
            Criado em {fullDate(lot.created_at)} por {lot.created_by}
          </span>
          {queued && (
            <span className="status queued">
              <CloudUpload />
              Aguardando envio
            </span>
          )}
        </div>
        {lot.status !== 'rascunho' && lot.item_count > 0 && (
          <div
            className="lot-progress"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className="session-actions">
        <button onClick={open}>
          Abrir
          <ArrowRight />
        </button>
      </div>
    </article>
  );
}

function Empty({
  almox,
  filter,
  onCreate,
}: {
  almox: boolean;
  filter: Filter;
  onCreate: () => void;
}) {
  if (filter === 'done')
    return (
      <section className="empty-state compact">
        <h2>Nenhum lote concluído ainda.</h2>
        <p>Lotes confirmados pelo almoxarifado aparecem aqui.</p>
      </section>
    );
  return (
    <section className="empty-state">
      <div className="empty-mark find-mark">
        <ScanSearch size={46} />
      </div>
      {almox ? (
        <>
          <h2>Produto sem etiqueta? Fotografe e envie.</h2>
          <p>
            Monte um lote com fotos, bombona e peso. A estrutura preenche o
            código de cada item aqui mesmo, e você confere o retorno.
          </p>
          <button className="primary" onClick={onCreate}>
            <Plus />
            Nova identificação
          </button>
          <div className="workflow">
            <span>
              <Camera />
              Fotografe
            </span>
            <ArrowRight />
            <span>
              <Send />
              Envie
            </span>
            <ArrowRight />
            <span>
              <Pencil />
              Receba os códigos
            </span>
          </div>
        </>
      ) : (
        <>
          <h2>Nada para identificar agora.</h2>
          <p>Quando o almoxarifado enviar um lote, ele aparece aqui.</p>
        </>
      )}
    </section>
  );
}

function NewLot({ onClose }: { onClose: () => void }) {
  const today = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(Date.now());
  const [name, setName] = useState(`Sem código ${today}`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Nova identificação" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const id = crypto.randomUUID();
            await queueLot(id, name);
            onClose();
            navigate(`/identificacao/${id}`);
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
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="helper">
          Agrupe os produtos que vão juntos para a estrutura.
        </p>
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
            {busy ? 'Criando…' : 'Criar lote'}
            <ArrowRight />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LocalLots({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const notice = useNotice();
  return (
    <div className="outbox-banner">
      <CloudUpload />
      <span>
        {count === 1
          ? 'Há 1 lote salvo só neste aparelho.'
          : `Há ${count} lotes salvos só neste aparelho.`}
      </span>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const sent = await migrateLocalLots();
            notice(
              `${sent} ${sent === 1 ? 'lote enviado' : 'lotes enviados'} para a nuvem.`,
              'success',
            );
          } catch (e) {
            notice(errorMessage(e), 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Enviando…' : 'Enviar para a nuvem'}
      </button>
    </div>
  );
}

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/** Planilha de todos os lotes criados no período escolhido. */
function PeriodSheet({
  lots,
  onClose,
}: {
  lots: CloudLot[];
  onClose: () => void;
}) {
  const [from, setFrom] = useState(() =>
      isoDay(new Date(Date.now() - 30 * 864e5)),
    ),
    [to, setTo] = useState(() => isoDay(new Date())),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notice = useNotice();
  const chosen = lots.filter((l) => {
    const day = isoDay(new Date(l.created_at));
    return day >= from && day <= to;
  });
  const label = (day: string) => day.split('-').reverse().join('/');
  return (
    <Modal title="Planilha da identificação" onClose={onClose}>
      <div className="find-pair">
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <p className="helper">
        {chosen.length} {chosen.length === 1 ? 'lote' : 'lotes'} no período.
        Colunas: código novo, endereço, galão (bombona) e peso, como no
        levantamento.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          className="primary"
          disabled={busy || !chosen.length}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const items = await listItemsOf(chosen.map((l) => l.id));
              const { identifyXlsx, identifyFilename } =
                await import('../../services/identify-xlsx');
              const title = `Período ${label(from)} a ${label(to)}`;
              await saveOrShare(
                await identifyXlsx(title, chosen, items),
                identifyFilename(title),
              );
              notice('Planilha pronta.', 'success');
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <ExcelIcon />
          {busy ? 'Gerando…' : 'Baixar planilha'}
        </button>
      </div>
    </Modal>
  );
}
