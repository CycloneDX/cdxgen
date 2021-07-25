/*
 * This file is part of CycloneDX Node Module.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) OWASP Foundation. All Rights Reserved.
 */
const ssri = require('ssri');
const Hash = require('./Hash');

class HashList {

  constructor(pkg) {
    this._hashes = [];
    if (pkg) {
      this.processHashes(pkg);
    }
  }

  get hashes() {
    return this._hashes;
  }

  set hashes(value) {
    if (!Array.isArray(value)) {
      throw "HashList value must be an array of Hash objects";
    } else {
      this._hashes = value;
    }
  }

  processHashes(pkg) {
    if (pkg._shasum) {
      this._hashes.push(new Hash("SHA-1", pkg._shasum));
    } else if (pkg._integrity) {
      let integrity = ssri.parse(pkg._integrity);
      // Components may have multiple hashes with various lengths. Check each one
      // that is supported by the CycloneDX specification.
      if (integrity.hasOwnProperty('sha512')) {
        this._hashes.push(this.createHash('SHA-512', integrity.sha512[0].digest));
      }
      if (integrity.hasOwnProperty('sha384')) {
        this._hashes.push(this.createHash('SHA-384', integrity.sha384[0].digest));
      }
      if (integrity.hasOwnProperty('sha256')) {
        this._hashes.push(this.createHash('SHA-256', integrity.sha256[0].digest));
      }
      if (integrity.hasOwnProperty('sha1')) {
        this._hashes.push(this.createHash('SHA-1', integrity.sha1[0].digest));
      }
    }
  }

  createHash(algorithm, digest) {
    let hash = Buffer.from(digest, 'base64').toString('hex');
    return new Hash(algorithm, hash);
  }

  toJSON() {
    let value = [];
    for (let hash of this._hashes) {
      value.push(hash.toJSON());
    }
    return value;
  }

  toXML() {
    let value = [];
    for (let hash of this._hashes) {
      value.push(hash.toXML());
    }
    return value;
  }
}

module.exports = HashList;
