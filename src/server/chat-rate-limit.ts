export class ChatRateLimiter {
  private readonly requestTimes = new Map<string, number[]>();

  constructor(private readonly limit = 20, private readonly windowMs = 60_000) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.requestTimes.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.requestTimes.set(key, recent);
      return false;
    }
    recent.push(now);
    this.requestTimes.set(key, recent);
    return true;
  }
}
