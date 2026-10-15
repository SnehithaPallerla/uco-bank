import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';

if(existsSync('.env'))loadEnvFile('.env');
await import('./build.mjs');
await import('./serve.mjs');
