import { defineConfig } from '@playwright/test';

// E2E no Chromium contra o build de produção (vite preview).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173/' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: !process.env.CI },
});
