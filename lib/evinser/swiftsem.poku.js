import { readFileSync } from "node:fs";

import { assert, it } from "poku";

import {
  extractCompilerParamsFromBuild,
  parseDumpPackage,
  parseIndex,
  parseModuleInfo,
  parseOutputFileMap,
  parseStructure,
} from "./swiftsem.js";

it("extractCompilerParamsFromBuild test", () => {
  const paramsObj = extractCompilerParamsFromBuild(
    readFileSync("./test/data/swiftsem/swift-build-output1.txt", {
      encoding: "utf-8",
    }),
  );
  assert.ok(paramsObj.params);
  assert.deepStrictEqual(
    paramsObj.compilerArgs,
    "-sdk /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX15.0.sdk -F /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/Library/Frameworks -F -Xcc -I /Volumes/Work/sandbox/HAKit/.build/x86_64-apple-macosx/debug/Modules -I /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/usr/lib -L /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/usr/lib",
  );
});

it("parseDumpPackage", () => {
  const metadata = parseDumpPackage(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-dump-package.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.deepStrictEqual(metadata.rootModule, "HAKit");
  assert.deepStrictEqual(metadata.dependencies, [
    {
      dependsOn: ["Starscream"],
      ref: "HAKit",
    },
    {
      dependsOn: ["HAKit", "PromiseKit"],
      ref: "HAKit_PromiseKit",
    },
    {
      dependsOn: ["HAKit"],
      ref: "HAKit_Mocks",
    },
    {
      dependsOn: ["HAKit", "HAKit_PromiseKit", "HAKit_Mocks"],
      ref: "Tests",
    },
  ]);
});

it("collectBuildSymbols", () => {
  const metadata = parseOutputFileMap(
    "./test/data/swiftsem/output-file-map.json",
  );
  assert.deepStrictEqual(metadata, {
    moduleName: "swiftsem",
    moduleSymbols: [
      "Compression",
      "WSCompression",
      "Data_Extensions",
      "Engine",
      "NativeEngine",
      "WSEngine",
      "FoundationHTTPHandler",
      "FoundationHTTPServerHandler",
      "FrameCollector",
      "Framer",
      "HTTPHandler",
      "StringHTTPHandler",
      "FoundationSecurity",
      "Security",
      "Server",
      "WebSocketServer",
      "WebSocket",
      "FoundationTransport",
      "TCPTransport",
      "Transport",
      "resource_bundle_accessor",
    ],
  });
});

it("parseModuleInfo", () => {
  let metadata = parseModuleInfo(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-module-info2.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.deepStrictEqual(metadata.classes.length, 13);
  assert.deepStrictEqual(metadata.protocols.length, 25);
  assert.deepStrictEqual(metadata.enums.length, 16);
  assert.deepStrictEqual(metadata.importedModules, [
    "CommonCrypto",
    "Foundation",
    "Network",
    "SwiftOnoneSupport",
    "_Concurrency",
    "_StringProcessing",
    "_SwiftConcurrencyShims",
    "zlib",
  ]);
  metadata = parseModuleInfo(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-module-info.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.deepStrictEqual(metadata.classes.length, 8);
  assert.deepStrictEqual(metadata.protocols.length, 14);
  assert.deepStrictEqual(metadata.enums.length, 15);
  assert.deepStrictEqual(metadata.importedModules, [
    "Dispatch",
    "Foundation",
    "Network",
    "Starscream",
    "SwiftOnoneSupport",
    "_Concurrency",
    "_StringProcessing",
    "_SwiftConcurrencyShims",
  ]);
});

it("parseStructure", () => {
  let metadata = parseStructure(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-structure-starscream2.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.deepStrictEqual(metadata.referredTypes, [
    "DispatchQueue",
    "Equatable",
    "HAData",
    "HARequestIdentifier",
    "HAResponseController",
    "HAResponseControllerDelegate?",
    "HAResponseControllerPhase",
    "HAWebSocketResponse",
    "Result<(HTTPURLResponse, Data?), Error>",
    "Result<HAData, HAError>",
    "Starscream.WebSocketEvent",
  ]);
  metadata = parseStructure(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-structure-starscream.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.deepStrictEqual(metadata.referredTypes, [
    "@escaping () -> Void",
    "@escaping (HACancellable, T) -> Void",
    "@escaping (Result<T, HAError>) -> Void",
    "@escaping (Result<Void, Error>) -> Void",
    "@escaping RequestCompletion",
    "@escaping SubscriptionHandler",
    "@escaping SubscriptionInitiatedHandler",
    "Data",
    "DispatchQueue",
    "Error",
    "HACachesContainer",
    "HACancellable",
    "HAConnection",
    "HAConnectionConfiguration",
    "HAConnectionDelegate?",
    "HAConnectionState",
    "HAHTTPMethod",
    "HAReconnectManager",
    "HAReconnectManagerDelegate",
    "HARequest",
    "HARequestController",
    "HARequestIdentifier",
    "HARequestIdentifier?",
    "HAResponseController",
    "HATypedRequest<T>",
    "HATypedSubscription<T>",
    "Result<T, HAError>",
    "SubscriptionInitiatedHandler?",
    "UInt8",
    "URLSession",
    "WebSocket",
    "WebSocket?",
    "[HAEventType]",
    "[String: Any]",
  ]);
  metadata = parseStructure(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-structure-speech.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.deepStrictEqual(metadata.referredTypes, [
    "AVSpeechSynthesizer",
    "AVSpeechSynthesizerDelegate",
    "AVSpeechUtterance",
    "NSObject",
  ]);
  metadata = parseStructure(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-structure-grdb.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.deepStrictEqual(metadata.referredTypes, [
    "(URL, URL) throws -> Void",
    "@escaping (GRDBWriteTransaction) throws -> Result<Void, Error>",
    "CaseIterable",
    "Database",
    "DatabaseMigrator",
    "DatabaseMigratorWrapper",
    "DatabaseWriter",
    "GRDBReadTransaction",
    "GRDBWriteTransaction",
    "MigrationId",
    "NSObject",
    "Result<Void, Error>",
    "SDSAnyWriteTransaction",
    "SDSDatabaseStorage",
    "Set<SignalAccount>",
    "SignalRecipient.RowId",
    "StaticString",
    "TSThread",
    "TableAlteration",
    "TableDefinition",
    "UInt",
    "UInt32",
    "URL",
    "UnsafeMutablePointer<ObjCBool>",
    "[SignalServiceAddress: [String]]",
  ]);
});

it("parseIndex", () => {
  let metadata = parseIndex(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-index-starscream.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.ok(metadata.obfuscatedSymbols);
  assert.ok(metadata.symbolLocations);
  assert.deepStrictEqual(metadata.swiftModules, [
    "Combine",
    "CoreFoundation",
    "Darwin",
    "Dispatch",
    "Foundation",
    "ObjectiveC",
    "Observation",
    "Swift",
    "System",
    "_Builtin_float",
    "_Concurrency",
    "_StringProcessing",
    "_errno",
    "_math",
    "_signal",
    "_stdio",
    "_time",
    "sys_time",
    "unistd",
  ]);
  assert.deepStrictEqual(metadata.clangModules, [
    "CoreFoundation",
    "Darwin",
    "Dispatch",
    "Foundation",
    "Mach",
    "ObjectiveC",
    "SwiftShims",
    "_Builtin_float",
    "_SwiftConcurrencyShims",
    "_errno",
    "_math",
    "_signal",
    "_stdio",
    "_time",
    "sys_time",
    "sysdir",
    "timeval",
    "unistd",
    "uuid",
  ]);
  metadata = parseIndex(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-index-starscream2.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.ok(metadata.obfuscatedSymbols);
  assert.ok(metadata.symbolLocations);
  assert.deepStrictEqual(metadata.swiftModules, [
    "Combine",
    "CoreFoundation",
    "Darwin",
    "Dispatch",
    "Foundation",
    "ObjectiveC",
    "Observation",
    "Swift",
    "System",
    "_Builtin_float",
    "_Concurrency",
    "_StringProcessing",
    "_errno",
    "_math",
    "_signal",
    "_stdio",
    "_time",
    "sys_time",
    "unistd",
  ]);
  assert.deepStrictEqual(metadata.clangModules, [
    "CoreFoundation",
    "Darwin",
    "Dispatch",
    "Foundation",
    "Mach",
    "ObjectiveC",
    "SwiftShims",
    "_Builtin_float",
    "_SwiftConcurrencyShims",
    "_errno",
    "_math",
    "_signal",
    "_stdio",
    "_time",
    "sys_time",
    "sysdir",
    "timeval",
    "unistd",
    "uuid",
  ]);

  metadata = parseIndex(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-index-speech.json", {
        encoding: "utf-8",
      }),
    ),
  );
  assert.ok(metadata);
  assert.ok(metadata.obfuscatedSymbols);
  assert.ok(metadata.symbolLocations);
  assert.deepStrictEqual(metadata.swiftModules, [
    "Swift",
    "_Concurrency",
    "_StringProcessing",
  ]);
  assert.deepStrictEqual(metadata.clangModules, [
    "AVFAudio",
    "SwiftShims",
    "_SwiftConcurrencyShims",
  ]);
});
