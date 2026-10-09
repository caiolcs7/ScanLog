import { useState, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Plus,
  ScanLine,
  MapPin,
  FileSpreadsheet,
  Copy,
  Archive,
  Trash2,
  Pencil,
  FolderOpen,
  Search,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import {
  createSession,
  db,
  deleteSession,
  duplicateSession,
  updateSession,
} from '../../core/database';
import type { Session, Settings } from '../../core/models';
import {
  Confirm,
  ExcelIcon,
  MoreMenu,
  Modal,
  Loading,
  dateTime,
  navigate,
  useTask,
  errorMessage,
} from '../../components/ui';
import { ExportDialog } from '../export/ExportDialog';

export function Home({ settings }: { settings: Settings }) {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy('updatedAt').reverse().toArray(),
    [],
  );
  const [create, setCreate] = useState(false),
    [editing, setEditing] = useState<Session | null>(null),
    [exporting, setExporting] = useState<Session | null>(null),
    [deleting, setDeleting] = useState<Session | null>(null);
  const [filter, setFilter] = useState('recent'),
    [search, setSearch] = useState('');
  const task = useTask();
  if (!sessions) return <Loading />;
  const filtered = sessions.filter(
    (s) =>
      (filter === 'archived'
        ? s.status === 'archived'
        : s.status !== 'archived') &&
      s.name
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR')),
  );
  return (
    <main className="home page">
      <div className="page-heading">
        <div>
          <h1>Levantamentos</h1>
          <p>Da etiqueta ao relatório. Tudo no seu dispositivo.</p>
        </div>
        <button className="primary new-session" onClick={() => setCreate(true)}>
          <Plus />
          Novo levantamento
        </button>
      </div>
      <div className="list-toolbar">
        <div className="tabs" aria-label="Filtrar levantamentos">
          <button
            className={filter === 'recent' ? 'selected' : ''}
            onClick={() => setFilter('recent')}
          >
            Recentes{' '}
            <span>
              {sessions.filter((s) => s.status !== 'archived').length}
            </span>
          </button>
          <button
            className={filter === 'archived' ? 'selected' : ''}
            onClick={() => setFilter('archived')}
          >
            Arquivados
          </button>
        </div>
        {sessions.length > 0 && (
          <div className="search-field">
            <Search />
            <input
              aria-label="Buscar levantamentos"
              placeholder="Buscar levantamento"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <section className="empty-state">
          <div className="empty-mark">
            <ScanLine size={48} />
          </div>
          <h2>
            {sessions.length
              ? 'Nenhum levantamento encontrado'
              : 'O próximo levantamento começa aqui.'}
          </h2>
          <p>
            {sessions.length
              ? 'Altere a busca ou crie um novo levantamento.'
              : 'Leia um endereço, escaneie os produtos e leve o relatório pronto para o Excel.'}
          </p>
          <button className="primary" onClick={() => setCreate(true)}>
            <Plus />
            Novo levantamento
          </button>
          {!sessions.length && (
            <div className="workflow">
              <span>
                <MapPin />
                Leia o endereço
              </span>
              <ArrowRight />
              <span>
                <ScanLine />
                Leia os produtos
              </span>
              <ArrowRight />
              <span>
                <FileSpreadsheet />
                Exporte o Excel
              </span>
            </div>
          )}
        </section>
      ) : (
        <div className="session-list">
          {filtered.map((session, index) => (
            <article
              className={`session-row ${session.status}`}
              key={session.id}
              style={{ '--i': Math.min(index, 8) } as CSSProperties}
            >
              <div className="session-symbol">
                {session.status === 'completed' ? (
                  <CheckCircle2 />
                ) : (
                  <FolderOpen />
                )}
              </div>
              <div className="session-info">
                <button
                  className="session-title"
                  onClick={() =>
                    navigate(
                      `/session/${session.id}/${session.status === 'archived' ? 'records' : 'scanner'}`,
                    )
                  }
                >
                  {session.name}
                </button>
                <div className="session-meta">
                  <span>
                    <strong>{session.count}</strong> registros
                  </span>
                  <span>Atualizado {dateTime(session.updatedAt)}</span>
                  <span className={`status ${session.status}`}>
                    {session.status === 'active'
                      ? 'Em andamento'
                      : session.status === 'completed'
                        ? 'Concluído'
                        : 'Arquivado'}
                  </span>
                </div>
                {session.notes && (
                  <p className="session-note">{session.notes}</p>
                )}
              </div>
              <div className="session-actions">
                <button
                  className="btn-sheet"
                  aria-label={`Exportar ${session.name} para planilha`}
                  title="Exportar planilha"
                  onClick={() => setExporting(session)}
                >
                  <ExcelIcon />
                </button>
                <button
                  onClick={() =>
                    navigate(
                      `/session/${session.id}/${session.status === 'archived' ? 'records' : 'scanner'}`,
                    )
                  }
                >
                  {session.status === 'archived' ? 'Consultar' : 'Continuar'}
                  <ArrowRight />
                </button>
                <MoreMenu
                  label={`Opções de ${session.name}`}
                  items={[
                    {
                      label: 'Nome e observações',
                      icon: <Pencil />,
                      onSelect: () => setEditing(session),
                    },
                    {
                      label: 'Duplicar',
                      icon: <Copy />,
                      onSelect: () =>
                        void task(() => duplicateSession(session.id)),
                    },
                    {
                      label:
                        session.status === 'archived'
                          ? 'Desarquivar'
                          : 'Arquivar',
                      icon:
                        session.status === 'archived' ? (
                          <RotateCcw />
                        ) : (
                          <Archive />
                        ),
                      onSelect: () =>
                        void task(() =>
                          updateSession(session.id, {
                            status:
                              session.status === 'archived'
                                ? 'active'
                                : 'archived',
                          }),
                        ),
                    },
                    {
                      label: 'Excluir',
                      icon: <Trash2 />,
                      danger: true,
                      onSelect: () => setDeleting(session),
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      <footer className="page-footnote">
        <span className="local-dot" />
        Salvo neste navegador. Exporte um backup para guardar uma cópia em outro
        lugar.
      </footer>
      {(create || editing) && (
        <SessionForm
          session={editing}
          settings={settings}
          onClose={() => {
            setCreate(false);
            setEditing(null);
          }}
        />
      )}
      {exporting && (
        <ExportDialog
          session={exporting}
          defaultFormat={settings.exportFormat}
          onClose={() => setExporting(null)}
        />
      )}{' '}
      {deleting && (
        <Confirm
          title="Excluir levantamento?"
          message={`“${deleting.name}” e seus ${deleting.count} registros serão excluídos deste dispositivo.`}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteSession(deleting.id)}
        />
      )}
    </main>
  );
}
function SessionForm({
  session,
  settings,
  onClose,
}: {
  session: Session | null;
  settings: Settings;
  onClose: () => void;
}) {
  const [name, setName] = useState(session?.name ?? ''),
    [notes, setNotes] = useState(session?.notes ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title={session ? 'Nome e observações' : 'Novo levantamento'}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (session)
              await updateSession(session.id, { name: name.trim(), notes });
            else {
              const created = await createSession(name, settings.mode);
              if (notes) await updateSession(created.id, { notes });
              navigate(`/session/${created.id}/scanner`);
            }
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome do levantamento
          <input
            autoFocus
            required
            maxLength={100}
            placeholder="Ex.: Inventário Rua 01"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Observações <span className="optional">opcional</span>
          <textarea
            maxLength={2000}
            placeholder="Setor, lado da rua ou informações úteis"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
            {busy
              ? 'Salvando…'
              : session
                ? 'Salvar alterações'
                : 'Criar levantamento'}
            <ArrowRight />
          </button>
        </div>
      </form>
    </Modal>
  );
}
