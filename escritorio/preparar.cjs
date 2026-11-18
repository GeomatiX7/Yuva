// Compila la app web y la copia a escritorio/web, que es lo que se empaqueta dentro del programa.
'use strict';
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..', 'app');
const WEB = path.join(__dirname, 'web');

if (!fs.existsSync(path.join(APP, 'node_modules'))) execSync('npm install --ignore-scripts', { cwd: APP, stdio: 'inherit' });
execSync('npm run build', { cwd: APP, stdio: 'inherit' });
fs.rmSync(WEB, { recursive: true, force: true });
fs.cpSync(path.join(APP, 'dist'), WEB, { recursive: true });
console.log('App web copiada a escritorio/web');
