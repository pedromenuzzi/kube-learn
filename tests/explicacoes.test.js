// @vitest-environment node
// A caixa "Na vida real" do terminal: o que vem da saída do kubectl (nomes, campos) entra escapado no HTML.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { explicar } from '../src/k8s/explicacoes.js';
import { definirIdioma } from '../src/i18n.js';

describe('explicações do terminal', () => {
  it('um campo com HTML na mensagem de erro não vira HTML na caixa', () => {
    const saida = 'Error from server (BadRequest): error when creating "x.yaml": Deployment in version "v1" cannot be handled as a Deployment: strict decoding error: unknown field "<img src=x onerror=alert(1)>"';
    const [caixa] = explicar(saida, { falhou: true });
    expect(caixa.texto).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(`${caixa.titulo}${caixa.texto}`).not.toContain('<img');
  });

  it('o nome que aparece no título também chega escapado', () => {
    const [caixa] = explicar('Error from server (AlreadyExists): pods "<b>x</b>" already exists', { falhou: true });
    expect(caixa.titulo).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('as caixas das mensagens novas, com a saída do kind', () => {
  const ler = (nome) => readFileSync(new URL(`./golden/kind/${nome}.txt`, import.meta.url), 'utf8');
  const titulos = (saida, falhou) => explicar(saida, { falhou }).map((c) => c.titulo);

  it('fuso horário inventado, imagem com Never, norma nova com pods antigos e campo ignorado no patch', () => {
    expect(titulos('The CronJob "marte" is invalid: spec.timeZone: Invalid value: "Mars/Olympus": unknown time zone Mars/Olympus', true)).toEqual(['"Mars/Olympus" não é um fuso horário']);
    expect(titulos('nunca   0/1     ErrImageNeverPull   0          68s', false)).toEqual(['A imagem não está no node, e o pod proibiu baixar']);
    expect(titulos(ler('real-label-ns-restrito'), false)).toContain('A norma nova vale para os próximos pods');
    expect(titulos(ler('oficina-patch-desconhecido'), false)).toEqual(['O campo foi ignorado']);
  });

  it('request maior que o limit, recurso inventado, rótulo de PodSecurity inválido, apply num objeto criado sem apply e valor fora da lista', () => {
    expect(titulos(ler('val-apply-cpu'), true)).toEqual(['O request de cpu passa do limit']);
    expect(titulos(ler('val-apply-memoria'), true)).toEqual(['O request de memory passa do limit']);
    expect(titulos(ler('val-apply-cpus'), true)).toEqual(['"cpus" não é um recurso de contêiner']);
    expect(titulos(ler('val-label-psa-nivel'), true)).toEqual(['"restrito" não vale no rótulo de PodSecurity']);
    expect(titulos(ler('val-apply-ns-psa'), true)).toEqual(['"restrito" não vale no rótulo de PodSecurity', 'Aviso: o objeto não nasceu de um apply']);
    expect(titulos(ler('val-apply-sem-last-applied'), false)).toEqual(['Aviso: o objeto não nasceu de um apply']);
    const [politica] = explicar(ler('val-apply-politica'), { falhou: true });
    expect(politica.titulo).toBe('"Talvez" não é um valor aceito em imagePullPolicy');
    expect(politica.texto).toContain('<code>IfNotPresent</code>');
  });
});

describe('o erro que ensina: campo inexistente, objeto que não existe e o aviso do Endpoints', () => {
  const ler = (nome) => readFileSync(new URL(`./golden/kind/${nome}.txt`, import.meta.url), 'utf8');
  const decodificacao = (kind, campos) => `Error from server (BadRequest): error when creating "a.yaml": ${kind} in version "v1" cannot be handled as a ${kind}: strict decoding error: ${campos.map((c) => `unknown field "${c}"`).join(', ')}`;
  const caixa = (saida, falhou = true) => explicar(saida, { falhou })[0];

  it('container num Pod: o campo sem escape cru e a sugestão do irmão parecido', () => {
    const { texto } = caixa(decodificacao('Pod', ['spec.container']));
    expect(texto).toContain('O Kubernetes não conhece o campo <code>spec.container</code>');
    expect(texto).toContain('Você quis dizer <code>containers</code>?');
    expect(texto).not.toMatch(/&quot;|unknown field/);
  });

  it('replica num Deployment sugere replicas (a saída do kind), e um campo sem parecido não ganha sugestão', () => {
    expect(caixa(ler('apply-errado')).texto).toContain('Você quis dizer <code>replicas</code> e <code>image</code>?');
    const { texto } = caixa(decodificacao('Pod', ['spec.banana']));
    expect(texto).toContain('<code>spec.banana</code>');
    expect(texto).not.toContain('Você quis dizer');
  });

  it('objeto que não existe: o título não depende de número nem de gênero', () => {
    expect(caixa(ler('get-pod-nao-existe')).titulo).toBe('Nenhum objeto em pods se chama "nao-existe"');
    expect(caixa('Error from server (NotFound): deployments.apps "web" not found').titulo).toBe('Nenhum objeto em deployments se chama "web"');
  });

  it('o Warning do Endpoints deprecated ganha a caixa com as alternativas', () => {
    const c = explicar(ler('get-ep'), { falhou: false }).find((x) => /Endpoints/.test(x.titulo));
    expect(c.texto).toContain('kubectl get endpointslices -l kubernetes.io/service-name=NOME');
    expect(c.texto).toContain('kubectl describe svc NOME');
  });

  it('o obrigatório numa lista de erros (uma linha por campo): a caixa diz o primeiro que falta', () => {
    expect(caixa(ler('obr-apply-conteiner-vazio')).titulo).toBe('Falta um campo obrigatório: spec.containers[0].name');
    expect(caixa(ler('obr-apply-crd-sem-nomes')).titulo).toBe('Falta um campo obrigatório: spec.names.plural');
    expect(caixa(ler('obr-apply-dono-vazio')).titulo).toBe('Falta um campo obrigatório: metadata.ownerReferences[0].apiVersion');
  });

  it('o roleRef que falta ou não muda: caixas próprias (a saída do kind)', () => {
    expect(caixa(ler('obr-apply-rb-sem-roleref')).titulo).toBe('Falta dizer qual crachá entregar');
    expect(caixa(ler('obr-apply-rb-tipo-errado')).titulo).toBe('"Rol" não é um tipo de crachá');
    expect(caixa(ler('obr-apply-rb-troca')).titulo).toBe('O roleRef não muda depois de criado');
  });

  it('em inglês: a mesma sugestão e as mesmas caixas', async () => {
    await definirIdioma('en', { salvar: false });
    try {
      const { texto } = caixa(decodificacao('Pod', ['spec.container']));
      expect(texto).toContain('Kubernetes doesn’t know the field <code>spec.container</code>');
      expect(texto).toContain('Did you mean <code>containers</code>?');
      expect(texto).not.toMatch(/&quot;|unknown field/);
      expect(caixa(decodificacao('Deployment', ['spec.replica'])).texto).toContain('Did you mean <code>replicas</code>?');
      expect(caixa(ler('get-pod-nao-existe')).titulo).toBe('Nothing in pods is named “nao-existe”');
      expect(explicar(ler('get-ep'), { falhou: false }).map((x) => x.titulo)).toContain('Warning: Endpoints is on its way out');
    } finally {
      await definirIdioma('pt', { salvar: false });
    }
  });
});
