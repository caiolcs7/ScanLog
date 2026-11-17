import { useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  Pencil,
  RefreshCw,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';
import { Modal, errorMessage, useNotice } from '../../components/ui';
import { useCloud } from '../../cloud/hooks';
import {
  countLotsByPessoa,
  listPessoas,
  savePessoa,
  suggestLogin,
  type Pessoa,
} from '../../cloud/pessoas';

const loadAll = async () => {
  const [pessoas, counts] = await Promise.all([
    listPessoas(),
    countLotsByPessoa(),
  ]);
  return { pessoas, counts };
};
const lots = (n: number) => `${n} ${n === 1 ? 'lote' : 'lotes'}`;

/** Administrador: quem do almoxarifado entra, com usuário e senha próprios. */
export function PessoasAdmin() {
  const { data, error, loading, reload } = useCloud(loadAll, []);
  const [editing, setEditing] = useState<Pessoa | 'new' | null>(null);
  return (
    <section className="settings-section">
      <div className="settings-section-title">
        <Users />
        <div>
          <h2>Pessoas do almoxarifado</h2>
          <p>Cada pessoa entra com o próprio usuário e vê só os lotes dela.</p>
        </div>
      </div>
      <div className="settings-fields">
        {error && (
          <div className="cloud-error" role="alert">
            <span>{error}</span>
            <button onClick={() => void reload()}>
              <RefreshCw />
              Tentar de novo
            </button>
          </div>
        )}
        {!data && loading && <p className="helper">Buscando pessoas…</p>}
        {data && (
          <ul className="people-list">
            {data.pessoas.map((p) => (
              <li key={p.id} className={p.ativo ? '' : 'inactive'}>
                <span className="people-avatar" aria-hidden="true">
                  {p.nome.trim()[0]?.toUpperCase()}
                </span>
                <span className="people-info">
                  <strong>{p.nome}</strong>
                  <small>
                    {p.login} · {lots(data.counts.get(p.id) ?? 0)}
                    {!p.ativo && ' · Desativada'}
                  </small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`Editar ${p.nome}`}
                  onClick={() => setEditing(p)}
                >
                  <Pencil />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button onClick={() => setEditing('new')}>
          <UserPlus />
          Adicionar pessoa
        </button>
      </div>
      {editing && data && (
        <PessoaForm
          pessoa={editing === 'new' ? null : editing}
          taken={data.pessoas.map((p) => p.login)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}

function PessoaForm({
  pessoa,
  taken,
  onClose,
  onSaved,
}: {
  pessoa: Pessoa | null;
  taken: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const notice = useNotice();
  const [nome, setNome] = useState(pessoa?.nome ?? ''),
    [login, setLogin] = useState(pessoa?.login ?? ''),
    [loginTouched, setLoginTouched] = useState(!!pessoa),
    [senha, setSenha] = useState(''),
    [show, setShow] = useState(false),
    [ativo, setAtivo] = useState(pessoa?.ativo ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const others = taken.filter((t) => t !== pessoa?.login);
  const loginOk = /^[a-z0-9][a-z0-9._-]{1,29}$/.test(login);
  const senhaOk = pessoa ? !senha || senha.length >= 6 : senha.length >= 6;
  return (
    <Modal
      title={pessoa ? `Editar ${pessoa.nome}` : 'Nova pessoa'}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await savePessoa({
              id: pessoa?.id,
              nome,
              login,
              senha: senha || undefined,
              ativo,
            });
            notice(pessoa ? 'Pessoa atualizada.' : 'Pessoa cadastrada.');
            onSaved();
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        <label>
          Nome
          <input
            autoFocus
            required
            maxLength={60}
            value={nome}
            placeholder="Como aparece nos lotes"
            onChange={(e) => {
              setNome(e.target.value);
              if (!loginTouched) setLogin(suggestLogin(e.target.value, others));
            }}
          />
        </label>
        <label>
          Usuário
          <span className="field-icon">
            <UserRound aria-hidden="true" />
            <input
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={30}
              value={login}
              aria-invalid={!!login && !loginOk}
              onChange={(e) => {
                setLoginTouched(true);
                setLogin(e.target.value.toLowerCase().replace(/\s/g, ''));
              }}
            />
          </span>
          <small className="field-hint">
            Letras minúsculas e números, sem acento. É o que a pessoa digita
            para entrar.
          </small>
        </label>
        <label>
          {pessoa ? 'Nova senha' : 'Senha'}
          <span className="field-icon">
            <Lock aria-hidden="true" />
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required={!pessoa}
              minLength={6}
              maxLength={72}
              value={senha}
              aria-invalid={!!senha && senha.length < 6}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
              aria-pressed={show}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff /> : <Eye />}
            </button>
          </span>
          <small className="field-hint">
            {pessoa
              ? 'Deixe em branco para manter a senha atual.'
              : 'Mínimo de 6 caracteres. Passe para a pessoa.'}
          </small>
        </label>
        {pessoa && (
          <label className="toggle-row">
            <span>
              <strong>Pode entrar</strong>
              <small>
                Desligado: a pessoa sai de todos os aparelhos. Os lotes dela
                continuam salvos.
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
          </label>
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
          <button
            className="primary"
            disabled={busy || nome.trim().length < 2 || !loginOk || !senhaOk}
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
