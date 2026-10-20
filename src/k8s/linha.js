// Uma linha do terminal do aluno: o kubectl, com redirecionamento para arquivo (`... > pod.yaml`), que grava
// a saída no editor. Usado pela tela do exercício e pelo teste da trilha (as soluções de terminal).
import { kubectl } from './kubectl/index.js';

const NOME = /^[\w.-]+\.(ya?ml|json|txt)$/;

/** → resultado do kubectl (com `arquivoGravado` quando houve `>`), ou { erro } se o nome do arquivo não serve. */
export function rodarLinha(cluster, linha, arquivos) {
  const m = linha.match(/^(.*?)\s+(>>?)\s*(\S+)\s*$/);
  if (!m) return kubectl(cluster, linha, { arquivos });
  const [, comando, operador, nome] = m;
  if (!NOME.test(nome)) {
    const texto = `bash: ${nome}: só dá para gravar arquivos .yaml, .json ou .txt aqui\n`;
    return { saida: texto, stdout: '', stderr: texto, partes: [{ fluxo: 'err', texto }], codigo: 1 };
  }
  const r = kubectl(cluster, comando, { arquivos });
  arquivos[nome] = (operador === '>>' ? arquivos[nome] ?? '' : '') + r.stdout;
  const partes = r.partes.filter((p) => p.fluxo === 'err');
  return { ...r, saida: partes.map((p) => p.texto).join(''), partes, arquivoGravado: nome };
}
