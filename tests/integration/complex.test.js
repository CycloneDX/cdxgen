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

const Bom = require('../../model/Bom')
const Tool = require('../../model/Tool')
const Metadata = require('../../model/Metadata')
const Dependency = require('../../model/Dependency')
const Component = require('../../model/Component')

describe('integration of complex', () => {
  const complex = new Bom()
  complex.metadata = new Metadata()
  complex.metadata.timestamp = new Date(0)
  complex.metadata.tools.push(new Tool('foo', 'bar', '0.0.0-testing'))
  complex.metadata.component = new Component()
  complex.metadata.component.name = 'RootComponent'
  complex.metadata.component.version = '1.33.7'
  complex.metadata.component.bomRef = 'myRootComponent'
  const c1 = new Component()
  c1.name = 'SomeComponent'
  c1.version = '23.42'
  c1.bomRef = 'some-component-2342'
  complex.components.push(c1)
  const c2 = new Component()
  c2.name = 'SomeComponent'
  c2.version = '0.8.15'
  c2.bomRef = 'some-component-0815'
  complex.components.push(c2)
  complex.addDependency(new Dependency(complex.metadata.component.bomRef, [
    new Dependency(c1.bomRef),
    new Dependency(c2.bomRef)
  ]))

  test.each(
    [
      'XML',
      'JSON'
    ]
  )('as %s', (target, done) => {
    process.env.BOM_REPRODUCIBLE = '1'
    const result = complex[`to${target}`]()
    expect(result).toMatchSnapshot()
    done()
  })
})
