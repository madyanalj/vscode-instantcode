import { ExtensionContext, languages, CodeLens, Range, TextDocument } from 'vscode';
import { runInNewContext } from 'vm';
import { Node, ParameterDeclaration, printNode, Project, ts, createWrappedNode, SourceFile, TypeNode } from 'ts-morph';
import { random } from 'faker';

const { factory, getJSDocType } = ts;

const generateArgumentByTypeNode = (type: TypeNode) => {
  switch (true) {
    case Node.isStringKeyword(type): return factory.createStringLiteral(random.words());
    case Node.isNumberKeyword(type): return factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
    case Node.isBooleanKeyword(type): return random.boolean() ? factory.createTrue() : factory.createFalse();
    default: return factory.createIdentifier('undefined');
  }
};

const generateArgumentByParameterDeclaration = (parameter: ParameterDeclaration) => {
  const compilerType = parameter.getType().isAny()
    && getJSDocType(parameter.compilerNode)
    || parameter.getTypeNode()?.compilerNode;

  if (!compilerType) {
    return random.boolean()
      ? factory.createStringLiteral(random.words())
      : factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
  }

  return generateArgumentByTypeNode(createWrappedNode(compilerType));
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
