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
class Hash {

  constructor(algorithm, value) {
    const validAlgorithms = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512", "SHA3-256", "SHA3-384",
      "SHA3-512", "BLAKE2b-256", "BLAKE2b-384", "BLAKE2b-512", "BLAKE3"];

    if (validAlgorithms.indexOf(algorithm) === -1) {
      throw "Unsupported hash algorithm";
    } else {
      this._algorithm = algorithm;
      this._value = value;
    }
  }

  get algorithm() {
    return this._algorithm;
  }

  set algorithm(value) {
    this._algorithm = value;
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = value;
  }

  toJSON() {
    return { hash: { 'alg': this._algorithm, 'value': this._value} };
  }

  toXML() {
    return { hash: { '@alg': this._algorithm, '#text': this._value} };
  }
}

module.exports = Hash;
