import { useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Camera,
  FileText,
  Pencil,
  Plus,
  ScanSearch,
  Trash2,
} from 'lucide-react';
import { createLot, deleteLot, renameLot } from '../../core/identify';
import type { FindLot } from '../../core/models';
import {
  Confirm,
  Modal,
  MoreMenu,
  dateTime,
  errorMessage,
  navigate,
} from '../../components/ui';

/** Lista de lotes da aba Identificação. */
export function IdentifyLots({
  lots,
  creating,
  onCreate,
  onCloseCreate,
}: {
  lots: FindLot[];
  creating: boolean;
  onCreate: () => void;
  onCloseCreate: () => void;
}) {
  const [renaming, setRenaming] = useState<FindLot | null>(null),
    [deleting, setDeleting] = useState<FindLot | null>(null);
  const open = (lot: FindLot) => navigate(`/identify/${lot.id}`);
  return (
    <>
      {lots.length === 0 ? (
        <section className="empty-state">
          <div className="empty-mark find-mark">
            <ScanSearch size={46} />
          </div>
          <h2>Produto sem etiqueta? Fotografe e envie.</h2>
          <p>
            Monte um lote com fotos, bombona e peso. O documento vai para o
            setor responsável, que escreve o código de cada item e devolve.
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
              <FileText />
              Exporte o Word
            </span>
            <ArrowRight />
            <span>
              <Pencil />
              Recebe os códigos
            </span>
          </div>
        </section>
      ) : (
        <div className="session-list">
          {lots.map((lot, index) => (
            <article
              className="session-row find-lot"
              key={lot.id}
              style={{ '--i': Math.min(index, 8) } as CSSProperties}
            >
              <div className="session-symbol">
                <ScanSearch />
              </div>
              <div className="session-info">
                <button className="session-title" onClick={() => open(lot)}>
                  {lot.name}
                </button>
                <div className="session-meta">
                  <span>
                    <strong>{lot.count}</strong>{' '}
                    {lot.count === 1 ? 'produto' : 'produtos'}
                  </span>
                  <span>Atualizado {dateTime(lot.updatedAt)}</span>
                  <span className="status identify">A identificar</span>
                </div>
              </div>
              <div className="session-actions">
                <button onClick={() => open(lot)}>
                  Abrir
                  <ArrowRight />
                </button>
                <MoreMenu
                  label={`Opções de ${lot.name}`}
                  items={[
                    {
                      label: 'Renomear',
                      icon: <Pencil />,
                      onSelect: () => setRenaming(lot),
                    },
                    {
                      label: 'Excluir',
                      icon: <Trash2 />,
                      danger: true,
                      onSelect: () => setDeleting(lot),
                    },
                  ]}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {(creating || renaming) && (
        <LotForm
          lot={renaming}
          onClose={() => {
            onCloseCreate();
            setRenaming(null);
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="Excluir lote?"
          message={`“${deleting.name}” e seus ${deleting.count} produtos fotografados serão excluídos deste dispositivo.`}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteLot(deleting.id)}
        />
      )}
    </>
  );
}

function LotForm({
  lot,
  onClose,
}: {
  lot: FindLot | null;
  onClose: () => void;
}) {
  const today = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(Date.now());
  const [name, setName] = useState(lot?.name ?? `Sem código ${today}`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title={lot ? 'Renomear lote' : 'Nova identificação'}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (lot) await renameLot(lot.id, name);
            else navigate(`/identify/${(await createLot(name)).id}`);
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
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
        {!lot && (
          <p className="helper">
            Agrupe os produtos que vão juntos para o mesmo setor.
          </p>
        )}
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
            {busy ? 'Salvando…' : lot ? 'Salvar' : 'Criar lote'}
            <ArrowRight />
          </button>
        </div>
      </form>
    </Modal>
  );
}
