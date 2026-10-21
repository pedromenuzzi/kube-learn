// Normaliza uma saída do kubectl para comparar o simulador com o kind: troca o que muda de uma execução
// para outra (nomes com hash, IPs, idades, datas, UIDs) por marcadores, e o espaço de alinhamento por " | ".
// O alinhamento em si é testado à parte (tests/tabwriter.test.js), contra as mesmas saídas reais.

const ALF = '[bcdfghjklmnpqrstvwxz2456789]';
const REGRAS = [
  [/\b[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}\b/g, '<data>'],
  [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})/g, '<iso>'],
  [/\b\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\b/g, '<data>'],
  [/\b\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)? [+-]\d{4} \S+/g, '<data>'], // o time.Time.String() do Go (describe netpol)
  [/local-path-provisioner-[a-z0-9]+-[a-z0-9]{5}_/g, 'local-path-provisioner-<h>-<s>_'],
  [/(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/g, '<uid>'],
  [/\b[0-9a-f]{64}\b/g, '<hex>'],
  [/\b[0-9a-f]{32}\b/g, '<hex>'],
  [/\b10\.244\.\d+\.\d+\b/g, '<ip-pod>'],
  [/\b10\.96\.(?!0\.1\b|0\.10\b)\d+\.\d+\b/g, '<ip-svc>'],
  [/\b172\.\d+\.0\.\d+\b/g, '<ip-node>'],
  [new RegExp(`\\b([a-z][a-z0-9-]*?)-(?:[456789bcdf]{8,10}|${ALF}{6,10})-${ALF}{5}\\b`, 'g'), '$1-<h>-<s>'],
  [/\b(web|loja|coredns|db|guarda)-[456789bcdf]{8,10}\b/g, '$1-<h>'],
  [/\bReplicaSet\/([a-z][a-z0-9-]*?)-[456789bcdf]{8,10}\b/g, 'ReplicaSet/$1-<h>'],
  [new RegExp(`\\b([a-z][a-z0-9-]*?)-${ALF}{5}\\b`, 'g'), '$1-<s>'], // nomes de generateName (pods de Job e DaemonSet)
  [/\blimpeza-\d{8}\b/g, 'limpeza-<minuto>'],
  [/127\.0\.0\.1:\d+/g, '127.0.0.1:<porta>'],
  [/pod-template-hash([=:] ?)[456789bcdf]{8,10}\b/g, 'pod-template-hash$1<h>'],
  [new RegExp(`kube-api-access-${ALF}{5}`, 'g'), 'kube-api-access-<s>'],
  [/resourceVersion: "\d+"/g, 'resourceVersion: "<rv>"'],
  [/"resourceVersion": "\d+"/g, '"resourceVersion": "<rv>"'],
  [/in [\d.]+m?s \([\d.]+m?s including waiting\)/g, 'in <dur> (<dur> including waiting)'],
  [/\b\d+(?:y|d|h|m|s)(?:\d+(?:d|h|m|s))?\b/g, '<t>'],
  [/golden-worker2/g, 'golden-worker'],
  [/start worker process \d+/g, 'start worker process <n>'],
];

export function normalizar(texto) {
  let t = texto.replace(/(.)exit=(\d+)\n$/, '$1\nexit=$2\n');
  for (const [re, troca] of REGRAS) t = t.replace(re, troca);
  return t.split('\n').map((l) => l.replace(/\s+$/, '').replace(/ {2,}|\t/g, ' | ')).join('\n');
}
