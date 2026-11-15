import { answerLocally } from './local-apollo';

describe('answerLocally', () => {
  it('answers about the machine named in the question, not the open story', () => {
    const answer = answerLocally('What did Opportunity find?', [{ role: 'user', content: 'How far away is Voyager 1?' }], 'voyager-1');
    expect(answer.reply).toContain('Opportunity');
    expect(answer.reply).toContain('hematite');
  });

  it('keeps the last named machine for a follow-up question', () => {
    const answer = answerLocally('Is it still working?', [{ role: 'user', content: 'What did Opportunity find?' }]);
    expect(answer.reply).toContain('Opportunity');
    expect(answer.reply).toContain('Where I am now');
  });

  it('lists every machine and explains the project', () => {
    expect(answerLocally('Who are the machines?').reply).toContain('New Horizons');
    expect(answerLocally('What is this project about?').reply).toContain('Ask the Machines');
  });

  it('says so when a question is off topic', () => {
    const answer = answerLocally('what is the capital of France', [{ role: 'user', content: 'Who are the machines?' }]);
    expect(answer.reply).toContain("I don't know that yet");
    expect(answer.suggestions.length).toBe(3);
  });
});
