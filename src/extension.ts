import { ExtensionContext, languages, CodeLens, Range, TextDocument } from 'vscode';
import { runInNewContext } from 'vm';
import { Node, ParameterDeclaration, printNode, Project, ts, createWrappedNode, SourceFile, TypeNode } from 'ts-morph';
import { random } from 'faker';

const { factory, getJSDocType } = ts;

type GeneratedArgument =
  ts.Identifier
  | ts.StringLiteral
  | ts.NumericLiteral
  | ts.TrueLiteral
  | ts.FalseLiteral
  | ts.ArrayLiteralExpression
  | ts.ObjectLiteralExpression;

const generateArgumentByTypeNode = (typeNode: TypeNode): GeneratedArgument => {
  if (Node.isStringKeyword(typeNode)) {
    return factory.createStringLiteral(random.words());
  }

  if (Node.isNumberKeyword(typeNode)) {
    return factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
  }

  if (Node.isBooleanKeyword(typeNode)) {
    return random.boolean() ? factory.createTrue() : factory.createFalse();
  }

  if (Node.isArrayTypeNode(typeNode)) {
    const elements = [generateArgumentByTypeNode(typeNode.getElementTypeNode())];
    return factory.createArrayLiteralExpression(elements);
  }

  if (Node.isTypeLiteralNode(typeNode)) {
    const properties = typeNode.getMembers()
      .filter(Node.isPropertySignature)
      .map((s) => factory.createPropertyAssignment(
        s.getName(),
        generateArgumentByTypeNode(s.getTypeNodeOrThrow()),
      ));
    return factory.createObjectLiteralExpression(properties);
  }

  if (Node.isUnionTypeNode(typeNode)) {
    const typeNodes = typeNode.getTypeNodes();
    const randomTypeNode = random.arrayElement(typeNodes);
    return generateArgumentByTypeNode(randomTypeNode);
  }

  if (Node.isTypeReferenceNode(typeNode)) {
    const declaration = typeNode.getTypeName().getSymbolOrThrow().getDeclarations().find(Node.isTypeAliasDeclaration);
    if (declaration) {
      return generateArgumentByTypeNode(declaration.getTypeNodeOrThrow());
    }
  }

  return factory.createIdentifier('undefined');
};

const generateArgumentByParameterDeclaration = (parameter: ParameterDeclaration) => {
  const jsDocType = getJSDocType(parameter.compilerNode);
  const typeNode = parameter.getTypeNode()
    || (jsDocType ? createWrappedNode(jsDocType) : null);

  if (!typeNode) {
    return random.boolean()
      ? factory.createStringLiteral(random.words())
      : factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
  }

  return generateArgumentByTypeNode(typeNode);
};

const generateExpressions = (file: SourceFile) =>
  file.getFunctions().map((func) => {
    const args = func.getParameters().map(generateArgumentByParameterDeclaration);
    const callExpression = factory.createCallExpression(func.getNameNodeOrThrow().compilerNode, undefined, args);
    const sourceCode = printNode(callExpression);
    const position = func.getEnd() + 1;
    return { sourceCode, position };
  });

const provideCodeLenses = (document: TextDocument) => {
  const project = new Project();
  const file = project.createSourceFile(
    '/tmp/vscode-instantcode/eval.ts',
    document.getText(),
  );
  const compiledJs = project.emitToMemory({ targetSourceFile: file }).getFiles()[0].text;

  const generatedExpressions = generateExpressions(file);

  const codeLensDetails = generatedExpressions.map(({ sourceCode, position }) => {
    const result = runInNewContext(`${compiledJs}; ${sourceCode}`);
    return {
      title: `${sourceCode} => ${JSON.stringify(result, null, 1)}`,
      position: document.positionAt(position),
    };
  });

  return codeLensDetails.map(({ title, position }) =>
    new CodeLens(new Range(position, position), { title, command: '' }),
  );
};

export const activate = (context: ExtensionContext) => {
  context.subscriptions.push(languages.registerCodeLensProvider(
    ['typescript', 'javascript'],
    { provideCodeLenses },
  ));
};
