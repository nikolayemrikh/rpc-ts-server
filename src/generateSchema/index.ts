import * as path from 'path';
import * as ts from 'typescript';

interface CollectedTypes {
  [typeName: string]: ts.Type;
}

const collectTypes = (type: ts.Type, checker: ts.TypeChecker, collected: CollectedTypes = {}): CollectedTypes => {
  // Обработка именованных типов
  if (type.symbol && type.symbol.name !== '__type') {
    const typeName = type.symbol.getName();
    if (!collected[typeName]) {
      collected[typeName] = type;

      // Если это алиас типа, собираем типы из целевого типа
      if (type.isTypeParameter()) {
        const constraint = checker.getBaseConstraintOfType(type);
        if (constraint) {
          collectTypes(constraint, checker, collected);
        }
      }

      // Если это класс или интерфейс, собираем базовые типы
      if (type.isClassOrInterface()) {
        const baseTypes = type.getBaseTypes();
        if (baseTypes) {
          baseTypes.forEach((baseType) => collectTypes(baseType, checker, collected));
        }
      }
    }
  }

  // Обработка массивов
  if (checker.isArrayType(type)) {
    const elementType = checker.getTypeArguments(type as ts.TypeReference)[0];
    collectTypes(elementType, checker, collected);
  }

  // Обработка кортежей
  if (checker.isTupleType(type)) {
    const tupleTypes = checker.getTypeArguments(type as ts.TypeReference);
    tupleTypes.forEach((t) => collectTypes(t, checker, collected));
  }

  // Обработка union типов
  if (type.isUnion()) {
    type.types.forEach((t) => collectTypes(t, checker, collected));
  }

  // Обработка intersection типов
  if (type.isIntersection()) {
    type.types.forEach((t) => collectTypes(t, checker, collected));
  }

  // Обработка объектных типов и их свойств
  if (type.isClassOrInterface() || type.flags & ts.TypeFlags.Object) {
    // Обработка generic параметров
    if (type.flags & ts.TypeFlags.Object) {
      const typeRef = type as ts.TypeReference;
      if (typeRef.typeArguments) {
        typeRef.typeArguments.forEach((t) => collectTypes(t, checker, collected));
      }
    }

    // Обработка свойств
    type.getProperties().forEach((prop) => {
      const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);
      collectTypes(propType, checker, collected);

      // Обработка методов и их параметров
      if (prop.flags & ts.SymbolFlags.Method) {
        const signatures = propType.getCallSignatures();
        signatures.forEach((signature) => {
          // Обработка параметров
          signature.getParameters().forEach((param) => {
            const paramType = checker.getTypeOfSymbolAtLocation(param, param.valueDeclaration!);
            collectTypes(paramType, checker, collected);
          });
          // Обработка возвращаемого типа
          const returnType = signature.getReturnType();
          collectTypes(returnType, checker, collected);
        });
      }
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

const processMethodType = (
  type: ts.Type,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  indent: number,
  collected: CollectedTypes,
  path: string[] = []
): string => {
  const properties = checker.getPropertiesOfType(type);
  const indentStr = ' '.repeat(indent + 4);
  const results: string[] = [];

  for (const prop of properties) {
    const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);
    const propName = prop.getName();
    const currentPath = [...path, propName];

    // Проверяем, является ли свойство объектом с методами
    if (
      propType.getCallSignatures().length === 0 &&
      (propType.isClassOrInterface() || propType.flags & ts.TypeFlags.Object)
    ) {
      // Это вложенный объект, рекурсивно обрабатываем его
      const nestedMethods = processMethodType(propType, checker, sourceFile, indent + 4, collected, currentPath);
      results.push(`${indentStr}${propName}: {${nestedMethods}\n${indentStr}};`);
    } else {
      // Это метод, обрабатываем его сигнатуру
      const signatures = propType.getCallSignatures();
      if (signatures.length > 0) {
        const signature = signatures[0];
        const parameters = signature.getParameters();
        const returnType = signature.getReturnType();

        const params = parameters
          .map((param) => {
            const paramType = checker.getTypeOfSymbolAtLocation(param, prop.valueDeclaration!);
            return `${param.getName()}: ${checker.typeToString(paramType)}`;
          })
          .join(', ');

        const promiseTypeArgs = checker.getTypeArguments(returnType as ts.TypeReference);
        if (promiseTypeArgs.length > 0) {
          const innerType = promiseTypeArgs[0];
          const innerTypeStr = serializeType(innerType, checker, sourceFile);
          results.push(`${indentStr}${propName}: (${params}) => Promise<${innerTypeStr}>;`);
          collectTypes(innerType, checker, collected);
        }
      }
    }
  }

  return `\n${results.join('\n')}`;
};

export const generateSchema = (tsConfigPath: string, projectRoot: string, sourceFilePath: string): string => {
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

  // Create a program using tsconfig.json
  const { config, error } = ts.readConfigFile(absoluteTsConfigPath, ts.sys.readFile);

  if (error) {
    throw new Error(`Failed to read tsconfig.json: ${error.messageText}`);
  }

  const { options, errors } = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(absoluteTsConfigPath));

  if (errors.length > 0) {
    throw new Error(`Failed to parse tsconfig.json: ${errors[0].messageText}`);
  }

  const program = ts.createProgram([absoluteSourcePath], options);

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
    const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);

    // Если это вложенный объект, собираем типы из его методов
    if (
      propType.getCallSignatures().length === 0 &&
      (propType.isClassOrInterface() || propType.flags & ts.TypeFlags.Object)
    ) {
      const nestedProperties = checker.getPropertiesOfType(propType);
      nestedProperties.forEach((nestedProp) => {
        const nestedPropType = checker.getTypeOfSymbolAtLocation(nestedProp, nestedProp.valueDeclaration!);
        const signatures = nestedPropType.getCallSignatures();
        if (signatures.length > 0) {
          const signature = signatures[0];
          const returnType = signature.getReturnType();
          const promiseTypeArgs = checker.getTypeArguments(returnType as ts.TypeReference);
          if (promiseTypeArgs.length > 0) {
            collectTypes(promiseTypeArgs[0], checker, collectedTypes);
          }
        }
      });
    } else {
      // Обычный метод верхнего уровня
      const signatures = propType.getCallSignatures();
      if (signatures.length > 0) {
        const signature = signatures[0];
        const returnType = signature.getReturnType();
        const promiseTypeArgs = checker.getTypeArguments(returnType as ts.TypeReference);
        if (promiseTypeArgs.length > 0) {
          collectTypes(promiseTypeArgs[0], checker, collectedTypes);
        }
      }
    }
  });

  // Генерируем определения типов
  Object.entries(collectedTypes).forEach(([name, type]) => {
    result += `export interface ${name} ${serializeType(type, checker, sourceFile, 0, true)};\n\n`;
  });

  // Генерируем определение rpcMethods
  result += 'export declare const rpcMethods: {';
  result += processMethodType(rpcMethodsType, checker, sourceFile, 0, collectedTypes);
  result += '\n};\n';
  result += 'export type RpcMethods = typeof rpcMethods;\n';

  return result;
};
