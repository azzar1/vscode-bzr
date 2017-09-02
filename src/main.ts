/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Andrea Azzarone. All rights reserved.
 *  Original Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vscode-nls';
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();
import { ExtensionContext, workspace, window, Disposable, commands, Uri } from 'vscode';
import { findBzr, Bzr, IBzr } from './bzr';
import { Model } from './model';
import { CommandCenter } from './commands';
import { BzrContentProvider } from './contentProvider';
import { toDisposable } from './util';

async function init(context: ExtensionContext, disposables: Disposable[]): Promise<void> {
  const outputChannel = window.createOutputChannel('Bzr');
  disposables.push(outputChannel);

  const config = workspace.getConfiguration('bzr');
  const enabled = config.get<boolean>('enabled') === true;
  const pathHint = workspace.getConfiguration('bzr').get<string>('path');
  const info = await findBzr(pathHint);

  const bzr = new Bzr({ bzrPath: info.path, version: info.version });
  const model = new Model(bzr);
  disposables.push(model);

  const onRepository = () => commands.executeCommand('setContext', 'bzrOpenRepositoryCount', `${model.repositories.length}`);
  model.onDidOpenRepository(onRepository, null, disposables);
  model.onDidCloseRepository(onRepository, null, disposables);
  onRepository();

  outputChannel.appendLine(enabled.toString());

  if (!enabled) {
    const commandCenter = new CommandCenter(bzr, model, outputChannel);
    disposables.push(commandCenter);
    return;
  }

  outputChannel.appendLine(localize('using bzr', "Using bzr {0} from {1}", info.version, info.path));

  const onOutput = str => outputChannel.append(str);
  bzr.onOutput.addListener('log', onOutput);
  disposables.push(toDisposable(() => bzr.onOutput.removeListener('log', onOutput)));

  disposables.push(
    new CommandCenter(bzr, model, outputChannel),
    new BzrContentProvider(model),
  );
}

export function activate(context: ExtensionContext): any {
  const disposables: Disposable[] = [];
  context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

  init(context, disposables)
    .catch(err => console.error(err));
}
