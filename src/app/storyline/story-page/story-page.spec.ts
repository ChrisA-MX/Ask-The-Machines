import '@angular/compiler';
import { buildMachineImageUrl, MACHINES, WORLDS } from '../machines.data';
import {
  chunkSpeechText,
  findStoryRoute,
  isStoryUnlocked,
  prepareSpeechText,
  rankEnglishSpeechVoices,
  resolveStoryRoute,
  scoreSpeechVoice,
  splitStoryParagraphs,
  SpeechVoicePreference,
} from './story-page';

describe('Story page routes and progression', () => {
  it('builds machine image URLs using the current base href', () => {
    expect(buildMachineImageUrl('apollo-11-eagle')).toBe('/assets/mac_images/apollo-11-eagle.jpg');
    expect(buildMachineImageUrl('apollo-11-eagle', '/school/')).toBe('/school/assets/mac_images/apollo-11-eagle.jpg');
    expect(buildMachineImageUrl('apollo-11-eagle', '/school')).toBe('/school/assets/mac_images/apollo-11-eagle.jpg');
  });
  it('resolves all twelve typed world and story route ids', () => {
    for (const world of WORLDS) {
      for (const machine of world.machines) {
        expect(findStoryRoute(world.id, machine.routeId ?? machine.id)?.machine.id).toBe(machine.id);
        expect(machine.image).toBe(buildMachineImageUrl(machine.routeId));
        expect(machine.imageAlt).toContain(machine.name);
      }
    }
    expect(MACHINES).toHaveLength(12);
  });

  it('shows a not-found result for unknown worlds or machine ids', () => {
    expect(resolveStoryRoute('pluto', 'unknown-story', new Set()).kind).toBe('not-found');
    expect(resolveStoryRoute('moon', 'unknown-story', new Set()).kind).toBe('not-found');
  });

  it('blocks a story until all earlier stories in its world are finished', () => {
    const world = WORLDS[0];
    const thirdStory = world.machines[2];
    const prior = new Set([world.machines[0].id]);
    expect(resolveStoryRoute(world.id, thirdStory.routeId ?? thirdStory.id, prior).kind).toBe('locked');
    prior.add(world.machines[1].id);
    expect(resolveStoryRoute(world.id, thirdStory.routeId ?? thirdStory.id, prior).kind).toBe('story');
  });

  it('unlocks the next story after the current story is marked finished', () => {
    const world = WORLDS[1];
    const current = world.machines[0];
    const next = world.machines[1];
    const completed = new Set<string>();
    expect(isStoryUnlocked(world, 1, completed)).toBe(false);
    completed.add(current.id);
    expect(isStoryUnlocked(world, 1, completed)).toBe(true);
    expect(resolveStoryRoute(world.id, next.routeId ?? next.id, completed).kind).toBe('story');
  });

  it('provides an 11-character YouTube id for each machine video', () => {
    for (const machine of MACHINES) {
      expect(machine.video?.youtubeId).toMatch(/^[\w-]{11}$/);
    }
  });

  it('uses the finished JSON story copy and has the expected sidebar and voice notes', () => {
    expect(WORLDS.map((world) => world.machines.length)).toEqual([4, 4, 4]);
    for (const machine of MACHINES) {
      expect(machine.storyPage.whoIAm.trim()).not.toBe('');
      expect(machine.storyPage.howIWorked.trim()).not.toBe('');
      expect(machine.storyPage.whatIFound.trim()).not.toBe('');
      expect(machine.storyPage.whereIAmNow.trim()).not.toBe('');
      expect(machine.voiceNote.trim()).not.toBe('');
      expect(machine.facts.length).toBeGreaterThanOrEqual(3);
    }
    expect(MACHINES.filter((machine) => machine.sidebar).map((machine) => machine.routeId).sort())
      .toEqual(['apollo-11-eagle', 'opportunity', 'pioneer-10', 'sojourner']);
  });

  it('splits for layout without splitting decimal facts or changing their words', () => {
    const source = 'The Moon moves away about 3.8 centimeters each year. It is still measured with lasers.';
    const paragraphs = splitStoryParagraphs(source);
    expect(paragraphs).toEqual(['The Moon moves away about 3.8 centimeters each year.', 'It is still measured with lasers.']);
    expect(paragraphs.join(' ')).toBe(source);
  });
});

describe('Story narration helpers', () => {
  it('ranks English natural, Google and enhanced Apple voices ahead of robotic voices', () => {
    const voices: SpeechVoicePreference[] = [
      { name: 'Microsoft David - English (United States)', lang: 'en-US', voiceURI: 'david', default: true },
      { name: 'Google US English', lang: 'en-US', voiceURI: 'google', default: false },
      { name: 'Ava Premium', lang: 'en-AU', voiceURI: 'ava', default: false },
      { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', voiceURI: 'aria', default: false },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', default: false },
      { name: 'Google US English', lang: 'fr-FR', voiceURI: 'french', default: false },
      { name: 'English United Kingdom', lang: 'en-GB', voiceURI: 'uk-generic', default: false },
    ];
    expect(rankEnglishSpeechVoices(voices).map((voice) => voice.voiceURI)).toEqual([
      'aria', 'google', 'ava', 'samantha', 'uk-generic', 'david',
    ]);
    expect(scoreSpeechVoice(voices[5])).toBe(Number.NEGATIVE_INFINITY);
  });

  it('splits long narration at whitespace and keeps every word in order', () => {
    const source = ('A small spacecraft can teach us a surprising lesson about distant worlds. ').repeat(8).trim();
    const chunks = chunkSpeechText(source, 180);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 180)).toBe(true);
    expect(chunks.join(' ')).toBe(source);
    expect(chunkSpeechText('unbrokenword'.repeat(20), 20)).toEqual(['unbrokenword'.repeat(20)]);
  });

  it('applies pronunciation substitutions to speech copies without changing story text', () => {
    const pageText = 'ALSEP measured -170°C; Cernan, Tombaugh and Kuiper noted magnitude-5 and 1% readings.';
    expect(prepareSpeechText(pageText)).toBe('Al-sep measured minus 170 degrees Celsius; Sernan, Tom-baw and Kyper noted magnitude 5 and 1 percent readings.');
    expect(pageText).toContain('-170°C');
  });
});
