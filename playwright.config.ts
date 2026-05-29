/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Set timeout for each action */
    actionTimeout: 15000,

    /* Set timeout for navigation */
    navigationTimeout: 30000,
  },

  /* Configure projects for 6 different websites */
  projects: [
    // Project 1: tuoixanhnhanhngon.timdaythay.com
    {
      name: 'tuoixanhnhanhngon',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://tuoixanhnhanhngon.timdaythay.com/?nvsale=nguyena_0989336674',
      },
    },

    // Project 2: tegianoitro.timdaythay.com
    {
      name: 'tegianoitro',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://tegianoitro.timdaythay.com/?nvsale=dangthanhtuan_0913103769',
      },
    },

    // Project 3: danongdichthuc.timdaythay.com
    {
      name: 'danongdichthuc',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://danongdichthuc.timdaythay.com/?nvsale=dangthanhtuan_0913103769',
      },
    },

    // Project 4: hangthietyeu.timdaythay.com
    {
      name: 'hangthietyeu',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://hangthietyeu.timdaythay.com/',
      },
    },

    // Project 5: nhanquocdan.timdaythay.com
    {
      name: 'nhanquocdan',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://nhanquocdan.timdaythay.com/?nvsale=nguyena_0989336674',
      },
    },

    // Project 6: si.timdaythay.com
    {
      name: 'si',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://si.timdaythay.com/?nvsale=nguyena_0989336674',
      },
    },
    {
      name: 'thegioiphaidep',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://thegioiphaidep.timdaythay.com/',
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