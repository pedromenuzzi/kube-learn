// Manifestos que o conteúdo (as missões) e os clusters de partida usam: só texto, sem nada do simulador. Assim o
// nível 4 os usa sem trazer o cluster simulado para o pacote da página inicial (o simulador vem com a tela do exercício).
import { yaml } from './util.js';

/** O banco (postgres), com ou sem a senha vinda de um Secret. */
export const BANCO = ({ chave } = {}) => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: banco
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: banco
    template:
      metadata:
        labels:
          app: banco
      spec:
        containers:
        - name: postgres
          image: postgres:17
${chave ? `          env:
          - name: POSTGRES_PASSWORD
            valueFrom:
              secretKeyRef:
                name: banco-senha
                key: ${chave}
` : ''}`;
/** O caderno: anota numa pasta /dados que, sem volume, nem existe. */
export const CADERNO = (volume = '') => yaml`
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: caderno
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: caderno
    template:
      metadata:
        labels:
          app: caderno
      spec:
        containers:
        - name: caderno
          image: busybox:1.36
          command: ["sh", "-c", "echo nota >> /dados/notas.txt; sleep 3600"]
${volume}`;
export const PVC = (nome, classe, tamanho = '1Gi') => yaml`
  apiVersion: v1
  kind: PersistentVolumeClaim
  metadata:
    name: ${nome}
  spec:
${classe ? `    storageClassName: ${classe}\n` : ''}    accessModes:
    - ReadWriteOnce
    resources:
      requests:
        storage: ${tamanho}
`;
/** O banco com identidade: o Service headless e o StatefulSet (cada pod com o seu disco). */
export const DB = (replicas = 3) => yaml`
  apiVersion: v1
  kind: Service
  metadata:
    name: db
  spec:
    clusterIP: None
    selector:
      app: db
    ports:
    - port: 6379
  ---
  apiVersion: apps/v1
  kind: StatefulSet
  metadata:
    name: db
  spec:
    serviceName: db
    replicas: ${replicas}
    selector:
      matchLabels:
        app: db
    template:
      metadata:
        labels:
          app: db
      spec:
        containers:
        - name: redis
          image: redis:7
          ports:
          - containerPort: 6379
          volumeMounts:
          - name: dados
            mountPath: /data
    volumeClaimTemplates:
    - metadata:
        name: dados
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
`;
