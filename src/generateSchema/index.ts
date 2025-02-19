import { Node, Project, SourceFile, TypeAliasDeclaration, VariableDeclaration, ts } from 'ts-morph';

type RpcMethodsType = {
  declaration: VariableDeclaration | TypeAliasDeclaration;
  isDts: boolean;
};

const findRpcMethodsType = (sourceFile: SourceFile): RpcMethodsType | null => {
  // First try to find type alias
  const typeAlias = sourceFile.getFirstDescendant(
    (node): node is TypeAliasDeclaration => Node.isTypeAliasDeclaration(node) && node.getName() === 'RpcMethods'
  );

  if (typeAlias) {
    const isDts = sourceFile.getFilePath().endsWith('.d.ts');
    return { declaration: typeAlias, isDts };
  }

  // If no type alias found, try to find variable declaration
  const varDeclaration = sourceFile.getFirstDescendant(
    (node): node is VariableDeclaration => Node.isVariableDeclaration(node) && node.getName() === 'rpcMethods'
  );

  if (varDeclaration) {
    const isDts = sourceFile.getFilePath().endsWith('.d.ts');
    return { declaration: varDeclaration, isDts };
  }

  return null;
};

export const generateSchema = (sourceFilePath: string): string => {
  if (!sourceFilePath.endsWith('.ts') && !sourceFilePath.endsWith('.d.ts')) {
    throw new Error('Source file must be either .ts or .d.ts');
  }

  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(sourceFilePath);

  const rpcMethodsType = findRpcMethodsType(sourceFile);
  if (!rpcMethodsType) {
    throw new Error('Neither rpcMethods declaration nor RpcMethods type found');
  }

  const { declaration, isDts } = rpcMethodsType;

  // For .d.ts files, we can directly use the type
  if (isDts) {
    if (Node.isTypeAliasDeclaration(declaration)) {
      return `export ${declaration.getText()}\n`;
    }
    // For variable declaration in .d.ts
    return `export type RpcMethods = ${declaration.getType().getText()}\n`;
  }

  // For .ts files, we need to generate the interface
  let interfaceText = `export interface RpcMethods {\n`;

  if (Node.isVariableDeclaration(declaration)) {
    const properties = declaration.getInitializerIfKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression).getProperties();

    properties.forEach((prop) => {
      if (prop.isKind(ts.SyntaxKind.PropertyAssignment) || prop.isKind(ts.SyntaxKind.ShorthandPropertyAssignment)) {
        const name = prop.getName();
        const type = prop.getType();
        const signature = type.getCallSignatures()[0];

        if (signature) {
          const params = signature
            .getParameters()
            .map((p) => `${p.getName()}: ${p.getValueDeclaration()?.getType().getText()}`)
            .join(', ');
          const returnType = signature.getReturnType().getText();

          interfaceText += `  ${name}(${params}): ${returnType};\n`;
        }
      }
    });
  }

  interfaceText += `}\n`;
  return interfaceText;
};
