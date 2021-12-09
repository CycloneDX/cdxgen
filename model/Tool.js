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

class Tool extends CycloneDXObject {
  constructor (vendor, name, version, hashes = []) {
    super()
    this._vendor = this.validateType('Vendor', vendor, String)
    this._name = this.validateType('Name', name, String)
    this._version = this.validateType('Version', version, String)
    this._hashes = hashes
  }

  get vendor () {
    return this._vendor
  }

  set vendor (value) {
    this._vendor = this.validateType('Vendor', value, String)
  }

  get name () {
    return this._name
  }

  set name (value) {
    this._name = this.validateType('Name', value, String)
  }

  get version () {
    return this._version
  }

  set version (value) {
    this._version = this.validateType('Version', value, String)
  }

  get hashes () {
    return this._hashes
  }

  set hashes (value) {
    this._hashes = value
  }

  processArray (array, format) {
    const value = []
    for (const object of array) {
      if (format === 'XML') {
        value.push(object.toXML())
      } else if (format === 'JSON') {
        value.push(object.toJSON())
      }
    }
    return value
  }

  toJSON () {
    return {
      vendor: this._vendor,
      name: this._name,
      version: this._version,
      hashes: (this._hashes && this.hashes.length > 0) ? this.processArray(this._hashes, 'JSON') : undefined
    }
  }

  toXML () {
    return {
      tool: {
        vendor: this._vendor,
        name: this._name,
        version: this._version,
        hashes: (this._hashes && this.hashes.length > 0) ? this.processArray(this._hashes, 'XML') : undefined
      }
    }
  }
}

module.exports = Tool
