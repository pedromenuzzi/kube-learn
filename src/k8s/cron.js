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

// ---------- fusos (spec.timeZone) ----------
const formatos = new Map();
/** O relógio de parede num fuso do IANA: { ano, mes, dia, hora, minuto, segundo, semana (0 = domingo) }. */
function relogio(ms, fuso) {
  if (!fuso) {
    const d = new Date(ms);
    return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), hora: d.getUTCHours(), minuto: d.getUTCMinutes(), segundo: d.getUTCSeconds(), semana: d.getUTCDay() };
  }
  let f = formatos.get(fuso);
  if (!f) formatos.set(fuso, (f = new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })));
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute, segundo: p.second, semana: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
}

const doisDigitos = (n) => String(n).padStart(2, '0');
/** O instante no formato RFC 3339 do Go, no fuso: "2026-10-22T14:30:00-03:00" (ou "...Z" quando a diferença é zero). */
export function isoNoFuso(ms, fuso) {
  const r = relogio(ms, fuso);
  const dif = Math.round((Date.UTC(r.ano, r.mes - 1, r.dia, r.hora, r.minuto, r.segundo) - Math.floor(ms / 1000) * 1000) / 60_000);
  const zona = dif === 0 ? 'Z' : `${dif < 0 ? '-' : '+'}${doisDigitos(Math.floor(Math.abs(dif) / 60))}:${doisDigitos(Math.abs(dif) % 60)}`;
  return `${r.ano}-${doisDigitos(r.mes)}-${doisDigitos(r.dia)}T${doisDigitos(r.hora)}:${doisDigitos(r.minuto)}:${doisDigitos(r.segundo)}${zona}`;
}

/** Os erros do spec.timeZone, com as mensagens da validação do kube-apiserver (o time.LoadLocation do Go). */
export function errosDoFuso(fuso) {
  if (fuso === '') return ['timeZone must be nil or non-empty string'];
  const erros = [];
  if (fuso.toLowerCase() === 'local') erros.push('timeZone must be an explicit time zone as defined in https://www.iana.org/time-zones');
  if (fuso !== 'Local' && !fusoExiste(fuso)) erros.push(`unknown time zone ${fuso}`);
  return erros;
}

/** O Intl aceita o nome sem ligar para maiúsculas; o Go, não ("america/sao_paulo" não existe). */
function fusoExiste(fuso) {
  if (!/^[A-Za-z]/.test(fuso)) return false; // o Intl aceita "+03:00"; o Go, não
  try {
    const nome = new Intl.DateTimeFormat('en-US', { timeZone: fuso }).resolvedOptions().timeZone;
    return nome.toLowerCase() !== fuso.toLowerCase() || nome === fuso;
  } catch {
    return false;
  }
}

/**
 * Lê o horário (no fuso, se houver). → { casa(ms): bool } ou { erro: 'mensagem' }.
 * ponytail: na mudança do horário de verão, a hora que se repete casa duas vezes (o robfig/cron roda uma só).
 */
export function lerCron(texto, fuso) {
  // O cron do Go aceita "TZ=..." ou "CRON_TZ=..." na frente; a API recusa (ver esquema.js), mas a leitura passa.
  const semFuso = texto.trim().replace(/^(CRON_)?TZ=\S+\s+/, '');
  const expandido = ATALHOS[semFuso] ?? semFuso;
  const partes = expandido.trim().split(/\s+/).filter(Boolean);
  if (partes.length !== 5) return { erro: `expected exactly 5 fields, found ${partes.length}: [${partes.join(' ')}]` };
  try {
    const [minutos, horas, dias, meses, semana] = partes.map(campo);
    const diaLivre = partes[2] === '*' || partes[2] === '?';
    const semanaLivre = partes[4] === '*' || partes[4] === '?';
    return {
      /** O minuto deste instante (no fuso; sem fuso, UTC) está no horário? (dia do mês OU da semana, como no cron, quando os dois são dados) */
      casa(ms) {
        const d = relogio(ms, fuso);
        if (!minutos.has(d.minuto) || !horas.has(d.hora) || !meses.has(d.mes)) return false;
        const dia = dias.has(d.dia);
        const sem = semana.has(d.semana);
        if (diaLivre || semanaLivre) return dia && sem;
        return dia || sem;
      },
    };
  } catch (e) {
    if (e instanceof ErroCron) return { erro: e.message };
    throw e;
  }
}
