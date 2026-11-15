import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const configPath = resolve(root, 'src/app/data/lab-models.ts');
const servedModelRoot = resolve(root, 'src/assets/machines');
const angularConfigPath = resolve(root, 'angular.json');
const issues = [];

if (!existsSync(configPath)) {
  console.error('Mission Lab config is missing: src/app/data/lab-models.ts');
  process.exit(1);
}

const config = readFileSync(configPath, 'utf8');
const angularConfig = JSON.parse(readFileSync(angularConfigPath, 'utf8'));
const assetEntries = angularConfig.projects['ask-the-machine-app'].architect.build.options.assets;
const assetCopyConfigured = assetEntries.some((asset) =>
  typeof asset === 'object' && asset.input === 'src/assets/machines' && asset.output === 'assets/machines',
);
if (!assetCopyConfigured) issues.push('angular.json does not copy src/assets/machines to assets/machines.');

const models = [...config.matchAll(/\{\s*id:\s*'([^']+)'([\s\S]*?)\n  \},/g)]
  .map((match) => {
    const file = match[2].match(/file:\s*'([^']+\.glb)'/)?.[1] ?? '';
    const credit = match[2].match(/credit:\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    const hasCredit = ['title', 'author', 'sourceUrl', 'license'].every((field) =>
      new RegExp(field + "\\s*:\\s*'[^']+'").test(credit),
    );
    return { id: match[1], file, hasCredit };
  });
if (models.length !== 5) issues.push('Expected five model entries in lab-models.ts; found ' + models.length + '.');

for (const model of models) {
  if (!model.file) issues.push(model.id + ': missing .glb file entry.');
  if (!existsSync(resolve(servedModelRoot, model.file))) issues.push(model.id + ': missing served model file ' + model.file + '.');
}

if (issues.length) {
  console.error('Mission Lab check failed (' + issues.length + ' issue' + (issues.length === 1 ? '' : 's') + '):');
  for (const issue of issues) console.error('- ' + issue);
  process.exitCode = 1;
} else {
  console.log('Mission Lab check passed: all ' + models.length + ' configured models exist in the Angular served assets folder.');
  const uncredited = models.filter((model) => !model.hasCredit);
  console.log('Models without credit information:');
  if (uncredited.length) for (const model of uncredited) console.log('- ' + model.id);
  else console.log('- none');
}
