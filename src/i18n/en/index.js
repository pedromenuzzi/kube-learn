// O pacote do inglês: baixado só quando alguém escolhe inglês (src/i18n.js). O português continua sendo a fonte;
// o conteúdo traduzido segue o formato de scripts/textos.mjs, e tests/i18n.test.js confere que está completo.
import nivel0 from './conteudo/nivel0.json';
import nivel1 from './conteudo/nivel1.json';
import nivel2 from './conteudo/nivel2.json';
import nivel3 from './conteudo/nivel3.json';
import nivel4 from './conteudo/nivel4.json';
import nivel5 from './conteudo/nivel5.json';
import nivel6 from './conteudo/nivel6.json';
import nivel7 from './conteudo/nivel7.json';
import nivel8 from './conteudo/nivel8.json';
import nivel9 from './conteudo/nivel9.json';
import nivel10 from './conteudo/nivel10.json';
import nivel11 from './conteudo/nivel11.json';
import troubleshooting from './conteudo/troubleshooting.json';
import glossario from './conteudo/glossario.json';
import { REGRAS, STATUS } from './explicacoes.js';
import uiExercicio from './ui-exercicio.js';
import uiPaginas from './ui-paginas.js';
import uiEngajamento from './ui-engajamento.js';

export const itens = {
  ...nivel0, ...nivel1, ...nivel2, ...nivel3, ...nivel4, ...nivel5, ...nivel6, ...nivel7, ...nivel8, ...nivel9, ...nivel10, ...nivel11, ...troubleshooting,
  livre: { titulo: 'Free playground', enunciado: '<p>A cluster all to yourself, with 1 control plane and 2 workers. Write YAML, apply it and explore with <code>kubectl</code>. Nothing here is graded.</p>' },
};
export { glossario };
export const explicacoes = { REGRAS, STATUS };
export const ui = { ...uiExercicio, ...uiPaginas, ...uiEngajamento };

export const niveis = {
  0: { titulo: 'Containers', descricao: 'Before Kubernetes: image, container, registry and tags.' },
  1: { titulo: 'Cluster, kubectl and Pods', descricao: 'The condo’s management office, kubectl and your first pod.' },
  2: { titulo: 'ReplicaSet and Deployment', descricao: 'Keeping replicas running and switching versions without taking anyone down.' },
  3: { titulo: 'Services and networking', descricao: 'A fixed phone extension, DNS, Ingress and Gateway API.' },
  4: { titulo: 'Configuration and storage', descricao: 'ConfigMap, Secret, volumes and StatefulSet.' },
  5: { titulo: 'Jobs, CronJobs and DaemonSets', descricao: 'One-off tasks, scheduled routines, a fire extinguisher in every building and the inspection before moving in.' },
  6: { titulo: 'Health and resources', descricao: 'Probes, requests and limits, OOMKilled, autoscaling and quotas.' },
  7: { titulo: 'Scheduling and maintenance', descricao: 'Who lives in which building: affinity, taints, cordon, drain, PDB and the power outage.' },
  8: { titulo: 'Security', descricao: 'Badges (RBAC), turnstiles (NetworkPolicy) and the fire code (securityContext and Pod Security).' },
  9: { titulo: 'Troubleshooting', descricao: 'The building manager’s on-call shift: 20 real incidents, each in a cluster that arrives already broken.' },
  10: { titulo: 'Helm, Kustomize and GitOps', descricao: 'The builder’s standard design, the same blueprint in every city, the new form and the blueprint filed at the notary.' },
  11: { titulo: 'Final projects', descricao: 'Everything together, in stages: each stage starts from what you did in the one before.' },
};
