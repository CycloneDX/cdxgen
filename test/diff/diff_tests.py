import argparse
import csv
import json
import os

from custom_json_diff.custom_diff import compare_dicts, perform_bom_diff, report_results
from custom_json_diff.custom_diff_classes import Options


def build_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--directories',
        '-d',
        default=['/home/runner/work/original_snapshots','/home/runner/work/new_snapshots'],
        help='Directories containing the snapshots to compare',
        nargs=2
    )
    return parser.parse_args()


def compare_snapshot(dir1, dir2, options, repo):
    bom_1 = f"{dir1}/{repo["project"]}-bom.json"
    bom_2 = f"{dir2}/{repo["project"]}-bom.json"
    options.file_1 = bom_1
    options.file_2 = bom_2
    options.output = f'{dir2}/{repo["project"]}-diff.json'
    if not os.path.exists(bom_1):
        print(f'{bom_1} not found.')
        return f'{bom_1} not found.', f'{bom_1} not found.'
    result, j1, j2 = compare_dicts(options)
    if result != 0:
        result_summary = perform_bom_diff(j1, j2)
        report_results(result, result_summary, options, j1, j2)
        return f"{repo['project']} failed.", result_summary
    return None, None


def perform_snapshot_tests(dir1, dir2):
    repo_data = read_csv()

    options = Options(
        allow_new_versions=True,
        allow_new_data=True,
        bom_diff=True,
        include=["properties", "evidence", "licenses"],
    )

    failed_diffs = {}
    for repo in repo_data:
        result, summary = compare_snapshot(dir1, dir2, options, repo)
        if result:
            print(result)
            failed_diffs[repo["project"]] = summary

    if failed_diffs:
        diff_file = os.path.join(dir2, 'diffs.json')
        with open(diff_file, 'w') as f:
            json.dump(failed_diffs, f)
        print(f"Results of failed diffs saved to {diff_file}")
    else:
        print("Snapshot tests passed!")


def read_csv():
    csv_file = os.path.join(os.path.dirname(os.path.realpath(__file__)), "repos.csv")
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        repo_data = list(reader)
    return repo_data


if __name__ == '__main__':
    args = build_args()
    perform_snapshot_tests(args.directories[0], args.directories[1])
