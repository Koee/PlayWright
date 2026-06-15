import dotenv from 'dotenv';
import path from 'path';

const envPaths = [
    // Primary env file used by the automation suite.
    path.resolve(__dirname, '..', 'test-data', 'env', '.env'),
    // Fallback env file for older/local setups.
    path.resolve(__dirname, '..', '.env'),
];

for (const envPath of envPaths) {
    dotenv.config({ path: envPath, quiet: true });
}

/**
 * Lay env bat buoc va fail som khi thieu.
 */
export const requiredEnv = (name: string) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

// Optional env lookup for values that can use defaults in tests.
/**
 * Lay env tuy chon, dung fallback neu khong khai bao.
 */
export const optionalEnv = (name: string, fallback = '') => {
    return process.env[name] || fallback;
};

// Base URL declarations are validated here before Playwright projects are created.
/**
 * Lay env URL bat buoc va validate phai la absolute URL.
 */
export const requiredUrlEnv = (name: string) => {
    const value = requiredEnv(name).trim();

    try {
        new URL(value);
    } catch {
        throw new Error(`Environment variable ${name} must be a valid absolute URL. Current value: ${value}`);
    }

    return value;
};
