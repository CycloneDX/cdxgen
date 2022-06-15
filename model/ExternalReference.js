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

const CycloneDXObject = require('./CycloneDXObject')

/**
 * ExternalReference's type
 *
 * @see ExternalReference.validChoices
 *
 * @typedef {("vcs"|"issue-tracker"|"website"|"advisories"|"bom"|"mailing-list"|"social"|"chat"
 *           |"documentation"|"support"|"distribution"|"license"|"build-meta"|"build-system"
 *           |"other")} ExternalReference.ExternalReferenceType
 */

class ExternalReference extends CycloneDXObject {
  /** @type {ExternalReference.ExternalReferenceType} */
  #type
  /** @type {string} */
  #url
  /** @type {(string|undefined)} */
  #comment

  /**
   * @param {ExternalReference.ExternalReferenceType} type
   * @param {string} url
   * @param {(string|undefined|null)} [comment]
   * @throws {TypeError} if param is not of expected type
   */
  constructor (type, url, comment) {
    super()
    this.type = type
    this.url = url
    this.comment = comment
  }

  /** @return {Array<ExternalReference.ExternalReferenceType>} */
  validChoices () {
    return ['vcs', 'issue-tracker', 'website', 'advisories', 'bom', 'mailing-list', 'social', 'chat',
      'documentation', 'support', 'distribution', 'license', 'build-meta', 'build-system',
      'other']
  }

  /**
   * @return {string}
   */
  get url () {
    return this.#url
  }

  /**
   * @param {string} value
   * @throws {TypeError} if value is not of expected type
   */
  set url (value) {
    this.#url = this.validateType('URL', value, String, true)
  }

  /**
   * @return {ExternalReference.ExternalReferenceType}
   */
  get type () {
    return this.#type
  }

  /**
   * @param {ExternalReference.ExternalReferenceType} value
   * @throws {TypeError} if value is not of expected type
   */
  set type (value) {
    this.#type = this.validateChoice('Reference type', value, this.validChoices())
  }

  /**
   * @return {(string|undefined)}
   */
  get comment () {
    return this.#comment
  }

  /**
   * @param {(string|undefined|null)} value
   * @throws {TypeError} if value is not of expected type
   */
  set comment (value) {
    this.#comment = this.validateType('Comment', value, String)
  }

  toJSON () {
    return { type: this.#type, url: this.#url, comment: this.#comment }
  }

  toXML () {
    return { reference: { '@type': this.#type, url: this.#url, comment: this.#comment } }
  }

  /**
   * Compare with another ExternalReference
   *
   * @param {ExternalReference} other
   * @return {number}
   */
  compare (other) {
    if (!(other instanceof ExternalReference)) { return 0 }
    return this.#type.localeCompare(other.#type) ||
      this.#url.localeCompare(other.#url)
  }
}

module.exports = ExternalReference
