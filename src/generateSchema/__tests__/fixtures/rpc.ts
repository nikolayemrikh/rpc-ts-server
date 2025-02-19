import { getUser } from './authenticated/getUser';
import { sayHello } from './sayHello';

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type TMethod = (...args: any[]) => Promise<any>;

export interface IMethods {
  [key: string]: TMethod | IMethods;
}

export const rpcMethods = {
  sayHello,
  add: (a: number, b: number) => Promise.resolve(a + b),
  authenticated: {
    getUser,
  },
} satisfies IMethods;

export type RpcMethods = typeof rpcMethods;
