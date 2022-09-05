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

const Component = require('../../model/Component')
const Hash = require('../../model/Hash')
const HashList = require('../../model/HashList')
const License = require('../../model/License')
const LicenseChoice = require('../../model/LicenseChoice')
const OrganizationalContact = require('../../model/OrganizationalContact')
const OrganizationalEntity = require('../../model/OrganizationalEntity')
const Swid = require('../../model/Swid')

test('Model: Component / Format: XML', () => {
  const result = createComponent().toXML()
  expect(result.component['@type']).toBe('application')
  expect(result.component['@bom-ref']).toBe('12345')
  expect(result.component.supplier.name).toBe('Acme R&D')
  expect(result.component.supplier.url).toBe('https://example.com/r&d')
  expect(result.component.supplier.contact.name).toBe('John Doe')
  expect(result.component.supplier.contact.email).toBe('john.doe@example.com')
  expect(result.component.supplier.contact.phone).toBe('555-1212')
  expect(result.component.author).toBe('Acme Development Team')
  expect(result.component.publisher).toBe('Example Inc')
  expect(result.component.group).toBe('com.example')
  expect(result.component.name).toBe('sample-app')
  expect(result.component.version).toBe('1.0.0')
  expect(result.component.description['#cdata']).toBe('A sample application')
  expect(result.component.scope).toBe('required')
  expect(result.component.hashes[0].hash['@alg']).toBe('SHA-1')
  expect(result.component.hashes[0].hash['#text']).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  expect(result.component.licenses[0].license.id).toBe('Apache-2.0')
  expect(result.component.copyright).toBe('Copyright 2020 Example Inc.')
  expect(result.component.cpe).toBe('cpe:2.3:a:example:sample-app:*:*:*:*:*:*:*:*')
  expect(result.component.purl).toBe('pkg:maven/com.example/sample-app@1.0.0')
  expect(result.component.swid['@tagId']).toBe('example-com-sample-app')
  expect(result.component.swid['@name']).toBe('Sample App')
  expect(result.component.swid['@version']).toBe('1.0.0')
})

test('Model: Component / Format: JSON', () => {
  const result = createComponent().toJSON()
  expect(result.type).toBe('application')
  expect(result['bom-ref']).toBe('12345')
  expect(result.supplier.name).toBe('Acme R&D')
  expect(result.supplier.url[0]).toBe('https://example.com/r&d')
  expect(result.supplier.contact[0].name).toBe('John Doe')
  expect(result.supplier.contact[0].email).toBe('john.doe@example.com')
  expect(result.supplier.contact[0].phone).toBe('555-1212')
  expect(result.author).toBe('Acme Development Team')
  expect(result.publisher).toBe('Example Inc')
  expect(result.group).toBe('com.example')
  expect(result.name).toBe('sample-app')
  expect(result.version).toBe('1.0.0')
  expect(result.description).toBe('A sample application')
  expect(result.scope).toBe('required')
  expect(result.hashes[0].alg).toBe('SHA-1')
  expect(result.hashes[0].content).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  expect(result.licenses[0].license.id).toBe('Apache-2.0')
  expect(result.copyright).toBe('Copyright 2020 Example Inc.')
  expect(result.cpe).toBe('cpe:2.3:a:example:sample-app:*:*:*:*:*:*:*:*')
  expect(result.purl).toBe('pkg:maven/com.example/sample-app@1.0.0')
  expect(result.swid.tagId).toBe('example-com-sample-app')
  expect(result.swid.name).toBe('Sample App')
  expect(result.swid.version).toBe('1.0.0')
})

describe('Model: Component', () => {
  describe.each([
    {
      purpose: 'constructed with author',
      // issue: https://github.com/CycloneDX/cyclonedx-node-module/issues/246
      pkg: { name: 'test', author: { name: 'Foo Bar' } },
      property: 'author',
      detected: 'Foo Bar',
      normalized: 'Foo Bar'
    },
    {
      purpose: 'undefined version normalizes to empty-string',
      property: 'version',
      detected: undefined,
      normalized: ''
    }
  ])('$purpose',
    ({ pkg = undefined, property, detected, normalized }) => {
      const component = new Component(pkg)
      testPropertyAndNormalization({
        component,
        propertyName: property,
        expectedProperty: detected,
        expectedNormalized: normalized
      })
    })
})

