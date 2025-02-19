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

    // Run tsc to generate .d.ts
    execSync('tsc', { cwd: tmpDir });

    // Read the generated .d.ts file
    const dtsPath = path.join(tmpDir, path.basename(fileName, '.ts') + '.d.ts');
    const dtsContent = fs.readFileSync(dtsPath, 'utf-8');

    return dtsContent;
  } finally {
    // Cleanup: remove temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};
