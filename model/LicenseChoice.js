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

const spdxLicenses = require('../spdx-licenses.json')
const fs = require('fs')
const License = require('./License')
const AttachmentText = require('./AttachmentText')
const CycloneDXObject = require('./CycloneDXObject')

class LicenseChoice extends CycloneDXObject {
  constructor (pkg, includeLicenseText = true) {
    super()
    if (pkg) {
      this._licenses = this.processLicenses(pkg, includeLicenseText)
      this._expression = null
    }
  }

  /**
   * Performs a lookup + validation of the license specified in the
   * package. If the license is a valid SPDX license ID, set the 'id'
   * of the license object, otherwise, set the 'name' of the license
   * object.
   */
  processLicenses (pkg, includeLicenseText = true) {
    let license = pkg.license && (pkg.license.type || pkg.license)
    if (license) {
      if (!Array.isArray(license)) {
        license = [license]
      }
      return license.map(l => {
        if (!(typeof l === 'string' || l instanceof String)) {
          console.error('Invalid license definition in package: ' + pkg.name + ':' + pkg.version + '. Skipping')
          return undefined
        }
        const licenseObject = new License()
        if (spdxLicenses.some(v => { return l === v })) {
          licenseObject.id = l
        } else {
          licenseObject.name = l
        }
        if (includeLicenseText) {
          this.addLicenseText(pkg, l, licenseObject)
        }
        return licenseObject
      })
    }
    return null
  }

  /**
   * Tries to find a file containing the license text based on commonly
   * used naming and content types. If a candidate file is found, add
   * the text to the license text object and stop.
   */
  addLicenseText (pkg, l, licenseObject) {
    const licenseFilenames = ['LICENSE', 'License', 'license', 'LICENCE', 'Licence', 'licence', 'NOTICE', 'Notice', 'notice']
    const licenseContentTypes = { 'text/plain': '', 'text/txt': '.txt', 'text/markdown': '.md', 'text/xml': '.xml' }
    /* Loops over different name combinations starting from the license specified
       naming (e.g., 'LICENSE.Apache-2.0') and proceeding towards more generic names. */
    for (const licenseName of [`.${l}`, '']) {
      for (const licenseFilename of licenseFilenames) {
        for (const [licenseContentType, fileExtension] of Object.entries(licenseContentTypes)) {
          const licenseFilepath = `${pkg.realPath}/${licenseFilename}${licenseName}${fileExtension}`
          if (fs.existsSync(licenseFilepath) && fs.lstatSync(licenseFilepath).isFile()) {
            // 'text/plain' is the default in the spec. No need to specify it.
            const contentType = (licenseContentType === 'text/plain') ? null : licenseContentType
            licenseObject.attachmentText = this.createAttachmentText(licenseFilepath, contentType)
          }
        }
      }
    }
  }

  /**
   * Read the file from the given path to the license text object and includes
   * content-type attribute, if not default. Returns the license text object.
   */
  createAttachmentText (licenseFilepath, licenseContentType) {
    const licenseText = fs.readFileSync(licenseFilepath, 'utf8')
    if (licenseText) {
      return new AttachmentText(licenseContentType, licenseText)
    }
    return null
  }

  get licenses () {
    return this._licenses
  }

  set licenses (value) {
    if (!Array.isArray(value)) {
      throw new TypeError('LicenseChoice.licenses value must be an array of License objects')
    } else {
      this._expression = null
      this._licenses = value
    }
  }

  get expression () {
    return this._expression
  }

  set expression (value) {
    this._licenses = null
    this._expression = this.validateType('SPDX license expression', value, String)
  }

  toJSON () {
    if (this._licenses && this._licenses.length > 0) {
      const value = []
      for (const license of this._licenses) {
        if (license instanceof License) {
          value.push(license.toJSON())
        }
      }
      return value
    } else if (this._expression) {
      return this._expression
    }
    return undefined
  }

  toXML () {
    if (this._licenses && this._licenses.length > 0) {
      const value = []
      for (const license of this._licenses) {
        if (license instanceof License) {
          value.push(license.toXML())
        }
      }
      return value
    } else if (this._expression) {
      return this._expression
    }
    return null
  }
}

module.exports = LicenseChoice
