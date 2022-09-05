#!/usr/bin/env node
/* eslint-env node */

/*!
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

const fs = require('fs')
const process = require('process')

const commander = require('commander')
const DomParser = require('@xmldom/xmldom').DOMParser
const xmlFormat = require('prettify-xml')

const bomHelpers = require('../index.js')
const program = require('../package.json')
const Component = require('../model/Component')

const EXIT_SUCCESS = 0
const EXIT_INVALID = 1
const EXIT_FAILURE = 2

const xmlOptions = { indent: 4, newline: '\n' }

const cdx = new commander.Command()

let filePath = '.'

cdx
  .description(program.description)
  .addHelpText('afterAll', '\n\n' +
    'Environment variable BOM_REPRODUCIBLE causes bom result to be more consistent\n' +
    'over multiple runs by omitting time/rand-based values, and sorting lists.\n')
  .version(program.version, '-v, --version')
  .argument('[path]', 'Path to analyze')
  .option('-d, --include-dev', 'Include devDependencies', false)
  .option('-l, --include-license-text', 'Include full license text', false)
  .option('-o, --output <output>', 'Write BOM to file', 'bom.xml')
  .option('-t, --type <type>', 'Project type', 'library')
  .option('-ns, --no-serial-number', 'Do not include BOM serial number', true)
  .action((path) => {
    if (path) filePath = path
  })
  .parse(process.argv)

const options = cdx.opts()

const includeSerialNumber = options.serialNumber
const includeLicenseText = options.includeLicenseText
const output = options.output
const componentType = options.type

if (Component.supportedComponentTypes().indexOf(componentType) === -1) {
  throw new RangeError(
    'Unsupported component type. Supported types are ' +
    Component.supportedComponentTypes().toString()
  )
}

// Options are specific to readinstalled
const readInstalledOptions = { dev: options.includeDev }

/**
 * Creates a Bom object and writes either XML or JSON.
 */
bomHelpers.createbom(componentType, includeSerialNumber, includeLicenseText, filePath, readInstalledOptions, (createbomError, bom) => {
  if (!fs.existsSync(filePath)) {
    console.error('Folder path does not exist')
    process.exit(EXIT_INVALID)
  }

  if (createbomError) {
    console.debug(createbomError)
    console.error(
      'Ooops. Something stupid happened.',
      'Please file an issue at https://github.com/CycloneDX/cyclonedx-node-module/issues/new'
    )
    process.exit(EXIT_FAILURE)
  }

  const writeFileCB = (writeFileError) => {
    if (!writeFileError) { process.exit(EXIT_SUCCESS) }
    console.error('Failed to write output file: ' + writeFileError.path)
    process.exit(EXIT_FAILURE)
  }

  if (bom.components.length === 0) {
    console.info(
      'There are no components in the BOM.',
      'The project may not contain dependencies or node_modules does not exist.',
      'Executing `npm install` prior to CycloneDX may solve the issue.'
    )
  }

  if (output.endsWith('.xml')) {
    const doc = new DomParser().parseFromString(bom.toXML())
    const xmlString = xmlFormat(doc.toString(), xmlOptions)
    fs.writeFile(output, xmlString, writeFileCB)
  } else if (output.endsWith('.json')) {
    fs.writeFile(output, bom.toJSON(), writeFileCB)
  } else {
    console.error('Unsupported file extension. Output filename must end with .xml or .json')
    process.exit(EXIT_INVALID)
  }
})
