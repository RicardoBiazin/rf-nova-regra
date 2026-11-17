// Abre o desktop em desenvolvimento. O ELECTRON_RUN_AS_NODE herdado (ex.: do VS Code) quebra o Electron.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron');
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const filho = spawn(electron, [raiz, ...process.argv.slice(2)], { cwd: raiz, env, stdio: 'inherit' });
filho.on('exit', (codigo) => process.exit(codigo ?? 0));
