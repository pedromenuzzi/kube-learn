import { defineConfig } from '@playwright/test';

// E2E contra o build de produção (vite preview): todos os specs no Chromium; os de polimento e de missão também no
// Firefox (o aviso flutuante usa CSS anchor positioning, que no Firefox cai no fallback).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true, // cada teste abre a sua página: os de um mesmo arquivo também rodam em paralelo
  // Fora do CI, no máximo 2 navegadores: com um por metade dos núcleos (6), a máquina de quem roda travava. O CI é o
  // GITHUB_ACTIONS, não o CI: o comando Docker local (no CLAUDE.md) também passa CI=1.
  workers: process.env.GITHUB_ACTIONS ? undefined : 2,
  // Sem retry, nem no CI: o teste instável fica vermelho em vez de passar escondido na segunda tentativa.
  retries: 0,
  // pt-BR: o site abre no idioma do navegador (os testes leem o português; a troca para o inglês tem o seu teste).
  // O trace (passos, DOM e rede) fica em test-results/ quando um teste falha; o CI sobe a pasta como artefato.
  use: { baseURL: 'http://localhost:4173/', locale: 'pt-BR', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' }, testMatch: /[/\\](polimento|missao)\.spec\.js$/ },
  ],
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
});
