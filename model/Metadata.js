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
const Component = require('./Component');
const CycloneDXObject = require('./CycloneDXObject');
const OrganizationalEntity = require('./OrganizationalEntity');

class Metadata extends CycloneDXObject {

  constructor() {
    super();
    this._timestamp = new Date();
    this._tools = [];
    this._authors = [];
  }

  get timestamp() {
    return this._timestamp;
  }

  set timestamp(value) {
    this._timestamp = this.validateType("Timestamp", value, Date);
  }

  get tools() {
    return this._tools;
  }

  set tools(value) {
    if (!Array.isArray(value)) {
      throw "Tools value must be an array of Tool objects";
    } else {
      this._tools = value;
    }
  }

  get authors() {
    return this._authors;
  }

  set authors(value) {
    if (!Array.isArray(value)) {
      throw "Authors value must be an array of Author objects";
    } else {
      this._authors = value;
    }
  }

  get component() {
    return this._component;
  }

  set component(value) {
    this._component = this.validateType("Component", value, Component);
  }

  get manufacture() {
    return this._manufacture;
  }

  set manufacture(value) {
    this._manufacture = this.validateType("Manufacture", value, OrganizationalEntity);
  }

  get supplier() {
    return this._supplier;
  }

  set supplier(value) {
    this._supplier = this.validateType("Supplier", value, OrganizationalEntity);
  }

  processArray(array, format) {
    let value = [];
    for (const object of array) {
      if (format === 'XML') {
        value.push(object.toXML());
      } else if (format === 'JSON') {
        value.push(object.toJSON());
      }
    }
    return value;
  }

  toJSON() {
    return {
      timestamp: (this._timestamp) ? this._timestamp.toISOString() : undefined,
      tools: (this._tools && this._tools.length > 0) ? this.processArray(this._tools, "JSON") : undefined,
      authors: (this._authors && this._authors.length > 0) ? this.processArray(this._authors, "JSON") : undefined,
      component: (this._component) ? this._component.toJSON() : undefined,
      manufacture: (this._manufacture) ? this._manufacture.toJSON() : undefined,
      supplier: (this._supplier) ? this._supplier.toJSON() : undefined
    };
  }

  toXML() {
    return {
      timestamp: (this._timestamp) ? this._timestamp.toISOString() : undefined,
      tools: (this._tools && this._tools.length > 0) ? this.processArray(this._tools, "XML") : undefined,
      authors: (this._authors && this._authors.length > 0) ? this.processArray(this._authors, "XML") : undefined,
      component: (this._component) ? this._component.toXML() : undefined,
      manufacture: (this._manufacture) ? this._manufacture.toXML() : undefined,
      supplier: (this._supplier) ? this._supplier.toXML() : undefined
    };
  }
}

module.exports = Metadata;
