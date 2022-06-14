const isWin = require("os").platform() === "win32";
const got = require("got");
const glob = require("glob");
const url = require("url");
const util = require("util");
const stream = require("stream");
const fs = require("fs");
const path = require("path");
const os = require("os");
const tar = require("tar");

const pipeline = util.promisify(stream.pipeline);

let dockerConn = undefined;
let isPodman = false;
let isPodmanRootless = true;

// Debug mode flag
const DEBUG_MODE =
  process.env.SCAN_DEBUG_MODE === "debug" ||
  process.env.SHIFTLEFT_LOGGING_LEVEL === "debug";

/**
 * Method to get all dirs matching a name
 *
 * @param {string} dirPath Root directory for search
 * @param {string} dirName Directory name
 */
const getDirs = (dirPath, dirName, hidden = false) => {
  try {
    return glob.sync("**/" + dirName, {
      cwd: dirPath,
      silent: true,
      absolute: true,
      nocase: true,
      nodir: false,
      follow: false,
      dot: hidden,
    });
  } catch (err) {
    return [];
  }
};
exports.getDirs = getDirs;

const getDefaultOptions = () => {
  let opts = {
    throwHttpErrors: true,
    "hooks.beforeError": [],
    method: "GET",
    isPodman,
  };
  const userInfo = os.userInfo();
  opts.podmanPrefixUrl = isWin ? "" : `unix:/run/podman/podman.sock:`;
  opts.podmanRootlessPrefixUrl = isWin
    ? ""
    : `unix:/run/user/${userInfo.uid}/podman/podman.sock:`;
  if (!process.env.DOCKER_HOST) {
    if (isPodman) {
      opts.prefixUrl = isPodmanRootless
        ? opts.podmanRootlessPrefixUrl
        : opts.podmanPrefixUrl;
    } else {
      opts.prefixUrl = isWin
        ? "npipe://./pipe/docker_engine:"
        : "unix:/var/run/docker.sock:";
    }
  } else {
    let hostStr = process.env.DOCKER_HOST;
    opts.prefixUrl = hostStr;
    if (process.env.DOCKER_CERT_PATH) {
      opts.https = {
        certificate: fs.readFileSync(
          path.join(process.env.DOCKER_CERT_PATH, "cert.pem"),
          "utf8"
        ),
        key: fs.readFileSync(
          path.join(process.env.DOCKER_CERT_PATH, "key.pem"),
          "utf8"
        ),
      };
    }
  }

  return opts;
};

const getConnection = async (options) => {
  if (!dockerConn) {
    let res = undefined;
    const opts = Object.assign({}, getDefaultOptions(), options);
    try {
      res = await got.get("_ping", opts);
      dockerConn = got.extend(opts);
      console.log("Docker service in root mode detected!");
    } catch (err) {
      try {
        opts.prefixUrl = opts.podmanRootlessPrefixUrl;
        res = await got.get("libpod/_ping", opts);
        isPodman = true;
        isPodmanRootless = true;
        dockerConn = got.extend(opts);
        console.log("Podman in rootless mode detected!");
      } catch (err) {
        console.log(err);
        try {
          opts.prefixUrl = opts.podmanPrefixUrl;
          res = await got.get("libpod/_ping", opts);
          isPodman = true;
          isPodmanRootless = false;
          dockerConn = got.extend(opts);
          console.log("Podman in root mode detected!");
        } catch (err) {
          console.warn(
            "Ensure docker/podman service or Docker for Desktop is running",
            opts
          );
        }
      }
    }
  }
  return dockerConn;
};
exports.getConnection = getConnection;

const makeRequest = async (path, method = "GET") => {
  let client = await getConnection();
  if (!client) {
    return undefined;
  }
  const extraOptions = {
    responseType: method === "GET" ? "json" : "text",
    resolveBodyOnly: true,
    method,
  };
  const opts = Object.assign({}, getDefaultOptions(), extraOptions);
  return await client(path, opts);
};
exports.makeRequest = makeRequest;

