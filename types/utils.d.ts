/**
 * Performs a lookup + validation of the license specified in the
 * package. If the license is a valid SPDX license ID, set the 'id'
 * and url of the license object, otherwise, set the 'name' of the license
 * object.
 */
export function getLicenses(pkg: any): any;
/**
 * Tries to find a file containing the license text based on commonly
 * used naming and content types. If a candidate file is found, add
 * the text to the license text object and stop.
 */
export function addLicenseText(pkg: any, l: any, licenseContent: any): void;
/**
 * Read the file from the given path to the license text object and includes
 * content-type attribute, if not default. Returns the license text object.
 */
export function readLicenseText(licenseFilepath: any, licenseContentType: any): {
    content: string;
};
/**
 * Method to parse requirements.txt data
 *
 * @param {Object} reqData Requirements.txt data
 * @param {Boolean} fetchDepsInfo Fetch dependencies info from pypi
 */
export function parseReqFile(reqData: any, fetchDepsInfo: boolean): Promise<any[]>;
export const dirNameStr: string;
export const isWin: boolean;
export const isMac: boolean;
export let ATOM_DB: string;
export const frameworksList: any;
export const DEBUG_MODE: boolean;
export const TIMEOUT_MS: number;
export const MAX_BUFFER: number;
export let metadata_cache: {};
export const includeMavenTestScope: boolean;
export const FETCH_LICENSE: boolean;
export const SEARCH_MAVEN_ORG: boolean;
export let JAVA_CMD: string;
export let PYTHON_CMD: string;
export let DOTNET_CMD: string;
export let NODE_CMD: string;
export let NPM_CMD: string;
export let YARN_CMD: string;
export let GCC_CMD: string;
export let RUSTC_CMD: string;
export let GO_CMD: string;
export let CARGO_CMD: string;
export let CLJ_CMD: string;
export let LEIN_CMD: string;
export let SWIFT_CMD: string;
export const cdxgenAgent: any;
export function getAllFiles(dirPath: string, pattern: string, options?: {}): string[];
export function getAllFilesWithIgnore(dirPath: string, pattern: string, ignoreList: any[]): string[];
export function getKnownLicense(licenseUrl: string, pkg: string): any;
export function getSwiftPackageMetadata(pkgList: any): Promise<any[]>;
export function getNpmMetadata(pkgList: any[]): Promise<any[]>;
export function parsePkgJson(pkgJsonFile: string, simple?: boolean): Promise<any[]>;
export function parsePkgLock(pkgLockFile: string, options?: object): Promise<{
    pkgList: any;
    dependenciesList: any;
}>;
export function yarnLockToIdentMap(lockData: string): {};
export function parseYarnLock(yarnLockFile: string): Promise<{
    pkgList: any[];
    dependenciesList: any[];
}>;
export function parseNodeShrinkwrap(swFile: string): Promise<any[]>;
export function parsePnpmLock(pnpmLock: string, parentComponent?: any): Promise<{
    pkgList?: undefined;
    dependenciesList?: undefined;
} | {
    pkgList: any[];
    dependenciesList: {
        ref: string;
        dependsOn: string[];
    }[];
}>;
export function parseBowerJson(bowerJsonFile: string): Promise<any[]>;
export function parseMinJs(minJsFile: string): Promise<any[]>;
export function parsePom(pomFile: any): {
    group: any;
    name: any;
    version: any;
    qualifiers: {
        type: string;
    };
    properties: {
        name: string;
        value: any;
    }[];
    evidence: {
        identity: {
            field: string;
            confidence: number;
            methods: {
                technique: string;
                confidence: number;
                value: any;
            }[];
        };
    };
}[];
export function parseMavenTree(rawOutput: string): {
    pkgList?: undefined;
    dependenciesList?: undefined;
} | {
    pkgList: any[];
    dependenciesList: {
        ref: string;
        dependsOn: any;
    }[];
};
export function parseGradleDep(rawOutput: string, rootProjectGroup?: string, rootProjectName?: string, rootProjectVersion?: string): {
    pkgList: {
        group: any;
        name: any;
        version: any;
        qualifiers: {
            type: string;
        };
    }[];
    dependenciesList: {
        ref: string;
        dependsOn: any;
    }[];
} | {
    pkgList?: undefined;
    dependenciesList?: undefined;
};
export function parseCljDep(rawOutput: string): any[];
export function parseLeinDep(rawOutput: string): any;
export function parseLeinMap(node: any, keys_cache: any, deps: any): any;
export function parseGradleProjects(rawOutput: string): {
    rootProject: string;
    projects: any[];
};
export function parseGradleProperties(rawOutput: string): {
    rootProject: string;
    projects: any[];
    metadata: {
        group: string;
        version: string;
        properties: any[];
    };
};
export function executeGradleProperties(dir: string, rootPath: string, subProject: string): {};
export function parseBazelActionGraph(rawOutput: string): any[];
export function parseBazelSkyframe(rawOutput: string): any[];
export function parseBazelBuild(rawOutput: string): any[];
export function parseKVDep(rawOutput: any): any[];
export function findLicenseId(name: string): any;
export function guessLicenseId(content: any): any;
export function getMvnMetadata(pkgList: any[], jarNSMapping?: any): Promise<any[]>;
export function composePomXmlUrl({ urlPrefix, group, name, version }: string): string;
export function fetchPomXmlAsJson({ urlPrefix, group, name, version }: string): any | undefined;
export function fetchPomXml({ urlPrefix, group, name, version }: string): Promise<string>;
export function parseLicenseEntryOrArrayFromPomXml(license: any | any[]): any[];
export function extractLicenseCommentFromPomXml({ urlPrefix, group, name, version }: string): Promise<string>;
export function parsePyRequiresDist(dist_string: any): {
    name: string;
    version: string;
};
export function guessPypiMatchingVersion(versionsList: any[], versionSpecifiers: any): any;
export function getPyMetadata(pkgList: any[], fetchDepsInfo: boolean): Promise<any[]>;
export function parseBdistMetadata(mData: any): {}[];
export function parsePiplockData(lockData: any): Promise<any[]>;
export function parsePyProjectToml(tomlFile: string): {};
export function parsePoetrylockData(lockData: any, lockFile: string): Promise<any[] | {
    pkgList: any[];
    rootList: any[];
    dependenciesList: {
        ref: string;
        dependsOn: any[];
    }[];
}>;
export function getPyModules(src: string, epkgList: any[], options: any): Promise<{
    allImports: {};
    pkgList: any;
    dependenciesList: {
        ref: string;
        dependsOn: any[];
    }[];
    modList: any;
}>;
export function parseSetupPyFile(setupPyData: any): Promise<any[]>;
export function repoMetadataToGitHubApiUrl(repoMetadata: any): string | undefined;
export function getGithubUrlParts(repoUrl: string): [string];
export function toGitHubApiUrl(repoUrl: string, repoMetadata: any): string | undefined;
export function getRepoLicense(repoUrl: string, repoMetadata: any): Promise<string>;
export function getGoPkgLicense(repoMetadata: any): Promise<any>;
export function getGoPkgComponent(group: any, name: any, version: any, hash: any): Promise<{}>;
export function parseGoModData(goModData: any, gosumMap: any): Promise<any[]>;
export function parseGoListDep(rawOutput: string, gosumMap: any): Promise<{
    parentComponent: {};
    pkgList: {}[];
}>;
export function parseGoModGraph(rawOutput: string, goModFile: string, gosumMap: any, epkgList?: any[], parentComponent?: {}): Promise<{
    pkgList: any[];
    dependenciesList: {
        ref: string;
        dependsOn: any[];
    }[];
}>;
export function parseGoModWhy(rawOutput: string): any;
export function parseGosumData(gosumData: any): Promise<any[]>;
export function parseGopkgData(gopkgData: any): Promise<any[]>;
export function parseGoVersionData(buildInfoData: any): Promise<any[]>;
export function getRubyGemsMetadata(pkgList: any[]): Promise<any[]>;
export function parseGemspecData(gemspecData: string): Promise<any[]>;
export function parseGemfileLockData(gemLockData: object, lockFile: string): Promise<any[] | {
    pkgList: any[];
    dependenciesList: {
        ref: string;
        dependsOn: any[];
    }[];
    rootList?: undefined;
} | {
    pkgList: any[];
    dependenciesList: {
        ref: string;
        dependsOn: any[];
    }[];
    rootList: any[];
}>;
export function getCratesMetadata(pkgList: any[]): Promise<any[]>;
export function getDartMetadata(pkgList: any[]): Promise<any[]>;
export function parseCargoTomlData(cargoData: any): Promise<any[]>;
export function parseCargoData(cargoData: any): Promise<any[]>;
export function parseCargoAuditableData(cargoData: any): Promise<any[]>;
export function parsePubLockData(pubLockData: any): Promise<any[]>;
export function parsePubYamlData(pubYamlData: any): any[];
export function parseHelmYamlData(helmData: any): any[];
export function recurseImageNameLookup(keyValueObj: any, pkgList: any, imgList: any): any;
export function parseContainerFile(fileContents: any): {
    image: any;
}[];
export function parseBitbucketPipelinesFile(fileContents: any): {
    image: any;
}[];
export function parseContainerSpecData(dcData: any): any[];
export function identifyFlow(processingObj: any): string;
export function parsePrivadoFile(f: any): any[];
export function parseOpenapiSpecData(oaData: any): any[];
export function parseCabalData(cabalData: any): any[];
export function parseMixLockData(mixData: any): any[];
export function parseGitHubWorkflowData(ghwData: any): any[];
export function parseCloudBuildData(cbwData: any): any[];
export function parseConanLockData(conanLockData: any): any[];
export function parseConanData(conanData: any): any[];
export function parseLeiningenData(leinData: any): any[];
export function parseEdnData(rawEdnData: any): any[];
export function parseNupkg(nupkgFile: any): Promise<any[]>;
export function parseNuspecData(nupkgFile: any, nuspecData: any): any[];
export function parseCsPkgData(pkgData: any): any[];
export function parseCsProjData(csProjData: any, projFile: any): any[];
export function parseCsProjAssetsData(csProjData: any, assetsJsonFile: any): {
    pkgList: any[];
    dependenciesList: any[];
};
export function parseCsPkgLockData(csLockData: any, pkgLockFile: any): {
    pkgList: any[];
    dependenciesList: any[];
    rootList: any[];
};
export function parsePaketLockData(paketLockData: any, pkgLockFile: any): {
    pkgList: any[];
    dependenciesList: any[];
};
export function parseComposerLock(pkgLockFile: string, rootRequires: any[]): any[] | {
    pkgList: {
        group: string;
        name: string;
        purl: string;
        "bom-ref": string;
        version: any;
        repository: any;
        license: any;
        description: any;
        scope: string;
        properties: {
            name: string;
            value: string;
        }[];
        evidence: {
            identity: {
                field: string;
                confidence: number;
                methods: {
                    technique: string;
                    confidence: number;
                    value: string;
                }[];
            };
        };
    }[];
    dependenciesList: {
        ref: string;
        dependsOn: any[];
    }[];
    rootList: {
        group: string;
        name: string;
        purl: string;
        "bom-ref": string;
        version: any;
        repository: any;
        license: any;
        description: any;
        scope: string;
        properties: {
            name: string;
            value: string;
        }[];
        evidence: {
            identity: {
                field: string;
                confidence: number;
                methods: {
                    technique: string;
                    confidence: number;
                    value: string;
                }[];
            };
        };
    }[];
};
export function parseSbtTree(sbtTreeFile: any): {
    pkgList: any[];
    dependenciesList: {
        ref: string;
        dependsOn: any;
    }[];
};
export function parseSbtLock(pkgLockFile: string): {
    group: any;
    name: any;
    version: any;
    _integrity: string;
    scope: string;
    properties: {
        name: string;
        value: string;
    }[];
    evidence: {
        identity: {
            field: string;
            confidence: number;
            methods: {
                technique: string;
                confidence: number;
                value: string;
            }[];
        };
    };
}[];
export function executeDpkgList(pkgName: string): string[];
export function executeRpmList(pkgName: string): string[];
export function executeApkList(pkgName: string): string[];
export function executeAlpmList(pkgName: string): string[];
export function executeEqueryList(pkgName: string): string[];
export function convertOSQueryResults(queryCategory: any, queryObj: any, results: any[], enhance?: boolean): {
    name: any;
    group: string;
    version: any;
    description: any;
    publisher: any;
    "bom-ref": string;
    purl: string;
    scope: any;
    type: any;
}[];
export function parseSwiftJsonTreeObject(pkgList: any, dependenciesList: any, jsonObject: string, pkgFile: string): string;
export function parseSwiftJsonTree(rawOutput: string, pkgFile: string): {
    pkgList?: undefined;
    dependenciesList?: undefined;
} | {
    pkgList: any[];
    dependenciesList: any[];
};
export function parseSwiftResolved(resolvedFile: string): {
    name: string;
    group: string;
    version: string;
    purl: string;
    "bom-ref": string;
    properties: {
        name: string;
        value: string;
    }[];
    evidence: {
        identity: {
            field: string;
            confidence: number;
            methods: {
                technique: string;
                confidence: number;
                value: string;
            }[];
        };
    };
}[];
export function collectMvnDependencies(mavenCmd: string, basePath: string, cleanup?: boolean, includeCacheDir?: boolean): Promise<{}>;
export function collectGradleDependencies(gradleCmd: any, basePath: any, cleanup?: boolean, includeCacheDir?: boolean): Promise<{}>;
export function collectJarNS(jarPath: string, pomPathMap?: object): Promise<{}>;
export function convertJarNSToPackages(jarNSMapping: any): {
    name: any;
    group: any;
    version: any;
    description: any;
    purl: string;
    "bom-ref": string;
    evidence: {
        identity: {
            field: string;
            confidence: number;
            methods: {
                technique: string;
                confidence: number;
                value: any;
            }[];
        };
    };
    properties: {
        name: string;
        value: any;
    }[];
}[];
export function parsePomXml(pomXmlData: any): {
    artifactId: any;
    groupId: any;
    version: any;
    description: any;
    url: any;
    scm: any;
};
export function parseJarManifest(jarMetadata: any): {};
export function parsePomProperties(pomProperties: any): {};
export function encodeForPurl(s: any): any;
export function getPomPropertiesFromMavenDir(mavenDir: string): {};
export function extractJarArchive(jarFile: string, tempDir: string, jarNSMapping?: object): Promise<any[]>;
export function determineSbtVersion(projectPath: string): any;
export function addPlugin(projectPath: string, plugin: string): string;
export function cleanupPlugin(projectPath: string, originalPluginsFile: string): boolean;
export function sbtPluginsPath(projectPath: string): string;
export function readZipEntry(zipFile: string, filePattern: string, contentEncoding?: string): Promise<any>;
export function getJarClasses(jarFile: string): Promise<any[]>;
export function getGradleCommand(srcPath: string, rootPath: string): string;
export function getMavenCommand(srcPath: string, rootPath: string): string;
export function getAtomCommand(): any;
export function executeAtom(src: any, args: any): boolean;
export function findAppModules(src: string, language: string, methodology?: string, slicesFile?: string): any;
export function getPipFrozenTree(basePath: string, reqOrSetupFile: string, tempVenvDir: string): {
    pkgList: {
        name: any;
        version: any;
        purl: string;
        "bom-ref": string;
        evidence: {
            identity: {
                field: string;
                confidence: number;
                methods: {
                    technique: string;
                    confidence: number;
                    value: any;
                }[];
            };
        };
    }[];
    rootList: {
        name: any;
        version: any;
    }[];
    dependenciesList: {
        ref: string;
        dependsOn: any;
    }[];
};
export function parsePackageJsonName(name: any): {
    scope: any;
    fullName: string;
    projectName: string;
    moduleName: string;
};
export function addEvidenceForImports(pkgList: any[], allImports: object, allExports: object, deep: any): Promise<any[]>;
export function componentSorter(a: any, b: any): any;
export function parseCmakeDotFile(dotFile: any, pkgType: any, options?: {}): {
    parentComponent: {};
    pkgList: any[];
    dependenciesList: {
        ref: string;
        dependsOn: any[];
    }[];
};
export function parseCmakeLikeFile(cmakeListFile: any, pkgType: any, options?: {}): {
    parentComponent: {};
    pkgList: any[];
};
export function getOSPackageForFile(afile: any, osPkgsList: any): any;
export function getCppModules(src: string, options: object, osPkgsList: any[], epkgList: any[]): {
    parentComponent: {};
    pkgList: any[];
    dependenciesList: {
        ref: any;
        dependsOn: any[];
    }[];
};
export function locateGenericPackage(apkg: object): any;
export function parseCUsageSlice(sliceData: any): {};
export function getNugetMetadata(pkgList: any[], dependencies?: any): Promise<{
    pkgList: any[];
    dependencies: any[];
}>;
export function addEvidenceForDotnet(pkgList: any, slicesFile: any): any;
//# sourceMappingURL=utils.d.ts.map