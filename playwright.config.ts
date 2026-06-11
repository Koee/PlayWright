/// <reference types="node" />
import { defineConfig } from '@playwright/test';
import { createPlaywrightProjects } from './config/projects.config';
import { ACTION_TIMEOUT_MS, NAVIGATION_TIMEOUT_MS, SERIAL_WORKERS } from './config/test.config';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Clipboard tests use shared OS state, so keep the suite serial. */
  workers: SERIAL_WORKERS,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',
    headless: true,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],

    /* Set timeout for each action */
    actionTimeout: ACTION_TIMEOUT_MS,

    /* Set timeout for navigation */
    navigationTimeout: NAVIGATION_TIMEOUT_MS,
  },

  /* Configure projects for all websites from config/projects.config.ts. */
  projects: createPlaywrightProjects(),

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
