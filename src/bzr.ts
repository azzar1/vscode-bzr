/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Andrea Azzarone. All rights reserved.
 *  Original Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as cp from 'child_process';
import * as path from 'path';
import { EventEmitter } from 'events';
import iconv = require('iconv-lite');
import { assign, /*uniqBy, groupBy, denodeify,*/ IDisposable, toDisposable, dispose, mkdirp } from './util';

export interface IBzr {
  path: string;
  version: string;
}

export interface IFileStatus {
  x: string;
  y: string;
  exe: string;
  path: string;
  rename?: string;
}

function parseVersion(raw: string): string {
  return raw;
}

function findSpecificBzr(path: string): Promise<IBzr> {
  return new Promise<IBzr>((c, e) => {
    const buffers: Buffer[] = [];
    const child = cp.spawn(path, ['version', '--short']);
    child.stdout.on('data', (b: Buffer) => buffers.push(b));
    child.on('error', e);
    child.on('exit', code => code ? e(new Error('Not found')) : c({ path, version: parseVersion(Buffer.concat(buffers).toString('utf8').trim()) }));
  });
}

function findBzrDarwin(): Promise<IBzr> {
  return Promise.reject<IBzr>('Platform not supported');
}

function findBzrWin32(): Promise<IBzr> {
  return Promise.reject<IBzr>('Platform not supported');
}

export function findBzr(hint: string | undefined): Promise<IBzr> {
  var first = hint ? findSpecificBzr(hint) : Promise.reject<IBzr>(null);

  return first.then(void 0, () => {
    switch (process.platform) {
      case 'darwin': return findBzrDarwin();
      case 'win32': return findBzrWin32();
      default: return findSpecificBzr('bzr');
    }
  });
}

export interface IExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function exec(child: cp.ChildProcess, options: any = {}): Promise<IExecutionResult> {
  if (!child.stdout || !child.stderr) {
    throw new BzrError({
      message: 'Failed to get stdout or stderr from git process.'
    });
  }

  const disposables: IDisposable[] = [];

  const once = (ee: NodeJS.EventEmitter, name: string, fn: Function) => {
    ee.once(name, fn);
    disposables.push(toDisposable(() => ee.removeListener(name, fn)));
  };

  const on = (ee: NodeJS.EventEmitter, name: string, fn: Function) => {
    ee.on(name, fn);
    disposables.push(toDisposable(() => ee.removeListener(name, fn)));
  };

  let encoding = options.encoding || 'utf8';
  encoding = iconv.encodingExists(encoding) ? encoding : 'utf8';

  const [exitCode, stdout, stderr] = await Promise.all<any>([
    new Promise<number>((c, e) => {
      once(child, 'error', e);
      once(child, 'exit', c);
    }),
    new Promise<string>(c => {
      const buffers: Buffer[] = [];
      on(child.stdout, 'data', b => buffers.push(b));
      once(child.stdout, 'close', () => c(iconv.decode(Buffer.concat(buffers), encoding)));
    }),
    new Promise<string>(c => {
      const buffers: Buffer[] = [];
      on(child.stderr, 'data', b => buffers.push(b));
      once(child.stderr, 'close', () => c(Buffer.concat(buffers).toString('utf8')));
    })
  ]);

  dispose(disposables);

  return { exitCode, stdout, stderr };
}

export interface IBzrErrorData {
  error?: Error;
  message?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  bzrErrorCode?: string;
  bzrCommand?: string;
}

export class BzrError {

  error?: Error;
  message: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  bzrErrorCode?: string;
  bzrCommand?: string;

  constructor(data: IBzrErrorData) {
    if (data.error) {
      this.error = data.error;
      this.message = data.error.message;
    } else {
      this.error = void 0;
    }

    this.message = this.message || data.message || 'Bzr error';
    this.stdout = data.stdout;
    this.stderr = data.stderr;
    this.exitCode = data.exitCode;
    this.bzrErrorCode = data.bzrErrorCode;
    this.bzrCommand = data.bzrCommand;
  }

