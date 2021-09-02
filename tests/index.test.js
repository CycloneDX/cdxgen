const bomHelpers = require("../index.js");
const fs = require("fs");
const xmlFormat = require("prettify-xml");
const xmlOptions = {indent: 4, newline: "\n"};
const DomParser = require('xmldom').DOMParser;

const timestamp = new Date("2020-01-01T01:00:00.000Z");
const programVersion = "2.0.0";

test('createbom produces an empty BOM', done => {
  bomHelpers.createbom("library", false, false, './tests/no-packages', {}, (err, bom) => {
    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM without development dependencies', done => {
  bomHelpers.createbom("library", false, true, './tests/with-packages', {}, (err, bom) => {
    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM with development dependencies', done => {
  bomHelpers.createbom("library", false, true, './tests/with-packages', { dev: true }, (err, bom) => {
    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM in JSON format', done => {
  bomHelpers.createbom("library", false, true, './tests/with-packages', {}, (err, bom) => {
    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toJSON()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM in JSON format that includes hashes from package-lock.json', done => {
  bomHelpers.createbom("library", false, true, './tests/with-lockfile-2', {}, (err, bom) => {
    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toJSON()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM when no package-lock.json is present', done => {
  bomHelpers.createbom("library", false, true, './tests/no-lockfile', {}, (err, bom) => {
    bom.metadata.timestamp = timestamp;
    bom.metadata.tools[0].version = programVersion;
    expect(bom.toJSON()).toMatchSnapshot();
    done();
  });
});
