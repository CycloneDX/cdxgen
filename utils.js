const glob = require("glob");

/**
 * Method to get files matching a pattern
 *
 * @param {string} dirPath Root directory for search
 * @param {string} pattern Glob pattern (eg: *.gradle)
 */
const getAllFiles = function(dirPath, pattern) {
  return glob.sync(pattern, { cwd: dirPath, silent: false, absolute: true });
};
exports.getAllFiles = getAllFiles;

/**
 * Parse gradle dependencies output
 * @param {string} rawOutput Raw string output
 */
const parseGradleDep = function(rawOutput) {
  if (typeof rawOutput === 'string') {
    const deps = [];
    const tmpA = rawOutput.split("\n");
    tmpA.forEach(l => {
      if (l.indexOf("---") >= 0) {
        l = l.substr(l.indexOf('---') + 4, l.length).trim();
        l = l.replace(" (*)", "");
        const verArr = l.split(":");
        if (verArr && verArr.length === 3) {
          let versionStr = verArr[2];
          if (versionStr.indexOf("->") >= 0) {
            versionStr = versionStr.substr(versionStr.indexOf("->") + 3, versionStr.length).trim();
          }
          deps.push({
            group: verArr[0].toLowerCase(),
            name: verArr[1].toLowerCase(),
            version: versionStr,
            qualifiers: {type: 'jar'}
          })
        }
      }
    });
    return deps;
  }
  return undefined;
}
exports.parseGradleDep = parseGradleDep;
