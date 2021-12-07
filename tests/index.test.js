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

const bomHelpers = require("../index.js");

const timestamp = new Date("2020-01-01T01:00:00.000Z");
const programVersion = "3.0.0";

test('createbom produces an empty BOM', done => {
  bomHelpers.createbom("library", false, false, './tests/no-packages', {}, (err, bom) => {
    expect(err).toBeFalsy();

    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM without development dependencies', done => {
  bomHelpers.createbom("library", false, true, './tests/with-packages', {}, (err, bom) => {
    expect(err).toBeFalsy();

    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM with development dependencies', done => {
  bomHelpers.createbom("library", false, true, './tests/with-packages', { dev: true }, (err, bom) => {
    expect(err).toBeFalsy();

    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM in JSON format', done => {
  bomHelpers.createbom("library", false, true, './tests/with-packages', {}, (err, bom) => {
    expect(err).toBeFalsy();

    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toJSON()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM in JSON format that includes hashes from package-lock.json', done => {
  bomHelpers.createbom("library", false, true, './tests/with-lockfile-2', {}, (err, bom) => {
    expect(err).toBeFalsy();

    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toJSON()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM when no package-lock.json is present', done => {
  bomHelpers.createbom("library", false, true, './tests/no-lockfile', {}, (err, bom) => {
    expect(err).toBeFalsy();

    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toJSON()).toMatchSnapshot();
    done();
  });
});
