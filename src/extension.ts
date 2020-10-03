import { ExtensionContext, languages, CodeLens, Range, TextDocument } from 'vscode';
import { runInNewContext } from 'vm';
import { Node, ParameterDeclaration, printNode, Project, ts, createWrappedNode, SourceFile, TypeNode, TypeLiteralNode, InterfaceDeclaration, ScriptTarget, ModuleKind, FunctionDeclaration, ArrowFunction } from 'ts-morph';
import { random } from 'faker';

const { SyntaxKind, factory, getJSDocType } = ts;

const RECOMMENDED_NODE_12_COMPILER_OPTIONS = {
  lib: ['ES2019'],
  module: ModuleKind.CommonJS,
  target: ScriptTarget.ES2019,
};

type GeneratedArgument =
  ts.Identifier
  | ts.StringLiteral
  | ts.NumericLiteral
  | ts.TrueLiteral
  | ts.FalseLiteral
  | ts.ArrayLiteralExpression
  | ts.ObjectLiteralExpression;

const generateArgumentForObjectTypeDeclaration = (declaration: TypeLiteralNode | InterfaceDeclaration) => {
  const properties = declaration.getMembers()
    .filter(Node.isPropertySignature)
    .map((s) => factory.createPropertyAssignment(
      s.getName(),
      generateArgumentByTypeNode(s.getTypeNodeOrThrow()),
    ));
  return factory.createObjectLiteralExpression(properties);
};

const generateArgumentByTypeNode = (typeNode: TypeNode): GeneratedArgument => {
  if (Node.isStringKeyword(typeNode)) {
    return factory.createStringLiteral(random.words(random.arrayElement([1, 2])));
  }

  if (Node.isNumberKeyword(typeNode)) {
    return factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
  }

  if (Node.isBooleanKeyword(typeNode)) {
    return random.boolean() ? factory.createTrue() : factory.createFalse();
  }

  if (Node.isArrayTypeNode(typeNode)) {
    const elements = Array.from(
      { length: random.number({ min: 0, max: 5 }) },
      () => generateArgumentByTypeNode(typeNode.getElementTypeNode()),
    );
    return factory.createArrayLiteralExpression(elements);
  }

  if (Node.isTypeLiteralNode(typeNode)) {
    return generateArgumentForObjectTypeDeclaration(typeNode);
  }

  if (Node.isUnionTypeNode(typeNode)) {
    const typeNodes = typeNode.getTypeNodes();
    const randomTypeNode = random.arrayElement(typeNodes);
    return generateArgumentByTypeNode(randomTypeNode);
  }

  if (Node.isTypeReferenceNode(typeNode)) {
    const declarations = typeNode.getTypeName().getSymbolOrThrow().getDeclarations();
    const typeAliasDeceleration = declarations.find(Node.isTypeAliasDeclaration);
    if (typeAliasDeceleration) {
      return generateArgumentByTypeNode(typeAliasDeceleration.getTypeNodeOrThrow());
    }
    const interfaceDeclaration = declarations.find(Node.isInterfaceDeclaration);
    if (interfaceDeclaration) {
      return generateArgumentForObjectTypeDeclaration(interfaceDeclaration);
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
      ? factory.createStringLiteral(random.words(random.arrayElement([1, 2])))
      : factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
  }

  return generateArgumentByTypeNode(typeNode);
};

const generateFunctionCallExpression = (declaration: FunctionDeclaration | ArrowFunction, name: string) => {
  const args = declaration.getParameters().map(generateArgumentByParameterDeclaration);
  const callExpression = factory.createCallExpression(
    factory.createIdentifier(name),
    undefined,
    args,
  );
  const sourceCode = printNode(callExpression);
  const position = declaration.getStart();
  return { sourceCode, position };
};

const generateExpressions = (file: SourceFile) => {
  const functionDecelerationCalls = file.getFunctions()
    .filter((d) => d.getName())
    .map((d) => generateFunctionCallExpression(d, d.getNameOrThrow()));

  const arrowFunctionCalls = file.getVariableDeclarations()
    .filter((d) => Node.isIdentifier(d.getNameNode()))
    .filter((d) => d.getInitializerIfKind(SyntaxKind.ArrowFunction))
    .map((d) => generateFunctionCallExpression(d.getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction), d.getName()));

  return [...functionDecelerationCalls, ...arrowFunctionCalls];
};

type GeneratedExpression = ReturnType<typeof generateExpressions>[0];

const evaluateExpression = (generatedExpression: GeneratedExpression, compiledJs: string) => {
  try {
    const result = runInNewContext(
      `${compiledJs}; ${generatedExpression.sourceCode}`,
      { exports: {}, require: () => { } },
    );
    return JSON.stringify(result, null, 1);
  } catch ({ message }) {
    return `🙀 ${message}`;
  }
};

const provideCodeLenses = (document: TextDocument) => {
  const project = new Project({ compilerOptions: RECOMMENDED_NODE_12_COMPILER_OPTIONS });
  const file = project.createSourceFile(
    '/tmp/vscode-instantcode/eval.ts',
    document.getText(),
  );
  const compiledJs = project.emitToMemory({ targetSourceFile: file }).getFiles()[0].text;

  const generatedExpressions = generateExpressions(file);

  const codeLensDetails = generatedExpressions.map((e) => ({
    title: `${e.sourceCode} => ${evaluateExpression(e, compiledJs)}`,
    position: document.positionAt(e.position),
  }));

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
