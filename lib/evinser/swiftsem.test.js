import { expect, test } from "@jest/globals";

import { readFileSync } from "node:fs";

import {
  extractCompilerParamsFromBuild,
  parseDumpPackage,
  parseIndex,
  parseModuleInfo,
  parseOutputFileMap,
  parseStructure,
} from "./swiftsem.js";

test("extractCompilerParamsFromBuild test", () => {
  const paramsObj = extractCompilerParamsFromBuild(
    readFileSync("./test/data/swiftsem/swift-build-output1.txt", {
      encoding: "utf-8",
    }),
  );
  expect(paramsObj.params).toBeDefined();
  expect(paramsObj.compilerArgs).toEqual(
    "-sdk /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX15.0.sdk -F /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/Library/Frameworks -F -Xcc -I /Volumes/Work/sandbox/HAKit/.build/x86_64-apple-macosx/debug/Modules -I /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/usr/lib -L /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/usr/lib",
  );
});

test("parseDumpPackage", () => {
  const metadata = parseDumpPackage(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-dump-package.json", {
        encoding: "utf-8",
      }),
    ),
  );
  expect(metadata.rootModule).toEqual("HAKit");
  expect(metadata.dependencies).toEqual([
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

test("collectBuildSymbols", () => {
  const metadata = parseOutputFileMap(
    "./test/data/swiftsem/output-file-map.json",
  );
  expect(metadata).toEqual({
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

test("parseModuleInfo", () => {
  let metadata = parseModuleInfo(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-module-info2.json", {
        encoding: "utf-8",
      }),
    ),
  );
  expect(metadata).toBeDefined();
  expect(metadata.classes.length).toEqual(13);
  expect(metadata.protocols.length).toEqual(25);
  expect(metadata.enums.length).toEqual(16);
  expect(metadata.importedModules).toEqual([
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
  expect(metadata).toBeDefined();
  expect(metadata.classes.length).toEqual(8);
  expect(metadata.protocols.length).toEqual(14);
  expect(metadata.enums.length).toEqual(15);
  expect(metadata.importedModules).toEqual([
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

test("parseStructure", () => {
  let metadata = parseStructure(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-structure-starscream2.json", {
        encoding: "utf-8",
      }),
    ),
  );
  expect(metadata).toBeDefined();
  expect(metadata.referredTypes).toEqual([
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
  expect(metadata).toBeDefined();
  expect(metadata.referredTypes).toEqual([
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
  expect(metadata).toBeDefined();
  expect(metadata.referredTypes).toEqual([
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
  expect(metadata).toBeDefined();
  expect(metadata.referredTypes).toEqual([
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

test("parseIndex", () => {
  let metadata = parseIndex(
    JSON.parse(
      readFileSync("./test/data/swiftsem/swift-index-starscream.json", {
        encoding: "utf-8",
      }),
    ),
  );
  expect(metadata).toBeDefined();
  expect(metadata.obfuscatedSymbols).toBeDefined();
  expect(metadata.symbolLocations).toBeDefined();
  expect(metadata.swiftModules).toEqual([
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
  expect(metadata.clangModules).toEqual([
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
  expect(metadata).toBeDefined();
  expect(metadata.obfuscatedSymbols).toBeDefined();
  expect(metadata.symbolLocations).toBeDefined();
  expect(metadata.swiftModules).toEqual([
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
  expect(metadata.clangModules).toEqual([
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
  expect(metadata).toBeDefined();
  expect(metadata.obfuscatedSymbols).toBeDefined();
  expect(metadata.symbolLocations).toBeDefined();
  expect(metadata.swiftModules).toEqual([
    "Swift",
    "_Concurrency",
    "_StringProcessing",
  ]);
  expect(metadata.clangModules).toEqual([
    "AVFAudio",
    "SwiftShims",
    "_SwiftConcurrencyShims",
  ]);
});
