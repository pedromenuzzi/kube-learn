// Gera src/i18n/en/esquema.json: as descrições do `kubectl explain` em inglês (as de verdade, do OpenAPI do apiserver),
// só para os campos que src/k8s/esquema.js conhece. No modo inglês, o explain e a aba Manual usam estas.
// Uso: baixe o OpenAPI v3 de um kind (um arquivo por grupo/versão) e rode
//   for p in $(kubectl get --raw /openapi/v3 | jq -r '.paths | keys[]' | grep -E '^apis?/'); do
//     kubectl get --raw "/openapi/v3/$p" > "pasta/$(echo $p | tr / _).json"; done
//   node scripts/explain-ingles.mjs pasta
// As descrições são da documentação da API do Kubernetes (Apache-2.0).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ESQUEMAS } from '../src/k8s/esquema.js';
import { recursoDoKind } from '../src/k8s/recursos.js';

const pasta = process.argv[2];
const componentes = {};
for (const f of readdirSync(pasta).filter((x) => x.endsWith('.json'))) Object.assign(componentes, JSON.parse(readFileSync(`${pasta}/${f}`, 'utf8')).components?.schemas ?? {});

const refDe = (p) => (p?.$ref ?? p?.allOf?.[0]?.$ref)?.split('/').pop();
/** O tipo de um campo: o $ref ou, nos CRDs (o Gateway API), o objeto escrito ali mesmo (sem descrição própria). */
function tipoDo(p, dono, nome) {
  const alvo = p.type === 'array' ? p.items : p;
  if (refDe(alvo)) return refDe(alvo);
  if (!alvo?.properties) return undefined;
  componentes[`${dono}.${nome}`] = { ...alvo, description: '' };
  return `${dono}.${nome}`;
}
const tipos = {};
const raizes = {};
const faltam = [];

/** Percorre o nó do esquema e o tipo do OpenAPI juntos, guardando a descrição do tipo e a de cada campo conhecido. */
function visitar(no, ref, caminho) {
  const s = componentes[ref];
  if (!s) return;
  const t = (tipos[ref] ??= { d: s.description ?? '' });
  for (const [nome, campo] of Object.entries(no.campos ?? {})) {
    const p = s.properties?.[nome];
    if (!p) {
      faltam.push(`${caminho}.${nome}`);
      continue;
    }
    const filho = tipoDo(p, ref, nome);
    (t.c ??= {})[nome] = { d: p.description ?? '', ...(filho ? { t: filho } : {}), ...(p.enum ? { e: p.enum } : {}) };
    if (filho) visitar(campo.tipo === 'array' ? campo.item : campo, filho, `${caminho}.${nome}`);
  }
}

for (const [kind, no] of Object.entries(ESQUEMAS)) {
  const r = recursoDoKind(kind);
  const ref = Object.keys(componentes).find((k) => componentes[k]['x-kubernetes-group-version-kind']?.some((g) => g.kind === kind && g.group === r.grupo && g.version === r.versao));
  if (!ref) {
    faltam.push(kind);
    continue;
  }
  raizes[kind] = ref;
  visitar(no, ref, kind);
}
writeFileSync(new URL('../src/i18n/en/esquema.json', import.meta.url), `${JSON.stringify({ raizes, tipos })}\n`);
console.log(`${Object.keys(raizes).length} kinds, ${Object.keys(tipos).length} tipos. Sem descrição no OpenAPI: ${faltam.join(', ') || 'nenhum'}`);
