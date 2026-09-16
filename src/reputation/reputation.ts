/**
 * Reputation Module
 *
 * Simple but effective reputation system for the swarm.
 * Agents check reputation before opening Payment Channels.
 * Successful settlements increase score; failures decrease it.
 */

export interface ReputationRecord {
  agentId: string;
  score: number;          // starts at 1.0
  successfulSettlements: number;
  failedSettlements: number;
  totalVolumeUsdc: number;
  lastUpdated: number;
}

export class ReputationRegistry {
  private records = new Map<string, ReputationRecord>();

  register(agentId: string): ReputationRecord {
    if (this.records.has(agentId)) return this.records.get(agentId)!;

    const record: ReputationRecord = {
      agentId,
      score: 1.0,
      successfulSettlements: 0,
      failedSettlements: 0,
      totalVolumeUsdc: 0,
      lastUpdated: Date.now(),
    };
    this.records.set(agentId, record);
    return record;
  }

  get(agentId: string): ReputationRecord | undefined {
    return this.records.get(agentId);
  }

  /** Minimum score required to open a channel with this agent */
  canOpenChannel(agentId: string, minScore = 0.5): boolean {
    const rec = this.records.get(agentId);
    if (!rec) return false;
    return rec.score >= minScore;
  }

  recordSuccess(agentId: string, volumeUsdc: number) {
    const rec = this.register(agentId);
    rec.successfulSettlements += 1;
    rec.totalVolumeUsdc += volumeUsdc;
    // Simple trust growth
    rec.score = Math.min(5.0, rec.score + 0.05 + volumeUsdc * 0.01);
    rec.lastUpdated = Date.now();
    this.records.set(agentId, rec);
    return rec.score;
  }

  recordFailure(agentId: string) {
    const rec = this.register(agentId);
    rec.failedSettlements += 1;
    rec.score = Math.max(0.1, rec.score - 0.15);
    rec.lastUpdated = Date.now();
    this.records.set(agentId, rec);
    return rec.score;
  }

  list(): ReputationRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.score - a.score);
  }
}
