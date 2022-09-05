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

const CycloneDXObject = require('./CycloneDXObject')

/**
 * HashAlgorithm
 *
 * @see Hash.validAlgorithms
 *
 * @typedef {("MD5"|"SHA-1"|"SHA-256"|"SHA-384"|"SHA-512"|"SHA3-256"|"SHA3-384"
 *           |"SHA3-512"|"BLAKE2b-256"|"BLAKE2b-384"|"BLAKE2b-512"|"BLAKE3")} Hash.HashAlgorithm
 */

class Hash extends CycloneDXObject {
  /** @type {Hash.HashAlgorithm}  */
  #algorithm
  /** @type {string} */
  #value

  /**
   * @param {Hash.HashAlgorithm} algorithm
   * @param {string} value
   * @throws {TypeError} if param is not of expected type
   */
  constructor (algorithm, value) {
    super()
    this.algorithm = algorithm
    this.value = value
  }

  /** @return {Array<Hash.HashAlgorithm>} */
  validAlgorithms () {
    return ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA3-256', 'SHA3-384',
      'SHA3-512', 'BLAKE2b-256', 'BLAKE2b-384', 'BLAKE2b-512', 'BLAKE3']
  }

  /**
   * @return {Hash.HashAlgorithm}
   */
  get algorithm () {
    return this.#algorithm
  }

  /**
   * @param {Hash.HashAlgorithm} value
   * @throws {TypeError} if value is not of expected type
   */
  set algorithm (value) {
    this.#algorithm = this.validateChoice('Algorithm', value, this.validAlgorithms())
  }

  /**
   * @return {string}
   */
  get value () {
    return this.#value
  }

  /**
   * @param {string} value
   * @throws {TypeError} if value is not of expected type
   */
  set value (value) {
    this.#value = this.validateType('Hash value', value, String, true)
  }

  toJSON () {
    return { alg: this.#algorithm, content: this.#value }
  }

  toXML () {
    return { hash: { '@alg': this.#algorithm, '#text': this.#value } }
  }

  /**
   * Compare with another Hash.
   *
   * @param {Hash} other
   * @return {number}
   */
  compare (other) {
    if (!(other instanceof Hash)) { return 0 }
    return this.#algorithm.localeCompare(other.#algorithm) ||
      this.#value.localeCompare(other.#value)
  }
}

module.exports = Hash
