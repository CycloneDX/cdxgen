import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import {
  platform as _platform,
  userInfo as _userInfo,
  homedir,
  tmpdir,
} from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import stream from "node:stream/promises";
import { parse } from "node:url";
import { globSync } from "glob";
import got from "got";
import { x } from "tar";
import { DEBUG_MODE, getAllFiles } from "../helpers/utils.js";

export const isWin = _platform() === "win32";
export const DOCKER_HUB_REGISTRY = "docker.io";

let dockerConn = undefined;
let isPodman = false;
let isPodmanRootless = true;
let isDockerRootless = false;
// https://github.com/containerd/containerd
let isContainerd = !!process.env.CONTAINERD_ADDRESS;
const WIN_LOCAL_TLS = "http://localhost:2375";
let isWinLocalTLS = false;
let isNerdctl = undefined;

if (
  !process.env.DOCKER_HOST &&
  (process.env.CONTAINERD_ADDRESS ||
    (process.env.XDG_RUNTIME_DIR &&
      existsSync(
        join(process.env.XDG_RUNTIME_DIR, "containerd-rootless", "api.sock"),
      )))
) {
  isContainerd = true;
}

/**
 * Detect if Rancher desktop is running on a mac.
 */
export function detectRancherDesktop() {
  // Detect Rancher desktop and nerdctl on a mac
  if (_platform() === "darwin") {
    const limaHome = join(
      homedir(),
      "Library",
      "Application Support",
      "rancher-desktop",
      "lima",
    );
    const limactl = join(
      "/Applications",
      "Rancher Desktop.app",
      "Contents",
      "Resources",
      "resources",
      "darwin",
      "lima",
      "bin",
      "limactl",
    );
    // Is Rancher Desktop running
    if (existsSync(limactl) || existsSync(limaHome)) {
      const result = spawnSync("rdctl", ["list-settings"], {
        encoding: "utf-8",
      });
      if (result.status !== 0 || result.error) {
        if (
          isNerdctl === undefined &&
          result.stderr?.includes("connection refused")
        ) {
          console.warn(
            "Ensure Rancher Desktop is running prior to invoking cdxgen. To start from the command line, type the command 'rdctl start'",
          );
          isNerdctl = false;
        }
      } else {
        if (DEBUG_MODE) {
          console.log("Rancher Desktop found!");
        }
        isNerdctl = true;
      }
    }
  }
  return isNerdctl;
}

// Cache the registry auth keys
const registry_auth_keys = {};

/**
 * Method to get all dirs matching a name
 *
 * @param {string} dirPath Root directory for search
 * @param {string} dirName Directory name
 */
