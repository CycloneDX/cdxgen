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
const CycloneDXObject = require('./CycloneDXObject');

class ExternalReference extends CycloneDXObject {

  constructor(type, url, comment) {
    super();
    this._type = this.validateChoice("Reference type", type, this.validChoices());
    this._url = url;
    this._comment = comment;
  }

  validChoices() {
    return ["vcs", "issue-tracker", "website", "advisories", "bom", "mailing-list", "social", "chat",
      "documentation", "support", "distribution", "license", "build-meta", "build-system", "other"];
  }

  get url() {
    return this._url;
  }

  set url(value) {
    this._url = this.validateType("URL", value, String);
  }

  get type() {
    return this._type;
  }

  set type(value) {
    this._type = this.validateChoice("Reference type", type, this.validChoices());
  }

  get comment() {
    return this._comment;
  }

  set comment(value) {
    this._comment = this.validateType("Comment", value, String);
  }

  toJSON() {
    return { 'type': this._type, 'url': this._url} ;
  }

  toXML() {
    return { reference: { '@type': this._type, 'url': this._url} };
  }
}

module.exports = ExternalReference;
