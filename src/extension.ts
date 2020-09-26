import { ExtensionContext, languages, CodeLens, Range } from 'vscode';
import { runInNewContext } from 'vm';
import { Node, ParameterDeclaration, printNode, Project, ts, createWrappedNode } from 'ts-morph';
import { random } from 'faker';

const { factory, getJSDocType } = ts;

const generateArgument = (parameter: ParameterDeclaration) => {
  const compilerType = parameter.getType().isAny()
    && getJSDocType(parameter.compilerNode)
    || parameter.getTypeNode()?.compilerNode;

  if (!compilerType) {
    return random.boolean()
      ? factory.createStringLiteral(random.words())
      : factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
  }

  const type = createWrappedNode(compilerType);

  switch (true) {
    case Node.isStringKeyword(type): return factory.createStringLiteral(random.words());
    case Node.isNumberKeyword(type): return factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
    case Node.isBooleanKeyword(type): return random.boolean() ? factory.createTrue() : factory.createFalse();
    default: return factory.createIdentifier('undefined');
  }
};

export const activate = (context: ExtensionContext) => {
  const disposable = languages.registerCodeLensProvider(['typescript', 'javascript'], {
    provideCodeLenses: async (document) => {
      const project = new Project();
      const file = project.createSourceFile(
        '/tmp/vscode-instantcode/eval.ts',
        document.getText(),
      );
      const functions = file.getFunctions();
      const compiledJs = project.emitToMemory({ targetSourceFile: file }).getFiles()[0].text;

      const functionCalls = functions.map((func) => {
        const args = func.getParameters().map(generateArgument);
        const callExpression = factory.createCallExpression(func.getNameNodeOrThrow().compilerNode, undefined, args);
        const sourceCode = printNode(callExpression);
        const result = runInNewContext(`${compiledJs}; ${sourceCode}`);
        return { func, sourceCode, result };
      });

      const codeLensDetails = functionCalls.map(({ func, sourceCode, result }) => ({
        title: `${sourceCode} => ${JSON.stringify(result, null, 1)}`,
        position: document.positionAt(func.getEnd()).translate(1),
      }));

      return codeLensDetails.map(({ title, position }) =>
        new CodeLens(new Range(position, position), { title, command: '' }),
      );
    },
  });

  context.subscriptions.push(disposable);
};