describe('Model: Component set empty version results in undefined', () => {
  // issue: https://github.com/CycloneDX/cyclonedx-node-module/issues/248
  const component = createComponent()
  expect(component.version).not.toBeUndefined()
  component.version = ''
  expect(component.version).toBeUndefined()
})

describe('Model: Component compare', () => {
  it.each(
    [
      {
        purpose: 'same',
        a: new Component({ name: '@foo/bar', version: '1' }),
        b: new Component({ name: '@foo/bar', version: '1' }),
        expected: 0
      },
      {
        purpose: 'group a/b',
        a: new Component({ name: '@a/bar', version: '1' }),
        b: new Component({ name: '@b/bar', version: '1' }),
        expected: -1
      },
      {
        purpose: 'group b/a',
        a: new Component({ name: '@b/bar', version: '1' }),
        b: new Component({ name: '@a/bar', version: '1' }),
        expected: +1
      },
      {
        purpose: 'group a/b',
        a: new Component({ name: '@a/bar', version: '1' }),
        b: new Component({ name: '@b/bar', version: '1' }),
        expected: -1
      },
      {
        purpose: 'name a/b',
        a: new Component({ name: '@foo/a', version: '1' }),
        b: new Component({ name: '@foo/b', version: '1' }),
        expected: -1
      },
      {
        purpose: 'name b/a',
        a: new Component({ name: '@foo/b', version: '1' }),
        b: new Component({ name: '@foo/a', version: '1' }),
        expected: +1
      },
      {
        purpose: 'version 1/2',
        a: new Component({ name: '@foo/bar', version: '1' }),
        b: new Component({ name: '@foo/bar', version: '2' }),
        expected: -1
      },
      {
        purpose: 'version 2/1',
        a: new Component({ name: '@foo/bar', version: '2' }),
        b: new Component({ name: '@foo/bar', version: '1' }),
        expected: +1
      },
      {
        purpose: 'version no/1',
        a: new Component({ name: '@foo/bar' }),
        b: new Component({ name: '@foo/bar', version: '1' }),
        expected: -1
      },
      {
        purpose: 'version 1/no',
        a: new Component({ name: '@foo/bar', version: '1' }),
        b: new Component({ name: '@foo/bar' }),
        expected: +1
      }
    ]
  )('$purpose', ({ a, b, expected }) => {
    expect(a.compare(b)).toBe(expected)
  })
})

function testPropertyAndNormalization ({ component, propertyName, expectedProperty, expectedNormalized }) {
  test('detects expected', () => {
    expect(component[propertyName]).toEqual(expectedProperty)
  })

  test('normalizes to expected JSON', () => {
    const json = component.toJSON()
    expect(json[propertyName]).toBe(expectedNormalized)
  })

  test('normalizes to expected XML', () => {
    const xml = component.toXML()
    expect(xml.component[propertyName]).toBe(expectedNormalized)
  })
}

function createComponent () {
  const component = new Component()
  component.type = 'application'
  component.bomRef = '12345'
  component.supplier = new OrganizationalEntity('Acme R&D', 'https://example.com/r&d', new OrganizationalContact('John Doe', 'john.doe@example.com', '555-1212'))
  component.author = 'Acme Development Team'
  component.publisher = 'Example Inc'
  component.group = 'com.example'
  component.name = 'sample-app'
  component.version = '1.0.0'
  component.description = 'A sample application'
  component.scope = 'required'
  const hashList = new HashList()
  hashList.hashes.push(new Hash('SHA-1', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'))
  component.hashes = hashList
  const license = new License()
  license.id = 'Apache-2.0'
  const licenseChoice = new LicenseChoice()
  licenseChoice.licenses = [license]
  component.licenses = licenseChoice
  component.copyright = 'Copyright 2020 Example Inc.'
  component.cpe = 'cpe:2.3:a:example:sample-app:*:*:*:*:*:*:*:*'
  component.purl = 'pkg:maven/com.example/sample-app@1.0.0'
  component.swid = new Swid('example-com-sample-app', 'Sample App', '1.0.0')
  return component
}
