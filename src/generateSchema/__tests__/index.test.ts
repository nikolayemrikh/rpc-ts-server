import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { generateSchema } from '../index';

describe('generateSchema', () => {
  const projectRoot = path.resolve(__dirname, 'fixtures');
  const sourceFilePath = path.join(projectRoot, 'rpc.ts');
  const tsConfigPath = path.join(projectRoot, 'tsconfig.json');

  it('should generate correct type definitions', async () => {
    const archiveBuffer = await generateSchema(tsConfigPath, projectRoot, sourceFilePath);

    // Create temp dir for extraction
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-schema-test-'));
    const zip = new AdmZip(archiveBuffer);
    zip.extractAllTo(tempDir, true);

    // Read the generated rpc.d.ts
    const rpcContent = fs.readFileSync(path.join(tempDir, 'rpc-ts-server.d.ts'), 'utf-8');
    expect(rpcContent).toBe(`import type { RpcMethods } from './rpc';
export type { RpcMethods };`);

    // Read the generated source .d.ts file
    const sourceFileName = path.basename(sourceFilePath, '.ts');
    const relativeSourcePath = path.relative(projectRoot, sourceFilePath);
    const sourceDtsPath = path.join(tempDir, path.dirname(relativeSourcePath), `${sourceFileName}.d.ts`);
    const sourceDtsContent = fs.readFileSync(sourceDtsPath, 'utf-8');
    expect(sourceDtsContent).toContain('export type RpcMethods = typeof rpcMethods;');
    expect(sourceDtsContent).toContain('export type TMethod');
    expect(sourceDtsContent).toContain('export interface IMethods');

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should throw error for non-typescript files', async () => {
    await expect(generateSchema(tsConfigPath, projectRoot, 'invalid.js')).rejects.toThrow(
      'Source file must be a .ts file'
    );
  });

  it('should throw error if file is outside project root', async () => {
    await expect(
      generateSchema(tsConfigPath, projectRoot, path.resolve(__dirname, '..', '..', 'index.ts'))
    ).rejects.toThrow('Source file must be inside project root directory');
  });

  it('should throw error if tsconfig.json is not found', async () => {
    await expect(generateSchema('non-existent-tsconfig.json', projectRoot, sourceFilePath)).rejects.toThrow(
      'Failed to read tsconfig.json'
    );
  });
});
