import { PackageURL } from "packageurl-js";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from 'os';
import { join } from 'path';
import got from 'got';
import { DEBUG_MODE} from "./utils.js";

/**
 * Fetches the POM file content from Maven Central.
 * @param {PackageURL} purl - The package URL object.
 * @returns {Promise<string>} - The POM file content.
 */
const fetchPomFromMavenCentral = async (purl) => {
    const { namespace, name, version } = purl;
    const url = `https://repo1.maven.org/maven2/${namespace.replaceAll(".", "/")}/${name.replaceAll(".", "/")}/${version}/${name}-${version}.pom`;
    if (DEBUG_MODE) {
        console.log(`Fetching POM from: ${url}`);
    }
    const response = await got.get(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch POM from maven: ${response.statusText}`);
    }
    return await response.body
};

/**
 * Creates a pom.xml file with the specified dependency from the purl.
 * @param {PackageURL} purl - The package URL object.
 * @returns {Promise<string>} - The path to the generated pom.xml file.
 */
const createPomFile = async (purl) => {
    try {
        const pomContent = await fetchPomFromMavenCentral(purl);
        const tempDir = mkdtempSync(join(tmpdir(), 'pom-'));
        const pomPath = join(tempDir, 'pom.xml');
        writeFileSync(pomPath, pomContent);
        if (DEBUG_MODE) {
            console.log(`POM file created at: ${pomPath}`);
        }
        return pomPath;
    } catch (error) {
        console.error(`Failed to create POM file: ${error.message}`);
        throw error;
    }
};


/**
 * Generates metadata files for the specified purl.
 * @param {string} purl - The purl string.
 * @returns {Promise<string>} - The path to the generated pom.xml file.
 */
const generatePurlMetadata = async (purlObject) => {
    switch (purlObject.type) {
        case 'maven':
            return await createPomFile(purlObject);
        default:
            console.error(`Purl type is not supported: ${purlObject.type}`);
            return false;
    }
};

export { generatePurlMetadata };
