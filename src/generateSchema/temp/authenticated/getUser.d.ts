export interface User {
    id: number;
    name: string;
    age: number;
}
export declare const getUser: (id: number) => Promise<User>;
