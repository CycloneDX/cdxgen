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

const ExternalReferenceList = require('../../model/ExternalReferenceList')
const ExternalReference = require('../../model/ExternalReference')

describe('ExternalReferenceList', () => {
  const mustBePresent = [
    'http://someurl.com',
    'https://someurl.com',
    'https://any.other.string',
    'https://example.com/#something.',
    'https://example.com/?foobar=.',
    'https://example.com/foo/.',
    'https://example.com/bar.'
  ]
  const mustBeOmitted = [
    'http://.',
    'https://.'
  ]
  const cases = [
    ...mustBePresent.map(s => ({
      purpose: `homepage be detected: ${s}`,
      pkg: { homepage: s },
      expected: [new ExternalReference('website', s)]
    })),
    ...mustBeOmitted.map(s => ({
      purpose: `homepage be omitted: ${s}`,
      pkg: { homepage: s },
      expected: []
    }))
  ]

  test.each(cases)('$purpose', ({ pkg, expected }) => {
    const refs = new ExternalReferenceList(pkg)
    expect(refs.externalReferences).toEqual(expected)
  })
})
