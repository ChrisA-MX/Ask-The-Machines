import storiesDocument from '../data/machine-stories.json';
import { buildLocalFallback, retrieveMachineStories } from '../../server/chat-knowledge';
import { formatKm, formatLightTime, voyager1Snapshot } from '../components/voyager-tracker/voyager-distance';

export interface LocalApolloReply {
  reply: string;
  suggestions: string[];
}

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

const names = storiesDocument.machines.map((machine) => machine.name);
const nicknames: Readonly<Record<string, readonly string[]>> = {
  opportunity: ['oppy'],
  'apollo-11-eagle': ['eagle', 'apollo 11'],
  'apollo-lrv': ['moon buggy', 'moon buggies', 'lunar rover'],
  'apollo-17-alsep': ['alsep'],
  sojourner: ['pathfinder'],
};
const starterSuggestions = ['Who are the machines?', 'How far away is Voyager 1?', 'What did Opportunity find?'];

/**
 * Answers in the browser from the checked-in story notes. ChatService uses this when the
 * chat server cannot be reached, so Apollo keeps working on static hosts and sleepy servers.
 */
export function answerLocally(question: string, history: readonly HistoryMessage[] = [], machineId?: string): LocalApolloReply {
  const text = question.toLowerCase();

  if (/voyager/.test(text) && /(how far|distance|far away|where is|where are|light.?day)/.test(text)) {
    const snapshot = voyager1Snapshot(Date.now());
    return {
      reply: `Right now Voyager 1 is about ${formatKm(snapshot.distanceKm)} km from Earth, and a radio signal takes ${formatLightTime(snapshot.lightSeconds)} to get there. That is an estimate worked out from NASA's published numbers, and it changes every second!`,
      suggestions: ['What did Voyager 1 find?', 'Is Voyager 1 still working?', 'What is the Golden Record?'],
    };
  }
  if (/(who|which|list).*(machines|stories)|machines are there/.test(text)) {
    return {
      reply: `There are ${names.length} machines to meet: ${names.join(', ')}. Pick one and ask me about it!`,
      suggestions: starterSuggestions,
    };
  }
  if (/(what|tell).*(project|website|app|ask the machines)|what is this/.test(text)) {
    return {
      reply: 'Ask the Machines tells the true stories of machines NASA left on the Moon, on Mars and out among the stars. You can read each story, explore 3D models and play a mini-game in every world.',
      suggestions: starterSuggestions,
    };
  }
  if (/what will i learn|what can i learn/.test(text)) {
    return {
      reply: 'You will learn how each machine worked, what it discovered and where it is today. Every fact links to a NASA source, so you can check it yourself.',
      suggestions: starterSuggestions,
    };
  }

  // A machine named in the question wins. A follow-up such as "Is it still working?" keeps the last machine named.
  const findNamed = (value: string) => storiesDocument.machines.find((machine) =>
    [machine.name, ...(nicknames[machine.id] ?? [])].some((label) => value.toLowerCase().includes(label.toLowerCase())));
  const isFollowUp = /\b(it|its|it's|they|their|them|that one|this one)\b/.test(text);
  const recent = isFollowUp
    ? [...history].reverse().filter((message) => message.role === 'user').map((message) => findNamed(message.content)).find(Boolean)
    : undefined;
  const retrieval = retrieveMachineStories(question, [], (findNamed(question) ?? recent)?.id ?? machineId);
  const fallback = buildLocalFallback(retrieval);
  if (retrieval.best && retrieval.relevantSection) return fallback;
  if (retrieval.best) {
    const machine = retrieval.best;
    return {
      reply: `${machine.name}: ${machine.tagline} Open its story to read more, or ask me what it found.`,
      suggestions: [`What did ${machine.name} find?`, `Is ${machine.name} still working?`, `How did ${machine.name} work?`],
    };
  }
  return {
    reply: "I don't know that yet. I can tell you about machines like Opportunity, Voyager 1 or the Apollo Moon buggies. Which one sounds fun?",
    suggestions: starterSuggestions,
  };
}
