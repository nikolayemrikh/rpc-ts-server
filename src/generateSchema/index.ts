import * as path from 'path';
import * as ts from 'typescript';

interface CollectedTypes {
  [typeName: string]: ts.Type;
}

const collectTypes = (type: ts.Type, checker: ts.TypeChecker, collected: CollectedTypes = {}): CollectedTypes => {
  // Если это именованный тип (интерфейс или тип)
  if (type.symbol && type.symbol.name !== '__type') {
    const typeName = type.symbol.getName();
    if (!collected[typeName]) {
      collected[typeName] = type;
    }
  }

  // Рекурсивно собираем типы из union
  if (type.isUnion()) {
    type.types.forEach((t) => collectTypes(t, checker, collected));
  }

  // Рекурсивно собираем типы из intersection
  if (type.isIntersection()) {
    type.types.forEach((t) => collectTypes(t, checker, collected));
  }

  // Рекурсивно собираем типы из свойств объекта
  if (type.isClassOrInterface() || type.flags & ts.TypeFlags.Object) {
    type.getProperties().forEach((prop) => {
      const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);
      collectTypes(propType, checker, collected);
    });
  }

  return collected;
};

const serializeType = (
  type: ts.Type,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  indent = 0,
  skipTypeCollection = false
): string => {
  // Если это именованный тип и мы не пропускаем сбор типов
  if (!skipTypeCollection && type.symbol && type.symbol.name !== '__type') {
    return type.symbol.getName();
  }

  if (type.isUnion()) {
    return type.types.map((t) => serializeType(t, checker, sourceFile, indent, skipTypeCollection)).join(' | ');
  }

  if (type.isIntersection()) {
    return type.types.map((t) => serializeType(t, checker, sourceFile, indent, skipTypeCollection)).join(' & ');
  }

  // Если это объектный тип
  if (type.isClassOrInterface() || type.flags & ts.TypeFlags.Object) {
    const properties = type.getProperties();
    if (properties.length === 0) {
      return checker.typeToString(type);
    }

    const indentStr = ' '.repeat(indent + 4);
    const propertiesStr = properties
      .map((prop) => {
        const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);
        const serialized = serializeType(propType, checker, sourceFile, indent + 4, skipTypeCollection);
        return `${indentStr}${prop.getName()}: ${serialized};`;
      })
      .join('\n');

    return `{\n${propertiesStr}\n${' '.repeat(indent)}}`;
  }

  return checker.typeToString(type);
};

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
  const collectedTypes: CollectedTypes = {};

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
  let result = '';

  // Сначала собираем все используемые типы
  const properties = checker.getPropertiesOfType(rpcMethodsType);
  properties.forEach((prop) => {
    const propType = checker.getTypeOfSymbolAtLocation(prop, sourceFile);
    const signatures = propType.getCallSignatures();

    if (signatures.length > 0) {
      const signature = signatures[0];
      const returnType = signature.getReturnType();
      const promiseTypeArgs = checker.getTypeArguments(returnType as ts.TypeReference);
      if (promiseTypeArgs.length > 0) {
        collectTypes(promiseTypeArgs[0], checker, collectedTypes);
      }
    }
  });

  // Генерируем определения типов
  Object.entries(collectedTypes).forEach(([name, type]) => {
    result += `export interface ${name} ${serializeType(type, checker, sourceFile, 0, true)};\n\n`;
  });

  // Генерируем определение rpcMethods
  result += 'export declare const rpcMethods: {\n';

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

      const promiseTypeArgs = checker.getTypeArguments(returnType as ts.TypeReference);
      if (promiseTypeArgs.length > 0) {
        const innerType = promiseTypeArgs[0];
        const innerTypeStr = serializeType(innerType, checker, sourceFile);
        result += `    ${prop.getName()}: (${params}) => Promise<${innerTypeStr}>;\n`;
      }
    }
  });

  result += '};\n';
  result += 'export type RpcMethods = typeof rpcMethods;\n';

  return result;
};
