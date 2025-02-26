/**
 * Function to parse the given gradle build file to identify properties such as included builds
 *
 * @param buildFile {build,settings}.gradle(.kts)? Build file in groovy or kotlin format
 * @param buildContent String content to parse directly.
 */
export function analyzeBuildSettings(buildFile: build, buildContent: any): {
    includedBuilds: any[];
};
//# sourceMappingURL=gradleutils.d.ts.map