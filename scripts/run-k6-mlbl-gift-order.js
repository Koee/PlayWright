const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const k6DistDir = path.join(rootDir, 'test-results', 'k6-dist');
const k6CompiledEntry = path.join('test-results', 'k6-dist', 'mlbl-gift-order-load.js');
const k6CompiledEntryPath = path.join(rootDir, k6CompiledEntry);

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

    if (!hasAllOutputs || !fs.existsSync(k6CompiledEntryPath)) {
        return true;
    }

    const newestSourceMtime = Math.max(...sourceFiles.map(filePath => fs.statSync(filePath).mtimeMs));
    const compiledMtime = fs.statSync(k6CompiledEntryPath).mtimeMs;

    return newestSourceMtime > compiledMtime;
}

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

const showVersion = hasArg('--version');
const writeJson = hasArg('--json');
const smoke = hasArg('--smoke');
const dryRun = hasArg('--dry-run');
const projectName = readArgValue('--project', process.env.K6_PROJECT_NAME || 'si');
const outputPath = readArgValue('--out', path.join('test-results', 'report', 'k6', `${projectName}-mlbl-gift-order-load-metrics.json`));
const k6Path = path.join(rootDir, 'tools', 'k6', process.platform === 'win32' ? 'k6.exe' : 'k6');

const env = {
    ...process.env,
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    NO_PROXY: '*',
    K6_PROJECT_NAME: projectName,
    K6_TOTAL_ORDERS: process.env.K6_TOTAL_ORDERS || (smoke ? '1' : '20'),
    K6_RATE_PER_SECOND: process.env.K6_RATE_PER_SECOND || (smoke ? '1' : '5'),
    K6_MAX_VUS: process.env.K6_MAX_VUS || (smoke ? '5' : '20'),
    K6_P95_THRESHOLD_MS: process.env.K6_P95_THRESHOLD_MS || (smoke ? '15000' : '3000'),
    K6_DROPPED_ITERATIONS_LIMIT: process.env.K6_DROPPED_ITERATIONS_LIMIT || (smoke ? '1' : '0'),
};

fs.mkdirSync(path.join(rootDir, 'test-results', 'report', 'k6'), { recursive: true });

if (showVersion) {
    const result = spawnSync(k6Path, ['version'], {
        cwd: rootDir,
        env,
        stdio: 'inherit',
        shell: false,
    });

    process.exit(result.status ?? 1);
}

compileK6Typescript();

const args = ['run'];
if (writeJson) {
    args.push('--out', `json=${outputPath}`);
}
args.push(k6CompiledEntry);

console.log([
    'k6 MLBL gift order mode: api-load',
    `K6_PROJECT_NAME: ${env.K6_PROJECT_NAME}`,
    `K6_TOTAL_ORDERS: ${env.K6_TOTAL_ORDERS}`,
    `K6_RATE_PER_SECOND: ${env.K6_RATE_PER_SECOND}`,
    `K6_MAX_VUS: ${env.K6_MAX_VUS}`,
    `K6_P95_THRESHOLD_MS: ${env.K6_P95_THRESHOLD_MS}`,
    `K6_OUTPUT_PATH: ${outputPath}`,
].join('\n'));

if (dryRun) {
    console.log('Dry run only. k6 was not started.');
    process.exit(0);
}

const result = spawnSync(k6Path, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    shell: false,
});

process.exit(result.status ?? 1);
