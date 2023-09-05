# pip install natsort
from configparser import RawConfigParser
import json
import re
from pathlib import Path
from natsort import natsorted

with open("releases.json") as rfp:
    releases_data = json.load(rfp)
    wrap_data = {}
    wrap_files = Path(".").glob(r"**/*.wrap")
    wrap_files = natsorted(wrap_files, key=str)
    for awrap in wrap_files:
        name = awrap.name.replace(".wrap", "")
        config = RawConfigParser()
        config.read(awrap)
        metadata = config["wrap-file"]
        provides = []
        if "provide" in config.sections():
            provides = natsorted([k for k in config["provide"]], key=str)
        wrap_data[name] = {
            "name_with_version": metadata.get("directory", ""),
            "analyzed_version": re.sub(
                r"^" + name + "-", "", metadata.get("directory", "")
            ),
            "analyzed_source_url": metadata.get("source_url", ""),
            "analyzed_source_filename": metadata.get("source_filename", ""),
            "analyzed_source_hash": metadata.get("source_hash", ""),
            "PkgProvides": provides,
            "available_versions": releases_data.get(name, {}).get("versions"),
        }

    with open("wrapdb-releases.json", mode="w") as fp:
        json.dump(wrap_data, fp)
