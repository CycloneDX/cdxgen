const Bom = require('../../model/Bom');

test('default schema version', () => {
  let bom = new Bom();
  expect(bom.schemaVersion).toBe('1.2');
});

test('specific schema version', () => {
  let bom = new Bom();
  bom.schemaVersion = "1.1";
  expect(bom.schemaVersion).toBe('1.1');
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
