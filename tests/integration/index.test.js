/* eslint-env jest */

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

const path = require('path')

const bomHelpers = require('../../index.js')
const Bom = require('../../model/Bom.js')

const programVersion = '3.0.0'

describe('integration:', () => {
  describe.each(
    [
      {
        dir: 'no-packages',
        purpose: 'that is empty'
      },
      {
        dir: 'no-lockfile',
        purpose: 'when no package-lock.json is present'
      },
      {
        dir: 'with-packages',
        purpose: 'without development dependencies',
        options: { /* do not set dev:false - is must be default */}
      },
      {
        dir: 'with-packages',
        purpose: 'with development dependencies',
        options: { dev: true }
      },
      {
        dir: 'with-lockfile-2',
        purpose: 'that includes hashes from package-lock.json'
      },
      {
        dir: 'with-dev-dependencies',
        purpose: 'when all dependencies are dev-dependencies that shall not be listed',
        options: { dev: false }
      },
      {
        dir: 'with-dev-dependencies',
        purpose: 'when all dependencies are dev-dependencies that shall be listed',
        options: { dev: true }
      },
      {
        dir: 'no-name',
        purpose: 'when there is no name in the root package',
        options: { dev: true }
      },
      {
        dir: 'with-yarn1-lockfile',
        purpose: 'verify conversion of yarn1 lock to package.json'
      }
    ]
  )('produce a BOM $purpose', ({ dir, options = {} }) => {
    test.each(
      [
        'XML',
        'JSON'
      ]
    )('as %s', (target, done) => {
      bomHelpers.createbom(
        'library', false, false,
        path.join(__dirname, dir), options,
        (err, bom) => {
          expect(err).toBeNull()
          expect(bom).toBeInstanceOf(Bom)

          bom.metadata.tools[0].version = programVersion
          process.env.BOM_REPRODUCIBLE = '1'

          const result = bom[`to${target}`]()
          expect(result).toMatchSnapshot()
          done()
        })
    })
  })
})
