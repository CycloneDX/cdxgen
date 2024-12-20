import { PackageURL } from "packageurl-js";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from 'os';
import { join } from 'path';
import fetch from 'node-fetch';

/**
 * Fetches the POM file content from Maven Central.
 * @param {PackageURL} purl - The package URL object.
 * @returns {Promise<string>} - The POM file content.
 */
const fetchPomFromMavenCentral = async (purl) => {
    const { namespace, name, version } = purl;
    const url = `https://repo1.maven.org/maven2/${namespace.replace(".", "/")}/${name}/${version}/${name}-${version}.pom`;
    console.log(`Fetching POM from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch POM: ${response.statusText}`);
    }
    return await response.text();
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
        console.log(`POM file created at: ${pomPath}`);
        return pomPath;
    } catch (error) {
        console.error(`Failed to create POM file: ${error.message}`);
        throw error;
    }
};

/**
 * Checks if the given purl is supported.
 * @param {PackageURL} purl - The package URL object.
 * @returns {boolean} - True if supported, otherwise false.
 */
const isSupportedPurl = (purl) => purl.type === "maven";

/**
 * Validates and parses the purl string into a PackageURL object.
 * @param {string} purl - The purl string.
 * @returns {PackageURL|boolean} - The parsed PackageURL object or false if invalid.
 */
const validateAndParsePurl = (purl) => {
    try {
        return PackageURL.fromString(purl);
    } catch (error) {
        console.error(`Invalid purl: ${error.message}`);
        return false;
    }
};

/**
 * Inspects the purl and creates a POM file if supported.
 * @param {string} purl - The purl string.
 * @returns {Promise<string>} - The path to the generated pom.xml file.
 */
const inspectPurl = async (purl) => {
    const purlObj = validateAndParsePurl(purl);
    if (purlObj && isSupportedPurl(purlObj)) {
        return await createPomFile(purlObj);
    } else {
        console.error("We currently only support Maven purls");
        process.exit(1);
    }
};

export { validateAndParsePurl, inspectPurl };