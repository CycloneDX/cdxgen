import argparse
import csv
import logging
import os
from typing import Dict, List, Set

from custom_json_diff.lib.custom_diff import compare_dicts, perform_bom_diff, report_results
from custom_json_diff.lib.custom_diff_classes import Options
from custom_json_diff.lib.utils import json_dump,json_load

from generate import filter_repos

logging.disable(logging.INFO)


def build_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--directories',
        '-d',
        default=[f'/{os.getenv("GITHUB_WORKSPACE")}/original_snapshots', f'/{os.getenv("GITHUB_WORKSPACE")}/new_snapshots'],
        help='Directories containing the snapshots to compare',
        nargs=2
    )
    parser.add_argument(
        "--migrate-legacy",
        "-m",
        action="store_true",
        help="Migrate legacy snapshots to 1.6 format"
    )
    parser.add_argument(
        '--projects',
        '-p',
        help='Filter to these projects.',
        dest='projects',
    )
    parser.add_argument(
        '--types',
        '-t',
        help='Filter to these project types.',
        dest='project_types',
    )
    parser.add_argument(
        '--skip-projects',
        '-s',
        help='Skip these projects'
    )
    return parser.parse_args()


def compare_snapshot(dir1: str, dir2: str, options: Options, repo: Dict, migrate_legacy: bool):
    bom_1 = f"{dir1}/{repo['project']}-bom.json"
    bom_2 = f"{dir2}/{repo['project']}-bom.json"
    if migrate_legacy:
        bom_data = migrate_to_1_6(bom_1)
        bom_1 = bom_1.replace("bom.json", "bom.migrated.json")
        json_dump(bom_1, bom_data)
        bom_data = migrate_to_1_6(bom_1)
        bom_2 = bom_2.replace("bom.json", "bom.migrated.json")
        json_dump(bom_2, bom_data)
    options.file_1 = bom_1
    options.file_2 = bom_2
    options.output = f'{dir2}/{repo["project"]}-diff.json'
    if not (b1 := os.path.exists(bom_1)) or not os.path.exists(bom_2):
        return 1, "" if b1 else f"{bom_1} not found.", "" if os.path.exists(bom_2) else f"{bom_2} not found."
    status, j1, j2 = compare_dicts(options)
    if status:
        status, result_summary = perform_bom_diff(j1, j2)
        report_results(status, result_summary, options, j1, j2)
        return status, f"{repo['project']} failed.", result_summary
    return status, f"{repo['project']} succeeded.", {}


def perform_snapshot_tests(dir1: str, dir2: str, projects: List, project_types: Set, migrate_legacy: bool, skipped_projects):
    repo_data = read_csv(projects, project_types, skipped_projects)
    options = Options(
        allow_new_versions=True,
        allow_new_data=True,
        preconfig_type="bom",
        include=["properties", "evidence", "licenses"],
        exclude=["annotations"]
    )

    failed_diffs = {}
    for repo in repo_data:
        status, result, summary = compare_snapshot(dir1, dir2, options, repo, migrate_legacy)
        print(result)
        if status:
            failed_diffs[repo["project"]] = summary
    if failed_diffs:
        diff_file = os.path.join(dir2, 'diffs.json')
        print("Snapshot tests failed.")
        json_dump(diff_file, failed_diffs, success_msg=f"Results of failed diffs saved to {diff_file}")
    else:
        print("Snapshot tests passed!")


def migrate_to_1_6(bom_file):
    """Changes the format of certain fields from 1.5 to 1.6"""
    bom_data = json_load(bom_file)
    if bom_data["specVersion"] == "1.6":
        return bom_data
    for i, v in enumerate(bom_data.get("components", [])):
        if (identity := v.get("evidence", {}).get("identity")):
            bom_data["components"][i]["evidence"]["identity"] = [identity]
    metadata_components = []
    for comp in bom_data["metadata"]["tools"]["components"]:
        if comp.get("author") and comp["author"] == "OWASP Foundation":
            del comp["author"]
            comp["authors"] = [{"name": "OWASP Foundation"}]
        metadata_components.append(comp)
    bom_data["metadata"]["tools"]["components"] = metadata_components
    bom_data["specVersion"] = "1.6"
    return bom_data


def read_csv(projects, project_types, skipped_projects):
    csv_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "repos.csv")
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        repo_data = list(reader)
    return filter_repos(repo_data, projects, project_types, skipped_projects)


if __name__ == '__main__':
    args = build_args()
    if args.project_types:
        if ',' in args.project_types:
            project_types = set(args.project_types.split(','))
        else:
            project_types = {args.project_types}
    else:
        project_types = set()
    perform_snapshot_tests(args.directories[0], args.directories[1], args.projects, project_types, args.migrate_legacy, args.skip_projects)
