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

const parsePackageJsonName = require('parse-packagejson-name')
const { PackageURL } = require('packageurl-js')
const CycloneDXObject = require('./CycloneDXObject')
const LicenseChoice = require('./LicenseChoice')
const HashList = require('./HashList')
const ExternalReferenceList = require('./ExternalReferenceList')
const OrganizationalEntity = require('./OrganizationalEntity')
const Swid = require('./Swid')

/**
 * Component's scope
 *
 * @see Component.supportedComponentScopes
 *
 * @typedef {("required"|"optional"|"excluded")} Component.ComponentScope
 */

/**
 * Component's type
 *
 * @see Component.supportedComponentTypes
 *
 * @typedef {("application"|"framework"|"library"|"container"|"operating-system"|"device"|"firmware"
 *           |"file")} Component.ComponentType
 */

class Component extends CycloneDXObject {
  // region required properties

  /** @type {Component.ComponentType} */
  #type = 'library'
  /** @type {string} */
  #name = ''

  // endregion required properties

  // region optional properties

  /** @type {(string|undefined)} */
  #author
  /** @type {(string|undefined)} */
  #bomRef
  /** @type {(string|undefined)} */
  #copyright
  /** @type {(string|undefined)} */
  #cpe
  /** @type {(string|undefined)} */
  #description
  /** @type {(ExternalReferenceList|undefined)} */
  #externalReferences
  /** @type {(string|undefined)} */
  #group
  /** @type {(HashList|undefined)} */
  #hashes
  /** @type {(LicenseChoice|undefined)} */
  #licenses
  /** @type {(string|undefined)} */
  #publisher
  /** @type {(string|undefined)} */
  #purl
  /** @type {(Component.ComponentScope|undefined)} */
  #scope
  /** @type {(OrganizationalEntity|undefined)} */
  #supplier
  /** @type {(Swid|undefined)} */
  #swid
  /** @type {(string|undefined)} */
  #version

  // endregion optional properties

  /**
   * @param {(object|undefined)} [pkg]
   * @param {boolean} [includeLicenseText]
   * @param {(object|undefined)} [lockfile]
   */
  constructor (pkg, includeLicenseText = true, lockfile) {
    super()

    if (pkg) {
      // use the setters wherever type checks are needed, as the input data is untrusted and potentially malformed.
      const pkgIdentifier = parsePackageJsonName(pkg.name)

      this.name = pkgIdentifier.fullName

      this.type = this.determinePackageType(pkg)

      try {
        this.version = pkg.version
      } catch (e) { /* pass */ }

      this.group = pkgIdentifier.scope
      if (this.#group) {
        this.#group = `@${this.#group}`
      }

      try {
        this.description = pkg.description
      } catch (e) { /* pass */ }

      try {
        this.#licenses = new LicenseChoice(pkg, includeLicenseText)
      } catch (e) { /* pass */ }

      this.#hashes = new HashList(pkg, lockfile)

      this.#externalReferences = new ExternalReferenceList(pkg)

      if (this.#name && this.#version) {
        this.#purl = new PackageURL('npm', this.#group, this.#name, this.#version, null, null).toString()
      }

      if (pkg.author instanceof Object) {
        try {
          this.author = pkg.author.name
        } catch (e) { /* pass */ }
      }

      // bomRef defaults to PURL for backwards compatibility reasons
      this.bomRef = this.purl
    } else {
      this.#hashes = new HashList()
      this.#externalReferences = new ExternalReferenceList()
    }
  }

  /**
   * If the author has described the module as a 'framework', the take their
   * word for it, otherwise, identify the module as a 'library'.
   *
   * @returns {("framework"|"library")}
   */
  determinePackageType (pkg) {
    if (pkg && Object.prototype.hasOwnProperty.call(pkg, 'keywords')) {
      for (const keyword of pkg.keywords) {
        if (keyword.toLowerCase() === 'framework') {
          return 'framework'
        }
      }
    }
    return 'library'
  }

  /**
   * @returns {Array<Component.ComponentType>}
   */
  static supportedComponentTypes () {
    return ['application', 'framework', 'library', 'container', 'operating-system', 'device', 'firmware', 'file']
  }

  /**
   * @returns {Array<Component.ComponentScope>}
   */
  static supportedComponentScopes () {
    return ['required', 'optional', 'excluded']
  }

  /**
   * @type {Component.ComponentType}
   */
  get type () {
    return this.#type
  }

  /**
   * @see supportedComponentTypes
   * @param {Component.ComponentType} value
   * @throws {TypeError} if value is not in expected range
   */
  set type (value) {
    this.#type = this.validateChoice('Type', value, Component.supportedComponentTypes())
  }

  /**
   * @type {(string|undefined)}
   */
  get bomRef () {
    return this.#bomRef
  }

  /**
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set bomRef (value) {
    this.#bomRef = this.validateType('bom-ref', value, String)
  }

  /**
   * @type {(OrganizationalEntity|undefined)}
   */
  get supplier () {
    return this.#supplier
  }

  /**
   * @param {(OrganizationalEntity|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set supplier (value) {
    this.#supplier = this.validateType('Supplier', value, OrganizationalEntity)
  }

  /**
   * @type {(string|undefined)}
   */
  get author () {
    return this.#author
  }

  /**
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set author (value) {
    this.#author = this.validateType('Author', value, String)
  }

  /**
   * @type {(string|undefined)}
   */
  get publisher () {
    return this.#publisher
  }

