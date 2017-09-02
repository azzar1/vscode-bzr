/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Andrea Azzarone. All rights reserved.
 *  Original Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const nls = require("vscode-nls");
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();
const vscode_1 = require("vscode");
const bzr_1 = require("./bzr");
const model_1 = require("./model");
const commands_1 = require("./commands");
const contentProvider_1 = require("./contentProvider");
const util_1 = require("./util");
function init(context, disposables) {
    return __awaiter(this, void 0, void 0, function* () {
        const outputChannel = vscode_1.window.createOutputChannel('Bzr');
        disposables.push(outputChannel);
        const config = vscode_1.workspace.getConfiguration('bzr');
        const enabled = config.get('enabled') === true;
        const pathHint = vscode_1.workspace.getConfiguration('bzr').get('path');
        const info = yield bzr_1.findBzr(pathHint);
        const bzr = new bzr_1.Bzr({ bzrPath: info.path, version: info.version });
        const model = new model_1.Model(bzr);
        disposables.push(model);
        const onRepository = () => vscode_1.commands.executeCommand('setContext', 'bzrOpenRepositoryCount', `${model.repositories.length}`);
        model.onDidOpenRepository(onRepository, null, disposables);
        model.onDidCloseRepository(onRepository, null, disposables);
        onRepository();
        outputChannel.appendLine(enabled.toString());
        if (!enabled) {
            const commandCenter = new commands_1.CommandCenter(bzr, model, outputChannel);
            disposables.push(commandCenter);
            return;
        }
        outputChannel.appendLine(localize('using bzr', "Using bzr {0} from {1}", info.version, info.path));
        const onOutput = str => outputChannel.append(str);
        bzr.onOutput.addListener('log', onOutput);
        disposables.push(util_1.toDisposable(() => bzr.onOutput.removeListener('log', onOutput)));
        disposables.push(new commands_1.CommandCenter(bzr, model, outputChannel), new contentProvider_1.BzrContentProvider(model));
    });
}
function activate(context) {
    const disposables = [];
    context.subscriptions.push(new vscode_1.Disposable(() => vscode_1.Disposable.from(...disposables).dispose()));
    init(context, disposables)
        .catch(err => console.error(err));
}
exports.activate = activate;
