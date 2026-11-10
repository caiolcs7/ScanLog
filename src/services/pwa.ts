/** Activate only after the operator requests an update and local writes finish. */
export async function activateWaitingUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting;
  if (waiting) {
    // Recarrega quando a versão nova assume. Se o navegador não avisar
    // (controllerchange às vezes não dispara), recarrega mesmo assim: os
    // dados ficam no aparelho e a versão nova entra ao abrir.
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', done);
        waiting.removeEventListener('statechange', state);
        resolve();
      };
      const state = () => {
        if (waiting.state === 'activated') done();
      };
      const timer = setTimeout(done, 6000);
      navigator.serviceWorker.addEventListener('controllerchange', done);
      waiting.addEventListener('statechange', state);
      waiting.postMessage({ type: 'SKIP_WAITING' });
    });
  }
  // Preserve the current hash route. Do not depend on Workbox's isUpdate flag:
  // an update from another tab can be classified as an external installation.
  window.location.reload();
}
