const blockedPackages = [
  "supports-color",
  "is-arrayish",
  //  "color-convert",
  "color-name",
  "color-string",
  "supports-hyperlinks",
  "chalk",
  "wrap-ansi",
];

function readPackage(pkg) {
  // pnpm fetched metadata doesn't include libc. So we patch it based on the name to reduce duplicate binaries
  if (pkg.name?.includes("cdxgen-plugins-bin") && pkg.name.includes("linux")) {
    if (pkg.name?.includes("linuxmusl-") && !pkg.libc) {
      pkg.libc = "musl";
    } else if (pkg.name?.includes("linux-") && !pkg.libc) {
      pkg.libc = "glibc";
    }
  } else if (
    pkg.name?.includes("resolver-binding") &&
    pkg.name.includes("linux")
  ) {
    if (pkg.name?.includes("musl") && !pkg.libc) {
      pkg.libc = "musl";
    } else if (pkg.name?.includes("gnu") && !pkg.libc) {
      pkg.libc = "glibc";
    }
  } else if (pkg.name?.includes("@biomejs")) {
    if (pkg.name?.includes("linux") && !pkg.libc) {
      if (pkg.name?.includes("musl")) {
        pkg.libc = "musl";
      } else {
        pkg.libc = "glibc";
      }
    }
  }
  // Remove blocked packages from dependencies
  blockedPackages.forEach((blocked) => {
    if (pkg.dependencies?.[blocked]) {
      delete pkg.dependencies[blocked];
    }
    if (pkg.devDependencies?.[blocked]) {
      delete pkg.devDependencies[blocked];
    }
    if (pkg.optionalDependencies?.[blocked]) {
      delete pkg.optionalDependencies[blocked];
    }
  });
  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
