// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type TMethod = (...args: any[]) => Promise<any>;

export interface IMethods {
  [key: string]: TMethod | IMethods;
}
