/* eslint-env jest */

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

const ExternalReference = require('../../model/ExternalReference')

describe('Model: ExternalReference / Format: JSON', () => {
  const cases = [
    {
      purpose: 'no comment',
      pkg: new ExternalReference('website', 'http://someurl.com'),
      expected: '{"type":"website","url":"http://someurl.com"}'
    },
    {
      purpose: 'with comment',
      pkg: new ExternalReference('other', 'http://someurl.com', 'my comment'),
      expected: '{"type":"other","url":"http://someurl.com","comment":"my comment"}'
    }
  ]

  test.each(cases)('$purpose', ({ pkg, expected }) => {
    expect(JSON.stringify(pkg.toJSON())).toEqual(expected)
  })
})

test('Model: ExternalReference / Format: XML', () => {
  let result = new ExternalReference('website', 'http://someurl.com').toXML()
  expect(result.reference['@type']).toBe('website')
  expect(result.reference.url).toBe('http://someurl.com')
  expect(result.reference.comment).toBe(undefined)

  result = new ExternalReference('other', 'http://someurl.com', 'my comment').toXML()
  expect(result.reference['@type']).toBe('other')
  expect(result.reference.url).toBe('http://someurl.com')
  expect(result.reference.comment).toBe('my comment')
})
