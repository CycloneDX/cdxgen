const bom = require("../index.js");

test('createbom produces an empty BOM', done => {
  bom.createbom(false, './tests/no-packages', {}, (err, bom) => {
    expect(bom).toMatchSnapshot();
    done();
  });
});

test('createbom produces a BOM without development dependencies', done => {
  bom.createbom(false, './tests/with-packages', {}, (err, bom) => {
    expect(bom).toMatchSnapshot();
    done();
  });
});
