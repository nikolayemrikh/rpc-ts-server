export type TMethod = (...args: any[]) => Promise<any>;
export interface IMethods {
    [key: string]: TMethod | IMethods;
}
export declare const rpcMethods: {
    sayHello: (name: string) => Promise<import("./sayHello").THello>;
    add: (a: number, b: number) => Promise<number>;
    authenticated: {
        getUser: (id: number) => Promise<import("./authenticated/getUser").User>;
    };
};
export type RpcMethods = typeof rpcMethods;
