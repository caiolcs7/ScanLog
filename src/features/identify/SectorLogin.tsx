import { useState } from 'react';
import { ArrowRight, Boxes, Lock, Network } from 'lucide-react';
import { errorMessage } from '../../components/ui';
import { sectors, type Sector } from '../../cloud/config';
import { signIn } from '../../cloud/auth';

const about: Record<Sector, string> = {
  almoxarifado: 'Fotografa os produtos sem código e confere o retorno.',
  estrutura: 'Preenche o código de cada item enviado.',
};
/** Entrada por setor: senha guardada só no Supabase, nunca no app. */
export function SectorLogin() {
  const [sector, setSector] = useState<Sector | null>(null),
    [name, setName] = useState(() => {
      try {
        return localStorage.getItem('scanlog-operador') ?? '';
      } catch {
        return '';
      }
    }),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <main className="page sector-login">
      <div className="page-heading">
        <div>
          <h1>Identificação</h1>
          <p>
            Escolha o seu setor para entrar. O acesso fica salvo neste aparelho.
          </p>
        </div>
      </div>
      <form
        className="sector-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!sector) return;
          setBusy(true);
          setError('');
          try {
            await signIn(sector, password, name);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="sector-choice" role="radiogroup" aria-label="Setor">
          {(Object.keys(sectors) as Sector[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={sector === key}
              className={sector === key ? 'selected' : ''}
              onClick={() => {
                setSector(key);
                setError('');
              }}
            >
              {key === 'almoxarifado' ? <Boxes /> : <Network />}
              <strong>{sectors[key].label}</strong>
              <small>{about[key]}</small>
            </button>
          ))}
        </div>
        {sector && (
          <div className="sector-fields">
            <label>
              Seu nome
              <input
                autoComplete="name"
                maxLength={60}
                required
                value={name}
                placeholder="Como aparece nos registros"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Senha do {sectors[sector].label.toLowerCase()}
              <span className="field-icon">
                <Lock aria-hidden="true" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </span>
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={busy || !password || name.trim().length < 2}
            >
              {busy ? 'Entrando…' : 'Entrar'}
              <ArrowRight />
            </button>
          </div>
        )}
      </form>
    </main>
  );
}
