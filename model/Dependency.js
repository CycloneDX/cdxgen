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

class Dependency extends CycloneDXObject {
  /**
   * @param {string} ref
   * @param {(Array<Dependency>|undefined)} [dependencies]
   */
  constructor (ref, dependencies) {
    super()
    this._ref = ref
    this._dependencies = dependencies
  }

  /**
   * @type {string}
   */
  get ref () {
    return this._ref
  }

  /**
   * @param {string} value
   */
  set ref (value) {
    this._ref = value
  }

  /**
   * @type {(Array<Dependency>|undefined)}
   */
  get dependencies () {
    return this._dependencies
  }

  /**
   * @param {(Array<Dependency>|undefined)} value
   */
  set dependencies (value) {
    this._dependencies = value
  }

  /**
   * @param {Dependency} dependency
   */
  addDependency (dependency) {
    if (!this._dependencies) this._dependencies = []
    this._dependencies.push(dependency)
  }

  toJSON () {
    let dependencyArray
    if (this._dependencies && this._dependencies.length > 0) {
      dependencyArray = (
        process.env.BOM_REPRODUCIBLE
          ? Array.from(this._dependencies).sort((a, b) => a.compare(b))
          : this._dependencies
      ).map(d => d.ref)
    }
    return {
      ref: this._ref,
      dependsOn: dependencyArray
    }
  }

  toXML () {
    let dependencyArray
    if (this._dependencies && this._dependencies.length > 0) {
      dependencyArray = (
        process.env.BOM_REPRODUCIBLE
          ? Array.from(this._dependencies).sort((a, b) => a.compare(b))
          : this._dependencies
      ).map(d => ({ dependency: { '@ref': d.ref } }))
    }
    return {
      dependency: {
        '@ref': this.ref,
        '#text': dependencyArray
      }
    }
  }

  /**
   * Compare with another Dependency.
   *
   * @param {Dependency} other
   * @return {number}
   */
  compare (other) {
    if (!(other instanceof Dependency)) { return 0 }
    return this.ref.localeCompare(other.ref)
  }
}

module.exports = Dependency
