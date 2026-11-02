import { parseBinanceTicker } from "./providers";
import type { Instrument, Observation } from "./types";
export interface SocketLike {
  addEventListener(type: string, listener: (event: any) => void): void;
  close(): void;
}
export type SocketFactory = (url: string) => SocketLike;
export class BinanceStream {
  readonly metrics = {
    connections: 0,
    disconnects: 0,
    reconnects: 0,
    messages: 0,
    invalidMessages: 0,
    lastMessageAt: 0,
  };
  private socket?: SocketLike;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private failures = 0;
  private generation = 0;
  private lastMessage = 0;
  private openedAt = 0;
  private watchdog?: ReturnType<typeof setInterval>;
  state: "disabled" | "connecting" | "connected" | "backoff" = "disabled";
  constructor(
    private list: Instrument[],
    private onQuote: (i: Instrument, q: Observation) => void,
    private onDisconnect: () => void,
    private factory: SocketFactory = (url) => new WebSocket(url),
    private now = Date.now,
    private random = Math.random,
  ) {}
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.watchdog = setInterval(() => {
      if (
        this.socket &&
        (this.now() - this.lastMessage > 30000 ||
          this.now() - this.openedAt > 23 * 3600000)
      )
        this.lost(this.generation);
    }, 5000);
    this.watchdog.unref?.();
  }
  stop() {
    this.stopped = true;
    this.generation++;
    clearTimeout(this.timer);
    clearInterval(this.watchdog);
    this.socket?.close();
    this.socket = undefined;
    this.state = "disabled";
  }
  private connect() {
    if (this.stopped) return;
    const streams = this.list
      .filter((i) => i.mappings.binance)
      .map((i) => i.mappings.binance!.toLowerCase() + "@ticker");
    if (!streams.length) return;
    const generation = ++this.generation;
    this.state = "connecting";
    this.lastMessage = this.openedAt = this.now();
    try {
      this.metrics.connections++;
      if (this.metrics.connections > 1) this.metrics.reconnects++;
      const socket = this.factory(
        "wss://data-stream.binance.vision/stream?streams=" + streams.join("/"),
      );
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (generation === this.generation) this.state = "connected";
      });
      socket.addEventListener("message", (event) => {
        if (generation !== this.generation) return;
        try {
          const message = String(event.data);
          if (message.length > 65536) throw new Error("oversized");
          const envelope = JSON.parse(message),
            d = envelope.data;
          const i = this.list.find((i) => i.mappings.binance === d?.s);
          if (
            !i ||
            d.e !== "24hrTicker" ||
            envelope.stream !== d.s.toLowerCase() + "@ticker"
          )
            throw new Error("symbol");
          const received = this.now(),
            q = parseBinanceTicker(
              d,
              i,
              received,
              "websocket",
              Math.max(0, received - Number(d.E)),
            );
          if (received - Date.parse(q.asOf) > 60000) throw new Error("stale");
          this.metrics.messages++;
          this.metrics.lastMessageAt = received;
          this.onQuote(i, q);
          this.lastMessage = received;
          if (received - this.openedAt >= 60000) this.failures = 0;
        } catch {
          this.metrics.invalidMessages++;
          this.lost(generation);
        }
      });
      socket.addEventListener("error", () => this.lost(generation));
      socket.addEventListener("close", () => this.lost(generation));
    } catch {
      this.lost(generation);
    }
  }
  private lost(generation: number) {
    if (this.stopped || generation !== this.generation) return;
    this.generation++;
    this.metrics.disconnects++;
    this.socket?.close();
    this.socket = undefined;
    this.onDisconnect();
    this.state = "backoff";
    const delay =
      Math.min(60000, 1000 * 2 ** Math.min(this.failures++, 10)) *
      (1 + this.random() * 0.25);
    this.timer = setTimeout(() => this.connect(), delay);
    this.timer.unref?.();
  }
}
