import importlib.metadata as importlib_metadata
import json
import sys

from pip._internal.metadata import pkg_resources

REQUIREMENT_MODULE_FOUND = False
try:
    from packaging.requirements import Requirement
    REQUIREMENT_MODULE_FOUND = True
except ImportError:
    try:
        from pip._vendor.packaging.requirements import Requirement
        REQUIREMENT_MODULE_FOUND = True
    except ImportError:
        pass

def frozen_req_from_dist(dist):
    try:
        from pip._internal.operations.freeze import FrozenRequirement
    except ImportError:
        from pip import FrozenRequirement
    try:
        from pip._internal import metadata

        dist = metadata.pkg_resources.Distribution(dist)
        try:
            fr = FrozenRequirement.from_dist(dist)
        except TypeError:
            fr = FrozenRequirement.from_dist(dist, [])
        return str(fr).strip()
    except ImportError:
        pass


def get_installed_distributions(python_path=None):
    dists = pkg_resources.Environment.from_paths(python_path).iter_installed_distributions(
        local_only=False,
        skip=(),
        user_only=False,
    )
    return [d._dist for d in dists]


def _get_extra_deps_from_dist(dist):
    extra_deps = {}
    if not dist:
        return extra_deps
    # all requirements, some of which may be extra-only:
    reqs = dist.metadata.get_all('Requires-Dist') or []
    # extras this package defines:
    extras = dist.metadata.get_all('Provides-Extra') or []
    for req_str in reqs:
        req = Requirement(req_str)
        if req.marker and 'extra' in str(req.marker):
            # evaluate marker for each declared extra
            for extra in extras:
                if req.marker.evaluate({'extra': extra}):
                    extra_deps.setdefault(extra, []).append({"name": str(req.name), "versionSpecifiers": str(req.specifier), "url": str(req.url) if req.url else None})
    return extra_deps


def _get_deps_from_extras(name_version_cache, name_dist_cache, extra_deps):
    dependencies = []
    if not extra_deps:
        return dependencies
    # Treat an extra with the name all as dependencies
    all_deps = extra_deps.get("all", [])
    for dep in all_deps:
        dversion = name_version_cache.get(dep["name"])
        if not dversion:
            continue
        dversionSpecifiers = dep.get("versionSpecifiers")
        dpurl = f"""pkg:pypi/{dep["name"].lower()}@{dversion}"""
        dextra_deps = _get_extra_deps_from_dist(name_dist_cache.get(dep["name"]))
        ddependencies = _get_deps_from_extras(name_version_cache, name_dist_cache, dextra_deps)
        dependencies.append({
            "name": dep["name"],
            "version": dversion,
            "versionSpecifiers": dversionSpecifiers,
            "purl": dpurl,
            "extra_deps": dextra_deps,
            "dependencies": ddependencies
        })
    return dependencies


def get_installed_with_extras():
    result = {}
    if not REQUIREMENT_MODULE_FOUND:
        return result
    name_version_cache = {}
    name_dist_cache = {}
    for dist in importlib_metadata.distributions():
        name = dist.metadata['Name']
        version = dist.version or ""
        name_version_cache[name] = version
        name_dist_cache[name] = dist
    for dist in importlib_metadata.distributions():
        name = dist.metadata['Name']
        version = dist.version or ""
        # extras this package defines:
        extras = dist.metadata.get_all('Provides-Extra') or []
        # map each extra → its extra-only dependencies
        extra_deps = _get_extra_deps_from_dist(dist)
        purl = f"pkg:pypi/{name.lower()}@{version}"
        dependencies = _get_deps_from_extras(name_version_cache, name_dist_cache, extra_deps)
        result[purl] = {
            'name': name,
            'version': version,
            'extras': extras,
            'purl': purl,
            'extra_deps': extra_deps,
            "dependencies": dependencies
        }
    return result


def find_deps(idx, path, purl, reqs, global_installed, traverse_count):
    freqs = []
    for r in reqs:
        d = idx.get(r.key)
        if not d:
            continue
        r.project_name = d.project_name if d is not None else r.project_name
        if r.key in path:
            print(f"Cycle detected: {' -> '.join(current_path)}")
            continue
        current_path = path + [r.key]
        specs = sorted(r.specs, reverse=True)
        specs_str = ",".join(["".join(sp) for sp in specs]) if specs else ""
        dreqs = d.requires()
        name = r.project_name
        version = importlib_metadata.version(r.key)
        purl = f"pkg:pypi/{name.lower()}@{version}"
        extra_deps = global_installed.get(purl, {}).get("extra_deps", {})
        dependencies = find_deps(idx, current_path, purl, dreqs, global_installed, traverse_count + 1) if dreqs and traverse_count < 200 else []
        all_dependencies = global_installed.get(purl, {}).get("dependencies", [])
        freqs.append(
            {
                "name": name,
                "version": version,
                "versionSpecifiers": specs_str,
                'purl': purl,
                "extra_deps": extra_deps,
                "dependencies": dependencies + all_dependencies,
            }
        )
    return freqs


def main(argv):
    out_file = "piptree.json" if len(argv) < 2 else argv[-1]
    tree = []
    global_installed = get_installed_with_extras()
    pkgs = get_installed_distributions(python_path=None)
    idx = {p.key: p for p in pkgs}
    traverse_count = 0
    for p in pkgs:
        fr = frozen_req_from_dist(p)
        if not fr.startswith('# Editable'):
            tmpA = fr.split("==")
        else:
            fr = p.key
            tmpA = [fr,p.version]
        name = tmpA[0]
        if name.startswith("-e"):
            name = name.split("#egg=")[-1].split(" ")[0].split("&")[0]
        version = "latest"
        if len(tmpA) == 2:
            version = tmpA[1]
        pkgName = name.split(" ")[0]
        purl = f"pkg:pypi/{pkgName.lower()}@{version}"
        extra_deps = global_installed.get(purl, {}).get("extra_deps", "")
        all_dependencies = global_installed.get(purl, {}).get("dependencies", [])
        dependencies = find_deps(idx, [p.key], purl, p.requires(), global_installed, traverse_count + 1)
        tree.append(
            {
                "name": pkgName,
                "version": version,
                "purl": purl,
                "extra_deps": extra_deps,
                "dependencies": dependencies + all_dependencies,
            }
        )
    with open(out_file, mode="w", encoding="utf-8") as fp:
        json.dump(tree, fp)


if __name__ == "__main__":
    main(sys.argv)
