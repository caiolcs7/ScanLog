import { useState } from 'react';
import {
  ArrowRight,
  Boxes,
  Lock,
  Network,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { errorMessage } from '../../components/ui';
import { sectors, type Sector } from '../../cloud/config';
import { signIn } from '../../cloud/auth';

const about: Record<Sector, string> = {
  almoxarifado:
    'Cada pessoa entra com o próprio usuário e vê só os lotes dela.',
  estrutura: 'Preenche o código de cada item enviado.',
  admin: 'Os dois setores juntos: edita e exclui tudo.',
};
const icons: Record<Sector, typeof Boxes> = {
  almoxarifado: Boxes,
  estrutura: Network,
  admin: ShieldCheck,
};
/**
 * Entrada: almoxarifado com usuário próprio, estrutura com a senha do setor.
 * Senhas ficam só no Supabase, nunca no app.
 */
export function SectorLogin() {
  const [sector, setSector] = useState<Sector | null>(null),
    [name, setName] = useState(() => {
      try {
        return localStorage.getItem('scanlog-operador') ?? '';
      } catch {
        return '';
      }
    }),
    [user, setUser] = useState(''),
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
            await signIn(
              sector,
              password,
              sector === 'almoxarifado' ? user : name,
            );
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="sector-choice" role="radiogroup" aria-label="Setor">
          {(['almoxarifado', 'estrutura'] as Sector[]).map((key) => {
            const Icon = icons[key];
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={sector === key}
                className={`${sector === key ? 'selected' : ''} ${key === 'admin' ? 'sector-admin' : ''}`}
                onClick={() => {
                  setSector(key);
                  setError('');
                }}
              >
                <Icon />
                <strong>{sectors[key].label}</strong>
                <small>{about[key]}</small>
              </button>
            );
          })}
        </div>
        {sector && (
          <div className="sector-fields">
            {sector === 'almoxarifado' ? (
              <label>
                Usuário
                <span className="field-icon">
                  <UserRound aria-hidden="true" />
                  <input
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={30}
                    required
                    value={user}
                    placeholder="ex.: ilidio"
                    onChange={(e) => setUser(e.target.value)}
                  />
                </span>
                <small className="field-hint">
                  Quem não tem usuário pede ao administrador.
                </small>
              </label>
            ) : (
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
            )}
            <label>
              {sector === 'almoxarifado'
                ? 'Sua senha'
                : `Senha do ${sectors[sector].label.toLowerCase()}`}
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
              disabled={
                busy ||
                !password ||
                (sector === 'almoxarifado' ? user : name).trim().length < 2
              }
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
