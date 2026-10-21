import { defineConfig } from '@playwright/test';

// E2E no Chromium contra o build de produção (vite preview).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // pt-BR: o site abre no idioma do navegador (os testes leem o português; a troca para o inglês tem o seu teste).
  use: { baseURL: 'http://localhost:4173/', locale: 'pt-BR' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
});
