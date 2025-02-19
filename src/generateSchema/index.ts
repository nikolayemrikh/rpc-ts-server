import * as path from 'path';
import * as ts from 'typescript';

export const generateSchema = (projectRoot: string, sourceFilePath: string): string => {
  if (!sourceFilePath.endsWith('.ts')) {
    throw new Error('Source file must be a .ts file');
  }

  // Ensure paths are absolute
  const absoluteProjectRoot = path.resolve(projectRoot);
  const absoluteSourcePath = path.resolve(sourceFilePath);

  // Verify that source file is inside project root
  if (!absoluteSourcePath.startsWith(absoluteProjectRoot)) {
    throw new Error('Source file must be inside project root directory');
  }

  // Create a program
  const program = ts.createProgram([absoluteSourcePath], {
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.NodeNext,
    baseUrl: absoluteProjectRoot,
    rootDir: absoluteProjectRoot,
  });

  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(absoluteSourcePath);

  if (!sourceFile) {
    throw new Error('Could not load source file');
  }

  // Find rpcMethods variable declaration and get its type
  let rpcMethodsType: ts.Type | undefined;

  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((decl) => {
        if (ts.isIdentifier(decl.name) && decl.name.text === 'rpcMethods' && decl.initializer) {
          rpcMethodsType = checker.getTypeAtLocation(decl.initializer);
          return true;
        }
        return false;
      })
    ) {
      return;
    }
  });

  if (!rpcMethodsType) {
    throw new Error('rpcMethods not found in the source file');
  }

  // Generate interface text
  let result = 'export declare const rpcMethods: {\n';

  const properties = checker.getPropertiesOfType(rpcMethodsType);
  properties.forEach((prop) => {
    const propType = checker.getTypeOfSymbolAtLocation(prop, sourceFile);
    const signatures = propType.getCallSignatures();

    if (signatures.length > 0) {
      const signature = signatures[0];
      const parameters = signature.getParameters();
      const returnType = signature.getReturnType();

      const params = parameters
        .map((param) => {
          const paramType = checker.getTypeOfSymbolAtLocation(param, sourceFile);
          return `${param.getName()}: ${checker.typeToString(paramType)}`;
        })
        .join(', ');

      // Для Promise<T> нам нужно получить тип T
      const promiseTypeArgs = checker.getTypeArguments(returnType as ts.TypeReference);
      if (promiseTypeArgs.length > 0) {
        const innerType = promiseTypeArgs[0];
        // Используем флаг TypeFormatFlags.InTypeAlias чтобы получить полное определение типа
        const innerTypeStr = checker.typeToString(
          innerType,
          undefined,
          ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.NoTruncation
        );
        result += `    ${prop.getName()}: (${params}) => Promise<${innerTypeStr}>;\n`;
      }
    }
  });

  result += '};\n';
  result += 'export type RpcMethods = typeof rpcMethods;\n';

  return result;
};
