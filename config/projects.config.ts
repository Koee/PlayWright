import { devices, type Project } from '@playwright/test';
import { requiredUrlEnv } from './env.config';

type SiteProjectConfig = {
    name: string;
    baseUrlEnv: string;
};

// Website/project declaration list. Add a new site here with its BASE_URL_* env key.
export const SITE_PROJECTS: SiteProjectConfig[] = [
    { name: 'tuoixanhnhanhngon', baseUrlEnv: 'BASE_URL_TUOIXANHNHANHNGON' },
    { name: 'tegianoitro', baseUrlEnv: 'BASE_URL_TEGIANOITRO' },
    { name: 'danongdichthuc', baseUrlEnv: 'BASE_URL_DANONGDICHTHUC' },
    { name: 'hangthietyeu', baseUrlEnv: 'BASE_URL_HANGTHIETYEU' },
    { name: 'nhanquocdan', baseUrlEnv: 'BASE_URL_NHANQUOCDAN' },
    { name: 'si', baseUrlEnv: 'BASE_URL_SI' },
    { name: 'thegioiphaidep', baseUrlEnv: 'BASE_URL_THEGIOIPHAIDEP' },
];

// Converts SITE_PROJECTS into Playwright projects and attaches each baseURL.
/**
 * Chuyen danh sach website thanh Playwright projects.
 * Moi project duoc gan baseURL rieng tu env de cung mot spec chay tren nhieu site.
 */
export function createPlaywrightProjects(): Project[] {
    return SITE_PROJECTS.map(({ name, baseUrlEnv }) => ({
        name,
        use: {
            ...devices['Desktop Chrome'],
            baseURL: requiredUrlEnv(baseUrlEnv),
        },
    }));
}
