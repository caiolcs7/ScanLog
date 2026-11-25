import { useState } from 'react';
import { Modal, errorMessage } from '../../components/ui';
import type { Session, Settings } from '../../core/models';
import { addManual, type ScanResult } from '../../core/scan-engine';
export function ManualDialog({
  session,
  settings,
  onClose,
  onResult,
}: {
  session: Session;
  settings: Settings;
  onClose: () => void;
  onResult: (result: ScanResult) => void;
}) {
  const [code, setCode] = useState(''),
    [entryType, setEntryType] = useState<
      'code' | 'no-code' | 'empty' | 'descriptive'
    >('code'),
    [address, setAddress] = useState(session.activeAddress),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Entrada manual" onClose={onClose}>
      <p className="helper">
        Transcreva exatamente o que está na etiqueta. Não complete códigos
        ilegíveis.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const resolvedCode =
              entryType === 'no-code'
                ? 'SEM CODIGO'
                : entryType === 'empty'
                  ? 'VAZIO'
                  : code;
            onResult(
              await addManual(
                session.id,
                resolvedCode,
                address,
                settings,
                entryType === 'descriptive',
              ),
            );
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="manual-entry-options">
          <legend>Como registrar o produto</legend>
          <label>
            <input
              type="radio"
              name="manual-entry-type"
              value="code"
              checked={entryType === 'code'}
              onChange={() => setEntryType('code')}
            />
            Informar código
          </label>
          <label>
            <input
              type="radio"
              name="manual-entry-type"
              value="no-code"
              checked={entryType === 'no-code'}
              onChange={() => setEntryType('no-code')}
            />
            SEM CÓDIGO
          </label>
          <label>
            <input
              type="radio"
              name="manual-entry-type"
              value="empty"
              checked={entryType === 'empty'}
              onChange={() => setEntryType('empty')}
            />
            VAZIO
          </label>
          <label>
            <input
              type="radio"
              name="manual-entry-type"
              value="descriptive"
              checked={entryType === 'descriptive'}
              onChange={() => setEntryType('descriptive')}
            />
            DESCRITIVO
          </label>
        </fieldset>
        {entryType === 'descriptive' && (
          <label>
            Descritivo
            <textarea
              autoFocus
              required
              rows={3}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={500}
            />
          </label>
        )}
        {entryType === 'code' && (
          <label>
            Código do Produto
            <input
              autoFocus
              className="mono"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={128}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
        )}
        <label>
          Endereço
          <input
            className="mono"
            required
            aria-describedby="manual-address-help"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={128}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <p className="helper" id="manual-address-help">
          Preenchido automaticamente com o último endereço lido.
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
            {busy ? 'Salvando…' : 'Adicionar registro'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
