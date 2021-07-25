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
const defaultSpecVersion = "1.3";

class CycloneDXObject {

  constructor() {
  }

  validateType(name, value, expectedType, required = false) {
    if (!value && required) {
      throw name + " is required";
    }
    if (value) {
      if (expectedType === String) {
        if (typeof value === 'string' || value instanceof expectedType) {
          return value;
        } else {
          throw name + " value must be a string";
        }
      } else if (expectedType === Number) {
        if (typeof value === 'number' || value instanceof expectedType) {
          return value;
        } else {
          throw name + " value must be a number";
        }
      } else if (expectedType === Boolean) {
        if (typeof value === 'boolean' || value instanceof expectedType) {
          return value;
        } else {
          throw name + " value must be a number";
        }
      } else {
        if (value instanceof expectedType) {
          return value;
        } else {
          throw name + " value must be an instance of " + expectedType;
        }
      }
    } else {
      return undefined;
    }
  }

  validateChoice(name, value, validChoices = []) {
    if (validChoices.indexOf(value) === -1) {
      throw "Unsupported " + name + ". Valid choices are " + validChoices.toString();
    } else {
      return value;
    }
  }

}

module.exports = CycloneDXObject;
