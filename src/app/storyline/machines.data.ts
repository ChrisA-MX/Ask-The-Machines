import storyDocument from '../data/machine-stories.json';

export type WorldId = 'moon' | 'mars' | 'outer';
export type StoryStatus = 'silent-surface' | 'silent-flying' | 'still-talking' | 'still-flying' | 'grounded';

export interface StoryFact {
  text: string;
  source: string;
  sourceUrl: string;
}

export interface StoryVideo {
  youtubeId: string;
  title: string;
  channel: string;
  durationLabel: string;
  summary: string;
  startSeconds?: number;
  note?: string;
  isLongForm?: boolean;
  bonusLabel?: string;
}

export interface MachineStoryPageContent {
  whoIAm: string;
  howIWorked: string;
  whatIFound: string;
  whereIAmNow: string;
}

export interface MachineStory {
  /** Stable local-storage and chat story ID. */
  id: string;
  /** Story URL segment and id from machine-stories.json. */
  routeId: string;
  imageKey: string;
  name: string;
  year: string;
  location: string;
  worldId: WorldId;
  hook: string;
  storyPage: MachineStoryPageContent;
  sidebar: { title: string; text: string } | null;
  voiceNote: string;
  facts: StoryFact[];
  status: StoryStatus;
  statusLabel: string;
  verified: boolean;
  image?: string;
  imageAlt: string;
  video: StoryVideo;
}

export interface MiniGameDefinition {
  title: string;
  howToPlay: string;
  badge: string;
  durationSeconds: number;
}

export interface WorldStory {
  id: WorldId;
  name: string;
  shortName: string;
  tagline: string;
  intro: string;
  gameCard: string;
  machines: MachineStory[];
  miniGame: MiniGameDefinition;
  viewBoxHeight: number;
}

interface MachineStoriesDocument {
  schemaVersion: number;
  worlds: Record<WorldId, { name: string; intro: string; gameCard: string }>;
  connectTheDots: { title: string; lines: string[]; note: string };
  machines: Array<{
    id: string;
    imageKey: string;
    world: WorldId;
    order: number;
    name: string;
    years: string;
    tagline: string;
    status: StoryStatus;
    statusLabel: string;
    whoIAm: string;
    howIWorked: string;
    whatIFound: string;
    whereIAmNow: string;
    sidebar: { title: string; text: string } | null;
    voiceNote: string;
    facts: StoryFact[];
    verified: boolean;
    image?: string;
  }>;
}

const documentData = storyDocument as MachineStoriesDocument;
/** Build a base-href aware URL for a machine image; exported for focused unit tests. */
export function buildMachineImageUrl(machineId: string, baseHref = '/'): string {
  const normalizedBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
  return `${normalizedBase}assets/mac_images/${encodeURIComponent(machineId)}.jpg`;
}
const STABLE_STORY_IDS: Record<string, string> = {
  'apollo-11-eagle': 'apollo-lunar-module-stages',
  'apollo-lrv': 'lunar-roving-vehicles',
  opportunity: 'opportunity-mer-b',
};

