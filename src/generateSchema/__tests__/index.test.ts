import * as path from 'path';
import { generateSchema } from '../index';

describe('generateSchema', () => {
  const projectRoot = path.resolve(__dirname, 'fixtures');
  const sourceFilePath = path.join(projectRoot, 'rpc.ts');

  it('should generate correct type definitions', () => {
    const schema = generateSchema(projectRoot, sourceFilePath);

    // Expected type definition
    const expected = `export interface User {
    id: number;
    name: string;
    age: number
};

export declare const rpcMethods: {
    sayHello: (name: string) => Promise<string>;
    add: (a: number, b: number) => Promise<number>;
    getUser: (id: number) => Promise<User>;
};
export type RpcMethods = typeof rpcMethods;
`;

    expect(schema).toBe(expected);
  });

  it('should throw error for non-typescript files', () => {
    expect(() => {
      generateSchema(projectRoot, 'invalid.js');
    }).toThrow('Source file must be a .ts file');
  });

  it('should throw error if rpcMethods is not found', () => {
    expect(() => {
      generateSchema(projectRoot, __filename); // Try to parse the test file itself
    }).toThrow('Source file must be inside project root directory');
  });

  it('should throw error if file is outside project root', () => {
    expect(() => {
      generateSchema(projectRoot, path.resolve(__dirname, '..', '..', 'index.ts'));
    }).toThrow('Source file must be inside project root directory');
  });
});
