import dotenv from 'dotenv';
import path from 'path';

const envPaths = [
    path.resolve(__dirname, '..', 'test-data', 'env', '.env'),
    path.resolve(__dirname, '..', '.env'),
];

for (const envPath of envPaths) {
    dotenv.config({ path: envPath, quiet: true });
}

export const requiredEnv = (name: string) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};

export const optionalEnv = (name: string, fallback = '') => {
    return process.env[name] || fallback;
};

export const requiredUrlEnv = (name: string) => {
    const value = requiredEnv(name).trim();

    try {
        new URL(value);
    } catch {
        throw new Error(`Environment variable ${name} must be a valid absolute URL. Current value: ${value}`);
    }

    return value;
};
