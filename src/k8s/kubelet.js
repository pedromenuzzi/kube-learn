// O kubelet de cada node: baixa a imagem, cria e reinicia os contêineres, roda o programa da imagem,
// guarda os logs e escreve o status do pod. As transições seguem o relógio do cluster.
import { buscarImagem } from './imagens.js';
import { analisar, rodar, executarComando, rodarAteOFim } from './shell.js';
import { resolvConf, buscaDns, http, resolver } from './rede.js';
import { iso } from './unidades.js';
import { atobUtf8 } from './esquema.js';
import { SistemaDeArquivos } from './discos.js';

const BACKOFF_INICIAL = 10_000;
const BACKOFF_MAXIMO = 300_000;
const SINCRONIA = 2000; // o kubelet só percebe a queda e reinicia na próxima sincronização
const WRAPPERS = new Set(['/docker-entrypoint.sh', 'docker-entrypoint.sh']);
const ATRASO_CONFIG = 60_000; // o kubelet leva até um minuto para atualizar um ConfigMap montado como volume
const sem = (caminho) => `/${caminho.split('/').filter(Boolean).join('/')}`;
/** Init container com restartPolicy Always: o sidecar (sobe antes do app e continua rodando ao lado dele). */
export const ehSidecar = (ct) => ct.restartPolicy === 'Always';
const todosOsConteineres = (pod) => [...(pod.spec.initContainers ?? []), ...pod.spec.containers];
const terminouBem = (est) => est.fase === 'terminado' && est.atual?.exitCode === 0;

