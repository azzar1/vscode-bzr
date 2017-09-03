/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Andrea Azzarone. All rights reserved.
 *  Original Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri } from 'vscode';

export function fromBzrUri(uri: Uri): { path: string; ref: string; } {
  return JSON.parse(uri.query);
}

export function toBzrUri(uri: Uri, ref: string, replaceFileExtension = false): Uri {
  return uri.with({
    scheme: 'bzr',
    path: replaceFileExtension ? `${uri.path}.bzr` : uri.path,
    query: JSON.stringify({
      path: uri.fsPath,
      ref
    })
  });
}
