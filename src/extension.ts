import { ExtensionContext, languages, CodeLens, Range } from 'vscode';
import { runInNewContext } from 'vm';
import { Project } from 'ts-morph';

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
        const args = func.getParameters().map(() => 5);
        const sourceCode = `${func.getName() || ''}(${args.join(', ')})`;
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
