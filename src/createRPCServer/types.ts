export type TMethod = (...args: unknown[]) => Promise<unknown>;

export interface IMethods {
  [key: string]: TMethod | IMethods;
}
