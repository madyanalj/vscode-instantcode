import { ExtensionContext, languages, CodeLens, Range } from 'vscode';
import { runInNewContext } from 'vm';
import { ParameterDeclaration, printNode, Project, ts } from 'ts-morph';
import { random } from 'faker';

const { factory } = ts;

const generateArgument = (parameter: ParameterDeclaration) => {
  switch (true) {
    case parameter.getType().isString(): return factory.createStringLiteral(random.words());
    case parameter.getType().isNumber(): return factory.createNumericLiteral(random.number({ min: -5, max: 5 }));
    case parameter.getType().isBoolean(): return random.boolean() ? factory.createTrue() : factory.createFalse();
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
