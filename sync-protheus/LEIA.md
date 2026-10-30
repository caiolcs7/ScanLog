# Sincronizador Protheus → Supabase

O Protheus (`http://10.10.10.3:8600/rest/MACWS009/consultar/produto`) só existe
na rede da empresa. Este script roda num PC de lá, seg a sex às 4h, e copia os
produtos **desbloqueados** para `public.protheus_produtos` (migração
`supabase/migrations/0007_protheus.sql`). As páginas leem só do Supabase.

- Instalar: copiar `instalar.bat`, `instalar.ps1`, `sync.ps1` e
  `0007_protheus.sql` para uma pasta no PC e abrir `instalar.bat`. Ele pede
  usuário/senha do Protheus, agenda a tarefa "ScanLog Sync Protheus", copia o
  SQL para colar no SQL Editor e roda um teste de 3 páginas.
- Segredos ficam em `%LOCALAPPDATA%\ScanLogSync` criptografados pelo Windows
  (DPAPI). O banco guarda só o sha256 do token. Nada disso vai para o repositório.
- Log: `%LOCALAPPDATA%\ScanLogSync\sync.log`.
- Atualizar o `sync.ps1` num PC já instalado: `atualizar.bat` (não pede senha).

Comportamento da API (testado em 29/10/2026): Basic auth; filtros `Produto` e
`Bloqueado` ignorados; cada chamada leva ~45 s; páginas de 500+ podem voltar
`204` com corpo (o `Invoke-RestMethod` recusa, por isso `curl.exe`). O script
usa páginas de 100, 8 consultas ao mesmo tempo (o servidor aguenta; 8 páginas
levam o tempo de uma) e, se uma falha, tenta de 10 em 10 e depois de 1 em 1,
pulando só o item com defeito. Só apaga códigos que sumiram quando a leitura foi
completa e gravou pelo menos 80% do que já havia.

Os `.ps1` são só ASCII de propósito: o PowerShell 5.1 lê arquivo sem BOM como ANSI.
