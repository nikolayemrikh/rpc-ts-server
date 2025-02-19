import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import archiver from 'archiver';
import * as ts from 'typescript';

export const generateSchema = async (
  tsConfigPath: string,
  projectRoot: string,
  sourceFilePath: string
): Promise<Buffer> => {
  if (!sourceFilePath.endsWith('.ts')) {
    throw new Error('Source file must be a .ts file');
  }

  // Ensure paths are absolute
  const absoluteProjectRoot = path.resolve(projectRoot);
  const absoluteSourcePath = path.resolve(sourceFilePath);
  const absoluteTsConfigPath = path.resolve(tsConfigPath);

  // Verify that source file is inside project root
  if (!absoluteSourcePath.startsWith(absoluteProjectRoot)) {
    throw new Error('Source file must be inside project root directory');
  }

  // Create a temporary directory for output
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-schema-'));
  const typesDir = path.join(tempDir, 'types');
  fs.mkdirSync(typesDir);

  try {
    // Read the original tsconfig
    const { config: originalConfig, error } = ts.readConfigFile(absoluteTsConfigPath, ts.sys.readFile);

    if (error) {
      throw new Error(`Failed to read tsconfig.json: ${error.messageText}`);
    }

    // Create a modified config for declaration file generation
    const buildConfig = {
      ...originalConfig,
      compilerOptions: {
        ...originalConfig.compilerOptions,
        declaration: true,
        emitDeclarationOnly: true,
        noEmit: false,
        outDir: typesDir,
        removeComments: true,
      },
    };

    // Create a program
    const { options, errors: configErrors } = ts.parseJsonConfigFileContent(
      buildConfig,
      ts.sys,
      path.dirname(absoluteTsConfigPath)
    );

    if (configErrors.length > 0) {
      throw new Error(`Failed to parse tsconfig: ${configErrors[0].messageText}`);
    }

    const program = ts.createProgram([absoluteSourcePath], options);
    const emitResult = program.emit();

    const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    if (allDiagnostics.length > 0) {
      const formatHost: ts.FormatDiagnosticsHost = {
        getCanonicalFileName: (path) => path,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine,
      };

      throw new Error(ts.formatDiagnostics(allDiagnostics, formatHost));
    }

    // Create rpc.d.ts that re-exports RpcMethods from the source file
    const sourceFileName = path.basename(sourceFilePath, '.ts');
    const rpcContent = `import type { RpcMethods } from './${sourceFileName}';
export type { RpcMethods };`;
    fs.writeFileSync(path.join(typesDir, 'rpc-ts-server.d.ts'), rpcContent);

    // Create archive in memory
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    const chunks: Buffer[] = [];
    archive.on('data', (chunk) => chunks.push(chunk));

    return new Promise((resolve, reject) => {
      archive.on('end', () => {
        // Clean up temporary directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        resolve(Buffer.concat(chunks));
      });

      archive.on('error', (err) => {
        // Clean up temporary directory
        fs.rmSync(tempDir, { recursive: true, force: true });
        reject(err);
      });

      archive.directory(typesDir, false);
      archive.finalize();
    });
  } catch (error) {
    // Clean up on error
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
};
