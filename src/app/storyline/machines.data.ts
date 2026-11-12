export type WorldId = 'moon' | 'mars' | 'outer';

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
  image: string;
  imageAlt: string;
}

export interface WorldStory {
  id: WorldId;
  name: string;
  shortName: string;
  tagline: string;
  machines: MachineStory[];
  viewBoxHeight: number;
}

const TODO = 'TODO: verify with NASA source';
const PLACEHOLDER_IMAGE = '/roadmap/unresearched.svg';
const PLACEHOLDER_ALT = 'Neutral placeholder illustration for a machine story';
const world = (entry: Omit<WorldStory, 'viewBoxHeight'>): WorldStory => ({
  ...entry,
  viewBoxHeight: entry.machines.length * 600,
});

const machine = (
  worldId: WorldId,
  id: string,
  imageKey: string,
  name: string,
  seedText?: string,
  existing?: Partial<MachineStory>,
): MachineStory => ({
  id, imageKey, name,
  year: existing?.year ?? TODO,
  location: existing?.location ?? TODO,
  worldId,
  hook: seedText ?? existing?.hook ?? TODO,
  paragraphs: existing?.paragraphs ?? [seedText ?? TODO],
  fact: seedText ?? existing?.fact ?? TODO,
  sourceLabel: existing?.sourceLabel ?? TODO,
  sourceUrl: existing?.sourceUrl ?? '',
  image: PLACEHOLDER_IMAGE,
  imageAlt: PLACEHOLDER_ALT,
});

export const WORLDS: WorldStory[] = [
  world({
    id: 'moon', name: 'The Moon', shortName: 'Moon', tagline: 'A quiet world still holding the footprints of exploration.',
    machines: [
      machine('moon', 'surveyor-3', 'surveyor-3', 'Surveyor 3', 'Robotic lander later visited by the Apollo 12 astronauts, who partially dismantled it.'),
      machine('moon', 'apollo-lunar-module-stages', 'apollo-lunar-module-descent-stages', 'Apollo Lunar Module descent stages', undefined, {
        year: '1969', location: 'Tranquility Base · Sea of Tranquility',
        hook: 'The sturdy lower half that carried the first Moon explorers down still rests where it landed.',
        paragraphs: [
          'The Apollo 11 Lunar Module brought Neil Armstrong and Buzz Aldrin down to the Moon. Its lower descent stage stayed at Tranquility Base when the astronauts lifted off in the ascent stage.',
          'The descent stage served as the landing platform. It remained on the lunar surface after the crew returned to orbit, a quiet reminder of the mission that first brought people to the Moon.'
        ],
        fact: 'The landing site is at about 0.674° north and 23.473° east.',
        sourceLabel: 'NASA Apollo 11 mission summary',
        sourceUrl: 'https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm',
      }),
      machine('moon', 'lunar-roving-vehicles', 'lunar-roving-vehicles', 'Lunar Roving Vehicles', 'Three electric rovers left by Apollo 15, 16 and 17.'),
      machine('moon', 'lunar-prospector', 'lunar-prospector', 'Lunar Prospector', 'Orbital mapping spacecraft intentionally crashed into the Moon, carrying the ashes of Dr. Eugene Shoemaker.'),
    ],
  }),
  world({
    id: 'mars', name: 'Mars', shortName: 'Mars', tagline: 'Follow a trail of robotic explorers across the red planet.',
    machines: [
      machine('mars', 'mars-pathfinder', 'mars-pathfinder', 'Mars Pathfinder', 'Lander that used airbags to deliver the first rover.'),
      machine('mars', 'sojourner', 'sojourner', 'Sojourner', 'Microwave-sized rover, the first wheeled vehicle on another planet.'),
      machine('mars', 'spirit-mer-a', 'spirit', 'Spirit (MER-A)', 'Rover trapped in a sand trap called Troy and then froze.'),
      machine('mars', 'opportunity-mer-b', 'opportunity', 'Opportunity (MER-B)', undefined, {
        year: '2011', location: 'Endeavour Crater · approximate location',
        hook: 'A long-running explorer studied rocks around a vast crater on Mars.',
        paragraphs: [
          'Opportunity explored the rim of Endeavour Crater, studying rocks that preserve clues about ancient environments on Mars. This marker shows the approximate crater location, not the rover’s exact position.',
          'The rover helped scientists investigate how water may have shaped the Martian landscape. The crater area is a landmark for this story, rather than a precise final resting-place marker.',
          'Opportunity drove over 28 miles before a global dust storm disabled it.'
        ],
        fact: 'Endeavour Crater is about 22 km wide; this plotted coordinate marks the crater area.',
        sourceLabel: 'U.S. Geological Survey',
        sourceUrl: 'https://www.usgs.gov/publications/context-ancient-aqueous-environments-mars-situ-geologic-mapping-endeavour-crater',
      }),
      machine('mars', 'curiosity', 'curiosity', 'Curiosity', 'Large nuclear-powered rover delivered by a sky crane.'),
      machine('mars', 'perseverance', 'perseverance', 'Perseverance', 'Modern rover that also landed using a sky crane.'),
      machine('mars', 'ingenuity', 'ingenuity', 'Ingenuity', 'Small experimental helicopter that flew on Mars and photographed Perseverance’s discarded parachute and backshell.'),
    ],
  }),
  world({
    id: 'outer', name: 'Outer Solar System', shortName: 'Outer', tagline: 'Meet spacecraft that ventured far beyond the inner worlds.',
    machines: [
      machine('outer', 'pioneer-10', 'pioneer-10', 'Pioneer 10', 'Deep space probe with a golden plaque, coasting into interstellar space.'),
      machine('outer', 'cassini', 'cassini', 'Cassini', 'Orbiter that carried the Huygens probe to the Saturn system. Its mission ending: TODO: verify wording with NASA source.'),
      machine('outer', 'huygens', 'huygens', 'Huygens', 'Probe that landed on Saturn’s moon Titan and now rests frozen in its methane environment.'),
      machine('outer', 'dawn', 'dawn', 'Dawn', 'Spacecraft that orbited the dwarf planet Ceres and remains in a permanent, silent orbit around it.'),
    ],
  }),
];

/** Flat, chronological list for story lookup and progress storage. */
export const MACHINES: MachineStory[] = WORLDS.flatMap((world) => world.machines);
