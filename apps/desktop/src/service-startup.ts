import { ServiceStartupUnconfirmed, type ServiceStartupReview } from "@moguri-dev/sdk/node";
import type { Connection } from "@moguri-dev/sdk";

export class DesktopServiceStartup {
  private task?: Promise<Connection>;
  private connection?: Connection;
  private revision = 0;
  private cancelled = false;
  private pending?: { error: ServiceStartupUnconfirmed; gate: ReturnType<typeof Promise.withResolvers<void>>; revision: number };
  private suspension = Promise.withResolvers<ServiceStartupUnconfirmed>();
  constructor(private readonly acquire: (review?: ServiceStartupReview) => Promise<Connection>,
    private readonly inspect: (review: ServiceStartupReview) => Promise<Connection>) {}
  status() {
    return { revision: this.revision, canReconnect: Boolean(this.pending && !this.cancelled), diagnostic: this.pending?.error.message ?? null };
  }
  connect(): Promise<Connection> {
    this.task ??= this.open();
    return this.task;
  }
  private async open(): Promise<Connection> {
    let review: ServiceStartupReview | undefined;
    while (!this.cancelled) {
      try {
        const connection = await this.acquire(review);
        if (this.cancelled) break;
        this.connection = { ...connection }; return { ...connection };
      } catch (error) {
        if (!(error instanceof ServiceStartupUnconfirmed) || this.cancelled) throw error;
        review = error.review;
        const gate = Promise.withResolvers<void>();
        this.pending = { error, gate, revision: ++this.revision }; this.suspension.resolve(error);
        await gate.promise;
      }
    }
    throw new Error("Desktop startup was cancelled after the original service lifecycle settled. No late window or different owner was admitted.");
  }
  reconnect(revision: number): void {
    const pending = this.pending;
    if (this.cancelled || !pending || pending.revision !== revision) throw new Error("Choose the current unconfirmed startup before reconnecting. No stale or different owner was selected.");
    this.pending = undefined; this.suspension = Promise.withResolvers<ServiceStartupUnconfirmed>();
    pending.gate.resolve();
  }
  async originalForShutdown(): Promise<Connection> {
    if (this.connection) return { ...this.connection };
    while (true) {
      const current = this.pending;
      if (current) return this.inspect(current.error.review);
      const result = await Promise.race([
        this.connect().then((connection) => ({ connection })),
        this.suspension.promise.then((error) => ({ error })),
      ]);
      if ("connection" in result) return { ...result.connection };
      if (this.pending?.error === result.error) return this.inspect(result.error.review);
    }
  }
  cancelAfterShutdown(): void {
    this.cancelled = true;
    this.pending?.gate.resolve(); this.pending = undefined;
  }
}
