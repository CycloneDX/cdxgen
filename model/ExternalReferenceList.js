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

const ExternalReference = require('./ExternalReference')

class ExternalReferenceList {
  constructor (pkg) {
    this._externalReferences = []
    if (pkg) {
      this.processExternalReferences(pkg)
    }
  }

  get externalReferences () {
    return this._externalReferences
  }

  set externalReferences (value) {
    if (!Array.isArray(value)) {
      throw new TypeError('ExternalReferencesList value must be an array of ExternalReference objects')
    }
    this._externalReferences = value
  }

  processExternalReferences (pkg) {
    if (pkg.homepage) {
      this._externalReferences.push(new ExternalReference('website', pkg.homepage))
    }
    if (pkg.bugs && pkg.bugs.url) {
      this._externalReferences.push(new ExternalReference('issue-tracker', pkg.bugs.url))
    }
    if (pkg.repository && pkg.repository.url) {
      this._externalReferences.push(new ExternalReference('vcs', pkg.repository.url))
    }
  }

  toJSON () {
    const value = []
    for (const externalReference of this._externalReferences) {
      value.push(externalReference.toJSON())
    }
    return value
  }

  toXML () {
    const value = []
    for (const externalReference of this._externalReferences) {
      value.push(externalReference.toXML())
    }
    return value
  }
}

module.exports = ExternalReferenceList
