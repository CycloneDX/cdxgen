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

class Swid extends CycloneDXObject {
  /**
   * @param tagId Maps to the tagId of a SoftwareIdentity. (REQUIRED)
   * @param name Maps to the name of a SoftwareIdentity. (OPTIONAL)
   * @param version Maps to the version of a SoftwareIdentity. (OPTIONAL)
   * @param tagVersion Maps to the tagVersion of a SoftwareIdentity. (OPTIONAL)
   * @param patch Maps to the patch of a SoftwareIdentity. (OPTIONAL)
   */
  constructor (tagId, name, version, tagVersion, patch) {
    super()
    this._tagId = this.validateType('SWID tagId', tagId, String, true)
    this._name = this.validateType('Name', name, String)
    this._version = this.validateType('Version', version, String)
    this._tagVersion = this.validateType('Tag version', tagVersion, Number)
    this._patch = this.validateType('Patch', patch, Boolean)
  }

  get tagId () {
    return this._tagId
  }

  get name () {
    return this._name
  }

  get version () {
    return this._version
  }

  get tagVersion () {
    return this._tagVersion
  }

  get patch () {
    return this._patch
  }

  get attachmentText () {
    return this._attachmentText
  }

  set attachmentText (value) {
    this._attachmentText = this.validateType('Attachment text', value, AttachmentText)
  }

  toJSON () {
    return {
      tagId: this._tagId,
      name: this._name,
      version: this._version,
      tagVersion: this._tagVersion,
      patch: this._patch,
      text: (this._attachmentText) ? this._attachmentText.toJSON() : undefined
    }
  }

  toXML () {
    return {
      '@tagId': this._tagId,
      '@name': this._name,
      '@version': this._version,
      '@tagVersion': this._tagVersion,
      '@patch': this._patch,
      text: (this._attachmentText) ? this._attachmentText.toXML() : undefined
    }
  }
}

module.exports = Swid
