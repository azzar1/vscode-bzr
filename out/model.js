/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Andrea Azzarone. All rights reserved.
 *  Original Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const repository_1 = require("./repository");
const decorators_1 = require("./decorators");
const util_1 = require("./util");
const bzr_1 = require("./bzr");
const path = require("path");
const fs = require("fs");
const nls = require("vscode-nls");
const localize = nls.loadMessageBundle();
class RepositoryPick {
    constructor(repository) {
        this.repository = repository;
    }
    get label() { return path.basename(this.repository.root); }
    get description() { return path.dirname(this.repository.root); }
}
__decorate([
    decorators_1.memoize
], RepositoryPick.prototype, "label", null);
__decorate([
    decorators_1.memoize
], RepositoryPick.prototype, "description", null);
class Model {
    constructor(bzr) {
        this.bzr = bzr;
        this._onDidOpenRepository = new vscode_1.EventEmitter();
        this.onDidOpenRepository = this._onDidOpenRepository.event;
        this._onDidCloseRepository = new vscode_1.EventEmitter();
        this.onDidCloseRepository = this._onDidCloseRepository.event;
        this._onDidChangeRepository = new vscode_1.EventEmitter();
        this.onDidChangeRepository = this._onDidChangeRepository.event;
        this.openRepositories = [];
        this.possibleBzrRepositoryPaths = new Set();
        this.enabled = false;
        this.disposables = [];
        const config = vscode_1.workspace.getConfiguration('bzr');
        this.enabled = config.get('enabled') === true;
        this.configurationChangeDisposable = vscode_1.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this);
        if (this.enabled) {
            this.enable();
        }
    }
    get repositories() { return this.openRepositories.map(r => r.repository); }
    onDidChangeConfiguration() {
        const config = vscode_1.workspace.getConfiguration('bzr');
        const enabled = config.get('enabled') === true;
        if (enabled === this.enabled) {
            return;
        }
        this.enabled = enabled;
        if (enabled) {
            this.enable();
        }
        else {
            this.disable();
        }
    }
    enable() {
        vscode_1.workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders, this, this.disposables);
        this.onDidChangeWorkspaceFolders({ added: vscode_1.workspace.workspaceFolders || [], removed: [] });
        vscode_1.window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors, this, this.disposables);
        this.onDidChangeVisibleTextEditors(vscode_1.window.visibleTextEditors);
        const fsWatcher = vscode_1.workspace.createFileSystemWatcher('**');
        this.disposables.push(fsWatcher);
        const onWorkspaceChange = util_1.anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
        const onBzrRepositoryChange = util_1.filterEvent(onWorkspaceChange, uri => /\/\.bzr\//.test(uri.path));
        const onPossibleBzrRepositoryChange = util_1.filterEvent(onBzrRepositoryChange, uri => !this.getRepository(uri));
        onPossibleBzrRepositoryChange(this.onPossibleBzrRepositoryChange, this, this.disposables);
        this.scanWorkspaceFolders();
    }
    disable() {
        const openRepositories = [...this.openRepositories];
        openRepositories.forEach(r => r.dispose());
        this.openRepositories = [];
        this.possibleBzrRepositoryPaths.clear();
        this.disposables = util_1.dispose(this.disposables);
    }
    /**
     * Scans the first level of each workspace folder, looking
     * for bzr repositories.
     */
    scanWorkspaceFolders() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const folder of vscode_1.workspace.workspaceFolders || []) {
                const root = folder.uri.fsPath;
                const children = yield new Promise((c, e) => fs.readdir(root, (err, r) => err ? e(err) : c(r)));
                children
                    .filter(child => child !== '.bzr')
                    .forEach(child => this.tryOpenRepository(path.join(root, child)));
            }
        });
    }
    onPossibleBzrRepositoryChange(uri) {
        const possibleBzrRepositoryPath = uri.fsPath.replace(/\.bzr.*$/, '');
        this.possibleBzrRepositoryPaths.add(possibleBzrRepositoryPath);
        this.eventuallyScanPossibleBzrRepositories();
    }
    eventuallyScanPossibleBzrRepositories() {
        for (const path of this.possibleBzrRepositoryPaths) {
            this.tryOpenRepository(path);
        }
        this.possibleBzrRepositoryPaths.clear();
    }
    onDidChangeWorkspaceFolders({ added, removed }) {
        return __awaiter(this, void 0, void 0, function* () {
            const possibleRepositoryFolders = added
                .filter(folder => !this.getOpenRepository(folder.uri));
            const activeRepositoriesList = vscode_1.window.visibleTextEditors
                .map(editor => this.getRepository(editor.document.uri))
                .filter(repository => !!repository);
            const activeRepositories = new Set(activeRepositoriesList);
            const openRepositoriesToDispose = removed
                .map(folder => this.getOpenRepository(folder.uri))
                .filter(r => !!r && !activeRepositories.has(r.repository));
            possibleRepositoryFolders.forEach(p => this.tryOpenRepository(p.uri.fsPath));
            openRepositoriesToDispose.forEach(r => r.dispose());
        });
    }
    onDidChangeVisibleTextEditors(editors) {
        editors.forEach(editor => {
            const uri = editor.document.uri;
            if (uri.scheme !== 'file') {
                return;
            }
            const repository = this.getRepository(uri);
            if (repository) {
                return;
            }
            this.tryOpenRepository(path.dirname(uri.fsPath));
        });
    }
    tryOpenRepository(path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.getRepository(path)) {
                return;
            }
            try {
                const repositoryRoot = yield this.bzr.getRepositoryRoot(path);
                // This can happen whenever `path` has the wrong case sensitivity in
                // case insensitive file systems
                // https://github.com/Microsoft/vscode/issues/33498
                if (this.getRepository(repositoryRoot)) {
                    return;
                }
                const repository = new repository_1.Repository(this.bzr.open(repositoryRoot));
                this.open(repository);
            }
            catch (err) {
                if (err.bzrErrorCode === bzr_1.BzrErrorCodes.NotABzrRepository) {
                    return;
                }
                //console.error('Failed to find repository:', err);
            }
        });
    }
    open(repository) {
        const onDidDisappearRepository = util_1.filterEvent(repository.onDidChangeState, state => state === repository_1.RepositoryState.Disposed);
        const disappearListener = onDidDisappearRepository(() => dispose());
        const changeListener = repository.onDidChangeRepository(uri => this._onDidChangeRepository.fire({ repository, uri }));
        const dispose = () => {
            disappearListener.dispose();
            changeListener.dispose();
            repository.dispose();
            this.openRepositories = this.openRepositories.filter(e => e !== openRepository);
            this._onDidCloseRepository.fire(repository);
        };
        const openRepository = { repository, dispose };
        this.openRepositories.push(openRepository);
        this._onDidOpenRepository.fire(repository);
    }
    pickRepository() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.openRepositories.length === 0) {
                throw new Error(localize('no repositories', "There are no available repositories"));
            }
            const picks = this.openRepositories.map(e => new RepositoryPick(e.repository));
            const placeHolder = localize('pick repo', "Choose a repository");
            const pick = yield vscode_1.window.showQuickPick(picks, { placeHolder });
            return pick && pick.repository;
        });
    }
    getRepository(hint) {
        const liveRepository = this.getOpenRepository(hint);
        return liveRepository && liveRepository.repository;
    }
    getOpenRepository(hint) {
        if (!hint) {
            return undefined;
        }
        if (hint instanceof repository_1.Repository) {
            return this.openRepositories.filter(r => r.repository === hint)[0];
        }
        if (typeof hint === 'string') {
            hint = vscode_1.Uri.file(hint);
        }
        if (hint instanceof vscode_1.Uri) {
            const resourcePath = hint.fsPath;
            for (const liveRepository of this.openRepositories) {
                const relativePath = path.relative(liveRepository.repository.root, resourcePath);
                if (!/^\.\./.test(relativePath)) {
                    return liveRepository;
                }
            }
            return undefined;
        }
        for (const liveRepository of this.openRepositories) {
            const repository = liveRepository.repository;
            if (hint === repository.sourceControl) {
                return liveRepository;
            }
            if (hint === repository.mergeGroup || hint === repository.indexGroup || hint === repository.workingTreeGroup) {
                return liveRepository;
            }
        }
        return undefined;
    }
    dispose() {
        this.disable();
        this.configurationChangeDisposable.dispose();
    }
}
__decorate([
    decorators_1.debounce(500)
], Model.prototype, "eventuallyScanPossibleBzrRepositories", null);
__decorate([
    decorators_1.sequentialize
], Model.prototype, "tryOpenRepository", null);
exports.Model = Model;
