export interface User {
  id: number;
  name: string;
  age: number;
}

export const getUser = (id: number): Promise<User> => {
  return Promise.resolve({
    id,
    name: 'Test User',
    age: 25,
  });
};
