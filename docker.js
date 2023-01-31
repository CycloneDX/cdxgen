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
const { spawnSync } = require("child_process");

const pipeline = util.promisify(stream.pipeline);

let dockerConn = undefined;
let isPodman = false;
let isPodmanRootless = true;
let isDockerRootless = false;
const WIN_LOCAL_TLS = "http://localhost:2375";
let isWinLocalTLS = false;

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
const getDirs = (dirPath, dirName, hidden = false, recurse = true) => {
  try {
    return glob.sync(recurse ? "**/" : "" + dirName, {
      cwd: dirPath,
      silent: true,
      absolute: true,
      nocase: true,
      nodir: false,
      follow: false,
      dot: hidden
    });
  } catch (err) {
    return [];
  }
};
exports.getDirs = getDirs;

function flatten(lists) {
  return lists.reduce((a, b) => a.concat(b), []);
}

function getDirectories(srcpath) {
  if (fs.existsSync(srcpath)) {
    return fs
      .readdirSync(srcpath)
      .map((file) => path.join(srcpath, file))
      .filter((path) => {
        try {
          return fs.statSync(path).isDirectory();
        } catch (e) {
          return false;
        }
      });
  }
  return [];
}

const getOnlyDirs = (srcpath, dirName) => {
  return [
    srcpath,
    ...flatten(
      getDirectories(srcpath)
        .map((p) => {
          try {
            if (fs.existsSync(p)) {
              if (fs.lstatSync(p).isDirectory()) {
                return getOnlyDirs(p, dirName);
              }
            }
          } catch (err) {
            console.error(err);
          }
        })
        .filter((p) => p !== undefined)
    )
  ].filter((d) => d.endsWith(dirName));
};
exports.getOnlyDirs = getOnlyDirs;

const getDefaultOptions = () => {
  let opts = {
    throwHttpErrors: true,
    "hooks.beforeError": [],
    method: "GET",
    isPodman
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
      if (isWinLocalTLS) {
        opts.prefixUrl = WIN_LOCAL_TLS;
      } else {
        // Named pipes syntax for Windows doesn't work with got
        // See: https://github.com/sindresorhus/got/issues/2178
        /*
        opts.prefixUrl = isWin
          ? "npipe//./pipe/docker_engine:"
          : "unix:/var/run/docker.sock:";
        */
        opts.prefixUrl = isWin ? WIN_LOCAL_TLS : "unix:/var/run/docker.sock:";
      }
    }
  } else {
    let hostStr = process.env.DOCKER_HOST;
    if (hostStr.startsWith("unix:///")) {
      hostStr = hostStr.replace("unix:///", "unix:/");
      if (hostStr.includes("docker.sock")) {
        hostStr = hostStr.replace("docker.sock", "docker.sock:");
        isDockerRootless = true;
      }
    }
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
        )
      };
    }
  }

  return opts;
};

