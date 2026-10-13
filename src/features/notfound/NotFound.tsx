import type { ReactNode } from 'react';
import { ClipboardList, ScanSearch } from 'lucide-react';
import { navigate } from '../../components/ui';

/** Página 404: etiqueta "sem leitura" no padrão visual do app. */
export function NotFound({
  title = 'Esta página não existe',
  message = 'O endereço pode ter mudado ou foi digitado errado. Seus dados continuam salvos.',
  path,
  actions,
}: {
  title?: string;
  message?: string;
  path?: string;
  actions?: ReactNode;
}) {
  return (
    <main className="page not-found">
      <div className="not-found-card">
        <div className="not-found-label" aria-hidden="true">
          <Matrix />
          <div className="not-found-code">
            404
            <small>Sem leitura</small>
          </div>
          <span className="not-found-scan" />
        </div>
        <h1>{title}</h1>
        <p>{message}</p>
        {path && <code className="not-found-path">{path}</code>}
        <div className="not-found-actions">
          {actions ?? (
            <>
              <button className="primary" onClick={() => navigate('/')}>
                <ClipboardList />
                Ir para Levantamentos
              </button>
              <button onClick={() => navigate('/identificacao')}>
                <ScanSearch />
                Identificação
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/** Data Matrix decorativo com um quadrante "faltando". */
function Matrix() {
  const cells = [
    0b1010101010, 0b1101100111, 0b1000111001, 0b1110010011, 0b1001101101,
    0b1100000001, 0b1011000011, 0b1000000101, 0b1110100001, 0b1111111111,
  ];
  return (
    <svg className="not-found-matrix" viewBox="0 0 10 10" fill="currentColor">
      {cells.flatMap((row, y) =>
        Array.from({ length: 10 }, (_, x) =>
          (y === 9 || x === 0 || (row >> (9 - x)) & 1) &&
          !(x >= 5 && x <= 8 && y >= 5 && y <= 8) ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
          ) : null,
        ),
      )}
    </svg>
  );
}
