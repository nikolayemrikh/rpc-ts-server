import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const generateSchema = (sourceFilePath: string): string => {
  if (!sourceFilePath.endsWith('.ts')) {
    throw new Error('Source file must be a .ts file');
  }

  // Create a temporary directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-schema-'));
  const fileName = path.basename(sourceFilePath);
  const tmpFilePath = path.join(tmpDir, fileName);

  try {
    // Copy the source file to temp directory
    fs.copyFileSync(sourceFilePath, tmpFilePath);

    // Create a temporary tsconfig.json
    const tsConfig = {
      compilerOptions: {
        declaration: true,
        emitDeclarationOnly: true,
        noEmit: false,
        skipLibCheck: true,
        moduleResolution: 'node',
        target: 'ES2018',
        module: 'CommonJS',
        esModuleInterop: true,
        strict: true,
      },
      include: [fileName],
    };

    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));

    // Find path to local typescript installation
    const tscPath = require.resolve('typescript/bin/tsc');

    try {
      // Run local tsc to generate .d.ts with verbose output
      execSync(`node ${tscPath} --listFiles --verbose`, {
        cwd: tmpDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `TypeScript compilation failed: ${error.message}\nPlease check if all imports are available in the temporary directory.`
        );
      }
      throw error;
    }

    // Read the generated .d.ts file
    const dtsPath = path.join(tmpDir, path.basename(fileName, '.ts') + '.d.ts');

    if (!fs.existsSync(dtsPath)) {
      throw new Error(`Declaration file was not generated at ${dtsPath}`);
    }

    const dtsContent = fs.readFileSync(dtsPath, 'utf-8');

    return dtsContent;
  } finally {
    // Cleanup: remove temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};