/** Duração no formato do Go: 3.214s, 520ms. */
const duracaoGo = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(3).replace(/\.?0+$/, '')}s` : `${ms}ms`);

/** O programa padrão de uma imagem, sem o script de entrada (que só repassa os argumentos). */
const programaPadrao = (comp) => comp.comando.filter((a) => !WRAPPERS.has(a));

export class Kubelet {
  constructor(cluster) {
    this.c = cluster;
    this.pods = new Map(); // uid → { ip, conteineres: Map<nome, estado>, condicoes }
    this.imagens = new Map(); // node → Set de imagens já baixadas
  }

  temImagem(node, ref) {
    return this.imagens.get(node)?.has(ref) ?? false;
  }

  guardarImagem(node, ref) {
    if (!this.imagens.has(node)) this.imagens.set(node, new Set());
    this.imagens.get(node).add(ref);
  }

  /** Uma passada em todos os pods com node definido. */
  rodar() {
    for (const pod of this.c.listar('Pod')) {
      if (!pod.spec.nodeName) continue;
      this.sincronizar(pod);
    }
  }

  sincronizar(pod) {
    const c = this.c;
    const uid = pod.metadata.uid;
    let e = this.pods.get(uid);
    const node = c.obter('Node', null, pod.spec.nodeName);
    if (!e) {
      e = {
        ip: null, // o IP vem com a "sandbox" do pod, depois que os volumes montam
        conteineres: new Map(),
        condicoes: {},
        inicio: c.agora,
      };
      this.pods.set(uid, e);
    }
    for (const ct of todosOsConteineres(pod)) {
      if (!e.conteineres.has(ct.name)) e.conteineres.set(ct.name, { fase: 'esperando', reinicios: 0, logs: [], logsAnteriores: [], backoff: BACKOFF_INICIAL, backoffPull: BACKOFF_INICIAL });
    }
    if (pod.metadata.deletionTimestamp) {
      this.terminar(pod, e);
      return;
    }
    if (this.montarVolumes(pod, e)) {
      e.ip ??= pod.spec.hostNetwork ? c.ipDoNode(node) : c.alocarIpPod(node);
      if (this.inicializar(pod, e)) {
        for (const ct of pod.spec.containers) this.passo(pod, ct, e.conteineres.get(ct.name));
        this.encerrarSidecars(pod, e);
      }
    }
    this.escreverStatus(pod, e);
  }

  // ---------- eventos ----------
  evento(pod, ct, tipo, motivo, mensagem) {
    const lista = (pod.spec.initContainers ?? []).some((x) => x.name === ct.name) ? 'initContainers' : 'containers';
    this.c.evento(pod, tipo, motivo, mensagem, { componente: 'kubelet', campo: `spec.${lista}{${ct.name}}`, host: pod.spec.nodeName });
  }

  // ---------- volumes ----------
  /** Os dados de um ConfigMap ou Secret como arquivos (um por chave, ou só os `items`). */
  dadosDaFonte(fonte, obj) {
    const dados = Object.entries(obj?.data ?? {}).map(([k, v]) => [k, fonte.tipo === 'Secret' ? atobUtf8(v) : v]);
    if (!fonte.items) return new Map(dados);
    const mapa = Object.fromEntries(dados);
    return new Map(fonte.items.filter((i) => i.key in mapa).map((i) => [i.path, mapa[i.key]]));
  }

  /** Prepara os volumes do pod antes dos contêineres. Falta o ConfigMap ou o Secret: FailedMount, e espera. */
  montarVolumes(pod, e) {
    const c = this.c;
    const ns = pod.metadata.namespace;
    if (e.volumes) {
      this.atualizarVolumes(pod, e);
      return true;
    }
    const fontes = (pod.spec.volumes ?? []).map((v) => [v, v.configMap ? { tipo: 'ConfigMap', rotulo: 'configmap', nome: v.configMap.name, items: v.configMap.items, opcional: v.configMap.optional }
      : v.secret ? { tipo: 'Secret', rotulo: 'secret', nome: v.secret.secretName, items: v.secret.items, opcional: v.secret.optional } : null]);
    const falta = fontes.find(([, f]) => f && !f.opcional && !c.obter(f.tipo, ns, f.nome));
    if (falta) {
      if (c.agora >= (e.proximaMontagem ?? 0)) { // tenta de novo com espera crescente (0,5s, 1s, 2s... até 2 min)
        e.esperaMontagem = Math.min((e.esperaMontagem ?? 250) * 2, 122_000);
        e.proximaMontagem = c.agora + e.esperaMontagem;
        const [v, f] = falta;
        c.evento(pod, 'Warning', 'FailedMount', `MountVolume.SetUp failed for volume "${v.name}" : ${f.rotulo} "${f.nome}" not found`, { componente: 'kubelet', host: pod.spec.nodeName });
      }
      return false;
    }
    e.volumes = new Map();
    for (const [v, f] of fontes) {
      if (f) {
        const obj = c.obter(f.tipo, ns, f.nome);
        e.volumes.set(v.name, { loja: this.dadosDaFonte(f, obj), somenteLeitura: true, fonte: { ...f, assinatura: JSON.stringify(obj?.data ?? null) } });
      } else if (v.emptyDir) e.volumes.set(v.name, { loja: new Map() });
      else if (v.persistentVolumeClaim) {
        const pvc = c.obter('PersistentVolumeClaim', ns, v.persistentVolumeClaim.claimName);
        const chave = pvc?.spec.volumeName ?? `pvc:${ns}/${v.persistentVolumeClaim.claimName}`;
        if (!c.discos.has(chave)) c.discos.set(chave, new Map());
        e.volumes.set(v.name, { loja: c.discos.get(chave), somenteLeitura: !!v.persistentVolumeClaim.readOnly });
      } else if (v.hostPath) {
        const chave = `host:${pod.spec.nodeName}:${sem(v.hostPath.path)}`;
        if (!c.discos.has(chave)) c.discos.set(chave, new Map());
        e.volumes.set(v.name, { loja: c.discos.get(chave) });
      }
    }
    return true;
  }

  /** ConfigMap ou Secret mudou: o arquivo montado acompanha, mas só depois de um tempo (as variáveis de ambiente, nunca). */
  atualizarVolumes(pod, e) {
    const c = this.c;
    for (const vol of e.volumes.values()) {
      const f = vol.fonte;
      if (!f) continue;
      const obj = c.obter(f.tipo, pod.metadata.namespace, f.nome);
      const assinatura = JSON.stringify(obj?.data ?? null);
      if (!obj || assinatura === f.assinatura) {
        f.mudouEm = null;
        continue;
      }
      f.mudouEm ??= c.agora;
      if (c.agora - f.mudouEm < ATRASO_CONFIG) continue;
      vol.loja.clear();
      for (const [k, v] of this.dadosDaFonte(f, obj)) vol.loja.set(k, v);
      f.assinatura = assinatura;
      f.mudouEm = null;
    }
  }

  /** O sistema de arquivos que o contêiner enxerga (a imagem, a camada gravável e os volumes montados). */
  fs(pod, ct, est) {
    const e = this.pods.get(pod.metadata.uid);
    const montagens = (ct.volumeMounts ?? []).flatMap((m) => {
      const vol = e?.volumes?.get(m.name);
      if (!vol) return [];
      let { loja } = vol;
      if (m.subPath) { // só um arquivo (ou uma pasta) de dentro do volume
        const sub = m.subPath.replace(/^\/+|\/+$/g, '');
        loja = loja.has(sub) ? new Map([['', loja.get(sub)]]) : new Map([...loja].filter(([k]) => k.startsWith(`${sub}/`)).map(([k, v]) => [k.slice(sub.length + 1), v]));
      }
      return [{ caminho: sem(m.mountPath), loja, somenteLeitura: !!vol.somenteLeitura || !!m.readOnly }];
    });
    est.camada ??= new Map();
    return new SistemaDeArquivos(this.arquivos(pod, est), est.camada, montagens);
  }

  /** O sistema de arquivos de um contêiner pelo nome (para o servidor da imagem ler os arquivos dele). */
  fsDe(pod, nome) {
    const ct = todosOsConteineres(pod).find((x) => x.name === nome);
    const est = this.estado(pod, nome);
    return ct && est ? this.fs(pod, ct, est) : null;
  }

  /**
   * Os init containers, em ordem: cada um precisa terminar bem (código 0) antes do próximo; um sidecar só precisa
   * estar rodando. → true quando os contêineres do app já podem subir.
   */
  inicializar(pod, e) {
    const inits = pod.spec.initContainers ?? [];
    const politica = pod.spec.restartPolicy === 'Never' ? 'Never' : 'OnFailure'; // init que falha tenta de novo, a menos que Never
    for (const ct of inits) {
      const est = e.conteineres.get(ct.name);
      if (ehSidecar(ct)) {
        this.passo(pod, ct, est, 'Always');
        if (!e.inicializado && est.fase !== 'rodando') return false;
        continue;
      }
      if (e.inicializado || terminouBem(est)) {
        est.final = true;
        continue;
      }
      this.passo(pod, ct, est, politica);
      if (!terminouBem(est)) return false;
      est.final = true;
    }
    e.inicializado = true;
    return true;
  }

  /** O app terminou de vez (um Job, por exemplo): os sidecars recebem o sinal e saem, e o pod pode terminar. */
  encerrarSidecars(pod, e) {
    if (!pod.spec.containers.every((ct) => e.conteineres.get(ct.name).final)) return;
    for (const ct of (pod.spec.initContainers ?? []).filter(ehSidecar)) {
      const est = e.conteineres.get(ct.name);
      if (est.fase !== 'rodando') continue;
      this.evento(pod, ct, 'Normal', 'Killing', `Stopping container ${ct.name}`);
      this.encerrarExecucao(pod, ct, est, 0, 'Completed');
      est.final = true;
    }
  }

  // ---------- máquina de estados de um contêiner ----------
  passo(pod, ct, est, politicaDoContainer = pod.spec.restartPolicy) {
    const agora = this.c.agora;
    if (est.imagem && est.imagem !== ct.image && ['rodando', 'terminado', 'backoffCrash'].includes(est.fase)) {
      // A imagem do pod mudou (kubectl set image num pod solto): o contêiner é recriado.
      this.evento(pod, ct, 'Normal', 'Killing', `Container ${ct.name} definition changed, will be restarted`);
      this.encerrarExecucao(pod, ct, est, 137, 'Error');
      est.decidido = true;
      est.reiniciarEm = agora;
    }
    switch (est.fase) {
      case 'esperando':
        this.iniciarPull(pod, ct, est);
        break;
      case 'puxando':
        if (agora >= est.ate) this.terminarPull(pod, ct, est);
        break;
      case 'erroPull':
        if (agora >= est.ate) {
          est.fase = 'backoffPull';
          est.ate = agora + est.backoffPull;
          est.backoffPull = Math.min(est.backoffPull * 2, BACKOFF_MAXIMO);
          this.evento(pod, ct, 'Normal', 'BackOff', `Back-off pulling image "${ct.image}"`);
          this.evento(pod, ct, 'Warning', 'Failed', 'Error: ImagePullBackOff');
        }
        break;
      case 'backoffPull':
        if (agora >= est.ate) this.iniciarPull(pod, ct, est);
        break;
      case 'erroConfig':
        if (agora >= est.ate) this.criar(pod, ct, est);
        break;
      case 'rodando':
        this.avancarProcesso(pod, ct, est);
        break;
      case 'terminado':
        if (est.final) break;
        if (!est.decidido) {
          const politica = politicaDoContainer;
          if (!(politica === 'Always' || (politica === 'OnFailure' && est.atual.exitCode !== 0))) {
            if (agora >= est.ate) est.final = true;
            break;
          }
          // O primeiro reinício é quase imediato; depois a espera dobra: 10s, 20s, 40s... até 5 min.
          est.quedas = (est.quedas ?? 0) + 1;
          est.esperaAtual = est.quedas === 1 ? 1000 : Math.min(BACKOFF_INICIAL * 2 ** (est.quedas - 2), BACKOFF_MAXIMO);
          est.reiniciarEm = agora + est.esperaAtual + SINCRONIA;
          est.decidido = true;
        }
        if (agora >= est.reiniciarEm) this.iniciarPull(pod, ct, est);
        else if (agora >= est.ate + 4000) {
          est.fase = 'backoffCrash';
          this.evento(pod, ct, 'Warning', 'BackOff', `Back-off restarting failed container ${ct.name} in pod ${pod.metadata.name}_${pod.metadata.namespace}(${pod.metadata.uid})`);
        }
        break;
      case 'backoffCrash':
        if (agora >= est.reiniciarEm) this.iniciarPull(pod, ct, est);
        break;
    }
  }

  iniciarPull(pod, ct, est) {
    const c = this.c;
    const politica = ct.imagePullPolicy;
    const presente = this.temImagem(pod.spec.nodeName, ct.image);
    est.imagem = ct.image;
    if (presente && politica !== 'Always') {
      this.evento(pod, ct, 'Normal', 'Pulled', `Container image "${ct.image}" already present on machine and can be accessed by the pod`);
      this.criar(pod, ct, est);
      return;
    }
    if (politica === 'Never') {
      est.fase = 'erroConfig';
      est.motivo = 'ErrImageNeverPull';
      est.mensagem = `Container image "${ct.image}" is not present with pull policy of Never`;
      est.ate = c.agora + BACKOFF_INICIAL;
      this.evento(pod, ct, 'Warning', 'ErrImageNeverPull', est.mensagem);
      return;
    }
    this.evento(pod, ct, 'Normal', 'Pulling', `Pulling image "${ct.image}"`);
    const r = buscarImagem(ct.image);
    const base = r.ok ? (presente ? 400 : r.info.puxaEm) : 1000;
    est.duracaoPull = Math.round(base * (0.8 + c.aleatorio.proximo() * 0.4));
    est.fase = 'puxando';
    est.ate = c.agora + est.duracaoPull;
  }

  terminarPull(pod, ct, est) {
    const r = buscarImagem(ct.image);
    if (!r.ok) {
      this.evento(pod, ct, 'Warning', 'Failed', `Failed to pull image "${ct.image}": ${r.erro}`);
      this.evento(pod, ct, 'Warning', 'Failed', 'Error: ErrImagePull');
      est.fase = 'erroPull';
      est.erroPull = r.erro;
      est.ate = this.c.agora + 1000;
      return;
    }
    this.guardarImagem(pod.spec.nodeName, ct.image);
    est.erroPull = null;
    const d = duracaoGo(est.duracaoPull);
    this.evento(pod, ct, 'Normal', 'Pulled', `Successfully pulled image "${ct.image}" in ${d} (${d} including waiting). Image size: ${r.info.tamanho} bytes.`);
    this.criar(pod, ct, est);
  }

  /** Cria e inicia o contêiner (a imagem já está no node). */
  criar(pod, ct, est) {
    const c = this.c;
    const r = buscarImagem(ct.image);
    est.comportamento = r.comportamento;
    est.info = r.info;
    est.ref = r.ref;
    est.imagem = ct.image;
    const env = this.montarEnv(pod, ct, r.comportamento);
    if (env.erro) {
      est.fase = 'erroConfig';
      est.motivo = 'CreateContainerConfigError';
      est.mensagem = env.erro;
      est.ate = c.agora + BACKOFF_INICIAL;
      this.evento(pod, ct, 'Warning', 'Failed', `Error: ${env.erro}`);
      return;
    }
    est.env = env.env;
    if (est.jaRodou) { // é um reinício: o término anterior vira o "Last State"
      est.reinicios += 1;
      est.ultimoTermino = est.atual;
    }
    est.decidido = false;
    est.id = c.aleatorio.hex(64);
    est.inicio = c.agora;
    est.motivo = null;
    est.mensagem = null;
    est.ouvindo = false;
    est.logsAnteriores = est.logs;
    est.logs = [];
    est.camada = new Map(); // contêiner novo, camada gravável nova (o que não estava num volume se perde)

    const comp = r.comportamento;
    // Como o Docker: command substitui o ENTRYPOINT; args substitui o CMD.
    const ep = comp.entrypoint ?? [];
    const argv = ct.command ? [...ct.command, ...(ct.args ?? [])] : [...ep, ...(ct.args ?? comp.comando.slice(ep.length))];
    const semWrapper = argv.filter((a) => !WRAPPERS.has(a));
    const bin = semWrapper[0];
    this.evento(pod, ct, 'Normal', 'Created', 'Container created');

    if (bin && !comp.binarios.includes(bin) && !comp.binarios.includes(bin.split('/').pop())) {
      const msg = `failed to create containerd task: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "${bin}": executable file not found in $PATH`;
      this.evento(pod, ct, 'Warning', 'Failed', `Error: ${msg}`);
      est.fase = 'terminado';
      est.jaRodou = true;
      est.atual = { containerID: `containerd://${est.id}`, exitCode: 128, finishedAt: iso(c.agora), message: msg, reason: 'StartError', startedAt: '1970-01-01T00:00:00Z' };
      est.ate = c.agora + 1000;
      return;
    }

    this.evento(pod, ct, 'Normal', 'Started', 'Container started');
    est.fase = 'rodando';
    // Entre o "Started" e o "Ready" passa um tempo (o programa abrindo, o kubelet relatando o status).
    est.prontoEm = c.agora + (comp.prontoApos ?? 1000);
    est.jaRodou = true;
    est.final = false;
    const saida = (texto) => {
      for (const linha of texto.replace(/\n$/, '').split('\n')) est.logs.push({ t: c.agora, linha });
    };
    const node = c.obter('Node', null, pod.spec.nodeName);
    const ctx = this.contexto(pod, ct, est, saida);
    const programa = programaPadrao(comp);
    const base = (x) => x?.split('/').pop();
    if (comp.servidor && base(bin) === base(programa[0])) {
      est.processo = (function* servidor() {
        // Falta configuração: o programa sai na hora, sem nunca ficar pronto.
        if (comp.exigeEnv?.some((k) => !est.env[k])) {
          saida(`${comp.semEnv.log.join('\n')}\n`);
          return { codigo: comp.semEnv.codigo };
        }
        if (comp.exigeArquivo && ctx.fs.ler(comp.exigeArquivo) === undefined) {
          saida(`${comp.semArquivo.log.join('\n')}\n`);
          return { codigo: comp.semArquivo.codigo };
        }
        const linhas = comp.logs({ agora: c.agora, cpus: Math.max(1, Math.floor(c.cpuDoNode(node) / 1000)), kernel: c.kernel });
        if (linhas.length) saida(`${linhas.join('\n')}\n`);
        est.ouvindo = true;
        if (comp.quebraApos !== undefined) {
          // quebraApos 0: cai na subida. Maior que 0: sobe, fica "pronto" e cai depois (engana o rollout sem probe).
          if (comp.quebraApos > 0) yield { dormir: comp.quebraApos };
          est.ouvindo = false;
          saida(`${comp.log.join('\n')}\n`);
          return { codigo: comp.codigo };
        }
        yield { dormir: Infinity };
        return { codigo: 0 };
      })();
    } else {
      const base = bin?.split('/').pop();
      let script = '';
      if (base === 'sh' || base === 'bash') script = semWrapper[1] === '-c' ? semWrapper[2] ?? '' : '';
      else if (bin) script = semWrapper.map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(' ');
      est.processo = rodar(analisar(script), ctx);
    }
    est.acordarEm = c.agora;
    this.avancarProcesso(pod, ct, est);
  }

  avancarProcesso(pod, ct, est) {
    const c = this.c;
    for (let i = 0; i < 100 && est.fase === 'rodando' && est.acordarEm <= c.agora; i++) {
      const { value, done } = est.processo.next();
      if (done) {
        this.encerrarExecucao(pod, ct, est, value?.codigo ?? 0);
        return;
      }
      if (value?.dormir !== undefined) est.acordarEm = c.agora + value.dormir;
    }
  }

  encerrarExecucao(pod, ct, est, codigo, motivo) {
    const c = this.c;
    est.fase = 'terminado';
    est.ouvindo = false;
    est.atual = {
      containerID: `containerd://${est.id}`,
      exitCode: codigo,
      finishedAt: iso(c.agora),
      reason: motivo ?? (codigo === 0 ? 'Completed' : 'Error'),
      startedAt: iso(est.inicio),
    };
    est.ate = c.agora + 1000;
    // Rodou mais de 10 minutos sem cair: o backoff volta ao início.
    if (c.agora - est.inicio > 600_000) est.quedas = 0;
  }

  /** Pod marcado para apagar: manda parar os contêineres e espera o prazo de cada imagem. */
  terminar(pod, e) {
    const c = this.c;
    if (!e.terminando) {
      e.terminando = true;
      const prazo = (pod.metadata.deletionGracePeriodSeconds ?? pod.spec.terminationGracePeriodSeconds ?? 30) * 1000;
      for (const ct of todosOsConteineres(pod)) {
        const est = e.conteineres.get(ct.name);
        if (est.fase === 'rodando') {
          this.evento(pod, ct, 'Normal', 'Killing', `Stopping container ${ct.name}`);
          est.paraEm = c.agora + Math.min(est.comportamento?.paraEm ?? 0, prazo);
        } else est.paraEm = c.agora;
      }
    }
    const pronto = todosOsConteineres(pod).every((ct) => c.agora >= (e.conteineres.get(ct.name).paraEm ?? 0));
    if (pronto) {
      this.pods.delete(pod.metadata.uid);
      c.finalizarRemocao(pod);
    }
  }

  // ---------- ambiente do contêiner ----------
  montarEnv(pod, ct, comp) {
    const c = this.c;
    const ns = pod.metadata.namespace;
    const env = { ...comp.env, HOSTNAME: pod.metadata.name };
    // Variáveis de "service links" (o jeito antigo de achar Services; o DNS é o jeito certo).
    const servicos = [c.obter('Service', 'default', 'kubernetes'), ...(pod.spec.enableServiceLinks === false ? [] : c.listar('Service', ns))];
    for (const svc of servicos) {
      if (!svc || !svc.spec.clusterIP || svc.spec.clusterIP === 'None') continue;
      const nome = svc.metadata.name.toUpperCase().replaceAll('-', '_');
      const [p0] = svc.spec.ports;
      env[`${nome}_SERVICE_HOST`] = svc.spec.clusterIP;
      env[`${nome}_SERVICE_PORT`] = String(p0.port);
      env[`${nome}_PORT`] = `${p0.protocol.toLowerCase()}://${svc.spec.clusterIP}:${p0.port}`;
      for (const p of svc.spec.ports) {
        const pre = `${nome}_PORT_${p.port}_${p.protocol}`;
        env[pre] = `${p.protocol.toLowerCase()}://${svc.spec.clusterIP}:${p.port}`;
        env[`${pre}_PROTO`] = p.protocol.toLowerCase();
        env[`${pre}_PORT`] = String(p.port);
        env[`${pre}_ADDR`] = svc.spec.clusterIP;
        if (p.name) env[`${nome}_SERVICE_PORT_${p.name.toUpperCase().replaceAll('-', '_')}`] = String(p.port);
      }
    }
    const fonte = (tipo, nome) => c.obter(tipo, ns, nome);
    const valorDe = (tipo, obj, chave) => (tipo === 'Secret' ? atobUtf8(obj.data?.[chave] ?? '') : obj.data?.[chave]);
    for (const ef of ct.envFrom ?? []) {
      const [tipo, ref] = ef.configMapRef ? ['ConfigMap', ef.configMapRef] : ['Secret', ef.secretRef];
      const obj = fonte(tipo, ref.name);
      if (!obj) {
        if (ref.optional) continue;
        return { erro: `${tipo === 'ConfigMap' ? 'configmap' : 'secret'} "${ref.name}" not found` };
      }
      for (const k of Object.keys(obj.data ?? {})) env[`${ef.prefix ?? ''}${k}`] = valorDe(tipo, obj, k);
    }
    for (const v of ct.env ?? []) {
      if (!v.valueFrom) {
        env[v.name] = (v.value ?? '').replace(/\$\((\w+)\)/g, (m, n) => env[n] ?? m);
        continue;
      }
      const vf = v.valueFrom;
      if (vf.configMapKeyRef || vf.secretKeyRef) {
        const [tipo, ref, rotulo] = vf.configMapKeyRef ? ['ConfigMap', vf.configMapKeyRef, 'configmap'] : ['Secret', vf.secretKeyRef, 'secret'];
        const obj = fonte(tipo, ref.name);
        if (!obj) {
          if (ref.optional) continue;
          return { erro: `${rotulo} "${ref.name}" not found` };
        }
        if (!(ref.key in (obj.data ?? {}))) {
          if (ref.optional) continue;
          return { erro: `couldn't find key ${ref.key} in ${tipo} ${ns}/${ref.name}` };
        }
        env[v.name] = valorDe(tipo, obj, ref.key);
      } else if (vf.fieldRef) {
        const campos = { 'metadata.name': pod.metadata.name, 'metadata.namespace': ns, 'spec.nodeName': pod.spec.nodeName, 'status.podIP': this.pods.get(pod.metadata.uid)?.ip, 'spec.serviceAccountName': pod.spec.serviceAccountName };
        env[v.name] = campos[vf.fieldRef.fieldPath] ?? '';
      }
    }
    return { env };
  }

  arquivos(pod, est) {
    const ip = this.pods.get(pod.metadata.uid)?.ip;
    const ns = pod.metadata.namespace;
    return {
      '/etc/hostname': `${pod.spec.hostname ?? pod.metadata.name}\n`,
      '/etc/resolv.conf': resolvConf(ns),
      '/etc/hosts': `# Kubernetes-managed hosts file.\n127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\nfe00::0\tip6-localnet\nfe00::0\tip6-mcastprefix\nfe00::1\tip6-allnodes\nfe00::2\tip6-allrouters\n${ip}\t${pod.spec.subdomain ? `${pod.spec.hostname ?? pod.metadata.name}.${pod.spec.subdomain}.${ns}.svc.cluster.local\t` : ''}${pod.spec.hostname ?? pod.metadata.name}\n`,
      '/var/run/secrets/kubernetes.io/serviceaccount/namespace': ns,
      '/var/run/secrets/kubernetes.io/serviceaccount/token': 'eyJhbGciOiJSUzI1NiIsImtpZCI6Imt1YmUtbGVhcm4ifQ.simulado.assinatura',
      '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt': '-----BEGIN CERTIFICATE-----\nMIIC/jCCAeagAwIBAgIBADANBgkqhkiG9w0BAQsFADAVMRMwEQYDVQQDEwprdWJl\n-----END CERTIFICATE-----\n',
      ...(est.comportamento?.arquivos ?? {}),
    };
  }

  contexto(pod, ct, est, saida) {
    const c = this.c;
    return {
      env: est.env,
      hostname: pod.metadata.name,
      binarios: est.comportamento.binarios,
      busybox: !!est.comportamento.busybox,
      buscaDns: buscaDns(pod.metadata.namespace),
      get agora() { return c.agora; },
      fs: this.fs(pod, ct, est),
      saida,
      comandos: executarComando,
      rede: {
        http: (url, opcoes) => http(c, pod, url, opcoes),
        dns: (nome) => resolver(c, nome, pod.metadata.namespace),
      },
    };
  }

  // ---------- consultas usadas pela rede e pelo kubectl ----------
  quemOuve(pod, porta) {
    const e = this.pods.get(pod.metadata.uid);
    if (!e) return null;
    for (const [nome, est] of e.conteineres) {
      if (est.fase === 'rodando' && est.ouvindo && est.comportamento.servidor.portas.includes(porta)) return { comportamento: est.comportamento, conteiner: nome };
    }
    return null;
  }

  log(pod, conteiner, linha) {
    this.pods.get(pod.metadata.uid)?.conteineres.get(conteiner)?.logs.push({ t: this.c.agora, linha });
  }

  estado(pod, conteiner) {
    return this.pods.get(pod.metadata.uid)?.conteineres.get(conteiner);
  }

  ip(pod) {
    return this.pods.get(pod.metadata.uid)?.ip;
  }

  /** Roda um comando dentro do contêiner (kubectl exec). → { saida, codigo } | { erro } */
  exec(pod, conteiner, argv) {
    const est = this.estado(pod, conteiner);
    if (!est || est.fase !== 'rodando') return { erro: `error: unable to upgrade connection: container not found ("${conteiner}")` };
    const bin = argv[0];
    if (!est.comportamento.binarios.includes(bin) && !est.comportamento.binarios.includes(bin.split('/').pop()) && bin !== 'echo') {
      return { erro: `error: Internal error occurred: Internal error occurred: error executing command in container: failed to exec in container: failed to start exec "${this.c.aleatorio.hex(64)}": OCI runtime exec failed: exec failed: unable to start container process: exec: "${bin}": executable file not found in $PATH` };
    }
    let saida = '';
    const ctx = this.contexto(pod, todosOsConteineres(pod).find((x) => x.name === conteiner), est, (t) => { saida += t; });
    ctx.env = { ...est.env };
    const base = bin.split('/').pop();
    if ((base === 'sh' || base === 'bash') && argv[1] === '-c') {
      const codigo = rodarAteOFim(argv[2] ?? '', ctx);
      return { saida, codigo };
    }
    if (base === 'sh' || base === 'bash') return { saida: '', codigo: 0, shell: true, ctx };
    const r = executarComando(argv, ctx);
    return { saida: (r.saida ?? '') + (r.erro ?? ''), codigo: r.codigo };
  }

  // ---------- status ----------
  escreverStatus(pod, e) {
    const c = this.c;
    const ests = pod.spec.containers.map((ct) => [ct, e.conteineres.get(ct.name)]);
    const inits = (pod.spec.initContainers ?? []).map((ct) => [ct, e.conteineres.get(ct.name)]);
    const initFalhou = inits.find(([ct, est]) => !ehSidecar(ct) && est.final && est.atual?.exitCode !== 0);
    const todosJaRodaram = ests.every(([, est]) => est.jaRodou);
    const finais = ests.every(([, est]) => est.final);
    let fase = 'Pending';
    if (initFalhou) fase = 'Failed';
    else if (finais) fase = ests.every(([, est]) => est.atual.exitCode === 0) ? 'Succeeded' : 'Failed';
    else if (todosJaRodaram && e.inicializado) fase = 'Running';
    const pronto = (est) => est.fase === 'rodando' && c.agora >= (est.prontoEm ?? 0);
    const sidecars = inits.filter(([ct]) => ehSidecar(ct));
    const prontos = [...ests, ...sidecars].every(([, est]) => pronto(est));
    const incompletos = inits.filter(([ct, est]) => (ehSidecar(ct) ? est.fase !== 'rodando' : !terminouBem(est)) && !e.inicializado).map(([ct]) => ct.name);
    const condicao = (tipo, status, extra = {}) => {
      const anterior = e.condicoes[tipo];
      if (!anterior || anterior.status !== status) e.condicoes[tipo] = { status, desde: c.agora };
      return { lastProbeTime: null, lastTransitionTime: iso(e.condicoes[tipo].desde), observedGeneration: 1, status, type: tipo, ...extra };
    };
    const naoProntos = ests.filter(([, est]) => !pronto(est)).map(([ct]) => ct.name);
    const motivoNaoPronto = fase === 'Succeeded' ? { reason: 'PodCompleted' } : { message: `containers with unready status: [${naoProntos.join(' ')}]`, reason: 'ContainersNotReady' };
    const encerrado = fase === 'Succeeded' || fase === 'Failed';
    const status = {
      conditions: [
        condicao('PodReadyToStartContainers', encerrado || !e.ip ? 'False' : 'True'),
        condicao('Initialized', e.inicializado || !inits.length ? 'True' : 'False', e.inicializado || !inits.length ? {} : { message: `containers with incomplete status: [${incompletos.join(' ')}]`, reason: 'ContainersNotInitialized' }),
        condicao('Ready', prontos ? 'True' : 'False', prontos ? {} : motivoNaoPronto),
        condicao('ContainersReady', prontos ? 'True' : 'False', prontos ? {} : motivoNaoPronto),
        { ...(pod.status?.conditions?.find((x) => x.type === 'PodScheduled') ?? {}), observedGeneration: 1 },
      ],
      containerStatuses: ests.map(([ct, est]) => {
        const st = this.statusConteiner(pod, ct, est);
        return !inits.length || e.inicializado || est.jaRodou ? st : { ...st, state: { waiting: { reason: 'PodInitializing' } } }; // o app espera os init containers
      }),
      ...(inits.length ? { initContainerStatuses: inits.map(([ct, est]) => this.statusConteiner(pod, ct, est, terminouBem(est))) } : {}),
      hostIP: c.ipDoNode(c.obter('Node', null, pod.spec.nodeName)),
      hostIPs: [{ ip: c.ipDoNode(c.obter('Node', null, pod.spec.nodeName)) }],
      observedGeneration: 1,
      phase: fase,
      ...(e.ip ? { podIP: e.ip, podIPs: [{ ip: e.ip }] } : {}),
      qosClass: qos(pod),
      resources: {},
      startTime: iso(e.inicio),
    };
    if (JSON.stringify(status) !== JSON.stringify(pod.status)) {
      pod.status = status;
      c.salvar(pod);
    }
  }

  statusConteiner(pod, ct, est, concluido = false) {
    const s = { image: est.ref && est.id ? est.ref.completo : ct.image };
    if (est.ref && est.id) {
      s.imageID = `${est.ref.repo}@sha256:${est.info.digest}`;
      s.containerID = `containerd://${est.id}`;
    } else {
      s.imageID = '';
    }
    s.lastState = est.ultimoTermino ? { terminated: est.ultimoTermino } : {};
    s.name = ct.name;
    s.ready = concluido || (est.fase === 'rodando' && this.c.agora >= (est.prontoEm ?? 0));
    s.restartCount = est.reinicios;
    s.started = est.fase === 'rodando';
    switch (est.fase) {
      case 'rodando': s.state = { running: { startedAt: iso(est.inicio) } }; break;
      case 'terminado': s.state = { terminated: est.atual }; break;
      case 'erroPull': s.state = { waiting: { message: est.erroPull, reason: 'ErrImagePull' } }; break;
      case 'backoffPull': s.state = { waiting: { message: `Back-off pulling image "${ct.image}": ErrImagePull: ${est.erroPull}`, reason: 'ImagePullBackOff' } }; break;
      case 'erroConfig': s.state = { waiting: { message: est.mensagem, reason: est.motivo } }; break;
      case 'backoffCrash': s.state = { waiting: { message: `back-off ${est.esperaAtual / 1000}s restarting failed container=${ct.name} pod=${pod.metadata.name}_${pod.metadata.namespace}(${pod.metadata.uid})`, reason: 'CrashLoopBackOff' } }; break;
      default:
        // Tentando de novo: o status continua mostrando o problema anterior até o contêiner nascer.
        if (est.erroPull) s.state = { waiting: { message: `Back-off pulling image "${ct.image}": ErrImagePull: ${est.erroPull}`, reason: 'ImagePullBackOff' } };
        else if (est.atual) s.state = { terminated: est.atual };
        else s.state = { waiting: { reason: 'ContainerCreating' } };
    }
    if (!est.id) {
      delete s.containerID;
      return s;
    }
    s.resources = {};
    s.user = { linux: { gid: 0, supplementalGroups: [0], uid: 0 } };
    if (ct.volumeMounts?.length) s.volumeMounts = ct.volumeMounts.map((m) => ({ ...m, ...(m.readOnly ? { recursiveReadOnly: 'Disabled' } : {}) }));
    return s;
  }
}

/** Classe de QoS: Guaranteed (requests = limits em tudo), BestEffort (nada) ou Burstable. */
export function qos(pod) {
  const cs = pod.spec.containers;
  const nada = cs.every((c) => !Object.keys(c.resources?.requests ?? {}).length && !Object.keys(c.resources?.limits ?? {}).length);
  if (nada) return 'BestEffort';
  const garantido = cs.every((c) => {
    const l = c.resources?.limits ?? {};
    const r = { ...l, ...(c.resources?.requests ?? {}) };
    return l.cpu && l.memory && String(r.cpu) === String(l.cpu) && String(r.memory) === String(l.memory);
  });
  return garantido ? 'Guaranteed' : 'Burstable';
}
