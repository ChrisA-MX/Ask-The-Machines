export type WorldId = 'moon' | 'mars' | 'outer';

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
  currentStatus: string;
  voiceNote?: string;
}

export interface MachineStory {
  id: string;
  imageKey: string;
  name: string;
  year: string;
  location: string;
  worldId: WorldId;
  hook: string;
  paragraphs: string[];
  fact: string;
  sourceLabel: string;
  sourceUrl: string;
  additionalSources?: Array<{ label: string; url: string }>;
  image: string;
  imageAlt: string;
  /** URL-friendly route id; kept separate from stable progress/chat IDs. */
  routeId?: string;
  storyPage?: MachineStoryPageContent;
  video?: StoryVideo;
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
  machines: MachineStory[];
  miniGame: MiniGameDefinition;
  viewBoxHeight: number;
}

const PLACEHOLDER_IMAGE = '/roadmap/unresearched.svg';
const PLACEHOLDER_ALT = 'Neutral placeholder illustration for a machine story';

const machine = (
  worldId: WorldId,
  id: string,
  imageKey: string,
  name: string,
  year: string,
  location: string,
  hook: string,
  paragraphs: string[],
  fact: string,
  sourceLabel: string,
  sourceUrl: string,
  additionalSources: MachineStory['additionalSources'] = [],
): MachineStory => ({
  id, imageKey, name, year, location, worldId, hook, paragraphs, fact,
  sourceLabel, sourceUrl, additionalSources, image: PLACEHOLDER_IMAGE, imageAlt: PLACEHOLDER_ALT,
});

const world = (
  entry: Omit<WorldStory, 'viewBoxHeight'>,
): WorldStory => ({ ...entry, viewBoxHeight: 420 });

