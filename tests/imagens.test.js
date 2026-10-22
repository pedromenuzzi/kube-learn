// @vitest-environment node
// As tags de imagem: as que existem no Docker Hub sobem com o comportamento da família; as que não existem (erros de
// digitação, as tags inventadas dos exercícios) continuam dando ErrImagePull. E as contas das quantidades do apiserver.
import { describe, expect, it } from 'vitest';
import { buscarImagem } from '../src/k8s/imagens.js';
import { textoQuantidade } from '../src/k8s/unidades.js';

const versao = (imagem) => {
  const r = buscarImagem(imagem);
  return r.ok ? r.comportamento.versao ?? r.comportamento.env.REDIS_VERSION ?? r.comportamento.env.PG_VERSION ?? r.comportamento.env.HTTPD_VERSION ?? 'ok' : null;
};

describe('tags reais de imagem', () => {
  it('as tags do Docker Hub sobem, com a versão certa', () => {
    expect(versao('nginx:1.14.2')).toBe('1.14.2'); // a dos exemplos da documentação do Kubernetes
    expect(versao('nginx:1.27')).toBe('1.27.5');
    expect(versao('nginx:1.7.9')).toBe('1.7.9');
    expect(versao('nginx')).toBe('1.31.8');
    expect(versao('nginx:alpine')).toBe('1.31.8');
    expect(versao('nginx:stable')).toBe('1.30.6');
    expect(versao('nginx:1.27-alpine-slim')).toBe('1.27.5');
    expect(versao('docker.io/library/nginx:mainline-perl')).toBe('1.31.8');
    expect(versao('redis:7')).toBe('7.4.11');
    expect(versao('redis:7.2-alpine')).toBe('7.2.16');
    expect(versao('postgres:16-alpine')).toBe('16.15');
    expect(versao('httpd:2.4')).toBe('2.4.69');
    for (const im of ['busybox', 'busybox:1.34', 'busybox:1.36.1-musl', 'alpine:3.20', 'alpine:edge', 'ubuntu:22.04', 'ubuntu:noble', 'registry.k8s.io/pause:3.10']) expect(versao(im), im).toBe('ok');
  });

  it('tag que não existe falha como no cluster real, e repositório errado também', () => {
    for (const im of ['nginx:1.299', 'nginx:9.99', 'nginx:1.0.1', 'nginx:1.27-vitrine', 'nginx:1.9.13', 'nginx:1.14.2-alpine-slim', 'nginx:latest-alpine', 'busybox:1.24.0-musl', 'redis:6.2.9', 'alpine:3.23.1', 'postgres:18.5']) {
      expect(buscarImagem(im).erro, im).toBe(`rpc error: code = NotFound desc = failed to pull and unpack image "docker.io/library/${im}": failed to resolve reference "docker.io/library/${im}": docker.io/library/${im}: not found`);
    }
    expect(buscarImagem('ngnix:1.27').erro).toMatch(/pull access denied, repository does not exist/);
  });

  it('apelidos são a mesma imagem (mesmo digest); a variante alpine é outra, menor', () => {
    const a = buscarImagem('nginx:1.27').info;
    expect(buscarImagem('nginx:1.27.5').info.digest).toBe(a.digest);
    expect(buscarImagem('nginx:1.28').info.digest).not.toBe(a.digest);
    expect(buscarImagem('nginx:1.27-alpine').info.tamanho).toBeLessThan(a.tamanho);
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('o nginx antigo não tem o entrypoint nem o curl; o alpine não tem bash', () => {
    expect(buscarImagem('nginx:1.14.2').comportamento.binarios).not.toContain('curl');
    expect(buscarImagem('nginx:1.14.2').comportamento.logs({})).toEqual([]);
    expect(buscarImagem('nginx:alpine').comportamento.binarios).not.toContain('bash');
    expect(buscarImagem('nginx:alpine').comportamento.binarios).toContain('curl');
  });
});

describe('quantidades como o apiserver escreve', () => {
  it('mantém o formato e usa a maior unidade exata', () => {
    expect(['2', '0.5', '1000m', '250m', '1000', '1024Mi', '512Mi', '0.5Gi', '1.5Ki', '0.5Ki', '0'].map(textoQuantidade))
      .toEqual(['2', '500m', '1', '250m', '1k', '1Gi', '512Mi', '512Mi', '1536', '512', '0']);
  });
});
