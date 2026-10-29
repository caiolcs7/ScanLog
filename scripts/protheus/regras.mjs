// Regras do /painelruas em código: lê o "*ESTOQUE ..." e o "PESO ..." do
// descritivo do Protheus. Usado pela atualização diária do Relatório e do Painel.

// Posições do fim do descritivo: "*ESTOQUE R05G49S/G50S / R06G71", faixas
// "G13S A G18S", número solto "G9/10" (mesma letra). S = 2º andar (A2).
// Devolve [{rua: 5, andar: 'A2', letra: 'G', n: 49}, ...].
export function posicoes(d) {
  d = String(d || '');
  const m = /\*?\s*ESTOQUE\b\s*:?([\s\S]*)$/i.exec(lastEstoque(d));
  if (!m) return [];
  // Endereços de container (EXTA1C75P00) não são galão.
  const txt = m[1].toUpperCase().replace(/EXT\w*/g, ' ');
  const out = [];
  const re = /R\s*(\d{1,2})|([GCB])\s*(\d{1,4})(S?)|\bA\b|(\d{1,4})(S?)/g;
  let rua = null,
    letra = null,
    faixa = false,
    ultimo = null,
    x;
  while ((x = re.exec(txt))) {
    if (x[1]) {
      rua = +x[1];
      letra = null;
      continue;
    }
    if (x[0] === 'A') {
      faixa = ultimo != null;
      continue;
    }
    if (rua == null) continue;
    let n, s;
    if (x[2]) {
      letra = x[2];
      n = +x[3];
      s = x[4];
    } else if (letra) {
      n = +x[5];
      s = x[6];
    } else continue;
    if (!n) continue;
    const andar = s ? 'A2' : 'A1';
    if (
      faixa &&
      ultimo &&
      ultimo.rua === rua &&
      ultimo.letra === letra &&
      n > ultimo.n &&
      n - ultimo.n <= 60
    ) {
      for (let k = ultimo.n + 1; k <= n; k++)
        out.push({ rua, andar: ultimo.andar, letra, n: k });
    } else out.push({ rua, andar, letra, n });
    faixa = false;
    ultimo = out[out.length - 1];
  }
  const vistos = new Set();
  return out.filter((p) => {
    const k = chave(p);
    return vistos.has(k) ? false : vistos.add(k);
  });
}

function lastEstoque(d) {
  const i = d.toUpperCase().lastIndexOf('ESTOQUE');
  return i < 0 ? '' : d.slice(Math.max(0, i - 1));
}

export const chave = (p) =>
  `R${String(p.rua).padStart(2, '0')}${p.andar}|${p.letra}${p.n}`;

// Peso em gramas do texto "PESO: 1,149KG" / "PESO 59 G". Sem unidade = kg.
// Devolve null quando não há peso legível (0, vários diferentes, "PESO: KG",
// grama com vírgula).
export function pesoG(d) {
  const re = /\bPESO\b\s*(?:IA\b)?\s*:?\s*([\d.,]+)\s*(KGS?|G)?\b/gi;
  const vals = new Set();
  let x;
  while ((x = re.exec(String(d || '')))) {
    const emG = (x[2] || 'KG').toUpperCase() === 'G';
    // "1,200G" e "1.660 g": não dá para saber se é grama ou milhar.
    if (emG && /[.,]/.test(x[1])) continue;
    let num = x[1].replace(/\.(?=\d{3}(\D|$))/g, '');
    num = num.replace(',', '.');
    if ((num.match(/\./g) || []).length > 1) continue;
    const v = parseFloat(num);
    if (!isFinite(v) || v <= 0) continue;
    const g = emG ? v : v * 1000;
    vals.add(Math.round(g * 1000) / 1000);
  }
  return vals.size === 1 ? [...vals][0] : null;
}
