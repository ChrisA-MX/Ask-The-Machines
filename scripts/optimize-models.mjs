import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const inputDir = join(root, 'src', 'assets', 'machines');
const outputDir = join(root, 'public', 'assets', 'machines', 'optimized');
const tempDir = mkdtempSync(join(tmpdir(), 'ask-machines-models-'));
const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function gltfTransform(args) {
  const result = spawnSync(executable, ['exec', '--yes', '--package=@gltf-transform/cli', '--', 'gltf-transform', ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`gltf-transform ${args[0]} failed with exit code ${result.status}.`);
}

try {
  mkdirSync(outputDir, { recursive: true });
  const models = readdirSync(inputDir).filter((file) => file.endsWith('.glb'));
  for (const filename of models) {
    const source = join(inputDir, filename);
    const resized = join(tempDir, filename);
    const webp = join(tempDir, `webp-${filename}`);
    const destination = join(outputDir, filename);
    const before = statSync(source).size;
    gltfTransform(['resize', source, resized, '--width', '2048', '--height', '2048']);
    gltfTransform(['webp', resized, webp, '--quality', '88']);
    gltfTransform(['meshopt', webp, destination, '--level', 'medium']);
    const after = statSync(destination).size;
    console.log(`${filename}: ${(before / 1_048_576).toFixed(2)} MB → ${(after / 1_048_576).toFixed(2)} MB`);
  }
  console.log(`Optimized copies written to ${outputDir}; originals were left untouched.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