  toString(): string {
    let result = this.message + ' ' + JSON.stringify({
      exitCode: this.exitCode,
      bzrErrorCode: this.bzrErrorCode,
      bzrCommand: this.bzrCommand,
      stdout: this.stdout,
      stderr: this.stderr
    }, [], 2);

    if (this.error) {
      result += (<any>this.error).stack;
    }

    return result;
  }
}

export interface IBzrOptions {
  bzrPath: string;
  version: string;
}

export const BzrErrorCodes = {
  // BadConfigFile: 'BadConfigFile',
  // AuthenticationFailed: 'AuthenticationFailed',
  NoUserNameConfigured: 'NoUserNameConfigured',
  // NoUserEmailConfigured: 'NoUserEmailConfigured',
  // NoRemoteRepositorySpecified: 'NoRemoteRepositorySpecified',
  NotABzrRepository: 'NotABzrRepository',
  // NotAtRepositoryRoot: 'NotAtRepositoryRoot',
  // Conflict: 'Conflict',
  // UnmergedChanges: 'UnmergedChanges',
  // PushRejected: 'PushRejected',
  // RemoteConnectionError: 'RemoteConnectionError',
  // DirtyWorkTree: 'DirtyWorkTree',
  // CantOpenResource: 'CantOpenResource',
  // GitNotFound: 'GitNotFound',
  // CantCreatePipe: 'CantCreatePipe',
  // CantAccessRemote: 'CantAccessRemote',
  // RepositoryNotFound: 'RepositoryNotFound',
  RepositoryIsLocked: 'RepositoryIsLocked',
  // BranchNotFullyMerged: 'BranchNotFullyMerged',
  // NoRemoteReference: 'NoRemoteReference',
  // NoLocalChanges: 'NoLocalChanges',
  // NoStashFound: 'NoStashFound',
  // LocalChangesOverwritten: 'LocalChangesOverwritten'
};

