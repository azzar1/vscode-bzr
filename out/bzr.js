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
const cp = require("child_process");
const events_1 = require("events");
const iconv = require("iconv-lite");
const util_1 = require("./util");
function parseVersion(raw) {
    return raw;
}
function findSpecificBzr(path) {
    return new Promise((c, e) => {
        const buffers = [];
        const child = cp.spawn(path, ['version', '--short']);
        child.stdout.on('data', (b) => buffers.push(b));
        child.on('error', e);
        child.on('exit', code => code ? e(new Error('Not found')) : c({ path, version: parseVersion(Buffer.concat(buffers).toString('utf8').trim()) }));
    });
}
function findBzrDarwin() {
    return Promise.reject('Platform not supported');
}
function findBzrWin32() {
    return Promise.reject('Platform not supported');
}
function findBzr(hint) {
    var first = hint ? findSpecificBzr(hint) : Promise.reject(null);
    return first.then(void 0, () => {
        switch (process.platform) {
            case 'darwin': return findBzrDarwin();
            case 'win32': return findBzrWin32();
            default: return findSpecificBzr('bzr');
        }
    });
}
exports.findBzr = findBzr;
function exec(child, options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!child.stdout || !child.stderr) {
            throw new BzrError({
                message: 'Failed to get stdout or stderr from git process.'
            });
        }
        const disposables = [];
        const once = (ee, name, fn) => {
            ee.once(name, fn);
            disposables.push(util_1.toDisposable(() => ee.removeListener(name, fn)));
        };
        const on = (ee, name, fn) => {
            ee.on(name, fn);
            disposables.push(util_1.toDisposable(() => ee.removeListener(name, fn)));
        };
        let encoding = options.encoding || 'utf8';
        encoding = iconv.encodingExists(encoding) ? encoding : 'utf8';
        const [exitCode, stdout, stderr] = yield Promise.all([
            new Promise((c, e) => {
                once(child, 'error', e);
                once(child, 'exit', c);
            }),
            new Promise(c => {
                const buffers = [];
                on(child.stdout, 'data', b => buffers.push(b));
                once(child.stdout, 'close', () => c(iconv.decode(Buffer.concat(buffers), encoding)));
            }),
            new Promise(c => {
                const buffers = [];
                on(child.stderr, 'data', b => buffers.push(b));
                once(child.stderr, 'close', () => c(Buffer.concat(buffers).toString('utf8')));
            })
        ]);
        util_1.dispose(disposables);
        return { exitCode, stdout, stderr };
    });
}
class BzrError {
    constructor(data) {
        if (data.error) {
            this.error = data.error;
            this.message = data.error.message;
        }
        else {
            this.error = void 0;
        }
        this.message = this.message || data.message || 'Bzr error';
        this.stdout = data.stdout;
        this.stderr = data.stderr;
        this.exitCode = data.exitCode;
        this.bzrErrorCode = data.bzrErrorCode;
        this.bzrCommand = data.bzrCommand;
    }
    toString() {
        let result = this.message + ' ' + JSON.stringify({
            exitCode: this.exitCode,
            bzrErrorCode: this.bzrErrorCode,
            bzrCommand: this.bzrCommand,
            stdout: this.stdout,
            stderr: this.stderr
        }, [], 2);
        if (this.error) {
            result += this.error.stack;
        }
        return result;
    }
}
exports.BzrError = BzrError;
exports.BzrErrorCodes = {
    // BadConfigFile: 'BadConfigFile',
    // AuthenticationFailed: 'AuthenticationFailed',
    // NoUserNameConfigured: 'NoUserNameConfigured',
    // NoUserEmailConfigured: 'NoUserEmailConfigured',
    // NoRemoteRepositorySpecified: 'NoRemoteRepositorySpecified',
    NotABzrRepository: 'NotABzrRepository',
};
function getBzrErrorCode(stderr) {
    if (/Not a branch/.test(stderr)) {
        return exports.BzrErrorCodes.NotABzrRepository;
    }
    // if (/Another git process seems to be running in this repository|If no other git process is currently running/.test(stderr)) {
    // 	return GitErrorCodes.RepositoryIsLocked;
    // } else if (/Authentication failed/.test(stderr)) {
    // 	return GitErrorCodes.AuthenticationFailed;
    // } else if (/Not a git repository/.test(stderr)) {
    // 	return GitErrorCodes.NotAGitRepository;
    // } else if (/bad config file/.test(stderr)) {
    // 	return GitErrorCodes.BadConfigFile;
    // } else if (/cannot make pipe for command substitution|cannot create standard input pipe/.test(stderr)) {
    // 	return GitErrorCodes.CantCreatePipe;
    // } else if (/Repository not found/.test(stderr)) {
    // 	return GitErrorCodes.RepositoryNotFound;
    // } else if (/unable to access/.test(stderr)) {
    // 	return GitErrorCodes.CantAccessRemote;
    // } else if (/branch '.+' is not fully merged/.test(stderr)) {
    // 	return GitErrorCodes.BranchNotFullyMerged;
    // } else if (/Couldn\'t find remote ref/.test(stderr)) {
    // 	return GitErrorCodes.NoRemoteReference;
    // }
    return void 0;
}
class Bzr {
    constructor(options) {
        //private env: any;
        this._onOutput = new events_1.EventEmitter();
        this.bzrPath = options.bzrPath;
        this.version = options.version;
        //this.env = options.env || {};
    }
    get onOutput() { return this._onOutput; }
    open(repository) {
        return new Repository(this, repository);
    }
    init(repository) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.exec(repository, ['init']);
            return;
        });
    }
    getRepositoryRoot(path) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.exec(path, ['root']);
            return result.stdout.trim();
        });
    }
    exec(cwd, args, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            options = util_1.assign({ cwd }, options || {});
            return yield this._exec(args, options);
        });
    }
    // stream(cwd: string, args: string[], options: any = {}): cp.ChildProcess {
    //   options = assign({ cwd }, options || {});
    //   return this.spawn(args, options);
    // }
    _exec(args, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const child = this.spawn(args, options);
            if (options.input) {
                child.stdin.end(options.input, 'utf8');
            }
            const result = yield exec(child, options);
            if (options.log !== false && result.stderr.length > 0) {
                this.log(`${result.stderr}\n`);
            }
            if (result.exitCode) {
                return Promise.reject(new BzrError({
                    message: 'Failed to execute bzr',
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    bzrErrorCode: getBzrErrorCode(result.stderr),
                    bzrCommand: args[0]
                }));
            }
            return result;
        });
    }
    spawn(args, options = {}) {
        if (!this.bzrPath) {
            throw new Error('bzr could not be found in the system.');
        }
        if (!options) {
            options = {};
        }
        if (!options.stdio && !options.input) {
            options.stdio = ['ignore', null, null]; // Unless provided, ignore stdin and leave default streams for stdout and stderr
        }
        options.env = util_1.assign({}, process.env /*, this.env*/, options.env || {}, {
            VSCODE_BZR_COMMAND: args[0],
            LC_ALL: 'en_US.UTF-8',
            LANG: 'en_US.UTF-8'
        });
        if (options.log !== false) {
            this.log(`bzr ${args.join(' ')}\n`);
        }
        return cp.spawn(this.bzrPath, args, options);
    }
    log(output) {
        this._onOutput.emit('log', output);
    }
}
exports.Bzr = Bzr;
class Repository {
    constructor(_bzr, repositoryRoot) {
        this._bzr = _bzr;
        this.repositoryRoot = repositoryRoot;
    }
    get bzr() {
        return this._bzr;
    }
    get root() {
        return this.repositoryRoot;
    }
}
exports.Repository = Repository;
