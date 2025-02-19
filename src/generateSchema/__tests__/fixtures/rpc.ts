import { getUser } from './authenticated/getUser';
import { sayHello } from './sayHello';

export const rpcMethods = {
  sayHello,
  add: (a: number, b: number) => Promise.resolve(a + b),
  getUser,
};

export type RpcMethods = typeof rpcMethods;
