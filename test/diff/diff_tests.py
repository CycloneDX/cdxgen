import csv
import json
import os

from custom_json_diff.custom_diff import compare_dicts, perform_bom_diff, report_results
from custom_json_diff.custom_diff_classes import Options


with open('/home/runner/work/cdxgen/cdxgen/test/diff/repos.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    repo_data = list(reader)

failed_diffs = {}

for i in repo_data:
    bom_file = f'{i["project"]}-bom.json'
    bom_1 = f"/home/runner/work/samples/{bom_file}"
    bom_2 = f"/home/runner/work/cdxgen-samples/{bom_file}"
    exclude = []
    include = ["properties", "evidence", "licenses"]
    options = Options(
        allow_new_versions=True,
        allow_new_data=True,
        bom_diff=True,
        include=include,
        exclude=exclude,
        file_1=bom_1,
        file_2=bom_2,
        output=f'/home/runner/work/cdxgen-samples/{i["project"]}-diff.json'
    )
    if not os.path.exists(bom_1):
        print(f'{bom_file} does not exist in cdxgen-samples repository.')
        failed_diffs[i["project"]] = f'{bom_file} does not exist in cdxgen-samples repository.'
        continue
    result, j1, j2 = compare_dicts(options)

    if result != 0:
        print(f"{i['project']} failed.")
        result_summary = perform_bom_diff(j1, j2)
        failed_diffs[i["project"]] = result_summary
        report_results(result, result_summary, options, j1, j2)

if failed_diffs:
    with open('/home/runner/work/cdxgen-samples/diffs.json', 'w') as f:
        json.dump(failed_diffs, f)