/**
 * Parse image name
 *
 * docker pull debian
 * docker pull debian:jessie
 * docker pull ubuntu@sha256:45b23dee08af5e43a7fea6c4cf9c25ccf269ee113168c19722f87876677c5cb2
 * docker pull myregistry.local:5000/testing/test-image
 */
const parseImageName = (fullImageName) => {
  const nameObj = {
    registry: "",
    repo: "",
    tag: "",
    digest: "",
    platform: "",
  };
  if (!fullImageName) {
    return nameObj;
  }
  // Extract registry name
  if (
    fullImageName.includes("/") &&
    (fullImageName.includes(".") || fullImageName.includes(":"))
  ) {
    const urlObj = url.parse(fullImageName);
    const tmpA = fullImageName.split("/");
    if (
      urlObj.path !== fullImageName ||
      tmpA[0].includes(".") ||
      tmpA[0].includes(":")
    ) {
      nameObj.registry = tmpA[0];
      fullImageName = fullImageName.replace(tmpA[0] + "/", "");
    }
  }
  // Extract digest name
  if (fullImageName.includes("@sha256:")) {
    const tmpA = fullImageName.split("@sha256:");
    if (tmpA.length > 1) {
      nameObj.digest = tmpA[tmpA.length - 1];
      fullImageName = fullImageName.replace("@sha256:" + nameObj.digest, "");
    }
  }
  // Extract tag name
  if (fullImageName.includes(":")) {
    const tmpA = fullImageName.split(":");
    if (tmpA.length > 1) {
      nameObj.tag = tmpA[tmpA.length - 1];
      fullImageName = fullImageName.replace(":" + nameObj.tag, "");
    }
  }
  // The left over string is the repo name
  nameObj.repo = fullImageName;
  return nameObj;
};
exports.parseImageName = parseImageName;

/**
 * Method to get image to the local registry by pulling from the remote if required
 */
const getImage = async (fullImageName) => {
  let localData = undefined;
  const { repo, tag, digest } = parseImageName(fullImageName);
  // Fetch only the latest tag if none is specified
  if (tag === "" && digest === "") {
    fullImageName = fullImageName + ":latest";
  }
  try {
    localData = await makeRequest(`images/${repo}/json`);
    if (DEBUG_MODE) {
      console.log(localData);
    }
  } catch (err) {
    console.log(
      `Trying to pull the image ${fullImageName} from registry. This might take a while ...`
    );
    // If the data is not available locally
    try {
      const pullData = await makeRequest(
        `images/create?fromImage=${fullImageName}`,
        "POST"
      );
      if (DEBUG_MODE) {
        console.log(pullData);
      }
      try {
        if (DEBUG_MODE) {
          console.log(`Trying with ${repo}`);
        }
        localData = await makeRequest(`images/${repo}/json`);
        if (DEBUG_MODE) {
          console.log(localData);
        }
      } catch (err) {
        if (DEBUG_MODE) {
          console.log(`Retrying with ${fullImageName}`);
        }
        localData = await makeRequest(`images/${fullImageName}/json`);
        if (DEBUG_MODE) {
          console.log(localData);
        }
      }
    } catch (err) {
      console.log(`Unable to pull the image ${repo}`);
      console.error(err);
    }
  }
  return localData;
};
exports.getImage = getImage;

const extractTar = async (fullImageName, dir) => {
  try {
    await pipeline(
      fs.createReadStream(fullImageName),
      tar.x({
        sync: true,
        preserveOwner: false,
        noMtime: true,
        noChmod: true,
        C: dir,
      })
    );
    return true;
  } catch (err) {
    if (DEBUG_MODE) {
      console.log(err);
    }
    return false;
  }
};
exports.extractTar = extractTar;

/**
 * Method to export a container image archive.
 * Returns the location of the layers with additional packages related metadata
 */