const getConnection = async (options) => {
  if (!dockerConn) {
    const opts = Object.assign({}, getDefaultOptions(), options);
    try {
      await got.get("_ping", opts);
      dockerConn = got.extend(opts);
      if (DEBUG_MODE) {
        if (isDockerRootless) {
          console.log("Docker service in rootless mode detected!");
        } else {
          console.log("Docker service in root mode detected!");
        }
      }
    } catch (err) {
      // console.log(err, opts);
      try {
        if (isWin) {
          opts.prefixUrl = WIN_LOCAL_TLS;
          await got.get("_ping", opts);
          dockerConn = got.extend(opts);
          isWinLocalTLS = true;
          if (DEBUG_MODE) {
            console.log("Docker desktop on Windows detected!");
          }
        } else {
          opts.prefixUrl = opts.podmanRootlessPrefixUrl;
          await got.get("libpod/_ping", opts);
          isPodman = true;
          isPodmanRootless = true;
          dockerConn = got.extend(opts);
          if (DEBUG_MODE) {
            console.log("Podman in rootless mode detected!");
          }
        }
      } catch (err) {
        // console.log(err);
        try {
          opts.prefixUrl = opts.podmanPrefixUrl;
          await got.get("libpod/_ping", opts);
          isPodman = true;
          isPodmanRootless = false;
          dockerConn = got.extend(opts);
          console.log("Podman in root mode detected!");
        } catch (err) {
          if (os.platform() === "win32") {
            console.warn(
              "Ensure Docker for Desktop is running as an administrator with 'Exposing daemon on TCP without TLS' setting turned on.",
              opts
            );
          } else {
            console.warn(
              "Ensure docker/podman service or Docker for Desktop is running.",
              opts
            );
          }
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
    method
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
    platform: ""
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
  if (isWin) {
    let result = spawnSync("docker", ["pull", fullImageName], {
      encoding: "utf-8"
    });
    if (result.status !== 0 || result.error) {
      return localData;
    } else {
      result = spawnSync("docker", ["inspect", fullImageName], {
        encoding: "utf-8"
      });
      if (result.status !== 0 || result.error) {
        return localData;
      } else {
        try {
          const stdout = result.stdout;
          if (stdout) {
            const inspectData = JSON.parse(Buffer.from(stdout).toString());
            if (inspectData && Array.isArray(inspectData)) {
              return inspectData[0];
            } else {
              return inspectData;
            }
          }
        } catch (err) {
          // continue regardless of error
        }
      }
    }
  }
  try {
    localData = await makeRequest(`images/${repo}/json`);
    if (DEBUG_MODE) {
      console.log(localData);
    }
  } catch (err) {
    if (DEBUG_MODE) {
      console.log(
        `Trying to pull the image ${fullImageName} from registry. This might take a while ...`
      );
    }
    // If the data is not available locally
    try {
      const pullData = await makeRequest(
        `images/create?fromImage=${fullImageName}`,
        "POST"
      );
      if (
        pullData &&
        (pullData.includes("no match for platform in manifest") ||
          pullData.includes("Error choosing an image from manifest list"))
      ) {
        console.warn(
          "You may have to enable experimental settings in docker to support this platform!"
        );
        console.warn(
          "To scan windows images, run cdxgen on a windows server with hyper-v and docker installed. Switch to windows containers in your docker settings."
        );
        return undefined;
      }
    } catch (err) {
      // continue regardless of error
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
        console.log(`Retrying with ${fullImageName} due to`, err);
      }
      try {
        localData = await makeRequest(`images/${fullImageName}/json`);
        if (DEBUG_MODE) {
          console.log(localData);
        }
      } catch (err) {
        // continue regardless of error
      }
    }
  }
  if (!localData) {
    console.log(
      `Unable to pull ${fullImageName}. Check if the name is valid. Perform any authentication prior to invoking cdxgen.`
    );
    console.log(
      `Trying manually pulling this image using docker pull ${fullImageName}`
    );
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
        strict: true,
        C: dir,
        portable: true,
        onwarn: () => {}
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
      const allBlobs = getDirs(blobsDir, "*", false, true);
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
        lastWorkingDir
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
  // Example of manifests
  // [{"Config":"blobs/sha256/dedc100afa8d6718f5ac537730dd4a5ceea3563e695c90f1a8ac6df32c4cb291","RepoTags":["shiftleft/core:latest"],"Layers":["blobs/sha256/eaead16dc43bb8811d4ff450935d607f9ba4baffda4fc110cc402fa43f601d83","blobs/sha256/2039af03c0e17a3025b989335e9414149577fa09e7d0dcbee80155333639d11f"]}]
  // {"schemaVersion":2,"manifests":[{"mediaType":"application/vnd.docker.distribution.manifest.list.v2+json","digest":"sha256:7706ac20c7587081dc7a00e0ec65a6633b0bb3788e0048a3e971d3eae492db63","size":318,"annotations":{"io.containerd.image.name":"docker.io/shiftleft/scan-slim:latest","org.opencontainers.image.ref.name":"latest"}}]}
  let manifest = JSON.parse(
    fs.readFileSync(manifestFile, {
      encoding: "utf-8"
    })
  );
  let lastLayerConfig = {};
  let lastLayerConfigFile = "";
  let lastWorkingDir = "";
  // Extract the manifest for the new containerd syntax
  if (Object.keys(manifest).length !== 0 && manifest.manifests) {
    manifest = manifest.manifests;
  }
  if (Array.isArray(manifest)) {
    if (manifest.length !== 1) {
      if (DEBUG_MODE) {
        console.log(
          "Multiple image tags was downloaded. Only the last one would be used"
        );
        console.log(manifest[manifest.length - 1]);
      }
    }
    let layers = manifest[manifest.length - 1]["Layers"] || [];
    if (!layers.length && fs.existsSync(tempDir)) {
      const blobFiles = fs.readdirSync(path.join(tempDir, "blobs", "sha256"));
      if (blobFiles && blobFiles.length) {
        for (const blobf of blobFiles) {
          layers.push(path.join("blobs", "sha256", blobf));
        }
      }
    }
    const lastLayer = layers[layers.length - 1];
    for (let layer of layers) {
      if (DEBUG_MODE) {
        console.log(`Extracting layer ${layer} to ${allLayersExplodedDir}`);
      }
      try {
        await extractTar(path.join(tempDir, layer), allLayersExplodedDir);
      } catch (err) {
        console.log(err);
      }
    }
    if (manifest.Config) {
      lastLayerConfigFile = path.join(tempDir, manifest.Config);
    }
    if (lastLayer.includes("layer.tar")) {
      lastLayerConfigFile = path.join(
        tempDir,
        lastLayer.replace("layer.tar", "json")
      );
    }
    if (lastLayerConfigFile && fs.existsSync(lastLayerConfigFile)) {
      try {
        lastLayerConfig = JSON.parse(
          fs.readFileSync(lastLayerConfigFile, {
            encoding: "utf-8"
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
  }
  const exportData = {
    inspectData: localData,
    manifest,
    allLayersDir: tempDir,
    allLayersExplodedDir,
    lastLayerConfig,
    lastWorkingDir
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
  const { tag, digest } = parseImageName(fullImageName);
  // Fetch only the latest tag if none is specified
  if (tag === "" && digest === "") {
    fullImageName = fullImageName + ":latest";
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docker-images-"));
  const allLayersExplodedDir = path.join(tempDir, "all-layers");
  let manifestFile = path.join(tempDir, "manifest.json");
  // Windows containers use index.json
  const manifestIndexFile = path.join(tempDir, "index.json");
  // On Windows, fallback to invoking cli
  if (isWin) {
    const imageTarFile = path.join(tempDir, "image.tar");
    console.log(
      `About to export image ${fullImageName} to ${imageTarFile} using docker cli`
    );
    let result = spawnSync(
      "docker",
      ["save", "-o", imageTarFile, fullImageName],
      {
        encoding: "utf-8"
      }
    );
    if (result.status !== 0 || result.error) {
      if (result.stdout || result.stderr) {
        console.log(result.stdout, result.stderr);
      }
      return localData;
    } else {
      await extractTar(imageTarFile, tempDir);
      if (DEBUG_MODE) {
        console.log(`Cleaning up ${imageTarFile}`);
      }
      fs.rmSync(imageTarFile, { force: true });
    }
  } else {
    let client = await getConnection();
    try {
      if (DEBUG_MODE) {
        console.log(`About to export image ${fullImageName} to ${tempDir}`);
      }
      await pipeline(
        client.stream(`images/${fullImageName}/get`),
        tar.x({
          sync: true,
          preserveOwner: false,
          noMtime: true,
          noChmod: true,
          strict: true,
          C: tempDir,
          portable: true,
          onwarn: () => {}
        })
      );
    } catch (err) {
      console.error(err);
    }
  }
  // Continue with extracting the layers
  if (fs.existsSync(tempDir)) {
    if (fs.existsSync(manifestFile)) {
      // This is fine
    } else if (fs.existsSync(manifestIndexFile)) {
      manifestFile = manifestIndexFile;
    } else {
      console.log(
        `Manifest file ${manifestFile} was not found after export at ${tempDir}`
      );
      return undefined;
    }
    if (DEBUG_MODE) {
      console.log(
        `Image ${fullImageName} successfully exported to directory ${tempDir}`
      );
    }
    fs.mkdirSync(allLayersExplodedDir);
    return await extractFromManifest(
      manifestFile,
      localData,
      tempDir,
      allLayersExplodedDir
    );
  } else {
    console.log(`Unable to export image to ${tempDir}`);
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
  let knownSysPaths = [];
  if (allLayersExplodedDir && allLayersExplodedDir !== "") {
    knownSysPaths = [
      path.join(allLayersExplodedDir, "/usr/local/go"),
      path.join(allLayersExplodedDir, "/usr/local/lib"),
      path.join(allLayersExplodedDir, "/usr/local/lib64"),
      path.join(allLayersExplodedDir, "/opt"),
      path.join(allLayersExplodedDir, "/home"),
      path.join(allLayersExplodedDir, "/usr/share"),
      path.join(allLayersExplodedDir, "/usr/src"),
      path.join(allLayersExplodedDir, "/var/www/html"),
      path.join(allLayersExplodedDir, "/var/lib"),
      path.join(allLayersExplodedDir, "/mnt")
    ];
  } else if (allLayersExplodedDir === "") {
    knownSysPaths = [
      path.join(allLayersExplodedDir, "/usr/local/go"),
      path.join(allLayersExplodedDir, "/usr/local/lib"),
      path.join(allLayersExplodedDir, "/usr/local/lib64"),
      path.join(allLayersExplodedDir, "/opt"),
      path.join(allLayersExplodedDir, "/usr/share"),
      path.join(allLayersExplodedDir, "/usr/src"),
      path.join(allLayersExplodedDir, "/var/www/html"),
      path.join(allLayersExplodedDir, "/var/lib")
    ];
  }
  if (fs.existsSync(path.join(allLayersDir, "Files"))) {
    knownSysPaths.push(path.join(allLayersDir, "Files"));
  }
  /*
  // Too slow
  if (fs.existsSync(path.join(allLayersDir, "Users"))) {
    knownSysPaths.push(path.join(allLayersDir, "Users"));
  }
  */
  if (fs.existsSync(path.join(allLayersDir, "ProgramData"))) {
    knownSysPaths.push(path.join(allLayersDir, "ProgramData"));
  }
  const pyInstalls = getDirs(allLayersDir, "Python*/", false, false);
  if (pyInstalls && pyInstalls.length) {
    for (let pyiPath of pyInstalls) {
      const pyDirs = getOnlyDirs(pyiPath, "site-packages");
      if (pyDirs && pyDirs.length) {
        pathList = pathList.concat(pyDirs);
      }
    }
  }
  if (lastWorkingDir && lastWorkingDir !== "") {
    knownSysPaths.push(lastWorkingDir);
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
  }
  // Known to cause EACCESS error
  knownSysPaths.push(path.join(allLayersExplodedDir, "/usr/lib"));
  knownSysPaths.push(path.join(allLayersExplodedDir, "/usr/lib64"));
  // Build path list
  for (let wpath of knownSysPaths) {
    pathList = pathList.concat(wpath);
    const pyDirs = getOnlyDirs(wpath, "site-packages");
    if (pyDirs && pyDirs.length) {
      pathList = pathList.concat(pyDirs);
    }
    const gemsDirs = getOnlyDirs(wpath, "gems");
    if (gemsDirs && gemsDirs.length) {
      pathList = pathList.concat(gemsDirs);
    }
    const cargoDirs = getOnlyDirs(wpath, ".cargo");
    if (cargoDirs && cargoDirs.length) {
      pathList = pathList.concat(cargoDirs);
    }
    const composerDirs = getOnlyDirs(wpath, ".composer");
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
