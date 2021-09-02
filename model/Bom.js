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
const builder = require('xmlbuilder');
const uuid = require('uuid');
const Component = require('./Component');
const CycloneDXObject = require('./CycloneDXObject');
const Metadata = require('./Metadata');
const Tool = require('./Tool');
const program = require('../package.json');

class Bom extends CycloneDXObject {

  constructor(pkg, componentType, includeSerialNumber = true, includeLicenseText = true, lockfile) {
    super();
    this._schemaVersion = "1.3";
    this._includeSerialNumber = includeSerialNumber;
    this._includeLicenseText = includeLicenseText;
    this._version = 1;
    if (includeSerialNumber) {
      this._serialNumber = 'urn:uuid:' + uuid.v4();
    }
    if (pkg) {
      this._metadata = this.createMetadata(pkg, componentType);
      this._components = this.listComponents(pkg, lockfile);
    } else {
      this._components = [];
    }

  }

  createMetadata(pkg, componentType) {
    let metadata = new Metadata();
    metadata.component = new Component(pkg, this.includeLicenseText);
    metadata.component.type = componentType;
    let tool = new Tool("CycloneDX", "Node.js module", program.version);
    metadata.tools.push(tool);
    return metadata;
  }

  /**
   * For all modules in the specified package, creates a list of
   * component objects from each one.
   */
  listComponents(pkg, lockfile) {
    let list = {};
    let isRootPkg = true;
    this.createComponent(pkg, list, lockfile, isRootPkg);
    return Object.keys(list).map(k => (list[k]));
  }

  /**
   * Given the specified package, create a CycloneDX component and add it to the list.
   */
  createComponent(pkg, list, lockfile, isRootPkg = false) {
    //read-installed with default options marks devDependencies as extraneous
    //if a package is marked as extraneous, do not include it as a component
    if(pkg.extraneous) return;
    if(!isRootPkg) {
      let component = new Component(pkg, this.includeLicenseText, lockfile);
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
        .map(x => this.createComponent(x, list, lockfile));
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

  get serialNumber() {
    return this._serialNumber;
  }

  set serialNumber(value) {
    this._serialNumber = this.validateType("Serial number", value. String);
  }

  toJSON() {
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

    if (this._metadata) {
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