/** Story roster is the source of truth for story counts, order, progress and chat facts. */
export const WORLDS: WorldStory[] = [
  world({
    id: 'moon', name: 'The Moon', shortName: 'Moon', tagline: 'A quiet world still holding the footprints of exploration.',
    miniGame: { title: 'Pack the Lunar Module', howToPlay: 'Select an item, then choose whether to leave it on the Moon or bring it home.', badge: 'Moon Cargo Specialist', durationSeconds: 60 },
    machines: [
      machine(
        'moon', 'surveyor-3', 'surveyor-3', 'Surveyor 3', '1967', 'Ocean of Storms',
        'A robotic lander became a field stop for the Apollo 12 crew.',
        ['Surveyor 3 soft-landed on the Moon in 1967. When Apollo 12 landed nearby, astronauts Charles Conrad Jr. and Alan L. Bean visited it and brought its television camera and other pieces back to Earth for study.'],
        'Apollo 12 landed about 600 feet from Surveyor 3.', 'NASA Science — Apollo 12 and Surveyor 3',
        'https://science.nasa.gov/resource/apollo-12-and-surveyor-3/',
      ),
      machine(
        'moon', 'apollo-lunar-module-stages', 'apollo-11-eagle', 'Apollo 11 “Eagle” descent stage and laser retroreflector', '1969', 'Tranquility Base · Sea of Tranquility',
        'Eagle’s lower stage and a small reflector remain at the first crewed lunar landing site.',
        [
          'The Apollo 11 Lunar Module brought Neil Armstrong and Buzz Aldrin down to the Moon. Its lower descent stage stayed at Tranquility Base when the astronauts lifted off in the ascent stage.',
          'The crew also deployed a Laser Ranging Retroreflector. Researchers can aim lasers at its mirrors to measure the Earth–Moon distance.',
        ],
        'The Apollo 11 landing site is at about 0.674° north and 23.473° east.', 'NASA Apollo 11 Mission Overview',
        'https://www.nasa.gov/history/apollo-11-mission-overview/',
      ),
      machine(
        'moon', 'lunar-roving-vehicles', 'lunar-roving-vehicles', 'Apollo Lunar Roving Vehicles', '1971–1972', 'Apollo 15, 16 and 17 landing sites',
        'Three electric rovers extended the astronauts’ range on the Moon.',
        ['One battery-powered Lunar Roving Vehicle was used on each of Apollo 15, Apollo 16 and Apollo 17. All three rovers were left on the Moon when their crews returned to orbit.'],
        'The three Apollo Lunar Roving Vehicles were driven on Apollo 15, 16 and 17.', 'NASA Goddard — The Apollo Lunar Roving Vehicle',
        'https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html',
      ),
      machine(
        'moon', 'apollo-17-alsep', 'apollo-17-alsep', 'Apollo 17 science station (ALSEP)', '1972', 'Taurus–Littrow Valley',
        'Apollo 17 astronauts deployed a research station before leaving the Moon.',
        ['The Apollo Lunar Surface Experiments Package (ALSEP) was a set of instruments arranged around a central station. Apollo 17’s instruments studied the lunar surface and environment after the crew had gone home.'],
        'Apollo 17 set up the sixth automated lunar research station.', 'NASA — Apollo 17 Mission Details',
        'https://www.nasa.gov/missions/apollo/apollo-17-mission-details/',
      ),
    ],
  }),
  world({
    id: 'mars', name: 'Mars', shortName: 'Mars', tagline: 'Follow a trail of robotic explorers across the red planet.',
    miniGame: { title: 'Keep Opportunity Alive', howToPlay: 'Use the panel-angle slider or arrow keys to face the moving Sun and keep the battery above zero through the dust storm.', badge: 'Solar Sentinel', durationSeconds: 60 },
    machines: [
      machine(
        'mars', 'sojourner', 'sojourner', 'Sojourner', '1997', 'Ares Vallis',
        'A microwave-sized rover became the first wheeled vehicle operated on another planet.',
        ['Sojourner rode to Mars inside the Pathfinder lander, then rolled down a ramp to explore nearby rocks. The rover showed that a small mobile robot could work on another world.'],
        'Sojourner landed on Mars in 1997 and was about the size of a microwave oven.', 'NASA Space Place — The Mars Rovers: Sojourner',
        'https://spaceplace.nasa.gov/mars-sojourner/en/',
      ),
      machine(
        'mars', 'opportunity-mer-b', 'opportunity', 'Opportunity (MER-B)', '2004', 'Meridiani Planum · Endeavour Crater',
        'Opportunity explored Mars for years and drove over 28 miles before a global dust storm ended contact.',
        [
          'Opportunity explored the rim of Endeavour Crater, studying rocks that preserve clues about ancient environments on Mars. This marker shows the approximate crater location, not the rover’s exact position.',
          'The rover helped scientists investigate how water may have shaped the Martian landscape. The crater area is a landmark for this story, rather than a precise final resting-place marker.',
          'Opportunity drove over 28 miles before a global dust storm disabled it. Its twin, Spirit, landed in the same January 2004 arrival period, became stuck in soft soil at a place called Troy in 2009, and last communicated with Earth on March 22, 2010.',
        ],
        'The 2018 planet-wide dust storm blanketed Opportunity’s location; NASA last heard from the rover on June 10, 2018.', 'NASA Science — Mars Exploration Rovers: Spirit and Opportunity',
        'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/',
        [{ label: 'U.S. Geological Survey — Endeavour Crater', url: 'https://www.usgs.gov/publications/context-ancient-aqueous-environments-mars-situ-geologic-mapping-endeavour-crater' }],
      ),
      machine(
        'mars', 'insight', 'insight', 'InSight', '2018', 'Elysium Planitia',
        'The lander listened for marsquakes, but dust gradually reduced the sunlight reaching its solar panels.',
        ['InSight landed on Mars in 2018 to study the planet’s deep interior. Dust accumulated on its solar panels, reducing its available power; after more than four years of science, the mission ended when the lander ran out of energy.'],
        'NASA retired the InSight mission in December 2022 after dust reduced power from its solar panels.', 'NASA/JPL — NASA Retires InSight Mars Lander Mission',
        'https://www.jpl.nasa.gov/news/nasa-retires-insight-mars-lander-mission-after-years-of-science/',
      ),
      machine(
        'mars', 'ingenuity', 'ingenuity', 'Ingenuity', '2021', 'Jezero Crater',
        'A small experimental helicopter flew on Mars and photographed discarded landing hardware.',
        ['Ingenuity was a small experimental helicopter that flew on Mars. During a later flight, it photographed Perseverance’s discarded parachute and backshell on the surface.'],
        'Ingenuity photographed the parachute and backshell during its 26th flight on April 19, 2022.', 'NASA Science — Debris Field Seen from Mars Helicopter',
        'https://science.nasa.gov/photojournal/debris-field-for-perseverance-landing-gear-seen-from-mars-helicopter/',
      ),
    ],
  }),
  world({
    id: 'outer', name: 'Outer Solar System', shortName: 'Outer', tagline: 'Meet spacecraft that ventured far beyond the inner worlds.',
    miniGame: { title: 'Tune In to Voyager', howToPlay: 'Turn the radio dial with the slider or arrow keys; watch the signal meter and lock on when the signal is strongest.', badge: 'Deep-Space Listener', durationSeconds: 60 },
    machines: [
      machine(
        'outer', 'pioneer-10', 'pioneer-10', 'Pioneer 10', '1972', 'Outbound from the outer planets',
        'A deep-space probe carried a golden plaque and continued outward after its last signal.',
        ['Pioneer 10 carried a plaque with diagrams about its creators and home world. It passed Neptune’s orbit in 1983 and kept coasting outward after its final signal reached Earth in 2003.'],
        'Pioneer 10 sent its last signal to Earth on January 23, 2003.', 'NASA — 50 Years Ago: Pioneer 10 Launches to Explore Jupiter',
        'https://www.nasa.gov/history/50-years-ago-pioneer-10-launches-to-explore-jupiter/',
      ),
      machine(
        'outer', 'voyager-1', 'voyager-1', 'Voyager 1', '1977', 'Interstellar space',
        'Voyager 1 crossed into interstellar space and still sends science data to Earth.',
        ['Voyager 1 launched in 1977 and explored Jupiter and Saturn before heading beyond the heliosphere. NASA still communicates with the spacecraft and receives data from its working science instruments. Its radio signal takes many hours to reach Earth.'],
        'Voyager 1’s radio signal takes many hours to reach Earth, and it still sends data from interstellar space.', 'NASA Science — Voyager 1',
        'https://science.nasa.gov/mission/voyager/voyager-1/',
      ),
      machine(
        'outer', 'voyager-2', 'voyager-2', 'Voyager 2', '1977', 'Interstellar space',
        'Voyager 2 is the only spacecraft to have visited Uranus and Neptune, and it later entered interstellar space.',
        ['Voyager 2 flew past all four giant planets. It entered interstellar space in 2018, where it continues the Voyager mission.'],
        'Voyager 2 is the only spacecraft to have visited Uranus and Neptune.', 'NASA Science — Voyager 2',
        'https://science.nasa.gov/mission/voyager/voyager-2/',
      ),
      machine(
        'outer', 'new-horizons', 'new-horizons', 'New Horizons', '2006', 'Kuiper Belt',
        'After visiting Pluto, New Horizons continued exploring the distant Kuiper Belt.',
        ['New Horizons launched in 2006, visited Pluto, and later flew past the Kuiper Belt object Arrokoth. It continues making observations in the distant outer solar system.'],
        'New Horizons explored Pluto and the Kuiper Belt object Arrokoth.', 'NASA Science — New Horizons Continues Exploring the Outer Solar System',
        'https://science.nasa.gov/missions/new-horizons/nasas-new-horizons-to-continue-exploring-outer-solar-system/',
      ),
    ],
  }),
];

