// Embute as regras (regras.mjs + aplicar.mjs) e a atualização automática no
// script da página do Relatório. Uso:
//   node scripts/protheus/pagina.mjs <pagina.html> <saida.html>
// A página, aberta pelo dono, busca a última leitura do Protheus no Supabase
// (pelo conector), aplica as regras, salva e traduz o que faltar. O bloco fica
// entre os marcadores PXA e é trocado a cada execução.
import fs from 'node:fs';

const dir = new URL('.', import.meta.url);
const semModulo = (f) =>
  fs
    .readFileSync(new URL(f, dir), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export \{[^}]*\};?$/gm, '')
    .replace(/^export (function|const) /gm, '$1 ');

const PXA = `/*PXA-INI*/
window.PXA=(function(){
${semModulo('regras.mjs')}
${semModulo('aplicar.mjs')}
return {aplicar:aplicar,conhecidosDe:conhecidosDe};
})();
/*PXA-FIM*/
`;

// Roda dentro do script da página (escopo dela: state, ESP, espRows, ruLoad...).
const SYNC = `/*PXS-INI*/
  var apiBusy=false;
  function apiSync(){
    if(ro||apiBusy||!window.PXA||!(window.claude&&window.claude.use))return;apiBusy=true;
    var mcp=null;function sql(q){return mcp.callTool(ESP.srv,'execute_sql',{project_id:ESP.proj,query:q},{cache:false})}
    function q(v){return "'"+String(v).replace(/'/g,"''")+"'"}
    var ex=null;
    window.claude.use('mcp').then(function(m){mcp=m;if(!mcp)throw 0;
      return sql('select id,terminado_em from public.protheus_execucoes where gravados>1000 and terminado_em is not null order by id desc limit 1')
    }).then(function(r){ex=espRows(r)[0];if(!ex||(state.api&&state.api.exec>=ex.id))throw 0;
      var cs=Array.from(PXA.conhecidosDe(state)).map(q).join(',');var rows=[];
      var cols='codigo,descricao,tipo,unidade,saldo_estoque,saldo_compra,custo,moeda,fab_importado,fab_nacional';
      function pag(o){return sql('select '+cols+' from public.protheus_produtos where descricao ilike \\'%ESTOQUE%\\' or codigo in ('+(cs||"''")+') order by codigo limit 1000 offset '+o).then(function(r){var p=espRows(r);rows=rows.concat(p);return p.length<1000?rows:pag(o+1000)})}
      return pag(0)
    }).then(function(rows){if(!rows.length)throw 0;
      var x=PXA.aplicar(state,rows,{terminado_em:ex.terminado_em}),z=x.resumo;
      var n={d:z.descritivo.length,p:z.peso.length,e:z.entrou.length,s:z.saiu.length,i:z.inf};
      state.api={exec:ex.id,em:new Date().toISOString(),n:n};
      ruLoad();ruRender();sheetRender();keepLocal();schedule();
      if(x.mudou)toast('Relatório atualizado com o Protheus: '+n.d+' descritivos, '+n.p+' pesos, '+n.e+' entraram, '+n.s+' saíram.');
      sql('insert into public.relatorio_api_log(exec,resumo) values('+(+ex.id)+','+q(JSON.stringify(n))+'::jsonb) on conflict (exec) do update set em=now(),resumo=excluded.resumo').catch(function(){});
      setTimeout(function(){trNew(false)},2500);
    }).catch(function(e){if(e!==0)console.warn('apiSync',e)}).then(function(){apiBusy=false});
  }
/*PXS-FIM*/
`;

const [, , entrada, saida] = process.argv;
let html = fs.readFileSync(entrada, 'utf8');
const ini = '<script id="app-js">';
if (!html.includes(ini)) throw new Error('app-js não encontrado');
html = html.replace(/\/\*PXA-INI\*\/[\s\S]*?\/\*PXA-FIM\*\/\n?/, '');
html = html.replace(ini, ini + PXA);
html = html.replace(/\/\*PXS-INI\*\/[\s\S]*?\/\*PXS-FIM\*\/\n?/, '');
const ancora = '  function espSync(){';
if (!html.includes(ancora)) throw new Error('espSync não encontrado');
html = html.replace(ancora, SYNC + ancora);
const gancho = 'ruRender();sheetRender();if(unsaved)schedule();';
if (!html.includes('setTimeout(apiSync,3000)')) {
  if (!html.includes(gancho)) throw new Error('gancho não encontrado');
  html = html.replace(gancho, 'ruRender();sheetRender();setTimeout(apiSync,3000);if(unsaved)schedule();');
}
fs.writeFileSync(saida, html);
console.log('ok', PXA.length);
