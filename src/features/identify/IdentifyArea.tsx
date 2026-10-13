import { useEffect } from 'react';
import { CloudOff } from 'lucide-react';
import { Loading } from '../../components/ui';
import type { Settings } from '../../core/models';
import { cloudConfigured } from '../../cloud/config';
import { useCloudAuth } from '../../cloud/auth';
import { watchOutbox } from '../../cloud/outbox';
import { SectorLogin } from './SectorLogin';
import { LotList } from './LotList';
import { LotPage } from './LotPage';

/** Área da Identificação: compartilhada entre almoxarifado e estrutura. */
export function IdentifyArea({
  lotId,
  settings,
}: {
  lotId?: string;
  settings: Settings;
}) {
  const auth = useCloudAuth();
  const almox = auth.status === 'in' && auth.sector === 'almoxarifado';
  useEffect(() => {
    if (almox) watchOutbox();
  }, [almox]);
  if (!cloudConfigured)
    return (
      <main className="page">
        <section className="empty-state">
          <div className="empty-mark find-mark">
            <CloudOff size={44} />
          </div>
          <h2>Identificação na nuvem não configurada</h2>
          <p>Os levantamentos continuam funcionando normalmente.</p>
        </section>
      </main>
    );
  if (auth.status === 'loading')
    return <Loading text="Abrindo Identificação…" />;
  if (auth.status === 'out') return <SectorLogin />;
  return lotId ? (
    <LotPage key={lotId} id={lotId} auth={auth} settings={settings} />
  ) : (
    <LotList auth={auth} />
  );
}
