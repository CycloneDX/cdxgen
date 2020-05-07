const bom = require("../index.js");

test('no dependencies produces an empty BOM', done => {
  bom.createbom(false, './tests/no-packages', {}, (err, bom) => {
    expect(bom).toMatchSnapshot();
    done();
  });
});

test('dependencies produces a BOM', done => {
  bom.createbom(false, './tests/with-packages', {}, (err, bom) => {
    expect(bom).toMatchSnapshot();
    done();
  });
});
