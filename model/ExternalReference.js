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
 * Copyright (c) Steve Springett. All Rights Reserved.
 */
class ExternalReference {

  constructor(pkg) {
    //TODO
  }

  get url() {
    return this._url;
  }

  set url(value) {
    this._url = value;
  }

  get type() {
    return this._type;
  }

  set type(value) {
    this._type = value;
  }

  get comment() {
    return this._comment;
  }

  set comment(value) {
    this._comment = value;
  }

  /**
   * Adds external references supported by the package format.
   */
  addExternalReferences(pkg) {
    let externalReferences = [];
    if (pkg.homepage) {
      externalReferences.push({'reference': {'@type': 'website', url: pkg.homepage}});
    }
    if (pkg.bugs && pkg.bugs.url) {
      externalReferences.push({'reference': {'@type': 'issue-tracker', url: pkg.bugs.url}});
    }
    if (pkg.repository && pkg.repository.url) {
      externalReferences.push({'reference': {'@type': 'vcs', url: pkg.repository.url}});
    }
    return externalReferences;
  }

  toJSON() {
    //TODO
  }

  toXML() {
    //TODO
  }
}

module.exports = ExternalReference;
