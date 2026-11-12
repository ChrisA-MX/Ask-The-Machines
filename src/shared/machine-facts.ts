import { MACHINES } from '../app/storyline/machines.data';

export const CHAT_MACHINE_IDS = [
  'apollo-lm',
  'lrv',
  'surveyor-3',
  'lunar-prospector',
  'mars-pathfinder',
  'sojourner',
  'spirit',
  'opportunity',
  'curiosity-sky-crane',
  'perseverance-sky-crane',
  'ingenuity',
  'cassini',
  'huygens',
  'dawn',
  'pioneer-10',
] as const;

export type ChatMachineId = (typeof CHAT_MACHINE_IDS)[number];

export const CHAT_MACHINE_STORY_IDS: Readonly<Record<ChatMachineId, string>> = {
  'apollo-lm': 'apollo-lunar-module-stages',
  lrv: 'lunar-roving-vehicles',
  'surveyor-3': 'surveyor-3',
  'lunar-prospector': 'lunar-prospector',
  'mars-pathfinder': 'mars-pathfinder',
  sojourner: 'sojourner',
  spirit: 'spirit-mer-a',
  opportunity: 'opportunity-mer-b',
  'curiosity-sky-crane': 'curiosity',
  'perseverance-sky-crane': 'perseverance',
  ingenuity: 'ingenuity',
  cassini: 'cassini',
  huygens: 'huygens',
  dawn: 'dawn',
  'pioneer-10': 'pioneer-10',
};

export interface VerifiedMachineFacts {
  id: ChatMachineId;
  name: string;
  year: string;
  location: string;
  hook: string;
  paragraphs: string[];
  fact: string;
  sourceLabel: string;
}

const machinesByStoryId = new Map(MACHINES.map((machine) => [machine.id, machine]));
const TODO_TEXT = /TODO/i;

export const VERIFIED_MACHINE_FACTS: Partial<Record<ChatMachineId, VerifiedMachineFacts>> =
  Object.fromEntries(
    CHAT_MACHINE_IDS.flatMap((id) => {
      const storyId = CHAT_MACHINE_STORY_IDS[id];
      const machine = machinesByStoryId.get(storyId);
      if (
        !machine ||
        !machine.sourceUrl ||
        [
          machine.year,
          machine.location,
          machine.hook,
          machine.fact,
          machine.sourceLabel,
          ...machine.paragraphs,
        ].some((text) => TODO_TEXT.test(text))
      ) {
        return [];
      }
      return [[id, {
        id,
        name: machine.name,
        year: machine.year,
        location: machine.location,
        hook: machine.hook,
        paragraphs: machine.paragraphs,
        fact: machine.fact,
        sourceLabel: machine.sourceLabel,
      } satisfies VerifiedMachineFacts]];
    }),
  );
