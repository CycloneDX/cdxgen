# cdx-proto

Runtime library to serialize/deserialize CycloneDX BOM with protocol buffers. The project was generated using [protoc-gen-es](https://github.com/bufbuild/protobuf-es) from the official [proto](https://github.com/CycloneDX/specification/blob/master/schema/bom-1.6.proto) specification.

## Sample usage

```js
import { cdx_15, cdx_16 } from "@cyclonedx/cdx-proto";
import {
  fromBinary,
  fromJsonString,
  toBinary,
  toJson,
} from "@bufbuild/protobuf";

// Create .proto files 
let bomSchema;
if (+bomJson.specVersion === 1.6) {
  bomSchema = cdx_16.BomSchema;
} else {
  bomSchema = cdx_15.BomSchema;
}
writeFileSync(
  binFile,
  toBinary(
    bomSchema,
    fromJsonString(bomSchema, stringifyIfNeeded(bomJson), {
      ignoreUnknownFields: true,
    }),
  ),
  {
    writeUnknownFields: true,
  },
);

// Read .proto files
const bomObject = fromBinary(bomSchema, readFileSync(binFile), {
  readUnknownFields: true,
});
const jsonstr = toJson(bomSchema, bomObject, { emitDefaultValues: true });
```

## License

Apache-2.0
