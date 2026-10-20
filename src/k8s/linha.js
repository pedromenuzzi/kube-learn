// Uma linha do terminal do aluno: o kubectl (com redirecionamento para arquivo, `... > pod.yaml`, que grava a
// saída no editor) e o curl do computador do aluno (fora do cluster: port-forward, NodePort, LoadBalancer,
// Ingress e Gateway), o echo e o `| base64` (para ver o que um Secret guarda). Usado pela tela do exercício e
// pelo teste da trilha (as soluções de terminal).
import { kubectl } from './kubectl/index.js';
import { palavras } from './kubectl/argv.js';
import { executarComando } from './shell.js';
import { httpDeFora } from './rede.js';
import { atobUtf8, btoaUtf8 } from './esquema.js';

const NOME = /^[\w.-]+\.(ya?ml|json|txt)$/;

const resultado = (codigo, out, err) => {
  const partes = [...(out ? [{ fluxo: 'out', texto: out }] : []), ...(err ? [{ fluxo: 'err', texto: err }] : [])];
  return { saida: out + err, stdout: out, stderr: err, partes, codigo };
};

/** O curl rodando no computador do aluno: só alcança o cluster pelas entradas de fora. */
function curlDeFora(cluster, linha) {
  const ctx = {
    env: {}, binarios: ['curl'], agenteCurl: 'curl/8.7.1',
    rede: { http: (u, op) => httpDeFora(cluster, u, op), dns: () => null },
  };
  const r = executarComando(palavras(linha), ctx);
  return r.codigo === 0 ? resultado(0, r.saida ?? '', '') : resultado(r.codigo, '', r.saida ?? '');
}

function eco(linha) {
  const args = palavras(linha).slice(1);
  const semQuebra = args[0] === '-n';
  return resultado(0, `${(semQuebra ? args.slice(1) : args).join(' ')}${semQuebra ? '' : '\n'}`, '');
}

/** "... | base64" codifica a saída; "... | base64 -d" decodifica (é assim que se lê um Secret). */
function base64(r, decodificar) {
  if (r.codigo) return r;
  if (!decodificar) return resultado(0, `${btoaUtf8(r.stdout)}\n`, r.stderr);
  try {
    return resultado(0, atobUtf8(r.stdout.trim()), r.stderr);
  } catch {
    return resultado(1, '', `${r.stderr}base64: invalid input\n`);
  }
}

/** → resultado do kubectl/curl (com `arquivoGravado` quando houve `>`), ou um erro se o nome do arquivo não serve. */
export function rodarLinha(cluster, linha, arquivos) {
  const cano = linha.match(/^(.*\S)\s*\|\s*base64(\s+(?:-d|--decode))?\s*$/);
  if (cano) return base64(rodarLinha(cluster, cano[1], arquivos), !!cano[2]);
  if (/^\s*echo\b/.test(linha)) return eco(linha);
  const m = linha.match(/^(.*?)\s+(>>?)\s*(\S+)\s*$/);
  const comando = m ? m[1] : linha;
  const ehCurl = /^\s*curl\b/.test(comando);
  if (!m) return ehCurl ? curlDeFora(cluster, comando) : kubectl(cluster, linha, { arquivos });
  const [, , operador, nome] = m;
  if (!NOME.test(nome)) return resultado(1, '', `bash: ${nome}: só dá para gravar arquivos .yaml, .json ou .txt aqui\n`);
  const r = ehCurl ? curlDeFora(cluster, comando) : kubectl(cluster, comando, { arquivos });
  arquivos[nome] = (operador === '>>' ? arquivos[nome] ?? '' : '') + r.stdout;
  const partes = r.partes.filter((p) => p.fluxo === 'err');
  return { ...r, saida: partes.map((p) => p.texto).join(''), partes, arquivoGravado: nome };
}