function getBzrErrorCode(stderr: string): string | undefined {
  if (/Not a branch/.test(stderr)) {
    return BzrErrorCodes.NotABzrRepository;
  } else if (/Unable to obtain lock file/.test(stderr)) {
    return BzrErrorCodes.RepositoryIsLocked;
  } else if (/You have not informed bzr of your Launchpad ID/) {
    return BzrErrorCodes.NoUserNameConfigured;
  }
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

export class Bzr {

  private bzrPath: string;
  private version: string;
  //private env: any;

  private _onOutput = new EventEmitter();
  get onOutput(): EventEmitter { return this._onOutput; }

  constructor(options: IBzrOptions) {
    this.bzrPath = options.bzrPath;
    this.version = options.version;
    //this.env = options.env || {};
  }

  open(repository: string): Repository {
    return new Repository(this, repository);
  }

  async init(repository: string): Promise<void> {
    await this.exec(repository, ['init']);
    return;
  }

  async clone(url: string, folderName: string, parentPath: string): Promise<string> {
    const folderPath = path.join(parentPath, folderName);

    await mkdirp(parentPath);
    await this.exec(parentPath, ['branch', url, folderPath]);
    return folderPath;
  }

  async getRepositoryRoot(path: string): Promise<string> {
    const result = await this.exec(path, ['root']);
    return result.stdout.trim();
  }

  async exec(cwd: string, args: string[], options: any = {}): Promise<IExecutionResult> {
    options = assign({ cwd }, options || {});
    return await this._exec(args, options);
  }

  stream(cwd: string, args: string[], options: any = {}): cp.ChildProcess {
    options = assign({ cwd }, options || {});
    return this.spawn(args, options);
  }

  private async _exec(args: string[], options: any = {}): Promise<IExecutionResult> {
    const child = this.spawn(args, options);

    if (options.input) {
      child.stdin.end(options.input, 'utf8');
    }

    const result = await exec(child, options);

    if (options.log !== false && result.stderr.length > 0) {
      this.log(`${result.stderr}\n`);
    }

    if (result.exitCode) {
      return Promise.reject<IExecutionResult>(new BzrError({
        message: 'Failed to execute bzr',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        bzrErrorCode: getBzrErrorCode(result.stderr),
        bzrCommand: args[0]
      }));
    }

    return result;
  }

  spawn(args: string[], options: any = {}): cp.ChildProcess {
    if (!this.bzrPath) {
      throw new Error('bzr could not be found in the system.');
    }

    if (!options) {
      options = {};
    }

    if (!options.stdio && !options.input) {
      options.stdio = ['ignore', null, null]; // Unless provided, ignore stdin and leave default streams for stdout and stderr
    }

    options.env = assign({}, process.env /*, this.env*/, options.env || {}, {
      VSCODE_BZR_COMMAND: args[0],
      LC_ALL: 'en_US.UTF-8',
      LANG: 'en_US.UTF-8'
    });

    if (options.log !== false) {
      this.log(`bzr ${args.join(' ')}\n`);
    }

    return cp.spawn(this.bzrPath, args, options);
  }

  private log(output: string): void {
    this._onOutput.emit('log', output);
  }
}

export class BzrStatusParser {

  private lastRaw = '';
  private result: IFileStatus[] = [];

  get status(): IFileStatus[] {
    return this.result;
  }

  update(raw: string): void {
    let i = 0;
    let nextI: number | undefined;

    raw = this.lastRaw + raw;

    while ((nextI = this.parseEntry(raw, i)) !== undefined) {
      i = nextI;
    }

    this.lastRaw = raw.substr(i);
  }

  private parseEntry(raw: string, i: number): number | undefined {
    if (i + 4 >= raw.length) {
      return;
    }

    let lastIndex: number;
    const entry: IFileStatus = {
      x: raw.charAt(i++),
      y: raw.charAt(i++),
      exe: raw.charAt(i++),
      rename: undefined,
      path: ''
    };

    // space
    i++;

    if (entry.x === 'R' || entry.x === 'K') {
      lastIndex = raw.indexOf(' => ', i);

      if (lastIndex === -1) {
        return;
      }

      entry.path = raw.substring(i, lastIndex);
      i = lastIndex + 4;

      lastIndex = raw.indexOf('\n', i);

      if (lastIndex === -1) {
        return;
      }

      entry.rename = raw.substring(i, lastIndex);
    } else {
      lastIndex = raw.indexOf('\n', i);

      if (lastIndex === -1) {
        return;
      }

      entry.path = raw.substring(i, lastIndex);
    }

    this.result.push(entry);

    return lastIndex + 1;
  }
}


export class Repository {

  constructor(
    private _bzr: Bzr,
    private repositoryRoot: string
  ) { }

  get bzr(): Bzr {
    return this._bzr;
  }

  get root(): string {
    return this.repositoryRoot;
  }

  stream(args: string[], options: any = {}): cp.ChildProcess {
    return this.bzr.stream(this.repositoryRoot, args, options);
  }

  async buffer(object: string, ref: string, encoding: string = 'utf8'): Promise<string> {
    const child = this.stream(['cat', object, '-r', ref]);

    if (!child.stdout) {
      return Promise.reject<string>('Can\'t open file from bzr');
    }

    const { exitCode, stdout } = await exec(child, { encoding });

    if (exitCode) {
      return Promise.reject<string>(new BzrError({
        message: 'Could not show object.',
        exitCode
      }));
    }

    return stdout;
  }

  getStatus(limit = 5000): Promise<{ status: IFileStatus[]; didHitLimit: boolean; }> {
    return new Promise<{ status: IFileStatus[]; didHitLimit: boolean; }>((c, e) => {
      const parser = new BzrStatusParser();
      const child = this.stream(['status', '-S', '--no-classify']);

      const onExit = exitCode => {
        if (exitCode !== 0) {
          const stderr = stderrData.join('');
          return e(new BzrError({
            message: 'Failed to execute bzr',
            stderr,
            exitCode,
            bzrErrorCode: getBzrErrorCode(stderr),
            bzrCommand: 'status'
          }));
        }

        c({ status: parser.status, didHitLimit: false });
      };

      const onStdoutData = (raw: string) => {
        parser.update(raw);

        if (parser.status.length > 5000) {
          child.removeListener('exit', onExit);
          child.stdout.removeListener('data', onStdoutData);
          child.kill();

          c({ status: parser.status.slice(0, 5000), didHitLimit: true });
        }
      };

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', onStdoutData);

      const stderrData: string[] = [];
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', raw => stderrData.push(raw as string));

      child.on('error', e);
      child.on('exit', onExit);
    });
  }
}
