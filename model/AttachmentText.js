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

class AttachmentText extends CycloneDXObject {

  constructor(contentType, text, encoding) {
    super();
    this._contentType = (contentType) ? contentType : undefined;
    this._text = (text) ? text : undefined;
    this._encoding = this.validateEncoding(encoding);
  }

  validateEncoding(encoding) {
    if (encoding && encoding !== "base64") {
      throw "Encoding may either be null or base64";
    }
  }

  get contentType() {
    return this._contentType;
  }

  set contentType(value) {
    this._contentType = this.validateType("Content type", value, String);
  }

  get text() {
    return this._text;
  }

  set text(value) {
    this._text = this.validateType("Text", value, String);
  }

  get encoding() {
    return this._encoding;
  }

  set encoding(value) {
    this._encoding = this.validateEncoding(value);
  }

  toJSON() {
    return {
      'contentType': this._contentType,
      'encoding': this._encoding,
      'content': this._text
    }
  }

  toXML() {
    return {
      '#cdata': this._text,
      '@content-type': this._contentType,
      '@encoding': this._encoding
    }
  }
}

module.exports = AttachmentText;
