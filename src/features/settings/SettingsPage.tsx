import { useEffect, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Download,
  Save,
  ShieldCheck,
  Trash2,
  Volume2,
  ScanLine,
  Database,
  SlidersHorizontal,
} from 'lucide-react';
import { clearAllData, db } from '../../core/database';
import {
  defaultSettings,
  settingsSchema,
  type Settings,
} from '../../core/models';
import { validateRules } from '../../core/parser';
import {
  createBackup,
  importBackup,
  validateBackup,
  type Backup,
} from '../../services/backup';
import {
  Confirm,
  Modal,
  errorMessage,
  useNotice,
  useTask,
} from '../../components/ui';

export function SettingsPage({ settings }: { settings: Settings }) {
  const [form, setForm] = useState(() => structuredClone(settings)),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [clearing, setClearing] = useState(false),
    [backup, setBackup] = useState<Backup | null>(null),
    [restoreSettings, setRestoreSettings] = useState(false);
  const [productPatterns, setProductPatterns] = useState(
      settings.rules.productPatterns.join('\n'),
    ),
    [addressPatterns, setAddressPatterns] = useState(
      settings.rules.addressPatterns.join('\n'),
    ),
    [wrappers, setWrappers] = useState(
      JSON.stringify(settings.rules.wrappers, null, 2),
    );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [persisted, setPersisted] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const notice = useNotice(),
    task = useTask();
  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setDevices(d.filter((x) => x.kind === 'videoinput')))
      .catch(() => {});
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => {});
  }, []);
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  return (
    <main className="settings-page page">
      <div className="page-heading">
        <div>
          <h1>Configurações</h1>
          <p>Ajustes para o seu dispositivo e suas etiquetas.</p>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const next = settingsSchema.parse({
              ...form,
              rules: {
                ...form.rules,
                productPatterns: productPatterns
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
                addressPatterns: addressPatterns
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
                wrappers: JSON.parse(wrappers),
              },
            });
            validateRules(next.rules);
            await db.settings.put(next);
            notice('Configurações salvas.', 'success');
          } catch (err) {
            setError(
              err instanceof SyntaxError
                ? 'Wrappers: informe uma lista JSON válida.'
                : errorMessage(err),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="settings-section">
          <div className="settings-section-title">
            <Volume2 />
            <div>
              <h2>Feedback e aparência</h2>
              <p>Perceba cada leitura sem desviar o olhar.</p>
            </div>
          </div>
          <div className="settings-fields">
            <Toggle
              title="Som de leitura"
              description="Sons diferentes para produto, endereço e erro."
              checked={form.sound}
              onChange={(value) => change('sound', value)}
            />
            <Toggle
              title="Vibração"
              description="Resposta curta, quando suportada pelo dispositivo."
              checked={form.vibration}
              onChange={(value) => change('vibration', value)}
            />
            <label>
              Tema
              <select
                value={form.theme}
                onChange={(e) =>
                  change('theme', e.target.value as Settings['theme'])
                }
              >
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
                <option value="system">Acompanhar dispositivo</option>
              </select>
            </label>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <ScanLine />
            <div>
              <h2>Leitura</h2>
              <p>O modo padrão vale para novos levantamentos.</p>
            </div>
          </div>
          <div className="settings-fields">
            <label>
              Modo de leitura padrão
              <select
                value={form.mode}
                onChange={(e) =>
                  change('mode', e.target.value as Settings['mode'])
                }
              >
                <option value="fixed">Endereço fixo</option>
                <option value="product-address">
                  Pareado · produto → endereço
                </option>
                <option value="address-product">
                  Pareado · endereço → produto
                </option>
              </select>
            </label>
            <label>
              Entrada preferida
              <select
                value={form.input}
                onChange={(e) =>
                  change('input', e.target.value as Settings['input'])
                }
              >
                <option value="camera">Câmera</option>
                <option value="hid">Leitor físico</option>
              </select>
            </label>
            <label>
              Formato de exportação padrão
              <select
                value={form.exportFormat}
                onChange={(e) =>
                  change(
                    'exportFormat',
                    e.target.value as Settings['exportFormat'],
                  )
                }
              >
                <option value="xlsx">Excel (.xlsx) — formatado</option>
                <option value="csv">CSV (.csv)</option>
              </select>
            </label>
            <label>
              Câmera padrão
              <select
                value={form.cameraId}
                onChange={(e) => change('cameraId', e.target.value)}
              >
                <option value="">Automática · preferir traseira</option>
                {devices.map((device, index) => (
                  <option
                    key={device.deviceId || index}
                    value={device.deviceId}
                  >
                    {device.label || `Câmera ${index + 1}`}
                  </option>
                ))}
              </select>
              <span className="helper">
                Para identificar todas as câmeras, permita o acesso na tela de
                leitura.
              </span>
            </label>
            <Toggle
              title="Lanterna automática"
              description="Ativa ao iniciar a câmera, se houver suporte."
              checked={form.autoTorch}
              onChange={(value) => change('autoTorch', value)}
            />
            <Toggle
              title="Ler descritivo da etiqueta"
              description="Ao ler um produto pela câmera, reconhece o texto impresso (OCR no aparelho) e preenche a coluna Descritivo. A imagem é descartada logo após a leitura. Na primeira vez, baixa o modelo de português (~2 MB)."
              checked={form.readDescription}
              onChange={(value) => change('readDescription', value)}
            />
            <Toggle
              title="Bombonas automáticas"
              description="Cada código recebe o próximo galão da rua do endereço (R14G01, R14G02…). Use Mesmo galão para guardar mais de um código na mesma bombona e Pular para G para saltar a numeração (G05 → G20). Ao excluir, a numeração é refeita em sequência."
              checked={form.autoGalao}
              onChange={(value) => change('autoGalao', value)}
            />
            <Toggle
              title="Avisar sobre duplicados"
              description="Pergunta antes de adicionar o mesmo código no mesmo endereço. O bloqueio de frames repetidos da câmera permanece ativo."
              checked={form.duplicates}
              onChange={(value) => change('duplicates', value)}
            />
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <SlidersHorizontal />
            <div>
              <h2>Regras das etiquetas</h2>
              <p>Valores desconhecidos são recusados para conferência.</p>
            </div>
          </div>
          <div className="settings-fields">
            <Toggle
              title="Preencher B com três dígitos"
              description="Somente endereços simples: R14B77 passa a R14B077. Endereços complexos permanecem iguais."
              checked={form.rules.padB}
              onChange={(value) =>
                setForm({ ...form, rules: { ...form.rules, padB: value } })
              }
            />
            <p className="helper">
              Produtos não têm restrição de prefixo. Etiquetas GS1 com os
              identificadores 251/37 são limpas automaticamente. Endereços
              completos são reconhecidos pela estrutura da posição.
            </p>
            <details className="advanced">
              <summary>Padrões e normalização avançada</summary>
              <p className="helper">
                Um padrão por linha, com ^ e $. Use letras, números, classes
                como [A-Z] e limites como &#123;3,64&#125;. Não são aceitos
                grupos nem repetições abertas. Quando um valor também formar um
                endereço completo, ele será tratado como endereço.
              </p>
              <label>
                Padrões de produto
                <textarea
                  className="mono"
                  value={productPatterns}
                  onChange={(e) => setProductPatterns(e.target.value)}
                  rows={3}
                />
              </label>
              <label>
                Padrões de endereço
                <textarea
                  className="mono"
                  value={addressPatterns}
                  onChange={(e) => setAddressPatterns(e.target.value)}
                  rows={4}
                />
              </label>
              <label>
                Wrappers completos (JSON)
                <textarea
                  className="mono"
                  value={wrappers}
                  onChange={(e) => setWrappers(e.target.value)}
                  rows={4}
                />
              </label>
              <p className="helper">
                Exemplo opcional: [&#123;"prefix":"251","suffix":"371"&#125;].
                Só remova se o par completo envolver um único código válido e o
                original não for válido.
              </p>
              <button
                type="button"
                onClick={() => {
                  setProductPatterns(
                    defaultSettings.rules.productPatterns.join('\n'),
                  );
                  setAddressPatterns(
                    defaultSettings.rules.addressPatterns.join('\n'),
                  );
                  setWrappers('[]');
                }}
              >
                Restaurar padrões iniciais no formulário
              </button>
              <Toggle
                title="Guardar leitura bruta para auditoria"
                description="Salva o conteúdo original localmente, junto do histórico. O Excel recebe apenas valores normalizados."
                checked={form.saveRaw}
                onChange={(value) => change('saveRaw', value)}
              />
            </details>
          </div>
        </section>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="settings-save">
          <button className="primary" disabled={busy}>
            <Save />
            {busy ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
      </form>
      <section className="settings-section">
        <div className="settings-section-title">
          <Database />
          <div>
            <h2>Seus dados</h2>
            <p>Uma cópia fora do navegador protege seu trabalho.</p>
          </div>
        </div>
        <div className="settings-fields">
          <p>
            O backup inclui levantamentos, registros, histórico e configurações.
          </p>
          <div className="backup-actions">
            <button
              onClick={() =>
                void task(async () => {
                  const content = await createBackup();
                  const { downloadBlob } =
                    await import('../../services/export');
                  downloadBlob(
                    new Blob([JSON.stringify(content, null, 2)], {
                      type: 'application/json',
                    }),
                    `Backup_Almoxarifado_${new Date().toISOString().slice(0, 10)}.json`,
                  );
                  notice(
                    'Backup gerado. Guarde o arquivo em um local seguro.',
                    'success',
                  );
                })
              }
            >
              <Download />
              Exportar backup
            </button>
            <button onClick={() => fileInput.current?.click()}>
              <ArchiveRestore />
              Restaurar backup
            </button>
          </div>
          <input
            className="sr-only"
            ref={fileInput}
            aria-label="Selecionar backup JSON"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file)
                void task(async () => {
                  if (file.size > 100 * 1024 * 1024)
                    throw new Error('Backup excede o limite de 100 MB.');
                  setBackup(validateBackup(JSON.parse(await file.text())));
                });
            }}
          />
          <div className="storage-info">
            <p>
              {persisted
                ? 'Armazenamento persistente concedido pelo navegador.'
                : 'Armazenamento local. O navegador pode liberar espaço se o dispositivo ficar cheio.'}
            </p>
            {!persisted && (
              <button
                onClick={() =>
                  void task(async () => {
                    const granted = await navigator.storage?.persist?.();
                    setPersisted(!!granted);
                    notice(
                      granted
                        ? 'Armazenamento persistente ativado.'
                        : 'O navegador decide essa permissão automaticamente. Mantenha backups regulares.',
                    );
                  })
                }
              >
                Solicitar armazenamento persistente
              </button>
            )}
          </div>
          <button className="text-danger" onClick={() => setClearing(true)}>
            <Trash2 />
            Limpar todos os dados
          </button>
        </div>
      </section>
      <section className="privacy-note">
        <ShieldCheck />
        <div>
          <h2>Privacidade por padrão</h2>
          <p>
            Todos os dados são processados localmente neste dispositivo. As
            imagens da câmera e os registros não são enviados para servidores.
          </p>
          <p className="helper">
            Limpar os dados do navegador ou desinstalar pode remover os
            levantamentos. O armazenamento depende do navegador e do endereço do
            aplicativo. Versão 1.0.0.
          </p>
        </div>
      </section>
      {clearing && (
        <Confirm
          title="Limpar todos os dados?"
          message="Todos os levantamentos, registros, históricos e configurações deste aplicativo serão apagados. Exporte um backup antes de continuar."
          strong="APAGAR TUDO"
          onClose={() => setClearing(false)}
          onConfirm={async () => {
            await clearAllData();
            window.location.hash = '/';
          }}
        />
      )}
      {backup && (
        <Modal title="Restaurar backup" onClose={() => setBackup(null)}>
          <p>
            Arquivo validado:{' '}
            <strong>{backup.sessions.length} levantamentos</strong> e{' '}
            <strong>{backup.records.length} registros</strong>.
          </p>
          <p>
            Os levantamentos serão adicionados como cópias com o sufixo
            “restaurado”. Os dados existentes serão preservados.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={restoreSettings}
              onChange={(e) => setRestoreSettings(e.target.checked)}
            />
            Substituir também as configurações atuais
          </label>
          <div className="modal-actions">
            <button onClick={() => setBackup(null)}>Cancelar</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  setBusy(true);
                  try {
                    await importBackup(backup, restoreSettings);
                    setBackup(null);
                    notice('Backup restaurado com sucesso.', 'success');
                    window.location.hash = '/';
                  } finally {
                    setBusy(false);
                  }
                })
              }
            >
              {busy ? 'Restaurando…' : 'Adicionar cópias'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
