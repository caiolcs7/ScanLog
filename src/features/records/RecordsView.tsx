import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  MapPin,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import type { InventoryRecord, Session, Settings } from '../../core/models';
import { db, removeRecords, restoreRecords } from '../../core/database';
import { editRecords } from '../../core/scan-engine';
import { formatGrams } from '../../core/weight';
import { WeightDialog } from '../weight/WeightDialog';
import { extractStreet, parseScan, searchText } from '../../core/parser';
import { reviewIssues } from '../../core/statistics';
import {
  Confirm,
  GalaoCode,
  Modal,
  dateTime,
  errorMessage,
  useNotice,
  useTask,
} from '../../components/ui';
const PAGE_SIZE = 50;
export function RecordsView({
  session,
  records,
  settings,
}: {
  session: Session;
  records: InventoryRecord[];
  settings: Settings;
}) {
  const [weighing, setWeighing] = useState<InventoryRecord | null>(null);
  const [search, setSearch] = useState(''),
    [street, setStreet] = useState(''),
    [address, setAddress] = useState(''),
    [sort, setSort] = useState('order'),
    [review, setReview] = useState(false),
    [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [editing, setEditing] = useState<InventoryRecord[] | null>(null),
    [deleting, setDeleting] = useState<string[] | null>(null);
  const notice = useNotice(),
    task = useTask(),
    readOnly = session.status === 'archived';
  const issues = useMemo(
    () =>
      new Map(
        reviewIssues(records, settings).map((i) => [i.record.id, i.reasons]),
      ),
    [records, settings],
  );
  const recentHistory = useLiveQuery(
    () =>
      db.history
        .where('[sessionId+timestamp]')
        .between([session.id, 0], [session.id, Infinity])
        .reverse()
        .limit(100)
        .toArray(),
    [session.id],
  );
  const unknowns = (recentHistory ?? []).filter(
    (h) => !parseScan(h.normalized, settings.rules).valid,
  );
  const streets = useMemo(
    () => [...new Set(records.map((r) => extractStreet(r.address)))].sort(),
    [records],
  );
  const addresses = useMemo(
    () =>
      [
        ...new Set(
          records
            .filter((r) => !street || extractStreet(r.address) === street)
            .map((r) => r.address),
        ),
      ].sort(),
    [records, street],
  );
  const filtered = useMemo(() => {
    const query = searchText(search);
    return records
      .filter(
        (r) =>
          (!query ||
            r.code.includes(query) ||
            r.address.includes(query) ||
            !!r.galao?.includes(query) ||
            !!r.description?.replace(/\s/g, '').includes(query)) &&
          (!street || extractStreet(r.address) === street) &&
          (!address || r.address === address) &&
          (!review || issues.has(r.id)),
      )
      .sort((a, b) =>
        sort === 'order'
          ? a.order - b.order
          : sort === 'recent'
            ? b.order - a.order
            : sort === 'address'
              ? a.address.localeCompare(b.address, 'pt-BR', {
                  numeric: true,
                }) || a.order - b.order
              : a.code.localeCompare(b.code, 'pt-BR', { numeric: true }),
      );
  }, [records, search, street, address, review, sort, issues]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1),
  );
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notice('Copiado.', 'success');
    } catch {
      notice(
        'Não foi possível copiar. Selecione o texto do registro e copie manualmente.',
        'error',
      );
    }
  }
  return (
    <section className="records-view">
      <div className="records-toolbar">
        <div className="search-field">
          <Search />
          <input
            id="record-search"
            aria-label="Buscar código ou endereço"
            placeholder="Buscar código ou endereço"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <button
          className={review ? 'selected' : ''}
          aria-pressed={review}
          onClick={() => {
            setReview(!review);
            setPage(0);
          }}
        >
          <AlertTriangle />
          Revisão <span>{issues.size}</span>
        </button>
      </div>
      <div className="filters">
        <Filter />
        <label>
          Rua
          <select
            value={street}
            onChange={(e) => {
              setStreet(e.target.value);
              setAddress('');
              setPage(0);
            }}
          >
            <option value="">Todas as ruas</option>
            {streets.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Endereço
          <select
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos os endereços</option>
            {addresses.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Ordenar
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="order">Ordem de leitura</option>
            <option value="recent">Mais recentes</option>
            <option value="address">Endereço</option>
            <option value="code">Código do produto</option>
          </select>
        </label>
      </div>
      {selected.size > 0 && !readOnly && (
        <div className="bulk-bar">
          <strong>{selected.size} selecionados</strong>
          <button
            onClick={() =>
              setEditing(records.filter((r) => selected.has(r.id)))
            }
          >
            <MapPin />
            Alterar endereço
          </button>
          <button
            className="text-danger"
            onClick={() => setDeleting([...selected])}
          >
            <Trash2 />
            Excluir
          </button>
          <button onClick={() => setSelected(new Set())}>Limpar seleção</button>
        </div>
      )}
      {review && (
        <p className="review-explanation">
          Itens para conferência: repetições, entradas manuais e valores fora
          das regras atuais. Nenhum dado é alterado automaticamente.
        </p>
      )}
      <div className="records-table">
        <table>
          <thead>
            <tr>
              {!readOnly && (
                <th className="check-cell">
                  <label className="check-target">
                    <input
                      type="checkbox"
                      aria-label="Selecionar registros desta página"
                      checked={
                        visible.length > 0 &&
                        visible.every((r) => selected.has(r.id))
                      }
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          visible.forEach((r) =>
                            e.target.checked
                              ? next.add(r.id)
                              : next.delete(r.id),
                          );
                          return next;
                        })
                      }
                    />
                  </label>
                </th>
              )}
              <th className="order-cell">Ordem</th>
              <th>Código do Produto</th>
              <th>Endereço</th>
              <th>Galão</th>
              {session.weighted && <th>Peso</th>}
              <th className="time-cell">Leitura</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((record) => (
              <tr
                key={record.id}
                className={selected.has(record.id) ? 'row-selected' : ''}
              >
                {!readOnly && (
                  <td className="check-cell">
                    <label className="check-target">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar registro ${record.order}`}
                        checked={selected.has(record.id)}
                        onChange={() => toggle(record.id)}
                      />
                    </label>
                  </td>
                )}
                <td className="order-cell">
                  {record.order.toString().padStart(2, '0')}
                </td>
                <td className="record-code">
                  <div className="copy-value">
                    <code>{record.code}</code>
                    <button
                      className="icon-button"
                      aria-label={`Copiar código ${record.code}`}
                      onClick={() => void copy(record.code)}
                    >
                      <Copy />
                    </button>
                  </div>
                  {record.description && (
                    <span className="record-description">
                      {record.description}
                    </span>
                  )}
                  {review &&
                    issues.get(record.id)?.map((reason) => (
                      <span className="issue-tag" key={reason}>
                        {reason}
                      </span>
                    ))}
                </td>
                <td className="record-address">
                  <div className="copy-value">
                    <code>{record.address}</code>
                    <button
                      className="icon-button"
                      aria-label={`Copiar endereço do registro ${record.order}`}
                      onClick={() => void copy(record.address)}
                    >
                      <Copy />
                    </button>
                  </div>
                </td>
                <td className="record-galao">
                  {record.galao ? <GalaoCode value={record.galao} /> : '—'}
                </td>
                {session.weighted && (
                  <td className="record-weight">
                    <button
                      className="weight-chip"
                      disabled={readOnly}
                      aria-label={`Peso do registro ${record.order}`}
                      onClick={() => setWeighing(record)}
                    >
                      {record.weight ? formatGrams(record.weight) : 'Informar'}
                    </button>
                  </td>
                )}
                <td className="time-cell">
                  {dateTime(record.timestamp)}
                  {record.source === 'manual' && (
                    <span className="source-label">Manual / editado</span>
                  )}
                </td>
                <td className="row-actions">
                  {!readOnly && (
                    <>
                      <button
                        className="icon-button"
                        aria-label={`Editar registro ${record.order}`}
                        onClick={() => setEditing([record])}
                      >
                        <Pencil />
                      </button>
                      <button
                        className="icon-button text-danger"
                        aria-label={`Excluir registro ${record.order}`}
                        onClick={() => setDeleting([record.id])}
                      >
                        <Trash2 />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-records">
            <Search />
            <h2>
              {records.length
                ? 'Nenhum registro corresponde aos filtros'
                : 'Nenhum produto registrado ainda'}
            </h2>
            <p>
              {records.length
                ? 'Ajuste a busca ou os filtros acima.'
                : 'Volte à leitura, selecione um endereço e leia os produtos.'}
            </p>
          </div>
        )}
      </div>
      <div className="pagination">
        <span>
          {filtered.length ? currentPage * PAGE_SIZE + 1 : 0}–
          {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de{' '}
          {filtered.length} registros
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Página anterior"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft />
          </button>
          <button
            className="icon-button"
            aria-label="Próxima página"
            disabled={(currentPage + 1) * PAGE_SIZE >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      {review && (
        <details className="history-details">
          <summary>
            Leituras não reconhecidas · {unknowns.length} entre as últimas 100
            leituras
          </summary>
          {unknowns.length ? (
            <ul>
              {unknowns.map((h) => (
                <li key={h.id}>
                  <code>{h.normalized || '(sem conteúdo válido)'}</code>
                  <span>{dateTime(h.timestamp)}</span>
                  <p>{h.outcome}</p>
                  {h.raw && <pre>{JSON.stringify(h.raw)}</pre>}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              <Check size={16} /> Nenhuma leitura desconhecida no histórico
              recente.
            </p>
          )}
        </details>
      )}
      {weighing && (
        <WeightDialog record={weighing} onClose={() => setWeighing(null)} />
      )}
      {editing && (
        <EditDialog
          rows={editing}
          settings={settings}
          onClose={() => setEditing(null)}
          onSave={async (newAddress, newCode, newGalao) => {
            await editRecords(
              session.id,
              editing.map((r) => r.id),
              newAddress,
              settings,
              newCode,
              newGalao,
            );
            setSelected(new Set());
            notice('Registros atualizados.', 'success');
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={
            deleting.length === 1
              ? 'Excluir registro?'
              : 'Excluir registros selecionados?'
          }
          message={`${deleting.length} registro(s) serão removidos. Você poderá restaurar pelo aviso seguinte.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const removed = await removeRecords(session.id, deleting);
            setSelected(new Set());
            notice('Registros excluídos.', 'info', {
              label: 'Restaurar',
              run: () => void task(() => restoreRecords(removed)),
            });
          }}
        />
      )}
    </section>
  );
}
function EditDialog({
  rows,
  onSave,
  onClose,
}: {
  rows: InventoryRecord[];
  settings: Settings;
  onSave: (address: string, code?: string, galao?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [code, setCode] = useState(rows[0].code),
    [address, setAddress] = useState(rows.length === 1 ? rows[0].address : ''),
    [galao, setGalao] = useState(
      rows.length === 1 ? (rows[0].galao ?? '') : '',
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={
        rows.length === 1
          ? 'Editar registro'
          : `Alterar endereço de ${rows.length} registros`
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(
              address,
              rows.length === 1 ? code : undefined,
              rows.length === 1 || galao.trim() ? galao : undefined,
            );
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {rows.length === 1 && (
          <label>
            Código do Produto
            <input
              required
              autoFocus
              className="mono"
              maxLength={128}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}
        <label>
          {rows.length === 1 ? 'Endereço' : 'Novo endereço'}
          <input
            required
            autoFocus={rows.length > 1}
            className="mono"
            maxLength={128}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label>
          Galão
          <input
            className="mono"
            maxLength={32}
            autoCapitalize="characters"
            placeholder={rows.length === 1 ? 'Sem galão' : 'Manter atual'}
            value={galao}
            onChange={(e) => setGalao(e.target.value)}
          />
        </label>
        <p className="helper">
          Alterações manuais ficam sinalizadas na revisão.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