/** Flat, chronological list for story lookup, progress validation and chat facts. */
export const MACHINES: MachineStory[] = WORLDS.flatMap((entry) => entry.machines);
export const VALID_STORY_IDS = new Set(MACHINES.map((entry) => entry.id));
export const VALID_MINI_GAME_IDS = new Set<string>(WORLDS.map((entry) => entry.id));

const STORY_ROUTE_IDS: Record<string, string> = {
  'surveyor-3': 'surveyor-3',
  'apollo-lunar-module-stages': 'apollo-11-eagle',
  'lunar-roving-vehicles': 'apollo-lrv',
  'apollo-17-alsep': 'apollo-17-alsep',
  sojourner: 'sojourner',
  'opportunity-mer-b': 'opportunity',
  insight: 'insight',
  ingenuity: 'ingenuity',
  'pioneer-10': 'pioneer-10',
  'voyager-1': 'voyager-1',
  'voyager-2': 'voyager-2',
  'new-horizons': 'new-horizons',
};

const STORY_PAGE_CONTENT: Record<string, MachineStoryPageContent> = {
  'surveyor-3': { whoIAm: 'I am Surveyor 3, a robotic lander sent to study the lunar surface.', howIWorked: 'I soft-landed in the Ocean of Storms and sent images and measurements from the Moon. Apollo 12 astronauts later visited and brought some of my parts back for study.', whatIFound: 'My visit gave scientists a close look at the lunar soil and showed that a spacecraft could land precisely enough to be revisited.', currentStatus: 'Silent on the surface', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  'apollo-lunar-module-stages': { whoIAm: 'I am Eagle, the Apollo 11 Lunar Module that carried two astronauts down to Tranquility Base.', howIWorked: 'My descent stage slowed the crew for landing. The astronauts later left that lower stage behind when they lifted off in the ascent stage.', whatIFound: 'The crew also deployed a laser retroreflector whose mirrors can send laser light back toward Earth.', currentStatus: 'Silent at Tranquility Base', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  'lunar-roving-vehicles': { whoIAm: 'I am one of three Lunar Roving Vehicles used on Apollo 15, 16, or 17.', howIWorked: 'I was an electric rover that let astronauts travel farther from their lunar landing site.', whatIFound: 'The three rovers supported surface exploration and were left on the Moon when their crews returned to orbit.', currentStatus: 'Silent on the lunar surface', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  'apollo-17-alsep': { whoIAm: 'I am Apollo 17\'s Lunar Surface Experiments Package, a group of instruments placed on the Moon.', howIWorked: 'The astronauts set out my experiments around a central station before leaving the lunar surface.', whatIFound: 'My instruments continued studying the lunar surface and environment after the crew had gone home.', currentStatus: 'Silent at Taurus-Littrow', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  sojourner: { whoIAm: 'I am Sojourner, a small rover delivered to Mars by the Pathfinder lander.', howIWorked: 'I rolled down a ramp and examined nearby rocks with my instruments.', whatIFound: 'My mission demonstrated that a small wheeled robot could explore another planet.', currentStatus: 'Mission complete; resting on Mars', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  'opportunity-mer-b': { whoIAm: 'I am Opportunity, a Mars rover that explored the Meridiani Planum region.', howIWorked: 'I drove across Mars and explored the rim of Endeavour Crater, examining rocks along the way.', whatIFound: 'My observations helped scientists investigate how water may have shaped the Martian landscape. I drove over 28 miles before a global dust storm disabled me. My twin Spirit became stuck at Troy and later stopped communicating.', currentStatus: 'Silent since the 2018 global dust storm', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  insight: { whoIAm: 'I am InSight, a Mars lander sent to study the planet\'s deep interior.', howIWorked: 'I stayed in one place and used instruments to listen for marsquakes and study the ground beneath me.', whatIFound: 'Dust built up on my solar panels and reduced the power available to continue the mission.', currentStatus: 'Mission ended after power ran out', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  ingenuity: { whoIAm: 'I am Ingenuity, a small experimental helicopter that flew on Mars.', howIWorked: 'I made powered flights in the thin Martian atmosphere while accompanying the Perseverance rover.', whatIFound: 'During a later flight, I photographed Perseverance\'s discarded parachute and backshell.', currentStatus: 'Flight mission complete', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  'pioneer-10': { whoIAm: 'I am Pioneer 10, a deep-space probe carrying a golden plaque.', howIWorked: 'After its exploration of Jupiter, I continued coasting outward through the solar system.', whatIFound: 'My plaque carries diagrams about the spacecraft\'s creators and home world.', currentStatus: 'Silent; coasting outward', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  'voyager-1': { whoIAm: 'I am Voyager 1, a spacecraft exploring beyond the heliosphere.', howIWorked: 'I sent observations across the vast distance to Earth using a radio signal that takes many hours to arrive.', whatIFound: 'I explored Jupiter and Saturn before continuing into interstellar space. NASA still communicates with me and receives science data.', currentStatus: 'Still talking from interstellar space', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  'voyager-2': { whoIAm: 'I am Voyager 2, a spacecraft that visited all four giant planets.', howIWorked: 'I flew past Jupiter, Saturn, Uranus, and Neptune before continuing outward.', whatIFound: 'I am the only spacecraft to have visited Uranus and Neptune, and I later entered interstellar space.', currentStatus: 'Still operating in interstellar space', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
  'new-horizons': { whoIAm: 'I am New Horizons, a spacecraft exploring the distant outer solar system.', howIWorked: 'I flew past Pluto and later visited the Kuiper Belt object Arrokoth.', whatIFound: 'My encounters gave scientists close-up observations of Pluto and Arrokoth.', currentStatus: 'Continuing through the outer solar system', voiceNote: 'This first-person narration is a creative voice based on the facts below.' },
};

const STORY_VIDEOS: Record<string, StoryVideo> = {
  'surveyor-3': { youtubeId: 'jeOTJd5GZYk', title: 'Surveyor III Sample Scoop--a Piece of a Real Lunar Spacecraft', channel: 'NASA', durationLabel: '1:22', summary: 'See the Surveyor III sample scoop and learn how Apollo 12 revisited the lander.' },
  'apollo-lunar-module-stages': { youtubeId: 'YKXw_3Pblh8', title: 'Apollo 11 Descent: Film and LRO Imagery', channel: 'NASA', durationLabel: '4:52', summary: 'Compare Apollo 11 descent footage with imagery of the landing site.' },
  'lunar-roving-vehicles': { youtubeId: 'QJW2Za9sg0c', title: 'Apollo 15 Lunar Rover Moon Landing Footage Upscaled and Interpolated to 60 FPS', channel: 'NASA footage restoration', durationLabel: '4:08', summary: 'Watch restored lunar rover footage from Apollo 15.', note: 'Restored version of NASA\'s original footage.' },
  'apollo-17-alsep': { youtubeId: 'V_EWCVqNFSk', title: 'ALSEP: Apollo\'s Unsung Experiments', channel: 'NASA', durationLabel: '19:37', summary: 'Learn about the Apollo Lunar Surface Experiments Package.', isLongForm: true },
  sojourner: { youtubeId: 'JXZa8cmab1g', title: 'NASA at Mars: 20 years of 24/7 exploration', channel: 'NASA', durationLabel: '3:20', summary: 'A look back at NASA\'s robotic exploration of Mars.' },
  'opportunity-mer-b': { youtubeId: 'WjVjS98BBA4', title: 'Opportunity\'s 15-Year Mission to Find Water on Mars', channel: 'NASA', durationLabel: '4:31', summary: 'Explore highlights from Opportunity\'s long Mars mission.' },
  insight: { youtubeId: 'm9cCuW9nIQg', title: 'Listen to NASA\'s InSight at Work on Mars', channel: 'NASA', durationLabel: '1:36', summary: 'Hear sounds recorded during InSight\'s work on Mars.' },
  ingenuity: { youtubeId: 'D0fkI8mO1LA', title: 'Watch Ingenuity\'s highlights as NASA\'s Mars helicopter mission ends after 72 flights', channel: 'NASA', durationLabel: '3:18', summary: 'Watch highlights from Ingenuity\'s Mars flight campaign.' },
  'pioneer-10': { youtubeId: '70gb4w5zY00', title: 'Astronomers Track a Deep-Space Anomaly in NASA\'s Pioneer 10 and 11 Missions', channel: 'NASA', durationLabel: '10:42', summary: 'A bonus look at a mystery associated with the Pioneer missions.', bonusLabel: 'Mystery solved' },
  'voyager-1': { youtubeId: 'L4hf8HyP0LI', title: 'Voyager Reaches Interstellar Space', channel: 'NASA', durationLabel: '2:09', summary: 'See how Voyager 1 reached interstellar space.' },
  'voyager-2': { youtubeId: 'HzGTYwZEOLs', title: 'NASA\'s Voyager 2 Probe Enters Interstellar Space', channel: 'NASA', durationLabel: '3:08', summary: 'Learn about Voyager 2 entering interstellar space.' },
  'new-horizons': { youtubeId: 'g1fPhhTT2Oo', title: 'New Horizons Flyover of Pluto', channel: 'NASA', durationLabel: '2:00', summary: 'Fly over Pluto using imagery captured by New Horizons.' },
};

for (const entry of MACHINES) {
  entry.routeId = STORY_ROUTE_IDS[entry.id] ?? entry.id;
  entry.storyPage = STORY_PAGE_CONTENT[entry.id];
  entry.video = STORY_VIDEOS[entry.id];
}
