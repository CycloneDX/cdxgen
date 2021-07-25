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
const Bom = require('../../model/Bom');
const Component = require('../../model/Component');
const Metadata = require('../../model/Metadata');
const OrganizationalContact = require('../../model/OrganizationalContact');
const OrganizationalEntity = require('../../model/OrganizationalEntity');
const Tool = require('../../model/Tool');


test('Model: Metadata / Format: XML', () => {
  let result = createMetadata().toXML();
  expect(new Date(result.timestamp)).toBeInstanceOf(Date);
  expect(result.tools[0].tool.vendor).toBe("Acme");
  expect(result.tools[0].tool.name).toBe("My tool");
  expect(result.tools[0].tool.version).toBe("2.2.0");
  expect(result.manufacture.name).toBe("Acme R&D");
  expect(result.manufacture.url).toBe("https://example.com/r&d");
  expect(result.manufacture.contact.name).toBe("R&D");
  expect(result.manufacture.contact.email).toBe("rd@example.com");
  expect(result.manufacture.contact.phone).toBe("555-1212");
  expect(result.supplier.name).toBe("Acme Wholesale");
  expect(result.supplier.url).toBe("https://example.com/wholesale");
  expect(result.supplier.contact.name).toBe("Customer Service");
  expect(result.supplier.contact.email).toBe("wholesale@example.com");
  expect(result.supplier.contact.phone).toBe("555-1212");
  expect(result.component['@type']).toBe("application");
  expect(result.component.name).toBe("sample-app");
  expect(result.component.version).toBe("1.0.0");
});

test('Model: Metadata / Format: JSON', () => {
  let result = createMetadata().toJSON();
  expect(new Date(result.timestamp)).toBeInstanceOf(Date);
  expect(result.tools[0].vendor).toBe("Acme");
  expect(result.tools[0].name).toBe("My tool");
  expect(result.tools[0].version).toBe("2.2.0");
  expect(result.manufacture.name).toBe("Acme R&D");
  expect(result.manufacture.url[0]).toBe("https://example.com/r&d");
  expect(result.manufacture.contact[0].name).toBe("R&D");
  expect(result.manufacture.contact[0].email).toBe("rd@example.com");
  expect(result.manufacture.contact[0].phone).toBe("555-1212");
  expect(result.supplier.name).toBe("Acme Wholesale");
  expect(result.supplier.url[0]).toBe("https://example.com/wholesale");
  expect(result.supplier.contact[0].name).toBe("Customer Service");
  expect(result.supplier.contact[0].email).toBe("wholesale@example.com");
  expect(result.supplier.contact[0].phone).toBe("555-1212");
  expect(result.component['type']).toBe("application");
  expect(result.component.name).toBe("sample-app");
  expect(result.component.version).toBe("1.0.0");
});

function createMetadata() {
  let bom = new Bom();
  let metadata = new Metadata();
  metadata.tools = [new Tool("Acme", "My tool", "2.2.0")];
  metadata.authors = [new OrganizationalContact("Jane Doe", "jane.doe@example.com", "555-1212")];
  metadata.manufacture = new OrganizationalEntity("Acme R&D", "https://example.com/r&d", new OrganizationalContact("R&D", "rd@example.com", "555-1212"));
  metadata.supplier = new OrganizationalEntity("Acme Wholesale", "https://example.com/wholesale", new OrganizationalContact("Customer Service", "wholesale@example.com", "555-1212"));
  let component = new Component();
  component.type = "application";
  component.name = "sample-app";
  component.version = "1.0.0";
  metadata.component = component;
  bom.metadata = metadata;
  return metadata;
}
