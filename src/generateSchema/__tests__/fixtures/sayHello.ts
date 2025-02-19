export type THello = string;

export const sayHello = (name: string): Promise<THello> => {
  return Promise.resolve(`Hello, ${name}!`);
};
