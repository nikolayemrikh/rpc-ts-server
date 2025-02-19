import { Project, ts } from 'ts-morph';

import path from 'path';

export const generateSchema = (): string => {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(path.resolve(__dirname, 'rpc.ts'));

  const rpcMethodsSymbol = sourceFile.getVariableDeclaration('rpcMethods');
  if (!rpcMethodsSymbol) {
    throw new Error('rpcMethods not found in rpc.ts');
  }

  let interfaceText = `export interface RpcMethods {\n`;

  const properties = rpcMethodsSymbol
    .getInitializerIfKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression)
    .getProperties();

  properties.forEach((prop) => {
    if (prop.isKind(ts.SyntaxKind.PropertyAssignment)) {
      const name = prop.getName();
      const func = prop.getInitializerIfKindOrThrow(ts.SyntaxKind.ArrowFunction);
      const params = func
        .getParameters()
        .map((p) => `${p.getName()}: ${p.getType().getText()}`)
        .join(', ');
      const returnType = func.getReturnType().getText();

      interfaceText += `  ${name}(${params}): Promise<${returnType}>;\n`;
    }
  });

  interfaceText += `}\n`;
  return interfaceText;
};