export const getDirs = (dirPath, dirName, hidden = false, recurse = true) => {
  try {
    return globSync(recurse ? "**/" : `${dirName}`, {
      cwd: dirPath,
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

function flatten(lists) {
  return lists.reduce((a, b) => a.concat(b), []);
}

function getDirectories(srcpath) {
  if (existsSync(srcpath)) {
    return readdirSync(srcpath)
      .map((file) => join(srcpath, file))
      .filter((path) => {
        try {
          return statSync(path).isDirectory();
        } catch (e) {
          return false;
        }
      });
  }
  return [];
}

export const getOnlyDirs = (srcpath, dirName) => {
  return [
    srcpath,
    ...flatten(
      getDirectories(srcpath)
        .map((p) => {
          try {
            if (existsSync(p)) {
              if (lstatSync(p).isDirectory()) {
                return getOnlyDirs(p, dirName);
              }
            }
          } catch (err) {
            // ignore
          }
        })
        .filter((p) => p !== undefined),
    ),
  ].filter((d) => d.endsWith(dirName));
};

const getDefaultOptions = (forRegistry) => {
  let authTokenSet = false;
  if (!forRegistry) {
    forRegistry = process.env.DOCKER_SERVER_ADDRESS ?? DOCKER_HUB_REGISTRY;
  }
  if (forRegistry) {
    forRegistry = forRegistry.replace("http://", "").replace("https://", "");
    if (forRegistry.includes("/")) {
      forRegistry = forRegistry.split("/")[0];
    }
  }
  const opts = {
    enableUnixSockets: true,
    throwHttpErrors: true,
    method: "GET",
    hooks: { beforeError: [] },
    mutableDefaults: true,
  };
  const DOCKER_CONFIG = process.env.DOCKER_CONFIG || join(homedir(), ".docker");
  // Support for private registry
  if (process.env.DOCKER_AUTH_CONFIG) {
    opts.headers = {
      "X-Registry-Auth": process.env.DOCKER_AUTH_CONFIG,
    };
    authTokenSet = true;
  }
  if (
    !authTokenSet &&
    process.env.DOCKER_USER &&
    process.env.DOCKER_PASSWORD &&
    process.env.DOCKER_EMAIL &&
    forRegistry
  ) {
    const authPayload = {
      username: process.env.DOCKER_USER,
      email: process.env.DOCKER_EMAIL,
      serveraddress: forRegistry,
    };
    if (process.env.DOCKER_USER === "<token>") {
      authPayload.IdentityToken = process.env.DOCKER_PASSWORD;
    } else {
      authPayload.password = process.env.DOCKER_PASSWORD;
    }
    opts.headers = {
      "X-Registry-Auth": Buffer.from(JSON.stringify(authPayload)).toString(
        "base64",
      ),
    };
  }
  if (!authTokenSet && existsSync(join(DOCKER_CONFIG, "config.json"))) {
    const configData = readFileSync(
      join(DOCKER_CONFIG, "config.json"),
      "utf-8",
    );
    if (configData) {
      try {
        const configJson = JSON.parse(configData);
        if (configJson.auths) {
          // Check if there are hardcoded tokens
          for (const serverAddress of Object.keys(configJson.auths)) {
            if (forRegistry && !serverAddress.includes(forRegistry)) {
              continue;
            }
            if (configJson.auths[serverAddress].auth) {
              opts.headers = {
                "X-Registry-Auth": configJson.auths[serverAddress].auth,
              };
              authTokenSet = true;
              break;
            }
            if (configJson.credsStore) {
              const helperAuthToken = getCredsFromHelper(
                configJson.credsStore,
                serverAddress,
              );
              if (helperAuthToken) {
                opts.headers = {
                  "X-Registry-Auth": helperAuthToken,
                };
                authTokenSet = true;
                break;
              }
            }
          }
        } else if (configJson.credHelpers) {
          // Support for credential helpers
          for (const serverAddress of Object.keys(configJson.credHelpers)) {
            if (forRegistry && !serverAddress.includes(forRegistry)) {
              continue;
            }
            if (configJson.credHelpers[serverAddress]) {
              const helperAuthToken = getCredsFromHelper(
                configJson.credHelpers[serverAddress],
                serverAddress,
              );
              if (helperAuthToken) {
                opts.headers = {
                  "X-Registry-Auth": helperAuthToken,
                };
                authTokenSet = true;
                break;
              }
            }
          }
        }
      } catch (err) {
        // pass
      }
    }
  }
  const userInfo = _userInfo();
  opts.podmanPrefixUrl = isWin ? "" : "http://unix:/run/podman/podman.sock:";
  opts.podmanRootlessPrefixUrl = isWin
    ? ""
    : `http://unix:/run/user/${userInfo.uid}/podman/podman.sock:`;
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
        opts.prefixUrl = isWin
          ? WIN_LOCAL_TLS
          : isDockerRootless
            ? `http://unix:${homedir()}/.docker/run/docker.sock:`
            : "http://unix:/var/run/docker.sock:";
      }
    }
  } else {
    let hostStr = process.env.DOCKER_HOST;
    if (hostStr.startsWith("unix:///")) {
      hostStr = hostStr.replace("unix:///", "http://unix:/");
      if (hostStr.includes("docker.sock")) {
        hostStr = hostStr.replace("docker.sock", "docker.sock:");
        isDockerRootless = true;
      }
    }
    opts.prefixUrl = hostStr;
    if (process.env.DOCKER_CERT_PATH) {
      opts.https = {
        certificate: readFileSync(
          join(process.env.DOCKER_CERT_PATH, "cert.pem"),
          "utf8",
        ),
        key: readFileSync(
          join(process.env.DOCKER_CERT_PATH, "key.pem"),
          "utf8",
        ),
      };
      // Disable tls on empty values
      // From the docker docs: Setting the DOCKER_TLS_VERIFY environment variable to any value other than the empty string is equivalent to setting the --tlsverify flag
      if (
        process.env.DOCKER_TLS_VERIFY &&
        process.env.DOCKER_TLS_VERIFY === ""
      ) {
        opts.https.rejectUnauthorized = false;
        console.log("TLS Verification disabled for", hostStr);
      }
    }
  }

  return opts;
};

export const getConnection = async (options, forRegistry) => {
  if (isContainerd || isNerdctl) {
    return undefined;
  }
  if (!dockerConn) {
    const defaultOptions = getDefaultOptions(forRegistry);
    const opts = Object.assign(
      {},
      {
        enableUnixSockets: defaultOptions.enableUnixSockets,
        throwHttpErrors: defaultOptions.throwHttpErrors,
        method: defaultOptions.method,
        prefixUrl: defaultOptions.prefixUrl,
        headers: defaultOptions.headers,
      },
      options,
    );
    try {
      await got.get("_ping", opts);
      dockerConn = got.extend(opts);
      if (DEBUG_MODE) {
        if (isDockerRootless) {
          console.log("Docker service in rootless mode detected.");
        } else {
          console.log(
            "Docker service in root mode detected. Consider switching to rootless mode to improve security. See https://docs.docker.com/engine/security/rootless/",
          );
        }
      }
    } catch (err) {
      opts.prefixUrl = `http://unix:${homedir()}/.docker/run/docker.sock:`;
      try {
        await got.get("_ping", opts);
        dockerConn = got.extend(opts);
        isDockerRootless = true;
        if (DEBUG_MODE) {
          console.log("Docker service in rootless mode detected.");
        }
        return dockerConn;
      } catch (err) {
        // ignore
      }
      try {
        if (isWin) {
          opts.prefixUrl = WIN_LOCAL_TLS;
          await got.get("_ping", opts);
          dockerConn = got.extend(opts);
          isWinLocalTLS = true;
          if (DEBUG_MODE) {
            console.log("Docker desktop on Windows detected.");
          }
        } else {
          opts.prefixUrl = opts.podmanRootlessPrefixUrl;
          await got.get("libpod/_ping", opts);
          isPodman = true;
          isPodmanRootless = true;
          dockerConn = got.extend(opts);
          if (DEBUG_MODE) {
            console.log(
              "Podman in rootless mode detected. Thank you for using podman!",
            );
          }
        }
      } catch (err) {
        try {
          opts.prefixUrl = opts.podmanPrefixUrl;
          await got.get("libpod/_ping", opts);
          isPodman = true;
          isPodmanRootless = false;
          dockerConn = got.extend(opts);
          console.log(
            "Podman in root mode detected. Consider switching to rootless mode to improve security. See https://github.com/containers/podman/blob/main/docs/tutorials/rootless_tutorial.md",
          );
        } catch (err) {
          if (_platform() === "win32") {
            console.warn(
              "Ensure Docker for Desktop is running as an administrator with 'Exposing daemon on TCP without TLS' setting turned on.",
              opts,
            );
          } else if (_platform() === "darwin" && !isNerdctl) {
            if (detectRancherDesktop()) {
              return undefined;
            }
            if (isNerdctl === undefined) {
              console.warn(
                "Ensure Podman Desktop (open-source) or Docker for Desktop (May require subscription) is running.",
              );
            }
          } else {
            console.warn(
              "Ensure docker/podman service or Docker for Desktop is running.",
              opts,
            );
            console.log(
              "Check if the post-installation steps were performed correctly as per this documentation https://docs.docker.com/engine/install/linux-postinstall/",
            );
          }
        }
      }
    }
  }
  return dockerConn;
};

export const makeRequest = async (path, method, forRegistry) => {
  const client = await getConnection({}, forRegistry);
  if (!client) {
    return undefined;
  }
  const extraOptions = {
    responseType: method === "GET" ? "json" : "buffer",
    resolveBodyOnly: true,
    enableUnixSockets: true,
    method,
  };
  const defaultOptions = getDefaultOptions(forRegistry);
  const opts = Object.assign(
    {},
    {
      enableUnixSockets: defaultOptions.enableUnixSockets,
      throwHttpErrors: defaultOptions.throwHttpErrors,
      method: defaultOptions.method,
      prefixUrl: defaultOptions.prefixUrl,
      headers: defaultOptions.headers,
    },
    extraOptions,
  );
  return await client(path, opts);
};

/**
 * Parse image name
 *
 * docker pull debian
 * docker pull debian:jessie
 * docker pull ubuntu@sha256:45b23dee08af5e43a7fea6c4cf9c25ccf269ee113168c19722f87876677c5cb2
 * docker pull myregistry.local:5000/testing/test-image
 */
export const parseImageName = (fullImageName) => {
  const nameObj = {
    registry: "",
    repo: "",
    tag: "",
    digest: "",
    platform: "",
    group: "",
    name: "",
  };
  if (!fullImageName) {
    return nameObj;
  }
  // ensure it's lowercased
  fullImageName = fullImageName.toLowerCase().trim();

  // Extract platform
  if (fullImageName.startsWith("--platform=")) {
    const tmpName = fullImageName.replace("--platform=", "").split(" ");
    nameObj.platform = tmpName[0];
    fullImageName = tmpName[1];
  }

  // Extract registry name
  if (
    fullImageName.includes("/") &&
    (fullImageName.includes(".") || fullImageName.includes(":"))
  ) {
    const urlObj = parse(fullImageName);
    const tmpA = fullImageName.split("/");
    if (
      urlObj.path !== fullImageName ||
      tmpA[0].includes(".") ||
      tmpA[0].includes(":")
    ) {
      nameObj.registry = tmpA[0];
      fullImageName = fullImageName.replace(`${tmpA[0]}/`, "");
    }
  }

  // Extract digest name
  if (fullImageName.includes("@sha256:")) {
    const tmpA = fullImageName.split("@sha256:");
    if (tmpA.length > 1) {
      nameObj.digest = tmpA[tmpA.length - 1];
      fullImageName = fullImageName.replace(`@sha256:${nameObj.digest}`, "");
    }
  }

  // Extract tag name
  if (fullImageName.includes(":")) {
    const tmpA = fullImageName.split(":");
    if (tmpA.length > 1) {
      nameObj.tag = tmpA[tmpA.length - 1];
      fullImageName = fullImageName.replace(`:${nameObj.tag}`, "");
    }
  }

  // The left over string is the repo name
  nameObj.repo = fullImageName;
  nameObj.name = fullImageName;

  // extract group name
  if (fullImageName.includes("/")) {
    const tmpA = fullImageName.split("/");
    if (tmpA.length > 1) {
      nameObj.name = tmpA[tmpA.length - 1];
      nameObj.group = fullImageName.replace(`/${tmpA[tmpA.length - 1]}`, "");
    }
  }

  return nameObj;
};

/**
 * Prefer cli on windows, nerdctl on mac, or when using tcp/ssh based host.
 *
 * @returns boolean true if we should use the cli. false otherwise
 */
const needsCliFallback = () => {
  if (_platform() === "darwin" && detectRancherDesktop()) {
    return true;
  }
  return (
    isWin ||
    (process.env.DOCKER_HOST &&
      (process.env.DOCKER_HOST.startsWith("tcp://") ||
        process.env.DOCKER_HOST.startsWith("ssh://")))
  );
};

/**
 * Method to get image to the local registry by pulling from the remote if required
 */
export const getImage = async (fullImageName) => {
  let localData = undefined;
  let pullData = undefined;
  const { registry, repo, tag, digest } = parseImageName(fullImageName);
  const repoWithTag =
    registry && registry !== DOCKER_HUB_REGISTRY
      ? fullImageName
      : `${repo}:${tag !== "" ? tag : ":latest"}`;
  // Fetch only the latest tag if none is specified
  if (tag === "" && digest === "") {
    fullImageName = `${fullImageName}:latest`;
  }
  if (isContainerd) {
    console.log(
      "containerd/nerdctl is currently unsupported. Export the image manually and run cdxgen against the tar image.",
    );
    return undefined;
  }
  if (needsCliFallback()) {
    let dockerCmd = process.env.DOCKER_CMD || "docker";
    if (!process.env.DOCKER_CMD && detectRancherDesktop()) {
      dockerCmd = "nerdctl";
    }
    let result = spawnSync(dockerCmd, ["pull", fullImageName], {
      encoding: "utf-8",
    });
    if (result.status !== 0 || result.error) {
      if (result.stderr?.includes("docker daemon is not running")) {
        console.log(
          "Ensure Docker for Desktop is running as an administrator with 'Exposing daemon on TCP without TLS' setting turned on.",
        );
      } else if (result.stderr?.includes("not found")) {
        console.log(
          "Set the environment variable DOCKER_CMD to use an alternative command such as nerdctl or podman.",
        );
      } else {
        console.log(result.stderr);
      }
      return localData;
    }
    result = spawnSync(dockerCmd, ["inspect", fullImageName], {
      encoding: "utf-8",
    });
    if (result.status !== 0 || result.error) {
      console.log(result.stderr);
      return localData;
    }
    try {
      const stdout = result.stdout;
      if (stdout) {
        const inspectData = JSON.parse(Buffer.from(stdout).toString());
        if (inspectData && Array.isArray(inspectData)) {
          return inspectData[0];
        }
        return inspectData;
      }
    } catch (err) {
      // continue regardless of error
    }
  }
  try {
    localData = await makeRequest(
      `images/${repoWithTag}/json`,
      "GET",
      registry,
    );
    if (localData) {
      return localData;
    }
  } catch (err) {
    // ignore
  }
  try {
    localData = await makeRequest(`images/${repo}/json`, "GET", registry);
  } catch (err) {
    try {
      localData = await makeRequest(
        `images/${fullImageName}/json`,
        "GET",
        registry,
      );
      if (localData) {
        return localData;
      }
    } catch (err) {
      // ignore
    }
    if (DEBUG_MODE) {
      console.log(
        `Trying to pull the image ${fullImageName} from registry. This might take a while ...`,
      );
    }
    // If the data is not available locally
    try {
      pullData = await makeRequest(
        `images/create?fromImage=${fullImageName}`,
        "POST",
        registry,
      );
      if (
        pullData &&
        (pullData.includes("no match for platform in manifest") ||
          pullData.includes("Error choosing an image from manifest list"))
      ) {
        console.warn(
          "You may have to enable experimental settings in docker to support this platform!",
        );
        console.warn(
          "To scan windows images, run cdxgen on a windows server with hyper-v and docker installed. Switch to windows containers in your docker settings.",
        );
        return undefined;
      }
    } catch (err) {
      try {
        if (DEBUG_MODE) {
          console.log(`Re-trying the pull with the name ${repoWithTag}.`);
        }
        pullData = await makeRequest(
          `images/create?fromImage=${repoWithTag}`,
          "POST",
          registry,
        );
      } catch (err) {
        // continue regardless of error
      }
    }
    try {
      if (DEBUG_MODE) {
        console.log(`Trying with ${repoWithTag}`);
      }
      localData = await makeRequest(
        `images/${repoWithTag}/json`,
        "GET",
        registry,
      );
      if (localData) {
        return localData;
      }
    } catch (err) {
      try {
        if (DEBUG_MODE) {
          console.log(`Trying with ${repo}`);
        }
        localData = await makeRequest(`images/${repo}/json`, "GET", registry);
        if (localData) {
          return localData;
        }
      } catch (err) {
        // continue regardless of error
      }
      try {
        if (DEBUG_MODE) {
          console.log(`Trying with ${fullImageName}`);
        }
        localData = await makeRequest(
          `images/${fullImageName}/json`,
          "GET",
          registry,
        );
      } catch (err) {
        // continue regardless of error
      }
    }
  }
  if (!localData) {
    console.log(
      `Unable to pull ${fullImageName}. Check if the name is valid. Perform any authentication prior to invoking cdxgen.`,
    );
    console.log(
      `Try manually pulling this image using docker pull ${fullImageName}`,
    );
  }
  return localData;
};

export const extractTar = async (fullImageName, dir) => {
  try {
    await stream.pipeline(
      createReadStream(fullImageName),
      x({
        sync: true,
        preserveOwner: false,
        noMtime: true,
        noChmod: true,
        strict: true,
        C: dir,
        portable: true,
        onwarn: () => {
          // ignore
        },
        filter: (path, entry) => {
          // Some files are known to cause issues with extract
          if (
            path.includes("etc/machine-id") ||
            path.includes("etc/gshadow") ||
            path.includes("etc/shadow") ||
            path.endsWith("etc/passwd") ||
            path.includes("usr/lib/systemd/") ||
            path.includes("usr/lib64/libdevmapper.so") ||
            path.includes("usr/sbin/") ||
            path.includes("cacerts") ||
            path.includes("ssl/certs") ||
            path.includes("logs/") ||
            path.includes("dev/") ||
            path.includes("usr/share/zoneinfo/") ||
            path.includes("usr/share/doc/") ||
            path.includes("usr/share/i18n/") ||
            path.includes("var/lib/ca-certificates") ||
            basename(path).startsWith(".") ||
            path.includes("usr/share/licenses/device-mapper-libs") ||
            [
              "BlockDevice",
              "CharacterDevice",
              "FIFO",
              "MultiVolume",
              "TapeVolume",
              "SymbolicLink",
              "RenamedOrSymlinked",
              "HardLink",
            ].includes(entry.type)
          ) {
            return false;
          }
          return true;
        },
      }),
    );
    return true;
  } catch (err) {
    if (err.code === "EPERM" && err.syscall === "symlink") {
      console.log(
        "Please run cdxgen from a powershell terminal with admin privileges to create symlinks.",
      );
      console.log(err);
    } else if (
      ![
        "TAR_BAD_ARCHIVE",
        "TAR_ENTRY_INFO",
        "TAR_ENTRY_INVALID",
        "TAR_ENTRY_ERROR",
        "TAR_ENTRY_UNSUPPORTED",
        "TAR_ABORT",
        "EACCES",
      ].includes(err.code)
    ) {
      console.log(
        `Error while extracting image ${fullImageName} to ${dir}. Please file this bug to the cdxgen repo. https://github.com/CycloneDX/cdxgen/issues`,
      );
      console.log("------------");
      console.log(err);
      console.log("------------");
    } else if (err.code === "TAR_BAD_ARCHIVE") {
      if (DEBUG_MODE) {
        console.log(`Archive ${fullImageName} is empty. Skipping.`);
      }
    } else if (["EACCES"].includes(err.code)) {
      console.log(err);
      /*
       * We do not display errors messages for errors:
       * 1) TAR_ENTRY_INFO is an informative error indicating that an entry is being modified.
       * 2) TAR_ENTRY_INVALID indicates that a given entry is not valid tar archive entry and will be skipped.
       */
    } else if (!["TAR_ENTRY_INFO", "TAR_ENTRY_INVALID"].includes(err.code)) {
      console.log(err);
    }
    return false;
  }
};

/**
 * Method to export a container image archive.
 * Returns the location of the layers with additional packages related metadata
 */
export const exportArchive = async (fullImageName) => {
  if (!existsSync(fullImageName)) {
    console.log(`Unable to find container image archive ${fullImageName}`);
    return undefined;
  }
  const manifest = {};
  const tempDir = mkdtempSync(join(tmpdir(), "docker-images-"));
  const allLayersExplodedDir = join(tempDir, "all-layers");
  const blobsDir = join(tempDir, "blobs", "sha256");
  mkdirSync(allLayersExplodedDir);
  const manifestFile = join(tempDir, "manifest.json");
  try {
    await extractTar(fullImageName, tempDir);
    // podman use blobs dir
    if (existsSync(blobsDir)) {
      if (DEBUG_MODE) {
        console.log(
          `Image archive ${fullImageName} successfully exported to directory ${tempDir}`,
        );
      }
      const allBlobs = getAllFiles(blobsDir, "*");
      for (const ablob of allBlobs) {
        if (DEBUG_MODE) {
          console.log(`Extracting ${ablob} to ${allLayersExplodedDir}`);
        }
        await extractTar(ablob, allLayersExplodedDir);
      }
      const lastLayerConfig = {};
      const lastWorkingDir = "";
      const exportData = {
        manifest,
        allLayersDir: tempDir,
        allLayersExplodedDir,
        lastLayerConfig,
        lastWorkingDir,
      };
      exportData.pkgPathList = getPkgPathList(exportData, lastWorkingDir);
      return exportData;
    }
    if (existsSync(manifestFile)) {
      // docker manifest file
      return await extractFromManifest(
        manifestFile,
        {},
        tempDir,
        allLayersExplodedDir,
      );
    }
    console.log(`Unable to extract image archive to ${tempDir}`);
  } catch (err) {
    // ignore
  }
  return undefined;
};

export const extractFromManifest = async (
  manifestFile,
  localData,
  tempDir,
  allLayersExplodedDir,
) => {
  // Example of manifests
  // [{"Config":"blobs/sha256/dedc100afa8d6718f5ac537730dd4a5ceea3563e695c90f1a8ac6df32c4cb291","RepoTags":["shiftleft/core:latest"],"Layers":["blobs/sha256/eaead16dc43bb8811d4ff450935d607f9ba4baffda4fc110cc402fa43f601d83","blobs/sha256/2039af03c0e17a3025b989335e9414149577fa09e7d0dcbee80155333639d11f"]}]
  // {"schemaVersion":2,"manifests":[{"mediaType":"application/vnd.docker.distribution.manifest.list.v2+json","digest":"sha256:7706ac20c7587081dc7a00e0ec65a6633b0bb3788e0048a3e971d3eae492db63","size":318,"annotations":{"io.containerd.image.name":"docker.io/shiftleft/scan-slim:latest","org.opencontainers.image.ref.name":"latest"}}]}
  let manifest = JSON.parse(
    readFileSync(manifestFile, {
      encoding: "utf-8",
    }),
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
          "Multiple image tags was downloaded. Only the last one would be used",
        );
        console.log(manifest[manifest.length - 1]);
      }
    }
    const layers = manifest[manifest.length - 1]["Layers"] || [];
    if (!layers.length && existsSync(tempDir)) {
      const blobFiles = readdirSync(join(tempDir, "blobs", "sha256"));
      if (blobFiles?.length) {
        for (const blobf of blobFiles) {
          layers.push(join("blobs", "sha256", blobf));
        }
      }
    }
    const lastLayer = layers[layers.length - 1];
    for (const layer of layers) {
      try {
        if (!lstatSync(join(tempDir, layer)).isFile()) {
          console.log(
            `Skipping layer ${layer} since it is not a readable file.`,
          );
          continue;
        }
      } catch (e) {
        console.log(`Skipping layer ${layer} since it is not a readable file.`);
        continue;
      }
      if (DEBUG_MODE) {
        console.log(`Extracting layer ${layer} to ${allLayersExplodedDir}`);
      }
      try {
        await extractTar(join(tempDir, layer), allLayersExplodedDir);
      } catch (err) {
        if (err.code === "TAR_BAD_ARCHIVE") {
          if (DEBUG_MODE) {
            console.log(`Layer ${layer} is empty.`);
          }
        } else {
          console.log(err);
        }
      }
    }
    if (manifest.Config) {
      lastLayerConfigFile = join(tempDir, manifest.Config);
    }
    if (lastLayer.includes("layer.tar")) {
      lastLayerConfigFile = join(
        tempDir,
        lastLayer.replace("layer.tar", "json"),
      );
    }
    if (lastLayerConfigFile && existsSync(lastLayerConfigFile)) {
      try {
        lastLayerConfig = JSON.parse(
          readFileSync(lastLayerConfigFile, {
            encoding: "utf-8",
          }),
        );
        lastWorkingDir = lastLayerConfig.config?.WorkingDir
          ? join(allLayersExplodedDir, lastLayerConfig.config.WorkingDir)
          : "";
      } catch (err) {
        // ignore
      }
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
export const exportImage = async (fullImageName) => {
  // Safely ignore local directories
  if (
    !fullImageName ||
    fullImageName === "." ||
    existsSync(resolve(fullImageName))
  ) {
    return undefined;
  }
  // Try to get the data locally first
  const localData = await getImage(fullImageName);
  if (!localData) {
    return undefined;
  }
  const { registry, tag, digest } = parseImageName(fullImageName);
  // Fetch only the latest tag if none is specified
  if (tag === "" && digest === "") {
    fullImageName = `${fullImageName}:latest`;
  }
  const tempDir = mkdtempSync(join(tmpdir(), "docker-images-"));
  const allLayersExplodedDir = join(tempDir, "all-layers");
  let manifestFile = join(tempDir, "manifest.json");
  // Windows containers use index.json
  const manifestIndexFile = join(tempDir, "index.json");
  // On Windows or on mac with Rancher Desktop, fallback to invoking cli
  if (needsCliFallback()) {
    const imageTarFile = join(tempDir, "image.tar");
    let dockerCmd = process.env.DOCKER_CMD || "docker";
    if (!process.env.DOCKER_CMD && detectRancherDesktop()) {
      dockerCmd = "nerdctl";
    }
    console.log(
      `About to export image ${fullImageName} to ${imageTarFile} using ${dockerCmd} cli`,
    );
    const result = spawnSync(
      dockerCmd,
      ["save", "-o", imageTarFile, fullImageName],
      {
        encoding: "utf-8",
      },
    );
    if (result.status !== 0 || result.error) {
      if (result.stdout || result.stderr) {
        console.log(result.stdout, result.stderr);
      }
      return localData;
    }
    await extractTar(imageTarFile, tempDir);
    if (DEBUG_MODE) {
      console.log(`Cleaning up ${imageTarFile}`);
    }
    if (rmSync) {
      rmSync(imageTarFile, { force: true });
    }
  } else {
    const client = await getConnection({}, registry);
    try {
      if (DEBUG_MODE) {
        if (registry?.trim().length) {
          console.log(
            `About to export image ${fullImageName} from ${registry} to ${tempDir}`,
          );
        } else {
          console.log(`About to export image ${fullImageName} to ${tempDir}`);
        }
      }
      await stream.pipeline(
        client.stream(`images/${fullImageName}/get`),
        x({
          sync: true,
          preserveOwner: false,
          noMtime: true,
          noChmod: true,
          strict: true,
          C: tempDir,
          portable: true,
          onwarn: () => {
            // ignore
          },
        }),
      );
    } catch (err) {
      if (localData?.Id) {
        console.log(`Retrying with ${localData.Id}`);
        try {
          await stream.pipeline(
            client.stream(`images/${localData.Id}/get`),
            x({
              sync: true,
              preserveOwner: false,
              noMtime: true,
              noChmod: true,
              strict: true,
              C: tempDir,
              portable: true,
              onwarn: () => {
                // ignore
              },
            }),
          );
        } catch (err) {
          // ignore
        }
      }
    }
  }
  // Continue with extracting the layers
  if (existsSync(tempDir)) {
    if (existsSync(manifestFile)) {
      // This is fine
    } else if (existsSync(manifestIndexFile)) {
      manifestFile = manifestIndexFile;
    } else {
      console.log(
        `Manifest file ${manifestFile} was not found after export at ${tempDir}`,
      );
      return undefined;
    }
    if (DEBUG_MODE) {
      console.log(
        `Image ${fullImageName} successfully exported to directory ${tempDir}`,
      );
    }
    mkdirSync(allLayersExplodedDir);
    return await extractFromManifest(
      manifestFile,
      localData,
      tempDir,
      allLayersExplodedDir,
    );
  }
  console.log(`Unable to export image to ${tempDir}`);
  return undefined;
};

/**
 * Method to retrieve path list for system-level packages
 */
export const getPkgPathList = (exportData, lastWorkingDir) => {
  const allLayersExplodedDir = exportData.allLayersExplodedDir;
  const allLayersDir = exportData.allLayersDir;
  let pathList = [];
  let knownSysPaths = [];
  if (allLayersExplodedDir && allLayersExplodedDir !== "") {
    knownSysPaths = [
      join(allLayersExplodedDir, "/usr/local/go"),
      join(allLayersExplodedDir, "/usr/local/lib"),
      join(allLayersExplodedDir, "/usr/local/lib64"),
      join(allLayersExplodedDir, "/opt"),
      join(allLayersExplodedDir, "/home"),
      join(allLayersExplodedDir, "/usr/share"),
      join(allLayersExplodedDir, "/usr/src"),
      join(allLayersExplodedDir, "/var/www/html"),
      join(allLayersExplodedDir, "/var/lib"),
      join(allLayersExplodedDir, "/mnt"),
    ];
  } else if (allLayersExplodedDir === "") {
    knownSysPaths = [
      join(allLayersExplodedDir, "/usr/local/go"),
      join(allLayersExplodedDir, "/usr/local/lib"),
      join(allLayersExplodedDir, "/usr/local/lib64"),
      join(allLayersExplodedDir, "/opt"),
      join(allLayersExplodedDir, "/usr/share"),
      join(allLayersExplodedDir, "/usr/src"),
      join(allLayersExplodedDir, "/var/www/html"),
      join(allLayersExplodedDir, "/var/lib"),
    ];
  }
  if (existsSync(join(allLayersDir, "Files"))) {
    knownSysPaths.push(join(allLayersDir, "Files"));
  }
  /*
  // Too slow
  if (fs.existsSync(path.join(allLayersDir, "Users"))) {
    knownSysPaths.push(path.join(allLayersDir, "Users"));
  }
  */
  if (existsSync(join(allLayersDir, "ProgramData"))) {
    knownSysPaths.push(join(allLayersDir, "ProgramData"));
  }
  const pyInstalls = getDirs(allLayersDir, "Python*/", false, false);
  if (pyInstalls?.length) {
    for (const pyiPath of pyInstalls) {
      const pyDirs = getOnlyDirs(pyiPath, "site-packages");
      if (pyDirs?.length) {
        pathList = pathList.concat(pyDirs);
      }
    }
  }
  if (lastWorkingDir && lastWorkingDir !== "") {
    if (
      !lastWorkingDir.includes("/opt/") &&
      !lastWorkingDir.includes("/home/")
    ) {
      knownSysPaths.push(lastWorkingDir);
    }
    // Some more common app dirs
    if (!lastWorkingDir.includes("/app/")) {
      knownSysPaths.push(join(allLayersExplodedDir, "/app"));
    }
    if (!lastWorkingDir.includes("/layers/")) {
      knownSysPaths.push(join(allLayersExplodedDir, "/layers"));
    }
    if (!lastWorkingDir.includes("/data/")) {
      knownSysPaths.push(join(allLayersExplodedDir, "/data"));
    }
    if (!lastWorkingDir.includes("/srv/")) {
      knownSysPaths.push(join(allLayersExplodedDir, "/srv"));
    }
  }
  // Known to cause EACCESS error
  knownSysPaths.push(join(allLayersExplodedDir, "/usr/lib"));
  knownSysPaths.push(join(allLayersExplodedDir, "/usr/lib64"));
  // Build path list
  for (const wpath of knownSysPaths) {
    pathList = pathList.concat(wpath);
    const pyDirs = getOnlyDirs(wpath, "site-packages");
    if (pyDirs?.length) {
      pathList = pathList.concat(pyDirs);
    }
    const gemsDirs = getOnlyDirs(wpath, "gems");
    if (gemsDirs?.length) {
      pathList = pathList.concat(gemsDirs);
    }
    const cargoDirs = getOnlyDirs(wpath, ".cargo");
    if (cargoDirs?.length) {
      pathList = pathList.concat(cargoDirs);
    }
    const composerDirs = getOnlyDirs(wpath, ".composer");
    if (composerDirs?.length) {
      pathList = pathList.concat(composerDirs);
    }
  }
  if (DEBUG_MODE) {
    console.log("pathList", pathList);
  }
  return pathList;
};

export const removeImage = async (fullImageName, force = false) => {
  const removeData = await makeRequest(
    `images/${fullImageName}?force=${force}`,
    "DELETE",
  );
  return removeData;
};

export const getCredsFromHelper = (exeSuffix, serverAddress) => {
  if (registry_auth_keys[serverAddress]) {
    return registry_auth_keys[serverAddress];
  }
  let credHelperExe = `docker-credential-${exeSuffix}`;
  if (isWin) {
    credHelperExe = `${credHelperExe}.exe`;
  }
  const result = spawnSync(credHelperExe, ["get"], {
    input: serverAddress,
    encoding: "utf-8",
  });
  if (result.status !== 0 || result.error) {
    console.log(result.stdout, result.stderr);
  } else if (result.stdout) {
    const cmdOutput = Buffer.from(result.stdout).toString();
    try {
      const authPayload = JSON.parse(cmdOutput);
      const fixedAuthPayload = {
        username:
          authPayload.username ||
          authPayload.Username ||
          process.env.DOCKER_USER,
        password:
          authPayload.password ||
          authPayload.Secret ||
          process.env.DOCKER_PASSWORD,
        email:
          authPayload.email || authPayload.username || process.env.DOCKER_USER,
        serveraddress: serverAddress,
      };
      const authKey = Buffer.from(JSON.stringify(fixedAuthPayload)).toString(
        "base64",
      );
      registry_auth_keys[serverAddress] = authKey;
      return authKey;
    } catch (err) {
      return undefined;
    }
  }
  return undefined;
};

export const addSkippedSrcFiles = (skippedImageSrcs, components) => {
  for (const skippedImage of skippedImageSrcs) {
    for (const co of components) {
      const srcFileValues = [];
      let srcImageValue;
      co.properties.forEach((property) => {
        if (property.name === "oci:SrcImage") {
          srcImageValue = property.value;
        }

        if (property.name === "SrcFile") {
          srcFileValues.push(property.value);
        }
      });

      if (
        srcImageValue === skippedImage.image &&
        !srcFileValues.includes(skippedImage.src)
      ) {
        co.properties = co.properties.concat({
          name: "SrcFile",
          value: skippedImage.src,
        });
      }
    }
  }
};
