import { buildApolloInstructions, normalizeCompletedMachineIds } from './chat-knowledge';

describe('Apollo chat knowledge', () => {
  it('drops unknown ids and removes duplicate completed ids', () => {
    expect(normalizeCompletedMachineIds([
      'apollo-lm',
      'apollo-lm',
      'not-a-machine',
      42,
      'opportunity',
    ])).toEqual(['apollo-lm', 'opportunity']);
  });

  it('does not include facts for a locked machine in the prompt', () => {
    const prompt = buildApolloInstructions(['apollo-lm']);
    expect(prompt).toContain('The Apollo 11 Lunar Module brought Neil Armstrong and Buzz Aldrin down to the Moon.');
    expect(prompt).toContain('opportunity: Opportunity (MER-B)');
    expect(prompt).not.toContain('Opportunity drove over 28 miles');
    expect(prompt).not.toContain('Robotic lander later visited by the Apollo 12 astronauts');
  });

  it('includes a completed machine story only when it has source-backed facts', () => {
    const prompt = buildApolloInstructions(['opportunity']);
    expect(prompt).toContain('Opportunity drove over 28 miles before a global dust storm disabled it.');
    expect(prompt).not.toContain('Apollo 11 Lunar Module brought Neil Armstrong');
  });
});