const exportArchive = async (fullImageName) => {
  if (!fs.existsSync(fullImageName)) {
    console.log(`Unable to find container image archive ${fullImageName}`);
    return undefined;
  }
  let manifest = {};
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docker-images-"));
  const allLayersExplodedDir = path.join(tempDir, "all-layers");
  const blobsDir = path.join(tempDir, "blobs", "sha256");
  fs.mkdirSync(allLayersExplodedDir);
  const manifestFile = path.join(tempDir, "manifest.json");
  try {
    await extractTar(fullImageName, tempDir);
    // podman use blobs dir
    if (fs.existsSync(blobsDir)) {
      if (DEBUG_MODE) {
        console.log(
          `Image archive ${fullImageName} successfully exported to directory ${tempDir}`
        );
      }
      const allBlobs = getDirs(blobsDir, "*", false);
      for (let ablob of allBlobs) {
        if (DEBUG_MODE) {
          console.log(`Extracting ${ablob} to ${allLayersExplodedDir}`);
        }
        await extractTar(ablob, allLayersExplodedDir);
      }
      let lastLayerConfig = {};
      let lastWorkingDir = "";
      const exportData = {
        manifest,
        allLayersDir: tempDir,
        allLayersExplodedDir,
        lastLayerConfig,
        lastWorkingDir,
      };
      exportData.pkgPathList = getPkgPathList(exportData, lastWorkingDir);
      return exportData;
    } else if (fs.existsSync(manifestFile)) {
      // docker manifest file
      return await extractFromManifest(
        manifestFile,
        {},
        tempDir,
        allLayersExplodedDir
      );
    } else {
      console.log(`Unable to extract image archive to ${tempDir}`);
    }
  } catch (err) {
    console.log(err);
  }
  return undefined;
};
exports.exportArchive = exportArchive;

const extractFromManifest = async (
  manifestFile,
  localData,
  tempDir,
  allLayersExplodedDir
) => {
  manifest = JSON.parse(
    fs.readFileSync(manifestFile, {
      encoding: "utf-8",
    })
  );
  if (manifest.length !== 1) {
    if (DEBUG_MODE) {
      console.log(
        "Multiple image tags was downloaded. Only the last one would be used"
      );
      console.log(manifest[manifest.length - 1]);
    }
  }
  const layers = manifest[manifest.length - 1]["Layers"];
  const lastLayer = layers[layers.length - 1];
  for (let layer of layers) {
    if (DEBUG_MODE) {
      console.log(`Extracting ${layer} to ${allLayersExplodedDir}`);
    }
    await extractTar(path.join(tempDir, layer), allLayersExplodedDir);
  }
  let lastLayerConfigFile = "";
  if (manifest.Config) {
    lastLayerConfigFile = path.join(tempDir, manifest.Config);
  }
  if (lastLayer.includes("layer.tar")) {
    lastLayerConfigFile = path.join(
      tempDir,
      lastLayer.replace("layer.tar", "json")
    );
  }
  let lastLayerConfig = {};
  let lastWorkingDir = "";
  if (lastLayerConfigFile && fs.existsSync(lastLayerConfigFile)) {
    try {
      lastLayerConfig = JSON.parse(
        fs.readFileSync(lastLayerConfigFile, {
          encoding: "utf-8",
        })
      );
      lastWorkingDir =
        lastLayerConfig.config && lastLayerConfig.config.WorkingDir
          ? path.join(allLayersExplodedDir, lastLayerConfig.config.WorkingDir)
          : "";
    } catch (err) {
      console.log(err);
    }
  }
  const exportData = {
    inspectData: localData,
    manifest,
    allLayersDir: tempDir,
    allLayersExplodedDir,
    lastLayerConfig,
    lastWorkingDir,
  };
  exportData.pkgPathList = getPkgPathList(exportData, lastWorkingDir);
  return exportData;
};

/**
 * Method to export a container image by using the export feature in docker or podman service.
 * Returns the location of the layers with additional packages related metadata
 */
