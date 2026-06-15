const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const testConfigPath = path.join(rootDir, 'config', 'test.config.ts');
const k6DistDir = path.join(rootDir, 'test-results', 'k6-dist');
const k6CompiledEntry = path.join('test-results', 'k6-dist', 'checkout-order-load.js');
const k6CompiledEntryPath = path.join(rootDir, k6CompiledEntry);

function readNumberExport(name) {
    const source = fs.readFileSync(testConfigPath, 'utf8');
    const match = source.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*(\\d+)\\s*;`));
    if (!match) {
        throw new Error(`Could not read ${name} from ${testConfigPath}`);
    }

    return match[1];
}

function hasArg(name) {
    return process.argv.includes(name);
}

function readArgValue(name, fallback) {
    const index = process.argv.indexOf(name);
    if (index === -1 || index + 1 >= process.argv.length) {
        return fallback;
    }

    return process.argv[index + 1];
}

const mode = readArgValue('--mode', 'guest');
const projectName = readArgValue('--project', process.env.K6_PROJECT_NAME || 'si');
const writeJson = hasArg('--json');
const smoke = hasArg('--smoke');
const dryRun = hasArg('--dry-run');
const showVersion = hasArg('--version');
const outputPath = readArgValue('--out', 'test-results/k6/checkout-order-load-metrics.json');
const totalOrders = smoke ? '1' : readNumberExport('API_PERFORMANCE_CHECKOUT_ORDER_COUNT');
const ratePerSecond = readNumberExport('API_PERFORMANCE_CHECKOUT_RATE_PER_SECOND');
const defaultP95ThresholdMs = smoke ? '15000' : '3000';
const defaultMaxVus = String(
    Math.max(
        Number(ratePerSecond),
        Number(ratePerSecond) * (Math.ceil(Number(defaultP95ThresholdMs) / 1000) + 3)
    )
);
const templatePath = process.env.K6_CHECKOUT_TEMPLATE_PATH || path.join('test-data', 'k6', `${projectName}-${mode}-checkout-order-api-template.json`);

function resolveProjectPath(filePath) {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    return path.resolve(rootDir, filePath);
}

function collectFiles(dirPath, predicate) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(entryPath, predicate));
        } else if (predicate(entryPath)) {
            files.push(entryPath);
        }
    }

    return files;
}

function shouldCompileK6Typescript() {
    const sourceFiles = [
        path.join(rootDir, 'tsconfig.k6.json'),
        ...collectFiles(path.join(rootDir, 'performance', 'k6'), filePath => filePath.endsWith('.ts')),
    ];
    const emittedSources = sourceFiles.filter(filePath => filePath.endsWith('.ts') && !filePath.endsWith('.d.ts'));
    const hasAllOutputs = emittedSources.every(filePath => {
        const relativePath = path.relative(path.join(rootDir, 'performance', 'k6'), filePath);
        const outputPath = path.join(k6DistDir, relativePath).replace(/\.ts$/, '.js');

        return fs.existsSync(outputPath);
    });

    if (!hasAllOutputs) {
        return true;
    }

    const newestSourceMtime = Math.max(...sourceFiles.map(filePath => fs.statSync(filePath).mtimeMs));
    const compiledMtime = fs.statSync(k6CompiledEntryPath).mtimeMs;

    return newestSourceMtime > compiledMtime;
}

const env = {
    ...process.env,
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    NO_PROXY: '*',
    K6_CHECKOUT_MODE: mode,
    K6_PROJECT_NAME: projectName,
    K6_CHECKOUT_TEMPLATE_PATH: resolveProjectPath(templatePath),
    K6_TOTAL_ORDERS: process.env.K6_TOTAL_ORDERS || totalOrders,
    K6_RATE_PER_SECOND: process.env.K6_RATE_PER_SECOND || ratePerSecond,
    K6_MAX_VUS: process.env.K6_MAX_VUS || defaultMaxVus,
    K6_P95_THRESHOLD_MS: process.env.K6_P95_THRESHOLD_MS || defaultP95ThresholdMs,
    K6_DROPPED_ITERATIONS_LIMIT: process.env.K6_DROPPED_ITERATIONS_LIMIT || (smoke ? '1' : '0'),
    K6_ORDER_ID_PATH: process.env.K6_ORDER_ID_PATH || process.env.CHECKOUT_API_ORDER_ID_PATH || '',
    K6_SUCCESS_PATH: process.env.K6_SUCCESS_PATH || process.env.CHECKOUT_API_SUCCESS_PATH || 'success',
    K6_STATUS_PATH: process.env.K6_STATUS_PATH || process.env.CHECKOUT_API_STATUS_PATH || 'status',
};

function compileK6Typescript() {
    if (!shouldCompileK6Typescript()) {
        console.log('k6 TypeScript build is up to date.');
        return;
    }

    fs.rmSync(k6DistDir, { recursive: true, force: true });

    const tscPath = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
    const result = spawnSync(process.execPath, [tscPath, '--project', 'tsconfig.k6.json'], {
        cwd: rootDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });

    if ((result.status ?? 1) !== 0) {
        process.exit(result.status ?? 1);
    }
}

const k6Path = path.join(rootDir, 'tools', 'k6', process.platform === 'win32' ? 'k6.exe' : 'k6');
const args = ['run'];
if (showVersion) {
    const result = spawnSync(k6Path, ['version'], {
        cwd: rootDir,
        env,
        stdio: 'inherit',
        shell: false,
    });

    process.exit(result.status ?? 1);
}

if (writeJson) {
    args.push('--out', `json=${outputPath}`);
}
args.push(k6CompiledEntry);

fs.mkdirSync(path.join(rootDir, 'test-results', 'k6'), { recursive: true });

console.log([
    `k6 checkout mode: ${env.K6_CHECKOUT_MODE}`,
    `K6_PROJECT_NAME: ${env.K6_PROJECT_NAME}`,
    `K6_CHECKOUT_TEMPLATE_PATH: ${env.K6_CHECKOUT_TEMPLATE_PATH}`,
    `K6_TOTAL_ORDERS: ${env.K6_TOTAL_ORDERS}`,
    `K6_RATE_PER_SECOND: ${env.K6_RATE_PER_SECOND}`,
    `K6_MAX_VUS: ${env.K6_MAX_VUS}`,
    `K6_P95_THRESHOLD_MS: ${env.K6_P95_THRESHOLD_MS}`,
].join('\n'));

if (dryRun) {
    console.log('Dry run only. k6 was not started.');
    process.exit(0);
}

const resolvedTemplatePath = resolveProjectPath(env.K6_CHECKOUT_TEMPLATE_PATH);
if (!fs.existsSync(resolvedTemplatePath)) {
    console.error([
        `Missing k6 checkout template: ${resolvedTemplatePath}`,
        '',
        'Generate it first with Playwright, for example:',
        `npx playwright test tests/api/checkout/checkout-api-template.spec.ts --grep "@api-template-${mode}" --project=${projectName}`,
        '',
        'Or set K6_CHECKOUT_TEMPLATE_PATH to an existing generated template.',
    ].join('\n'));
    process.exit(1);
}

compileK6Typescript();

const result = spawnSync(k6Path, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    shell: false,
});

process.exit(result.status ?? 1);
