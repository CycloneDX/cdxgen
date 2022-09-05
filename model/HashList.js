/*!
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
  /** @type {Array<Hash>} */
  #hashes

  constructor (pkg, lockfile) {
    this.#hashes = []
    if (pkg) {
      this.processHashes(pkg, lockfile)
    }
  }

  /**
   * Number of Hashes.
   * @type {number}
   */
  get length () {
    return this.#hashes
      ? this.#hashes.length
      : 0
  }

  get hashes () {
    return this.#hashes
  }

  set hashes (value) {
    if (!Array.isArray(value)) {
      throw new TypeError('HashList value must be an array of Hash objects')
    }
    this.#hashes = value
  }

  processHashes (pkg, lockfile) {
    // Default to checking the package-lock.json first and checking the node
    // module package.json as a backup.
    if (lockfile) {
      if (lockfile.dependencies && lockfile.dependencies[pkg.name] && lockfile.dependencies[pkg.name].integrity) {
        this.formatHash(ssri.parse(lockfile.dependencies[pkg.name].integrity))
      }
    } else if (pkg._shasum) {
      this.#hashes.push(new Hash('SHA-1', pkg._shasum))
    } else if (pkg._integrity) {
      this.formatHash(ssri.parse(pkg._integrity))
    }
  }

  formatHash (integrity) {
    // Components may have multiple hashes with various lengths. Check each one
    // that is supported by the CycloneDX specification.
    if (Object.prototype.hasOwnProperty.call(integrity, 'sha512')) {
      this.#hashes.push(this.createHash('SHA-512', integrity.sha512[0].digest))
    }
    if (Object.prototype.hasOwnProperty.call(integrity, 'sha384')) {
      this.#hashes.push(this.createHash('SHA-384', integrity.sha384[0].digest))
    }
    if (Object.prototype.hasOwnProperty.call(integrity, 'sha256')) {
      this.#hashes.push(this.createHash('SHA-256', integrity.sha256[0].digest))
    }
    if (Object.prototype.hasOwnProperty.call(integrity, 'sha1')) {
      this.#hashes.push(this.createHash('SHA-1', integrity.sha1[0].digest))
    }
  }

  createHash (algorithm, digest) {
    const hash = Buffer.from(digest, 'base64').toString('hex')
    return new Hash(algorithm, hash)
  }

  toJSON () {
    const hashes = this.#hashes.length > 0 && process.env.BOM_REPRODUCIBLE
      ? Array.from(this.#hashes).sort((a, b) => a.compare(b))
      : this.#hashes
    return hashes.map(h => h.toJSON())
  }

  toXML () {
    const hashes = this.#hashes.length > 0 && process.env.BOM_REPRODUCIBLE
      ? Array.from(this.#hashes).sort((a, b) => a.compare(b))
      : this.#hashes
    return hashes.map(h => h.toXML())
  }
}

module.exports = HashList
