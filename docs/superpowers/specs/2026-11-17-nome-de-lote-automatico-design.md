# Identificação: nome de lote automático (2026-11-17)

**Por quê:** cada pessoa digitava o nome do lote e os nomes se repetiam
("Sem código 17/11"), o que confunde. caio pediu nome automático e só um
campo de observação.

**Decisão (aprovada pelo caio):**
- Nome "Lote 011" com número de uma sequência do servidor (`lots.numero`),
  único e imutável; o gatilho ignora nome e número mandados pelo aparelho.
- Observação livre (`lots.obs`, até 200), opcional, editável pelo dono e pelo
  admin. Busca por nome e observação.
- Lotes antigos: numerados pela data de criação; o nome antigo virou a
  observação.
- Lote criado sem internet: "Lote (aguardando número)" até sincronizar.
- Planilha e Word: "Lote 011 · observação".

**Alternativa recusada:** nome com pessoa e data ("L-0012 · Ilídio · 17/11"):
repete o que o cartão já mostra.
