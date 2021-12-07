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

const ssri = require('ssri')
const Hash = require('./Hash')

class HashList {
  constructor (pkg, lockfile) {
    this._hashes = []
    if (pkg) {
      this.processHashes(pkg, lockfile)
    }
  }

  get hashes () {
    return this._hashes
  }

  set hashes (value) {
    if (!Array.isArray(value)) {
      throw new TypeError('HashList value must be an array of Hash objects')
    }
    this._hashes = value
  }

  processHashes (pkg, lockfile) {
    // Default to checking the package-lock.json first and checking the node
    // module package.json as a backup.
    if (lockfile) {
      if (lockfile.dependencies && lockfile.dependencies[pkg.name] && lockfile.dependencies[pkg.name].integrity) {
        this.formatHash(ssri.parse(lockfile.dependencies[pkg.name].integrity))
      }
    } else if (pkg._shasum) {
      this._hashes.push(new Hash('SHA-1', pkg._shasum))
    } else if (pkg._integrity) {
      this.formatHash(ssri.parse(pkg._integrity))
    }
  }

  formatHash (integrity) {
    // Components may have multiple hashes with various lengths. Check each one
    // that is supported by the CycloneDX specification.
    if (Object.prototype.hasOwnProperty.call(integrity, 'sha512')) {
      this._hashes.push(this.createHash('SHA-512', integrity.sha512[0].digest))
    }
    if (Object.prototype.hasOwnProperty.call(integrity, 'sha384')) {
      this._hashes.push(this.createHash('SHA-384', integrity.sha384[0].digest))
    }
    if (Object.prototype.hasOwnProperty.call(integrity, 'sha256')) {
      this._hashes.push(this.createHash('SHA-256', integrity.sha256[0].digest))
    }
    if (Object.prototype.hasOwnProperty.call(integrity, 'sha1')) {
      this._hashes.push(this.createHash('SHA-1', integrity.sha1[0].digest))
    }
  }

  createHash (algorithm, digest) {
    const hash = Buffer.from(digest, 'base64').toString('hex')
    return new Hash(algorithm, hash)
  }

  toJSON () {
    const value = []
    for (const hash of this._hashes) {
      value.push(hash.toJSON())
    }
    return value
  }

  toXML () {
    const value = []
    for (const hash of this._hashes) {
      value.push(hash.toXML())
    }
    return value
  }
}

module.exports = HashList
