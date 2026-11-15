import { readFileSync } from 'node:fs';

const storyPath = new URL('../src/app/data/machine-stories.json', import.meta.url);
const videoPath = new URL('../src/app/storyline/machines.data.ts', import.meta.url);
const story = JSON.parse(readFileSync(storyPath, 'utf8'));
const source = readFileSync(videoPath, 'utf8');
const errors = [];
const expectedWorlds = ['moon', 'mars', 'outer'];
const requiredText = ['imageKey', 'name', 'years', 'tagline', 'statusLabel', 'whoIAm', 'howIWorked', 'whatIFound', 'whereIAmNow', 'voiceNote'];
const statuses = new Set(['silent-surface', 'silent-flying', 'still-talking', 'still-flying', 'grounded']);
const storyIds = new Set();
const missingUrls = [];

for (const worldId of expectedWorlds) {
  if (!story.worlds?.[worldId]?.name || !story.worlds?.[worldId]?.intro || !story.worlds?.[worldId]?.gameCard) {
    errors.push(`World ${worldId}: name, intro, and gameCard are required.`);
  }
}
for (const [index, machine] of (story.machines ?? []).entries()) {
  const label = `${machine.id ?? `machine ${index + 1}`} (${machine.world ?? 'no world'})`;
  if (!machine.id || storyIds.has(machine.id)) errors.push(`${label}: id is missing or duplicated.`);
  storyIds.add(machine.id);
  if (!expectedWorlds.includes(machine.world)) errors.push(`${label}: unknown world.`);
  for (const field of requiredText) if (typeof machine[field] !== 'string' || !machine[field].trim()) errors.push(`${label}: ${field} is required.`);
  if (!Number.isInteger(machine.order) || machine.order < 1) errors.push(`${label}: order must be a positive integer.`);
  if (!statuses.has(machine.status)) errors.push(`${label}: invalid status ${machine.status}.`);
  if (typeof machine.verified !== 'boolean') errors.push(`${label}: verified must be boolean.`);
  if (!Array.isArray(machine.facts) || machine.facts.length < 3) errors.push(`${label}: at least three facts are required.`);
  for (const [factIndex, fact] of (machine.facts ?? []).entries()) {
    if (!fact.text?.trim()) errors.push(`${label}: fact ${factIndex + 1} text is required.`);
    if (!fact.source?.trim()) errors.push(`${label}: fact ${factIndex + 1} source is required.`);
    if (!fact.sourceUrl?.trim()) missingUrls.push(`${label}, fact ${factIndex + 1}: ${fact.source}`);
  }
}
for (const worldId of expectedWorlds) {
  const machines = (story.machines ?? []).filter((machine) => machine.world === worldId);
  if (machines.length !== 4) errors.push(`${worldId}: expected four machines, found ${machines.length}.`);
  const orders = machines.map((machine) => machine.order).sort((a, b) => a - b);
  if (orders.some((order, index) => order !== index + 1)) errors.push(`${worldId}: order values must be 1 through ${machines.length}.`);
}
const videoIds = new Set([...source.matchAll(/^\s*['"]?([\w-]+)['"]?\s*:\s*\{\s*youtubeId:\s*['"]([\w-]{11})['"]/gm)].map((match) => match[1]));
for (const id of storyIds) if (!videoIds.has(id)) errors.push(`${id}: missing video metadata in machines.data.ts.`);
for (const id of videoIds) if (!storyIds.has(id)) errors.push(`${id}: video metadata has no machine story JSON entry.`);
if (!story.connectTheDots?.title || !Array.isArray(story.connectTheDots.lines) || !story.connectTheDots.note) errors.push('connectTheDots title, lines, and note are required.');

if (errors.length) {
  console.error(`Story data check failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Story data check passed: ${storyIds.size} stories across ${expectedWorlds.length} worlds; all stories have video metadata.`);
  console.log('Fact source URLs that still need to be added:');
  if (missingUrls.length) for (const item of missingUrls) console.log(`- ${item}`);
  else console.log('- none');
}
