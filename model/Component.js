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
const parsePackageJsonName = require('parse-packagejson-name');
const PackageURL = require('packageurl-js');
const LicenseChoice = require('./LicenseChoice');
const HashList = require('./HashList');

class Component {

  constructor(pkg, includeLicenseText = true) {
    if (pkg) {
      this._type = this.determinePackageType(pkg);
      this._bomRef = this._purl;

      let pkgIdentifier = parsePackageJsonName(pkg.name);
      this._group = pkgIdentifier.scope;
      if (this._group != null) this._group = '@' + this._group;
      this._name = pkgIdentifier.fullName;
      this._version = pkg.version;
      this._description = pkg.description;
      this._licenses = new LicenseChoice(pkg, includeLicenseText);
      this._hashes = new HashList(pkg);
      //this._externalReferences = addExternalReferences; TODO

      this._purl = new PackageURL('npm', this._group, this._name, this._version, null, null).toString();
    }
  }

  /**
   * If the author has described the module as a 'framework', the take their
   * word for it, otherwise, identify the module as a 'library'.
   */
  determinePackageType(pkg) {
    if (pkg.hasOwnProperty('keywords')) {
      for (let keyword of pkg.keywords) {
        if (keyword.toLowerCase() === 'framework') {
          return 'framework';
        }
      }
    }
    return 'library';
  }

  get type() {
    return this._type;
  }

  get purl() {
    return this._purl;
  }

  get bomRef() {
    return this._bomRef;
  }

  get group() {
    return this._group;
  }

  get name() {
    return this._name;
  }

  get version() {
    return this._version;
  }

  get licenses() {
    return this._licenses;
  }

  get description() {
    return this._description;
  }

  get hashes() {
    return this._hashes;
  }

  get externalReferences() {
    return this._externalReferences;
  }

  toJSON() {

  }

  toXML() {
    return {
      '@type'            : this._type,
      '@bom-ref'         : this._bomRef,
      group              : this._group,
      name               : this._name,
      version            : this._version,
      description        : { '#cdata' : this._description },
      hashes             : (this._hashes) ? this._hashes.toXML() : null,
      licenses           : (this._licenses) ? this._licenses.toXML(): null,
      purl               : this._purl,
      //externalReferences : addExternalReferences(pkg) TODO
    };
  }
}

module.exports = Component;
