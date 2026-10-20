// Os 12 níveis da trilha. Cada item resolvido embarca um contêiner no navio, com a cor do nível; com os 12
// lacrados, o navio está carregado. Nível sem itens ainda aparece "em breve" e não segura o desbloqueio do seguinte.
import { NIVEL0 } from './nivel0.js';
import { NIVEL1 } from './nivel1.js';
import { NIVEL2 } from './nivel2.js';
import { NIVEL3 } from './nivel3.js';
import { NIVEL4 } from './nivel4.js';
import { NIVEL5 } from './nivel5.js';
import { NIVEL6 } from './nivel6.js';

const nivel = (numero, icone, titulo, descricao, itens = []) => ({ id: `nivel-${numero}`, numero, icone, titulo, descricao, itens });

export const NIVEIS = [
  nivel(0, '📦', 'Contêineres', 'Antes do Kubernetes: imagem, contêiner, registry e tags.', NIVEL0),
  nivel(1, '🏛️', 'Cluster, kubectl e Pods', 'A administração do condomínio, o kubectl e o primeiro pod.', NIVEL1),
  nivel(2, '👷', 'ReplicaSet e Deployment', 'Manter réplicas rodando e trocar de versão sem derrubar ninguém.', NIVEL2),
  nivel(3, '📞', 'Services e rede', 'Ramal fixo, DNS, Ingress e Gateway API.', NIVEL3),
  nivel(4, '📋', 'Configuração e armazenamento', 'ConfigMap, Secret, volumes e StatefulSet.', NIVEL4),
  nivel(5, '🧹', 'Jobs, CronJobs e DaemonSets', 'Tarefas pontuais, rotinas agendadas, um extintor em cada prédio e a vistoria antes da mudança.', NIVEL5),
  nivel(6, '🩺', 'Saúde e recursos', 'Probes, requests e limits, OOMKilled, autoscaling e cotas.', NIVEL6),
  nivel(7, '🧭', 'Scheduling e manutenção', 'Quem fica em qual prédio: affinity, taints, cordon e drain.'),
  nivel(8, '🔐', 'Segurança', 'Crachás (RBAC) e catracas (NetworkPolicy).'),
  nivel(9, '🚒', 'Troubleshooting', 'Incidentes de verdade num cluster quebrado.'),
  nivel(10, '📦', 'Helm, Kustomize e GitOps', 'O projeto padrão da construtora.'),
  nivel(11, '⚓', 'Projetos finais', 'Tudo junto: o navio zarpa carregado.'),
];

for (const n of NIVEIS) for (const i of n.itens) i.nivel = n.numero;
