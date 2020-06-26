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
const builder = require('xmlbuilder');
const uuidv4 = require('uuid/v4');
const Component = require('./Component');
const CycloneDXObject = require('./CycloneDXObject');
const Metadata = require('./Metadata');

class Bom extends CycloneDXObject {

  constructor(pkg, schemaVersion = "1.2", includeSerialNumber = true, includeLicenseText = true) {
    super();
    this._schemaVersion = this.validateChoice("Schema version", schemaVersion, Bom.supportedSchemaVersions());
    this._includeSerialNumber = includeSerialNumber;
    this._includeLicenseText = includeLicenseText;
    this._version = 1;
    if (includeSerialNumber) {
      this._serialNumber = 'urn:uuid:' + uuidv4();
    }
    if (pkg) {
      this._components = this.listComponents(pkg);
    } else {
      this._components = [];
    }
  }

  static supportedSchemaVersions() {
    return ["1.1", "1.2"];
  }

  /**
   * For all modules in the specified package, creates a list of
   * component objects from each one.
   */
  listComponents(pkg) {
    let list = {};
    let isRootPkg = true;
    this.createComponent(pkg, list, isRootPkg);
    return Object.keys(list).map(k => (list[k]));
  }

  /**
   * Given the specified package, create a CycloneDX component and add it to the list.
   */
  createComponent(pkg, list, isRootPkg = false) {
    //read-installed with default options marks devDependencies as extraneous
    //if a package is marked as extraneous, do not include it as a component
    if(pkg.extraneous) return;
    if(!isRootPkg) {
      let component = new Component(pkg, this.includeLicenseText);
      if (component.externalReferences === undefined || component.externalReferences.length === 0) {
          delete component.externalReferences;
      }
      if (list[component.purl]) return; //remove cycles
      list[component.purl] = component;
    }
    if (pkg.dependencies) {
      Object.keys(pkg.dependencies)
        .map(x => pkg.dependencies[x])
        .filter(x => typeof(x) !== 'string') //remove cycles
        .map(x => this.createComponent(x, list));
    }
  }

  addComponent(component) {
    this._components.push(component);
  }

  get includeSerialNumber() {
    return this._includeSerialNumber;
  }

  set includeSerialNumber(value) {
    this._includeSerialNumber = value;
  }

  get includeLicenseText() {
    return this._includeLicenseText;
  }

  set includeLicenseText(value) {
    this._includeLicenseText = value;
  }

  get metadata() {
    return this._metadata;
  }

  set metadata(value) {
    this._metadata = this.validateType("Metadata", value, Metadata);
  }

  get components() {
    return this._components;
  }

  set components(value) {
    this._components = value;
  }

  get dependencies() {
    return this._dependencies;
  }

  set dependencies(value) {
    this._dependencies = value;
  }

  get externalReferences() {
    return this._externalReferences;
  }

  set externalReferences(value) {
    this._externalReferences = value;
  }

  get version() {
    return this._version;
  }

  set version(value) {
    this._version = this.validateType("Version", value, Number);
  }

  get schemaVersion() {
    return this._schemaVersion;
  }

  set schemaVersion(value) {
    this._schemaVersion = this.validateChoice("Schema version", value, Bom.supportedSchemaVersions());
  }

  get serialNumber() {
    return this._serialNumber;
  }

  set serialNumber(value) {
    this._serialNumber = this.validateType("Serial number", value. String);
  }

  toJSON() {
    if (this.schemaVersion === "1.1") {
      throw "JSON format support was introduced in schema version 1.2";
    }
    let json = {
      "bomFormat": "CycloneDX",
      "specVersion": this._schemaVersion,
      "serialNumber": this._serialNumber,
      "version": this._version,
      "metadata": this._metadata,
      "components": this._components
    };
    return JSON.stringify(json, null, 2);
  }

  toXML() {
    let bom = builder.create('bom', { encoding: 'utf-8', separateArrayItems: true })
      .att('xmlns', 'http://cyclonedx.org/schema/bom/' + this._schemaVersion);
    if (this._serialNumber) {
      bom.att('serialNumber', this._serialNumber);
    }
    bom.att('version', this._version);

    if (this._schemaVersion !== "1.1" && this._metadata) {
      let metadata = bom.ele("metadata");
      metadata.ele(this._metadata.toXML());
    }

    let componentsNode = bom.ele('components');
    if (this._components && this._components.length > 0) {
      let value = [];
      for (let component of this._components) {
        value.push(component.toXML());
      }
      componentsNode.ele(value);
    }
    return bom.end({
      pretty: true,
      indent: '  ',
      newline: '\n',
      width: 0,
      allowEmpty: false,
      spacebeforeslash: ''
    });
  }
}

module.exports = Bom;
