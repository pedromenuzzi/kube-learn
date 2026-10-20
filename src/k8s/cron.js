// O formato do cron (minuto hora dia-do-mês mês dia-da-semana), como o do CronJob: "*/5 * * * *", "0 3 * * 1-5",
// "@daily". As mensagens de erro são as da biblioteca que o kube-apiserver usa (robfig/cron).

const CAMPOS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
const NOMES = [null, null, null, ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']];
const ATALHOS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };

class ErroCron extends Error {}

function numero(tok, i) {
  const nome = NOMES[i]?.indexOf(tok.toLowerCase());
  if (nome !== undefined && nome >= 0) return nome + (i === 3 ? 1 : 0);
  if (!/^\d+$/.test(tok)) throw new ErroCron(`failed to parse int from ${tok}: strconv.Atoi: parsing "${tok}": invalid syntax`);
  return Number(tok);
}

// Um campo ("*/15", "1-5", "0,30") → Set dos valores.
function campo(texto, i) {
  const [min, max] = CAMPOS[i];
  const valores = new Set();
  for (const parte of texto.split(',')) {
    const [faixa, passoTxt] = parte.split('/');
    let [ini, fim] = [min, max];
    if (faixa !== '*' && faixa !== '?') {
      const [a, b] = faixa.split('-');
      ini = numero(a, i);
      fim = b === undefined ? (passoTxt ? max : ini) : numero(b, i);
    }
    if (ini < min) throw new ErroCron(`beginning of range (${ini}) below minimum (${min}): ${parte}`);
    if (fim > max) throw new ErroCron(`end of range (${fim}) above maximum (${max}): ${parte}`);
    if (ini > fim) throw new ErroCron(`beginning of range (${ini}) beyond end of range (${fim}): ${parte}`);
    const passo = passoTxt === undefined ? 1 : numero(passoTxt, i);
    if (passo <= 0) throw new ErroCron(`step of range should be a positive number: ${parte}`);
    for (let v = ini; v <= fim; v += passo) valores.add(i === 4 && v === 7 ? 0 : v);
  }
  return valores;
}

/** Lê o horário. → { casa(ms): bool } ou { erro: 'mensagem' }. */
export function lerCron(texto) {
  const expandido = ATALHOS[texto.trim()] ?? texto;
  const partes = expandido.trim().split(/\s+/).filter(Boolean);
  if (partes.length !== 5) return { erro: `expected exactly 5 fields, found ${partes.length}: [${partes.join(' ')}]` };
  try {
    const [minutos, horas, dias, meses, semana] = partes.map(campo);
    const diaLivre = partes[2] === '*' || partes[2] === '?';
    const semanaLivre = partes[4] === '*' || partes[4] === '?';
    return {
      /** O minuto deste instante (UTC) está no horário? (dia do mês OU da semana, como no cron, quando os dois são dados) */
      casa(ms) {
        const d = new Date(ms);
        if (!minutos.has(d.getUTCMinutes()) || !horas.has(d.getUTCHours()) || !meses.has(d.getUTCMonth() + 1)) return false;
        const dia = dias.has(d.getUTCDate());
        const sem = semana.has(d.getUTCDay());
        if (diaLivre || semanaLivre) return dia && sem;
        return dia || sem;
      },
    };
  } catch (e) {
    if (e instanceof ErroCron) return { erro: e.message };
    throw e;
  }
}
