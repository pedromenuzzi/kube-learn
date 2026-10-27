// O teste de mutação das missões (fora do `npm test`, porque demora): para cada missão, apaga uma linha por vez da
// solução (a linha com o que está pendurado nela; só as que o aluno escreve, as que não estão no arquivo inicial) e
// cada comando do terminal, e roda os testes com o mesmo motor do tests/trilha.js. Se a solução mutilada ainda passa
// em tudo, a linha "sobreviveu": ou os testes não conferem aquilo, ou aquilo não muda nada.
// Cada sobrevivente precisa de uma decisão em tests/mutacoes-aceitas.json ({ id, linha, motivo }) ou de uma regra nova.
// Uso: node scripts/mutacoes.mjs [regex do id]. Sai com 1 se sobrar sobrevivente sem decisão (ou decisão sem sobrevivente).
// Com JSON=1, imprime também os sobreviventes sem decisão no formato do arquivo (com o motivo em branco, para preencher).
import { readFileSync } from 'node:fs';
import { ITENS, OFICINA, TROUBLESHOOTING } from '../src/conteudo/index.js';
import { rodarTestes } from '../src/verificacoes.js';
import { aluno } from '../tests/trilha.js';

const ACEITAS = new URL('../tests/mutacoes-aceitas.json', import.meta.url);
const filtro = process.argv[2] ? new RegExp(process.argv[2]) : null;
const missoes = [...ITENS, ...TROUBLESHOOTING, ...OFICINA].filter((i) => i.tipo === 'problema' && (!filtro || filtro.test(i.id)));

const recuo = (l) => l.match(/^ */)[0].length;
const ehItem = (l) => l.trimStart().startsWith('- ');
/** Onde acaba a linha i com o que está pendurado nela (as de baixo com mais recuo; numa chave, a lista no mesmo recuo). */
function fimDoBloco(linhas, i) {
  const b = recuo(linhas[i]);
  const chave = !ehItem(linhas[i]) && linhas[i].trim().endsWith(':');
  let fim = i + 1;
  while (fim < linhas.length && (!linhas[fim].trim() || recuo(linhas[fim]) > b || (chave && recuo(linhas[fim]) === b && ehItem(linhas[fim])))) fim++;
  return fim;
}
const passa = (item, desvio) => rodarTestes(item, aluno(item, { resolvido: true }, desvio), { todos: true }).every((t) => t.ok);

/** Os índices das linhas da solução que não vêm do inicial (as que sobram da maior subsequência comum). */
function linhasNovas(inicial, solucao) {
  const m = inicial.length;
  const n = solucao.length;
  const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) lcs[i][j] = inicial[i] === solucao[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const novas = new Set();
  let i = 0;
  let j = 0;
  while (j < n) {
    if (i < m && inicial[i] === solucao[j]) i++, j++;
    else if (i < m && lcs[i + 1][j] >= lcs[i][j + 1]) i++; // a linha do inicial que a solução tirou
    else novas.add(j++);
  }
  return novas;
}

/** As mutações de uma missão: { linha (o nome da linha no JSON), desvio (para o aluno() do teste da trilha) }. */
function* mutacoes(item) {
  const historico = item.solucaoTerminal ?? [];
  for (let k = 0; k < historico.length; k++) yield { linha: `$ ${historico[k]}`, desvio: { historico: historico.filter((_, x) => x !== k) } };
  for (const [nome, texto] of Object.entries(item.solucao ?? {})) {
    const linhas = texto.split('\n');
    const novas = linhasNovas((item.inicial?.[nome] ?? '').split('\n'), linhas);
    const vistas = new Map();
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i].trim();
      if (!novas.has(i) || !l || l.startsWith('#') || l === '---') continue;
      const fim = fimDoBloco(linhas, i);
      const n = (vistas.get(l) ?? 0) + 1;
      vistas.set(l, n);
      const mudo = [...linhas.slice(0, i), ...linhas.slice(fim)].join('\n');
      yield { linha: `${nome}: ${l}${n > 1 ? ` #${n}` : ''}`, desvio: { arquivos: { ...item.solucao, [nome]: mudo } } };
    }
  }
}

const aceitas = JSON.parse(readFileSync(ACEITAS, 'utf8'));
const chave = (x) => `${x.id}\u0000${x.linha}`;
const decididas = new Set(aceitas.map(chave));
const sobreviventes = [];
let total = 0;
for (const item of missoes) {
  for (const { linha, desvio } of mutacoes(item)) {
    total++;
    let vive;
    try {
      vive = passa(item, desvio);
    } catch (e) {
      vive = false; // quebrou (o simulador ou a respostaCerta da missão): conta como não passou, mas fica no relatório
      console.log(`!! ${item.id} sem "${linha}": ${e.message}`);
    }
    if (vive) sobreviventes.push({ id: item.id, linha });
  }
}

const semDecisao = sobreviventes.filter((s) => !decididas.has(chave(s)));
const vivas = new Set(sobreviventes.map(chave));
const sobrando = filtro ? [] : aceitas.filter((x) => !vivas.has(chave(x)));
for (const s of semDecisao) console.log(`sobrevive: ${s.id} sem "${s.linha}"`);
for (const x of sobrando) console.log(`decisão sem sobrevivente (apague de tests/mutacoes-aceitas.json): ${x.id} "${x.linha}"`);
console.log(`\n${missoes.length} missões, ${total} mutações, ${sobreviventes.length} sobreviventes, ${semDecisao.length} sobreviventes sem decisão, ${sobrando.length} decisões sobrando`);
if (process.env.JSON) console.log(JSON.stringify(semDecisao.map((s) => ({ ...s, motivo: '' })), null, 2));
process.exit(semDecisao.length || sobrando.length ? 1 : 0);
