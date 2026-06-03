/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const SERIAL_WORKERS = 1;
const ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 30000;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
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

  /* Configure projects for 7 different websites */
  projects: [
    // Project 1: tuoixanhnhanhngon.timdaythay.com
    {
      name: 'tuoixanhnhanhngon',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: requiredEnv('BASE_URL_TUOIXANHNHANHNGON'),
      },
    },

    // Project 2: tegianoitro.timdaythay.com
    {
      name: 'tegianoitro',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: requiredEnv('BASE_URL_TEGIANOITRO'),
      },
    },

    // Project 3: danongdichthuc.timdaythay.com
    {
      name: 'danongdichthuc',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: requiredEnv('BASE_URL_DANONGDICHTHUC'),
      },
    },

    // Project 4: hangthietyeu.timdaythay.com
    {
      name: 'hangthietyeu',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: requiredEnv('BASE_URL_HANGTHIETYEU'),
      },
    },

    // Project 5: nhanquocdan.timdaythay.com
    {
      name: 'nhanquocdan',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: requiredEnv('BASE_URL_NHANQUOCDAN'),
      },
    },

    // Project 6: si.timdaythay.com
    {
      name: 'si',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: requiredEnv('BASE_URL_SI'),
      },
    },
    {
      name: 'thegioiphaidep',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: requiredEnv('BASE_URL_THEGIOIPHAIDEP'),
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
