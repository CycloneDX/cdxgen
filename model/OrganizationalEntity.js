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
const CycloneDXObject = require('./CycloneDXObject');
const OrganizationalContact = require('./OrganizationalContact');

class OrganizationalEntity extends CycloneDXObject {

  constructor(name, url, contact, objectName) {
    super();
    this._name = this.validateType("Name", name, String);
    this._url = this.validateType("URL", url, String);
    this._contact = this.validateType("Contact", contact, OrganizationalContact);
    this._objectName = objectName;
  }

  get name() {
    return this._name;
  }

  set name(value) {
    this._name = this.validateType("Name", value, String);
  }

  get url() {
    return this._url;
  }

  set url(value) {
    this._url = this.validateType("URL", value, String);
  }

  get contact() {
    return this._contact;
  }

  set contact(value) {
    this._contact = this.validateType("Contact", value, OrganizationalContact);
  }

  toJSON() {
    return {
      name: this._name,
      url: [this._url],
      contact: (this._contact) ? [this._contact.toJSON()] : undefined
    }
  }

  toXML() {
    let data = {};
    if (this._objectName) {
      data[this._objectName] = {
        name: this._name,
        url: this._url,
        contact: (this._contact) ? this._contact.toXML() : undefined
      };
      return data;
    } else {
      return {
        name: this._name,
        url: this._url,
        contact: (this._contact) ? this._contact.toXML() : undefined
      }
    }
  }
}

module.exports = OrganizationalEntity;
