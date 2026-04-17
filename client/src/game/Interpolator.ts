import type { IPlayerState } from "@shared/types";

interface Sample {
  x:         number;
  y:         number;
  timestamp: number;
}

export class Interpolator {
  private buffer: Sample[]    = [];
  latestState!:   IPlayerState;

  addSample(x: number, y: number, state: IPlayerState): void {
    this.buffer.push({ x, y, timestamp: Date.now() });
    if (this.buffer.length > 3) this.buffer.shift();
    this.latestState = state;
  }

  getPosition(now: number): { x: number; y: number } {
    const RENDER_LAG = 100; // ms
    const renderTime = now - RENDER_LAG;

    if (this.buffer.length < 2) {
      return this.buffer[0] ?? { x: 0, y: 0 };
    }

    // Znajdź parę próbek otaczającą renderTime
    for (let i = this.buffer.length - 1; i >= 1; i--) {
      const b = this.buffer[i];
      const a = this.buffer[i - 1];
      if (renderTime >= a.timestamp && renderTime <= b.timestamp) {
        const t = (renderTime - a.timestamp) / (b.timestamp - a.timestamp);
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        };
      }
    }

    // Rendertime za stary lub za nowy — użyj ostatniej próbki
    return this.buffer[this.buffer.length - 1];
  }
}