  /**
   *
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set publisher (value) {
    this.#publisher = this.validateType('Publisher', value, String)
  }

  /**
   * @type {(string|undefined)}
   */
  get group () {
    return this.#group
  }

  /**
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set group (value) {
    this.#group = this.validateType('Group', value, String)
  }

  /**
   * @type {string}
   */
  get name () {
    return this.#name
  }

  /**
   * @param {string} value
   * @throws {TypeError} if value is not of expected type
   */
  set name (value) {
    this.#name = this.validateType('Name', value, String, true)
  }

  /**
   * @type {(string|undefined)}
   */
  get version () {
    return this.#version
  }

  /**
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set version (value) {
    this.#version = this.validateType('Version', value, String)
  }

  /**
   * @type {(string|undefined)}
   */
  get description () {
    return this.#description
  }

  /**
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set description (value) {
    this.#description = this.validateType('Description', value, String)
  }

  /**
   * @type {(Component.ComponentScope|undefined)}
   */
  get scope () {
    return this.#scope
  }

  /**
   * @see supportedComponentScopes
   * @param {(Component.ComponentScope|undefined)} value
   * @throws {RangeError} if value is not of expected range
   */
  set scope (value) {
    this.#scope = value
      ? this.validateChoice('Scope', value, Component.supportedComponentScopes())
      : undefined
  }

  /**
   * @type {(HashList|undefined)}
   */
  get hashes () {
    return this.#hashes
  }

  /**
   * @param {(HashList|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set hashes (value) {
    this.#hashes = this.validateType('Hashes', value, HashList)
  }

  /**
   * @type {(LicenseChoice|undefined)}
   */
  get licenses () {
    return this.#licenses
  }

  /**
   * @param {(LicenseChoice|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set licenses (value) {
    this.#licenses = this.validateType('Licenses', value, LicenseChoice)
  }

  /**
   * @type {(string|undefined)}
   */
  get copyright () {
    return this.#copyright
  }

  /**
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set copyright (value) {
    this.#copyright = this.validateType('Copyright', value, String)
  }

  /**
   * @type {(string|undefined)}
   */
  get cpe () {
    return this.#cpe
  }

  /**
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set cpe (value) {
    this.#cpe = this.validateType('CPE', value, String)
  }

  /**
   * @type {(string|undefined)}
   */
  get purl () {
    return this.#purl
  }

  /**
   * @param {(string|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set purl (value) {
    this.#purl = this.validateType('PURL', value, String)
  }

  /**
   * @type {(Swid|undefined)}
   */
  get swid () {
    return this.#swid
  }

  /**
   * @param {(Swid|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set swid (value) {
    this.#swid = this.validateType('SWID', value, Swid)
  }

  /**
   * @type {(ExternalReferenceList|undefined)}
   */
  get externalReferences () {
    return this.#externalReferences
  }

  /**
   * @param {(ExternalReferenceList|undefined)} value
   * @throws {TypeError} if value is not of expected type
   */
  set externalReferences (value) {
    this.#externalReferences = this.validateType('ExternalReferenceList', value, ExternalReferenceList)
  }

  /**
   *
   * @returns {object}
   */
  toJSON () {
    return {
      type: this.#type,
      'bom-ref': this.#bomRef,
      supplier: this.#supplier
        ? this.#supplier.toJSON()
        : undefined,
      author: this.#author,
      publisher: this.#publisher,
      group: this.#group,
      name: this.#name,
      version: this.#version || '',
      description: this.#description,
      scope: this.#scope,
      hashes: this.#hashes && this.#hashes.length > 0
        ? this.#hashes.toJSON()
        : undefined,
      licenses: this.#licenses
        ? this.#licenses.toJSON()
        : undefined,
      copyright: this.#copyright,
      cpe: this.#cpe,
      purl: this.#purl,
      swid: this.#swid
        ? this.#swid.toJSON()
        : undefined,
      externalReferences: this.#externalReferences && this.#externalReferences.length > 0
        ? this.#externalReferences.toJSON()
        : undefined
    }
  }

  /**
   * @returns {object}
   */
  toXML () {
    return {
      component: {
        '@type': this.#type,
        '@bom-ref': this.#bomRef,
        supplier: this.#supplier
          ? this.#supplier.toXML()
          : undefined,
        author: this.#author,
        publisher: this.#publisher,
        group: this.#group,
        name: this.#name,
        version: this.#version || '',
        description: this.#description
          ? { '#cdata': this.#description }
          : undefined,
        scope: this.#scope,
        hashes: this.#hashes && this.#hashes.length > 0
          ? this.#hashes.toXML()
          : undefined,
        licenses: this.#licenses
          ? this.#licenses.toXML()
          : undefined,
        copyright: this.#copyright,
        cpe: this.#cpe,
        purl: this.#purl,
        swid: this.#swid
          ? this.#swid.toXML()
          : undefined,
        externalReferences: this.#externalReferences && this.#externalReferences.length > 0
          ? this.#externalReferences.toXML()
          : undefined
      }
    }
  }

  /**
   * Compare with another component.
   *
   * Compare purl, if exists; else compare group, name, version.
   *
   * @param {Component} other
   * @return {number}
   */
  compare (other) {
    if (!(other instanceof Component)) { return 0 }
    if (this.#purl || other.#purl) { return this.#purl.localeCompare(other.#purl) }
    return (this.#group || '').localeCompare(other.#group || '') ||
      (this.#name).localeCompare(other.#name) ||
      (this.#version || '').localeCompare(other.#version || '')
  }
}

module.exports = Component
