// O ritual do dia: as poucas marcas que fecham um dia de estudo (uma missão da trilha, a revisão em dia e o plantão
// atendido) e o lembrete diário que o aluno baixa para a própria agenda. Funções puras, testadas em tests/ritual.test.js.

/**
 * As marcas de hoje → [{ id: 'missao' | 'revisao' | 'plantao', feito }]. Só entra o que já faz sentido: a missão enquanto a
 * trilha tiver o que fazer (ou se uma saiu hoje), a revisão quando há termos vistos e o plantão quando está liberado
 * (`plantao`: o id do plantão de hoje, ou null).
 */
export function marcasDoDia({ jornada, progresso, hoje, termos, cartoes, plantao }) {
  const missao = jornada.niveis.some((n) => n.itens.some((i) => progresso[i.id]?.status === 'resolvido' && progresso[i.id].em === hoje));
  return [
    (missao || jornada.proximo) && { id: 'missao', feito: missao },
    termos > 0 && { id: 'revisao', feito: cartoes === 0 },
    plantao && { id: 'plantao', feito: progresso[plantao]?.status === 'resolvido' },
  ].filter(Boolean);
}

/** O dia está cumprido quando tem marca e todas estão feitas. */
export const diaCumprido = (marcas) => marcas.length > 0 && marcas.every((m) => m.feito);

const bytes = (s) => new TextEncoder().encode(s).length;

/** Linha de mais de 75 bytes continua na seguinte, começando com um espaço (RFC 5545, 3.1), sem partir um acento. */
function dobrar(linha) {
  const partes = [''];
  for (const c of linha) {
    if (bytes(partes.at(-1) + c) > 75) partes.push(' ');
    partes[partes.length - 1] += c;
  }
  return partes.join('\r\n');
}

const texto = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/**
 * O lembrete diário em iCalendar: um evento de 15 minutos que se repete todo dia, a partir de `hoje`, na `hora` ('HH:MM')
 * do fuso de quem importa (hora "flutuante", sem fuso: 19:00 é 19:00 onde a agenda estiver). `agora` (Date) carimba o
 * arquivo e faz o UID: cada download é um evento novo. → o texto, com as linhas terminadas em CRLF.
 */
export function lembreteIcs({ hora, hoje, agora, url, titulo, descricao }) {
  const carimbo = agora.toISOString().replace(/[-:]|\.\d+/g, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//kube-learn//lembrete//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:lembrete-${carimbo}@kube-learn`,
    `DTSTAMP:${carimbo}`,
    `DTSTART:${hoje.replaceAll('-', '')}T${hora.slice(0, 5).replace(':', '')}00`,
    'DURATION:PT15M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${texto(titulo)}`,
    `DESCRIPTION:${texto(`${descricao}\n${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${texto(titulo)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].map(dobrar).join('\r\n');
}
