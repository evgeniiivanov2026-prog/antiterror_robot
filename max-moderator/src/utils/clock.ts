export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export type Sleep = (ms: number) => Promise<void>;

export const systemSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
