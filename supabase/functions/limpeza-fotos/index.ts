// Limpeza diária das fotos da Identificação (agendada por pg_cron às 06:00 UTC).
// 1. Miniaturas vencidas (150 dias após a confirmação) são apagadas.
// 2. Originais de itens confirmados que ficaram para trás (aparelho caiu no
//    meio da confirmação) são apagados.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const BUCKET = 'identificacao',
  BATCH = 100;

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  // Segredo guardado no Vault e enviado pelo cron: chamadas avulsas são recusadas.
  const { data: secret } = await admin.rpc('limpeza_secret');
  if (!secret || req.headers.get('x-cron-secret') !== secret)
    return new Response('Não autorizado', { status: 401 });

  let thumbs = 0,
    originals = 0;
  for (;;) {
    const { data, error } = await admin
      .from('items')
      .select('id, thumb_path')
      .lt('thumb_expires_at', new Date().toISOString())
      .not('thumb_path', 'is', null)
      .limit(BATCH);
    if (error) throw error;
    if (!data.length) break;
    await admin.storage.from(BUCKET).remove(data.map((i) => i.thumb_path));
    const { error: update } = await admin
      .from('items')
      .update({ thumb_path: null })
      .in(
        'id',
        data.map((i) => i.id),
      );
    if (update) throw update;
    thumbs += data.length;
    if (data.length < BATCH) break;
  }
  const yesterday = new Date(Date.now() - 864e5).toISOString();
  for (;;) {
    const { data, error } = await admin
      .from('items')
      .select('id, photos')
      .eq('status', 'confirmado')
      .lt('confirmed_at', yesterday)
      .neq('photos', '[]')
      .limit(BATCH);
    if (error) throw error;
    if (!data.length) break;
    const paths = data.flatMap((i) =>
      (i.photos as { path: string }[]).map((p) => p.path),
    );
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    const { error: update } = await admin
      .from('items')
      .update({ photos: [], photos_deleted_at: new Date().toISOString() })
      .in(
        'id',
        data.map((i) => i.id),
      );
    if (update) throw update;
    originals += paths.length;
    if (data.length < BATCH) break;
  }
  return Response.json({ thumbs, originals });
});