/** Existing video metadata is keyed by the JSON story IDs and merged below. */
const STORY_VIDEOS: Record<string, StoryVideo> = {
  'surveyor-3': { youtubeId: 'jeOTJd5GZYk', title: 'Surveyor III Sample Scoop--a Piece of a Real Lunar Spacecraft', channel: 'NASA', durationLabel: '1:22', summary: 'See the Surveyor III sample scoop and learn how Apollo 12 revisited the lander.' },
  'apollo-11-eagle': { youtubeId: 'YKXw_3Pblh8', title: 'Apollo 11 Descent: Film and LRO Imagery', channel: 'NASA', durationLabel: '4:52', summary: 'Compare Apollo 11 descent footage with imagery of the landing site.' },
  'apollo-lrv': { youtubeId: 'QJW2Za9sg0c', title: 'Apollo 15 Lunar Rover Moon Landing Footage Upscaled and Interpolated to 60 FPS', channel: 'NASA footage restoration', durationLabel: '4:08', summary: 'Watch restored lunar rover footage from Apollo 15.', note: 'Restored version of NASA\'s original footage.' },
  'apollo-17-alsep': { youtubeId: 'V_EWCVqNFSk', title: 'ALSEP: Apollo\'s Unsung Experiments', channel: 'NASA', durationLabel: '19:37', summary: 'Learn about the Apollo Lunar Surface Experiments Package.', isLongForm: true },
  sojourner: { youtubeId: 'JXZa8cmab1g', title: 'NASA at Mars: 20 years of 24/7 exploration', channel: 'NASA', durationLabel: '3:20', summary: 'A look back at NASA\'s robotic exploration of Mars.' },
  opportunity: { youtubeId: 'WjVjS98BBA4', title: 'Opportunity\'s 15-Year Mission to Find Water on Mars', channel: 'NASA', durationLabel: '4:31', summary: 'Explore highlights from Opportunity\'s long Mars mission.' },
  insight: { youtubeId: 'm9cCuW9nIQg', title: 'Listen to NASA\'s InSight at Work on Mars', channel: 'NASA', durationLabel: '1:36', summary: 'Hear sounds recorded during InSight\'s work on Mars.' },
  ingenuity: { youtubeId: 'D0fkI8mO1LA', title: 'Watch Ingenuity\'s highlights as NASA\'s Mars helicopter mission ends after 72 flights', channel: 'NASA', durationLabel: '3:18', summary: 'Watch highlights from Ingenuity\'s Mars flight campaign.' },
  'pioneer-10': { youtubeId: '70gb4w5zY00', title: 'Astronomers Track a Deep-Space Anomaly in NASA\'s Pioneer 10 and 11 Missions', channel: 'NASA', durationLabel: '10:42', summary: 'A bonus look at a mystery associated with the Pioneer missions.', bonusLabel: 'Mystery solved' },
  'voyager-1': { youtubeId: 'L4hf8HyP0LI', title: 'Voyager Reaches Interstellar Space', channel: 'NASA', durationLabel: '2:09', summary: 'See how Voyager 1 reached interstellar space.' },
  'voyager-2': { youtubeId: 'HzGTYwZEOLs', title: 'NASA\'s Voyager 2 Probe Enters Interstellar Space', channel: 'NASA', durationLabel: '3:08', summary: 'Learn about Voyager 2 entering interstellar space.' },
  'new-horizons': { youtubeId: 'g1fPhhTT2Oo', title: 'New Horizons Flyover of Pluto', channel: 'NASA', durationLabel: '2:00', summary: 'Fly over Pluto using imagery captured by New Horizons.' },
};

const GAME_DEFINITIONS: Record<WorldId, MiniGameDefinition> = {
  moon: { title: 'Pack the Lunar Module', howToPlay: 'Select an item, then choose whether to leave it on the Moon or bring it home.', badge: 'Moon Cargo Specialist', durationSeconds: 60 },
  mars: { title: 'Keep Opportunity Alive', howToPlay: 'Use the panel-angle slider or arrow keys to face the moving Sun and keep the battery above zero through the dust storm.', badge: 'Solar Sentinel', durationSeconds: 60 },
  outer: { title: 'Tune In to Voyager', howToPlay: 'Turn the radio dial with the slider or arrow keys; watch the signal meter and lock on when the signal is strongest.', badge: 'Deep-Space Listener', durationSeconds: 60 },
};

function toMachineStory(record: MachineStoriesDocument['machines'][number]): MachineStory {
  const video = STORY_VIDEOS[record.id];
  if (!video) throw new Error(`Missing video metadata for story ${record.id}`);
  return {
    id: STABLE_STORY_IDS[record.id] ?? record.id,
    routeId: record.id,
    imageKey: record.imageKey,
    name: record.name,
    year: record.years,
    location: '',
    worldId: record.world,
    hook: record.tagline,
    storyPage: {
      whoIAm: record.whoIAm,
      howIWorked: record.howIWorked,
      whatIFound: record.whatIFound,
      whereIAmNow: record.whereIAmNow,
    },
    sidebar: record.sidebar,
    voiceNote: record.voiceNote,
    facts: record.facts,
    status: record.status,
    statusLabel: record.statusLabel,
    verified: record.verified,
    image: record.image ?? buildMachineImageUrl(record.id),
    imageAlt: `Illustration of ${record.name}: ${record.tagline}`,
    video,
  };
}

export const WORLDS: WorldStory[] = (['moon', 'mars', 'outer'] as const).map((id) => {
  const worldData = documentData.worlds[id];
  const machines = documentData.machines
    .filter((machine) => machine.world === id)
    .sort((a, b) => a.order - b.order)
    .map(toMachineStory);
  return {
    id,
    name: worldData.name,
    shortName: id === 'outer' ? 'Outer' : id === 'moon' ? 'Moon' : 'Mars',
    tagline: worldData.intro,
    intro: worldData.intro,
    gameCard: worldData.gameCard,
    machines,
    miniGame: GAME_DEFINITIONS[id],
    viewBoxHeight: 420,
  };
});

export const CONNECT_THE_DOTS = documentData.connectTheDots;
export const MACHINES: MachineStory[] = WORLDS.flatMap((entry) => entry.machines);
export const VALID_STORY_IDS = new Set(MACHINES.map((entry) => entry.id));
export const VALID_MINI_GAME_IDS = new Set<string>(WORLDS.map((entry) => entry.id));
export const VALID_STORY_ROUTE_IDS = new Set(MACHINES.map((entry) => entry.routeId));
