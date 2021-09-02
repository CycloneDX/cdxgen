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
const parsePackageJsonName = require('parse-packagejson-name');
const { PackageURL } = require('packageurl-js');
const CycloneDXObject = require('./CycloneDXObject');
const LicenseChoice = require('./LicenseChoice');
const HashList = require('./HashList');
const ExternalReferenceList = require('./ExternalReferenceList');
const OrganizationalEntity = require('./OrganizationalEntity');
const Swid = require('./Swid');

class Component extends CycloneDXObject {

  constructor(pkg, includeLicenseText = true, lockfile) {
    super();
    this._type = this.determinePackageType(pkg); // Defaults to library
    if (pkg) {
      let pkgIdentifier = parsePackageJsonName(pkg.name);
      this._group = (pkgIdentifier.scope) ? pkgIdentifier.scope : undefined;
      if (this._group) this._group = '@' + this._group;
      this._name = (pkgIdentifier.fullName) ? pkgIdentifier.fullName : undefined;
      this._version = (pkg.version) ? pkg.version : undefined;
      this._description = (pkg.description) ? pkg.description : undefined;
      this._licenses = new LicenseChoice(pkg, includeLicenseText);
      this._hashes = new HashList(pkg, lockfile);
      this._externalReferences = new ExternalReferenceList(pkg);
      if (this._name && this._version)
        this._purl = new PackageURL('npm', this._group, this._name, this._version, null, null).toString();
      this._bomRef = this._purl;
    } else {
      this._hashes = new HashList();
      this._externalReferences = new ExternalReferenceList();
    }
  }

  /**
   * If the author has described the module as a 'framework', the take their
   * word for it, otherwise, identify the module as a 'library'.
   */
  determinePackageType(pkg) {
    if (pkg && pkg.hasOwnProperty('keywords')) {
      for (let keyword of pkg.keywords) {
        if (keyword.toLowerCase() === 'framework') {
          return 'framework';
        }
      }
    }
    return 'library';
  }

  static supportedComponentTypes() {
    return ['application', 'framework', 'library', 'container', 'operating-system', 'device', 'firmware', 'file'];
  }

  get type() {
    return this._type;
  }

  set type(value) {
    this._type = this.validateChoice("Type", value, Component.supportedComponentTypes());
  }

  get bomRef() {
    return this._bomRef;
  }

  set bomRef(value) {
    this._bomRef = this.validateType("bom-ref", value, String);
  }

  get supplier() {
    return this._supplier;
  }

  set supplier(value) {
    this._supplier = this.validateType("Supplier", value, OrganizationalEntity);
  }

  get author() {
    return this._author;
  }

  set author(value) {
    this._author = this.validateType("Author", value, String);
  }

  get publisher() {
    return this._publisher;
  }

  set publisher(value) {
    this._publisher = this.validateType("Publisher", value, String);
  }

  get group() {
    return this._group;
  }

  set group(value) {
    this._group = this.validateType("Group", value, String);
  }

  get name() {
    return this._name;
  }

  set name(value) {
    this._name = this.validateType("Name", value, String);
  }

  get version() {
    return this._version;
  }

  set version(value) {
    this._version = this.validateType("Version", value, String);
  }

  get description() {
    return this._description;
  }

  set description(value) {
    this._description = this.validateType("Description", value, String);
  }

  get scope() {
    return this._scope;
  }

  set scope(value) {
    const validChoices = ['required', 'optional', 'excluded'];
    this._scope = this.validateChoice("Scope", value, validChoices)
  }

  get hashes() {
    return this._hashes;
  }

  set hashes(value) {
    this._hashes = this.validateType("Hashes", value, HashList);
  }

  get licenses() {
    return this._licenses;
  }

  set licenses(value) {
    this._licenses = this.validateType("Licenses", value, LicenseChoice);
  }

  get copyright() {
    return this._copyright;
  }

  set copyright(value) {
    this._copyright = this.validateType("Copyright", value, String);
  }

  get cpe() {
    return this._cpe;
  }

  set cpe(value) {
    this._cpe = this.validateType("CPE", value, String);
  }

  get purl() {
    return this._purl;
  }

  set purl(value) {
    this._purl = this.validateType("PURL", value, String);
  }

  get swid() {
    return this._swid;
  }

  set swid(value) {
    this._swid = this.validateType("SWID", value, Swid);
  }

  get externalReferences() {
    return this._externalReferences;
  }

  set externalReferences(value) {
    this._externalReferences = value;
  }

  toJSON() {
    return {
      'type': this._type,
      'bom-ref': this._bomRef,
      supplier: this._supplier ? this._supplier.toJSON() : undefined,
      author: this._author,
      publisher: this._publisher,
      group: this._group,
      name: this._name,
      version: this._version,
      description: this._description,
      scope: this._scope,
      hashes: (this._hashes && this.hashes.hashes && this.hashes.hashes.length > 0) ? this._hashes.toJSON() : undefined,
      licenses: (this._licenses) ? this._licenses.toJSON() : undefined,
      copyright: this._copyright,
      cpe: this._cpe,
      purl: this._purl,
      swid: this._swid ? this.swid.toJSON() : undefined,
      externalReferences: (this._externalReferences && this._externalReferences.externalReferences && this._externalReferences.externalReferences.length > 0) ? this._externalReferences.toJSON() : undefined,
    };
  }

  toXML() {
    return {
      'component': {
        '@type': this._type,
        '@bom-ref': this._bomRef,
        supplier: this._supplier ? this._supplier.toXML() : undefined,
        author: this._author,
        publisher: this._publisher,
        group: this._group,
        name: this._name,
        version: this._version,
        description: (this._description) ? {'#cdata': this._description} : undefined,
        scope: this._scope,
        hashes: (this._hashes && this.hashes.hashes && this.hashes.hashes.length > 0) ? this._hashes.toXML() : undefined,
        licenses: (this._licenses) ? this._licenses.toXML() : undefined,
        copyright: this._copyright,
        cpe: this._cpe,
        purl: this._purl,
        swid: this._swid ? this.swid.toXML() : undefined,
        externalReferences: (this._externalReferences && this._externalReferences.externalReferences && this._externalReferences.externalReferences.length > 0) ? this._externalReferences.toXML() : undefined,
      }
    };
  }
}

module.exports = Component;
