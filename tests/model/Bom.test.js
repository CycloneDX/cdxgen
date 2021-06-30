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
const Bom = require('../../model/Bom');

test('default schema version', () => {
  let bom = new Bom();
  expect(bom.schemaVersion).toBe('1.3');
});

test('default bom version', () => {
  let bom = new Bom();
  expect(bom.version).toBe(1);
});

test('specific bom version', () => {
  let bom = new Bom();
  bom.version = 2;
  expect(bom.version).toBe(2);
});

test('generated serial number', () => {
  let bom = new Bom();
  expect(bom.serialNumber).toContain('urn:uuid:');
});
