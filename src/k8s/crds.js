// Os CustomResourceDefinitions (o formulário novo na administração) e o operador de backup que sabe cuidar dele.
import { esquemaDoCrd } from './esquema.js';
import { iso } from './unidades.js';

/** O CRD foi criado: o tipo novo entra na lista de recursos e de esquemas do cluster. */
export function registrarCrd(c, crd) {
  const { group, names, scope, versions } = crd.spec;
  const versao = versions.find((v) => v.storage) ?? versions[0];
  c.recursosExtras.push({
    kind: names.kind,
    plural: names.plural,
    singular: names.singular ?? names.kind.toLowerCase(),
    curtos: names.shortNames ?? [],
    grupo: group,
    versao: versao.name,
    namespaced: scope !== 'Cluster',
    crd: crd.metadata.name,
    colunas: versao.additionalPrinterColumns ?? null,
  });
  c.esquemasExtras[names.kind] = esquemaDoCrd(crd);
  c.crdsApagados = (c.crdsApagados ?? []).filter((r) => r.crd !== crd.metadata.name);
  crd.status = {
    acceptedNames: { kind: names.kind, listKind: names.listKind ?? `${names.kind}List`, plural: names.plural, ...(names.shortNames ? { shortNames: names.shortNames } : {}), singular: names.singular ?? names.kind.toLowerCase() },
    conditions: [
      { lastTransitionTime: iso(c.agora), message: 'no conflicts found', reason: 'NoConflicts', status: 'True', type: 'NamesAccepted' },
      { lastTransitionTime: iso(c.agora), message: 'the initial names have been accepted', reason: 'InitialNamesAccepted', status: 'True', type: 'Established' },
    ],
    storedVersions: [versao.name],
  };
  c.ativar();
}

/** O CRD foi apagado: os objetos do tipo vão junto, e o tipo sai da lista (o kubectl ainda lembra dele por um tempo). */
export function esquecerCrd(c, crd) {
  const r = c.recursosExtras.find((x) => x.crd === crd.metadata.name);
  if (!r) return;
  for (const obj of c.listar(r.kind)) c.finalizarRemocao(obj);
  c.recursosExtras.splice(c.recursosExtras.indexOf(r), 1);
  delete c.esquemasExtras[r.kind];
  c.crdsApagados = [...(c.crdsApagados ?? []), r];
  c.ativar();
}

// ---------- o operador de backup ----------
const CRD_BACKUP = 'backups.kube-learn.dev';
const IMAGEM_OPERADOR = /(^|\/)kubelearn\/operador-backup:/;

/**
 * O operador de backup (um Deployment com a imagem kubelearn/operador-backup): para cada Backup, mantém um CronJob
 * backup-NOME com o horário e o banco do Backup, dono dele (apagou o Backup, o CronJob vai junto).
 */
export function operadorDeBackup(c) {
  const operador = c.listar('Pod').find((p) => p.spec.containers.some((ct) => IMAGEM_OPERADOR.test(ct.image)) && p.status?.phase === 'Running' && !p.metadata.deletionTimestamp);
  if (!operador) return;
  const anotar = (linha) => c.kubelet.log(operador, operador.spec.containers[0].name, `{"level":"info","msg":"${linha}"}`);
  if (!c.obter('CustomResourceDefinition', null, CRD_BACKUP)) {
    if (!c.operadorEsperando) anotar(`esperando o CRD ${CRD_BACKUP} ser instalado`);
    c.operadorEsperando = true;
    return;
  }
  c.operadorEsperando = false;
  for (const b of c.listar('Backup')) {
    if (b.metadata.deletionTimestamp) continue;
    const nome = `backup-${b.metadata.name}`;
    const desejado = {
      schedule: b.spec.horario,
      jobTemplate: {
        spec: {
          template: {
            spec: {
              restartPolicy: 'OnFailure',
              containers: [{ name: 'copia', image: 'busybox:1.36', command: ['sh', '-c', `echo copiando o banco ${b.spec.banco}; echo guardando as ultimas ${b.spec.guardar ?? 7} copias`] }],
            },
          },
        },
      },
    };
    const atual = c.obter('CronJob', b.metadata.namespace, nome);
    try {
      if (!atual) {
        c.criar({
          apiVersion: 'batch/v1', kind: 'CronJob',
          metadata: { name: nome, namespace: b.metadata.namespace, labels: { 'app.kubernetes.io/managed-by': 'operador-backup', backup: b.metadata.name }, ownerReferences: [{ apiVersion: b.apiVersion, blockOwnerDeletion: true, controller: true, kind: 'Backup', name: b.metadata.name, uid: b.metadata.uid }] },
          spec: desejado,
        });
        anotar(`backup ${b.metadata.namespace}/${b.metadata.name}: cronjob ${nome} criado (${b.spec.horario})`);
      } else if (atual.spec.schedule !== desejado.schedule || JSON.stringify(atual.spec.jobTemplate.spec.template.spec.containers[0].command) !== JSON.stringify(desejado.jobTemplate.spec.template.spec.containers[0].command)) {
        atual.spec.schedule = desejado.schedule;
        atual.spec.jobTemplate.spec.template.spec.containers[0].command = desejado.jobTemplate.spec.template.spec.containers[0].command;
        c.salvar(atual, { spec: true });
        anotar(`backup ${b.metadata.namespace}/${b.metadata.name}: cronjob ${nome} atualizado (${b.spec.horario})`);
      }
    } catch { /* o CronJob foi recusado (horário inválido): tenta de novo na próxima volta */ }
    const status = { cronJob: nome, observedGeneration: b.metadata.generation };
    if (JSON.stringify(b.status) !== JSON.stringify(status)) {
      b.status = status;
      c.salvar(b);
    }
  }
}
