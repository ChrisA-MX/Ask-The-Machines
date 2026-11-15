import { MACHINES } from '../app/storyline/machines.data';

/** Chat API identifiers stay stable for retained stories while all content comes from machines.data.ts. */
export const CHAT_MACHINE_IDS = [
  'apollo-lm', 'lrv', 'surveyor-3', 'apollo-17-alsep',
  'sojourner', 'opportunity', 'insight', 'ingenuity',
  'pioneer-10', 'voyager-1', 'voyager-2', 'new-horizons',
] as const;

export type ChatMachineId = (typeof CHAT_MACHINE_IDS)[number];

export const CHAT_MACHINE_STORY_IDS: Readonly<Record<ChatMachineId, string>> = {
  'apollo-lm': 'apollo-lunar-module-stages',
  lrv: 'lunar-roving-vehicles',
  'surveyor-3': 'surveyor-3',
  'apollo-17-alsep': 'apollo-17-alsep',
  sojourner: 'sojourner',
  opportunity: 'opportunity-mer-b',
  insight: 'insight',
  ingenuity: 'ingenuity',
  'pioneer-10': 'pioneer-10',
  'voyager-1': 'voyager-1',
  'voyager-2': 'voyager-2',
  'new-horizons': 'new-horizons',
};

export interface VerifiedMachineFacts {
  id: ChatMachineId;
  name: string;
  year: string;
  hook: string;
  whoIAm: string;
  howIWorked: string;
  whatIFound: string;
  whereIAmNow: string;
  sidebar: { title: string; text: string } | null;
  facts: Array<{ text: string; source: string }>;
  statusLabel: string;
}

const machinesByStoryId = new Map(MACHINES.map((machine) => [machine.id, machine]));
export const VERIFIED_MACHINE_FACTS: Partial<Record<ChatMachineId, VerifiedMachineFacts>> =
  Object.fromEntries(
    CHAT_MACHINE_IDS.flatMap((id) => {
      const machine = machinesByStoryId.get(CHAT_MACHINE_STORY_IDS[id]);
      if (!machine) return [];
      return [[id, {
        id, name: machine.name, year: machine.year, hook: machine.hook,
        ...machine.storyPage, sidebar: machine.sidebar,
        facts: machine.facts.map(({ text, source }) => ({ text, source })),
        statusLabel: machine.statusLabel,
      } satisfies VerifiedMachineFacts]];
    }),
  );
