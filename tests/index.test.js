const bomHelpers = require("../index.js");
const fs = require("fs");
const xmlFormat = require("prettify-xml");
const xmlOptions = {indent: 4, newline: "\n"};
const DomParser = require('xmldom').DOMParser;

test('createbom produces an empty BOM', done => {
  bomHelpers.createbom(false, false, './tests/no-packages', {}, (err, bom) => {
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM without development dependencies', done => {
  bomHelpers.createbom(false, true, './tests/with-packages', {}, (err, bom) => {
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM with development dependencies', done => {
  bomHelpers.createbom(false, true, './tests/with-packages', { dev: true }, (err, bom) => {
    expect(bom.toXML()).toMatchSnapshot();
    done();
  });
});

test('creatbom produces a BOM in JSON format', done => {
  bomHelpers.createbom(false, true, './tests/with-packages', { json: true }, (err, bom) => {
    //expect(bom.toJSON()).toMatchSnapshot();
    done();
  });
});

/* TODO - broken with refacgtor - consumes all available memory
test('mergebom includes all dependencies in XML format', done => {
  let additionalBom = fs.readFileSync('./tests/other-bom.xml', "utf-8");
  let additionalDoc = new DomParser().parseFromString(additionalBom);

  bomHelpers.createbom(false, false, './tests/with-packages', {}, (err, bom) => {
    let doc = new DomParser().parseFromString(bom);
    bomHelpers.mergebom(doc, additionalDoc);
    bom = xmlFormat(doc.toString(), xmlOptions);
    expect(bom).toMatchSnapshot();
    done();
  });
});
 */
