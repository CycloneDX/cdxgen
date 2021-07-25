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

class OrganizationalContact extends  CycloneDXObject {

  constructor(name, email, phone, objectName) {
    super();
    this._name = this.validateType("Name", name, String);
    this._email = this.validateType("Email", email, String);
    this._phone = this.validateType("Phone", phone, String);
    this._objectName = objectName;
  }

  get name() {
    return this._name;
  }

  set name(value) {
    this._name = this.validateType("Name", value, String);
  }

  get email() {
    return this._email;
  }

  set email(value) {
    this._email = this.validateType("Email", value, String);
  }

  get phone() {
    return this._phone;
  }

  set phone(value) {
    this._phone = this.validateType("Phone", value, String);
  }

  get objectName() {
    return this._objectName;
  }

  set objectName(value) {
    this._objectName = this.validateType("Objectname", value, String);
  }

  toJSON() {
    return {
      name: this._name,
      email: this._email,
      phone: this._phone
    }
  }

  toXML() {
    let data = {};
    if (this._objectName) {
      data[this._objectName] = {
        name: this._name,
        email: this._email,
        phone: this._phone
      };
      return data;
    } else {
      return {
        name: this._name,
        email: this._email,
        phone: this._phone
      }
    }
  }
}

module.exports = OrganizationalContact;
