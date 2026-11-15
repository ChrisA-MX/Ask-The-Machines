import { ChatRateLimiter } from './chat-rate-limit';

describe('ChatRateLimiter', () => {
  it('allows 20 requests per minute per key and resets after the window', () => {
    const limiter = new ChatRateLimiter(20, 60_000);
    for (let request = 0; request < 20; request++) expect(limiter.allow('client-a', 1_000 + request)).toBe(true);
    expect(limiter.allow('client-a', 2_000)).toBe(false);
    expect(limiter.allow('client-b', 2_000)).toBe(true);
    expect(limiter.allow('client-a', 61_020)).toBe(true);
  });
});
