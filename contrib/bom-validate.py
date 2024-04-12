import argparse
import json
import os
import sys
from jsonschema import validate
from jsonschema.exceptions import ValidationError


def build_args():
    """
    Constructs command line arguments for the comparison tool
    """
    parser = argparse.ArgumentParser(
        description="Validate SBOM files against BOM 1.5 schema."
    )
    parser.add_argument(
        "--json",
        dest="bom_json",
        default="bom.json",
        help="bom json file.",
    )
    return parser.parse_args()


def vsbom(bom_json):
    schema = os.path.join(os.path.dirname(__file__), "bom-1.5.schema.json")
    with open(schema, mode="r", encoding="utf-8") as sp:
        with open(bom_json, mode="r", encoding="utf-8") as vp:
            vex_obj = json.load(vp)
            try:
                validate(instance=vex_obj, schema=json.load(sp))
                print("SBOM file is valid")
            except ValidationError as ve:
                print(ve)
                sys.exit(1)


def main():
    args = build_args()
    vsbom(args.bom_json)


if __name__ == "__main__":
    main()
