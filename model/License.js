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

const AttachmentText = require('./AttachmentText')
const CycloneDXObject = require('./CycloneDXObject')

class License extends CycloneDXObject {
  get id () {
    return this._id
  }

  set id (value) {
    this._name = undefined
    this._id = this.validateType('SPDX License ID', value, String)
  }

  get name () {
    return this._name
  }

  set name (value) {
    this._id = undefined
    this._name = this.validateType('License name', value, String)
  }

  get url () {
    return this._url
  }

  set url (value) {
    this._url = this.validateType('URL', value, String)
  }

  get attachmentText () {
    return this._attachmentText
  }

  set attachmentText (value) {
    this._attachmentText = this.validateType('Attachment text', value, AttachmentText)
  }

  toJSON () {
    return {
      license: {
        id: this._id,
        name: this._name,
        text: (this._attachmentText) ? this._attachmentText.toJSON() : undefined,
        url: this._url
      }
    }
  }

  toXML () {
    return {
      license: {
        id: this._id,
        name: this._name,
        text: (this._attachmentText) ? this._attachmentText.toXML() : null,
        url: this._url
      }
    }
  }
}

module.exports = License
