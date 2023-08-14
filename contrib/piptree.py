from typing import List
import importlib.metadata as importlib_metadata
import json
import sys

from pip._internal.metadata import pkg_resources
from pip._internal.operations.freeze import FrozenRequirement

def frozen_req_from_dist(dist):
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


def get_installed_distributions() -> List[pkg_resources.Distribution]:
    """
    Get a list of installed distributions.
    Returns:
        A list of installed distributions.
    """
    dists = pkg_resources.Environment.from_paths(None).iter_installed_distributions(
        local_only=False,
        skip=(),
        user_only=False,
    )
    return [d._dist for d in dists]


def find_deps(idx, visited, reqs, traverse_count):
    freqs = []
    for r in reqs:
        d = idx.get(r.key)
        if not d:
            continue
        r.project_name = d.project_name if d is not None else r.project_name
        if len(visited) > 100 or visited.get(r.project_name, 0) > 5:
            return freqs
        specs = sorted(r.specs, reverse=True)
        specs_str = ",".join(["".join(sp) for sp in specs]) if specs else ""
        dreqs = d.requires()
        freqs.append(
            {
                "name": r.project_name,
                "version": importlib_metadata.version(r.key),
                "versionSpecifiers": specs_str,
                "dependencies": find_deps(idx, visited, dreqs, traverse_count + 1) if dreqs and traverse_count < 200 else [],
            }
        )
        visited[r.project_name] = visited.get(r.project_name, 0) + 1
    return freqs


def main(argv):
    out_file = "piptree.json" if len(argv) < 2 else argv[-1]
    tree = []
    pkgs = get_installed_distributions()
    idx = {p.key: p for p in pkgs}
    visited = {}
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
        elif len(tmpA) == 1:
            if p.version:
                version = p.version
        tree.append(
            {
                "name": name.split(" ")[0],
                "version": version,
                "dependencies": find_deps(idx, visited, p.requires(), traverse_count + 1),
            }
        )
    all_deps = {}
    for t in tree:
        for d in t["dependencies"]:
            all_deps[d["name"]] = True
    trimmed_tree = [
        t for t in tree if t["name"] not in all_deps
    ]
    with open(out_file, mode="w", encoding="utf-8") as fp:
        json.dump(trimmed_tree, fp)


if __name__ == "__main__":
    main(sys.argv)
