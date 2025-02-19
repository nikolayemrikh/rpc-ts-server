import { getUser } from './getUser';

export const rpcMethods = {
  sayHello: (name: string) => Promise.resolve(`Hello, ${name}!`),
  add: (a: number, b: number) => Promise.resolve(a + b),
  getUser,
};

export type RpcMethods = typeof rpcMethods;
