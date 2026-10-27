// @vitest-environment node
// Compara o simulador com o kubectl de verdade: tests/golden/kind/ tem a saída real (scripts/capturar-golden.sh,
// num kind v1.37) e tests/golden/cenario.js roda os mesmos passos no simulador.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rodarCenario } from './golden/cenario.js';
import { normalizar } from './golden/normalizar.js';
import { definirIdioma } from '../src/i18n.js';
import { carregarEsquemaIngles } from '../src/k8s/esquema.js';

// Em inglês, como o kubectl de verdade: o explain usa as descrições reais (as em português são outras, de propósito).
await definirIdioma('en', { salvar: false });
await carregarEsquemaIngles();

// Casos que não dá para comparar linha a linha, e por quê.
const ESPECIAIS = {
  // Em qual node cada réplica do web caiu é sorte do scheduler: compara até a lista de pods.
  'describe-node': { ate: 'Non-terminated Pods:' },
  // Quantas vezes já caiu/tentou depende do ritmo exato do kubelet: compara sem as contagens.
  'crash-get': { semContagem: true },
  'pull-get': { semContagem: true },
  'crash-describe': { ate: '    State:', eventos: true },
  'pull-describe': { ate: '    State:', eventos: true },
  'nopull-describe': { ate: '    State:', eventos: true },
  'events': { conjunto: true },
  // O rollout real espera o pull do nginx:1.28; o simulado é mais rápido. Começo e fim iguais.
  'rollout-status': { pontas: true },
  // Fase 6: o pod caiu num node que ainda não tinha o nginx (a ordem dos eventos muda); o rollout real ainda
  // pegou o StatefulSet antes do controlador ("spec update to be observed"): compara as duas últimas linhas.
  'describe-pod-volumes': { ate: 'Events:' },
  'rollout-sts': { ultimas: 2 },
  'rollout-ds': { ultimas: 2 },
  // O Go percorre o mapa de recursos do LimitRange em ordem aleatória (cpu e memory trocam de lugar).
  'describe-limitrange': { conjunto: true },
  'describe-ns-cota': { conjunto: true },
  // As primeiras mensagens dependem de quando o metrics-server teve a primeira amostra.
  'describe-hpa-sem-requests': { ate: 'Events:' },
  // Fase 7: o kind recém-criado ainda tinha workers subindo (os primeiros FailedScheduling falam de taints de
  // not-ready): vale a última tentativa. Em que ordem os pods aparecem e quantas vezes o drain tentou de novo
  // dependem do ritmo do cluster: compara o conjunto de linhas.
  'describe-backup-pendente': { ate: 'Events:', ultimoEvento: true },
  'describe-espalha-pendente': { ate: 'Events:', ultimoEvento: true },
  'get-pods-backup': { conjunto: true },
  'get-pods-espalha': { conjunto: true },
  'describe-node-taint': { ate: 'Non-terminated Pods:' },
  'drain-pdb': { conjunto: true },
  'describe-node-caido': { ate: 'Non-terminated Pods:' },
  'get-pods-caido-antes': { conjunto: true },
  'get-pods-caido': { conjunto: true },
  // Nível 8: o nginx ainda não estava no node do kind (puxou); quantas vezes o kubelet tentou varia. E o
  // ReplicaSet bloqueado pelo PodSecurity junta os eventos repetidos de um jeito que o simulador não imita.
  'describe-pod-naoroot': { ate: '    State:', eventos: true },
  'describe-rs-psa': { ate: 'Events:' },
  // Nível 10: no kind, a imagem kubelearn/loja não existe (os pods ficam Pending/ErrImagePull); no simulador, sobem:
  // compara sem as contagens de pods prontos.
  'helm-status': { ate: '==> v1/Pod(related)', semProntos: true },
  'helm-deploy-labels': { semProntos: true },
  // O nslookup do busybox pergunta os domínios de busca ao mesmo tempo e escreve as respostas na ordem em que chegam
  // (até as linhas em branco mudam de uma vez para outra): compara o conjunto de linhas.
  'val-nslookup-curto': { conjunto: true },
  'val-nslookup-nada': { conjunto: true },
  // O run --rm -i de um comando que termina na hora: no kind, o kubectl às vezes se anexa tarde ("couldn't attach",
  // e lê os logs, às vezes repetindo a saída). Compara o que vem depois do anexo (o term-run-rm-lento confere o aviso).
  'term-run-rm': { anexo: true },
  'term-run-rm-falha': { anexo: true },
  'term-run-sem-rm': { anexo: true },
  // O NoPods do PDB sem pods: o real avisa a cada sincronia (x2 em segundos), o simulador a cada mudança do status.
  'obr-describe-pdb-sem-spec': { ate: 'Events:', eventos: true },
};

