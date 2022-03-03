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

const ExternalReferenceList = require('../../model/ExternalReferenceList')

describe.each([
  'http://someurl.com',
  'https://someurl.com',
  'https://any.other.string',
  'https://example.com/#something.',
  'https://example.com/?foobar=.',
  'https://example.com/foo/.',
  'https://example.com/bar.'
])('Homepage %s', (homepage) => {
  test('should be present in externalReferences array', () => {
    const externalReferences = new ExternalReferenceList({ homepage }).externalReferences

    expect(externalReferences).toHaveLength(1)
    expect(externalReferences).toEqual([expect.objectContaining({ url: homepage })])
  })
})

describe.each([
  'http://.',
  'https://.'
])('Homepage %s', (homepage) => {
  test('should not be present in externalReferences array', () => {
    const externalReferences = new ExternalReferenceList({ homepage }).externalReferences

    expect(externalReferences).toHaveLength(0)
  })
})
