import { ExtensionContext, languages, CodeLens, Range } from 'vscode';
import { Project } from 'ts-morph';

export const activate = (context: ExtensionContext) => {
  const disposable = languages.registerCodeLensProvider('typescript', {
    provideCodeLenses: async (document) => {
      const project = new Project();
      const file = project.createSourceFile(
        `/tmp/vscode-instantcode${document.uri.fsPath}`,
        document.getText(),
      );
      const functions = file.getFunctions();

      const functionRuns = functions.map((func) => ({
        func,
        args: func.getParameters().map(() => 2),
        result: 5,
      }));

      const codeLensDetails = functionRuns.map(({ func, args, result }) => ({
        title: `${func.getName() || ''}(${args.join(', ')}) => ${result}`,
        position: document.positionAt(func.getEnd()).translate(1),
      }));

      return codeLensDetails.map(({ title, position }) =>
        new CodeLens(new Range(position, position), { title, command: '' }),
      );
    },
  });

  context.subscriptions.push(disposable);
};