const linhas = (t) => t.split('\n');
// Se a imagem já estava no node depende de onde o pod caiu: "baixou" e "já estava lá" contam igual.
const semCache = (l) => (/Pulling image/.test(l) ? null : l
  .replace(/Successfully pulled image ("[^"]+") in .*$/, 'imagem $1 no node')
  .replace(/Container image ("[^"]+") already present on machine and can be accessed by the pod/, 'imagem $1 no node'));
const semContagem = (t) => t.replace(/\b\d+ \(<t> ago\)/g, 'N (<t> ago)').replace(/\(x\d+ over/g, '(xN over')
  .replace(/\b(ErrImagePull|ImagePullBackOff)\b/g, '<pull>').replace(/\b(CrashLoopBackOff|Completed|Error)\b/g, '<crash>');

function comparavel(texto, regra) {
  let t = normalizar(texto);
  if (regra.semContagem) t = semContagem(t);
  if (regra.semProntos) t = t.replace(/\| \d+\/(\d+) \| (\d+) \| \d+ \|/g, '| N/$1 | $2 | N |');
  if (regra.ate) {
    const ls = linhas(t);
    const i = ls.findIndex((l) => l.startsWith(normalizar(regra.ate).replace(/^ \| /, ' | ')) || l.startsWith(regra.ate.trim()) || l.replace(/^ \| /, '').startsWith(regra.ate.trim()));
    const base = ls.slice(0, i === -1 ? undefined : i).join('\n');
    if (regra.ultimoEvento) return `${base}\n---\n${semContagem(ls.filter(Boolean).at(-2)).replace(/^ \| (\w+) \| (\w+) \| [^|]+ \| /, ' | $1 | $2 | <t> | ')}`;
    if (!regra.eventos) return base;
    const j = ls.findIndex((l) => l.startsWith('Events:'));
    const eventos = ls.slice(j + 3).filter(Boolean).map((l) => semCache(semContagem(l).replace(/\| [^|]*\(xN over <t>\) \|/, '| <t> |'))).filter(Boolean).sort();
    return `${base}\n---\n${[...new Set(eventos)].join('\n')}`;
  }
  if (regra.conjunto) return [...new Set(linhas(semContagem(t)).map(semCache).filter((l) => l !== null))].sort().join('\n');
  if (regra.pontas) {
    const ls = linhas(t).filter(Boolean);
    return [ls[0], ...ls.slice(-2)].join('\n');
  }
  if (regra.ultimas) return linhas(t).filter(Boolean).slice(-regra.ultimas).join('\n');
  if (regra.anexo) {
    const ls = linhas(t);
    return ls.slice(ls.findIndex((l) => l.startsWith("warning: couldn't attach to pod/")) + 1)
      .filter((l) => !l.startsWith('All commands and output from this session') && !l.startsWith("If you don't see a command prompt")).join('\n');
  }
  return t;
}

describe('saída igual à do kubectl de verdade (kind v1.37)', () => {
  const { saidas } = rodarCenario();
  for (const [nome, sim] of Object.entries(saidas)) {
    it(nome, () => {
      const real = readFileSync(new URL(`./golden/kind/${nome}.txt`, import.meta.url), 'utf8');
      const regra = ESPECIAIS[nome] ?? {};
      expect(comparavel(sim, regra)).toBe(comparavel(real, regra));
    });
  }
});
