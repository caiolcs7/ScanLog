/**
 * Pede ao navegador armazenamento persistente: com ele, levantamentos e
 * dados locais nunca são apagados automaticamente para liberar espaço.
 * O app em si nunca apaga dados sem uma ação explícita do operador.
 */
export async function protectStorage(): Promise<boolean> {
  const storage =
    typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persist) return false;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