const exportImage = async (fullImageName) => {
  // Try to get the data locally first
  const localData = await getImage(fullImageName);
  if (!localData) {
    return undefined;
  }
  const { repo, tag, digest } = parseImageName(fullImageName);
  // Fetch only the latest tag if none is specified
  if (tag === "" && digest === "") {
    fullImageName = fullImageName + ":latest";
  }
  let client = await getConnection();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docker-images-"));
  const allLayersExplodedDir = path.join(tempDir, "all-layers");
  fs.mkdirSync(allLayersExplodedDir);
  const manifestFile = path.join(tempDir, "manifest.json");
  try {
    console.log(`About to export image ${fullImageName} to ${tempDir}`);
    await pipeline(
      client.stream(`images/${fullImageName}/get`),
      tar.x({
        sync: true,
        preserveOwner: false,
        noMtime: true,
        noChmod: true,
        C: tempDir,
      })
    );
    if (fs.existsSync(tempDir) && fs.existsSync(manifestFile)) {
      if (DEBUG_MODE) {
        console.log(
          `Image ${fullImageName} successfully exported to directory ${tempDir}`
        );
      }
      return await extractFromManifest(
        manifestFile,
        localData,
        tempDir,
        allLayersExplodedDir
      );
    } else {
      console.log(`Unable to export image to ${tempDir}`);
    }
  } catch (err) {
    console.error(err);
  }
  return undefined;
};
exports.exportImage = exportImage;

/**
 * Method to retrieve path list for system-level packages
 */
const getPkgPathList = (exportData, lastWorkingDir) => {
  const allLayersExplodedDir = exportData.allLayersExplodedDir;
  const allLayersDir = exportData.allLayersDir;
  let pathList = [];
  const knownSysPaths = [
    path.join(allLayersExplodedDir, "/usr/local/lib"),
    path.join(allLayersExplodedDir, "/usr/local/lib64"),
    path.join(allLayersExplodedDir, "/opt"),
    path.join(allLayersExplodedDir, "/home"),
    path.join(allLayersExplodedDir, "/usr/share"),
    path.join(allLayersExplodedDir, "/var/www/html"),
    path.join(allLayersExplodedDir, "/var/lib"),
    path.join(allLayersExplodedDir, "/mnt"),
  ];
  if (lastWorkingDir && lastWorkingDir !== "") {
    knownSysPaths.push(lastWorkingDir);
  }
  // Some more common app dirs
  if (!lastWorkingDir.startsWith("/app")) {
    knownSysPaths.push(path.join(allLayersExplodedDir, "/app"));
  }
  if (!lastWorkingDir.startsWith("/data")) {
    knownSysPaths.push(path.join(allLayersExplodedDir, "/data"));
  }
  if (!lastWorkingDir.startsWith("/srv")) {
    knownSysPaths.push(path.join(allLayersExplodedDir, "/srv"));
  }
  // Known to cause EACCESS error
  knownSysPaths.push(path.join(allLayersExplodedDir, "/usr/lib"));
  knownSysPaths.push(path.join(allLayersExplodedDir, "/usr/lib64"));
  // Build path list
  for (let wpath of knownSysPaths) {
    pathList = pathList.concat(wpath);
    const pyDirs = getDirs(wpath, "site-packages", false);
    if (pyDirs && pyDirs.length) {
      pathList = pathList.concat(pyDirs);
    }
    const gemsDirs = getDirs(wpath, "gems", false);
    if (gemsDirs && gemsDirs.length) {
      pathList = pathList.concat(gemsDirs);
    }
    const cargoDirs = getDirs(wpath, ".cargo", true);
    if (cargoDirs && cargoDirs.length) {
      pathList = pathList.concat(cargoDirs);
    }
    const composerDirs = getDirs(wpath, ".composer", true);
    if (composerDirs && composerDirs.length) {
      pathList = pathList.concat(composerDirs);
    }
  }
  if (DEBUG_MODE) {
    console.log("pathList", pathList);
  }
  return pathList;
};
exports.getPkgPathList = getPkgPathList;

const removeImage = async (fullImageName, force = false) => {
  const removeData = await makeRequest(
    `images/${fullImageName}?force=${force}`,
    "DELETE"
  );
  if (DEBUG_MODE) {
    console.log(removeData);
  }
  return removeData;
};
exports.removeImage = removeImage;
