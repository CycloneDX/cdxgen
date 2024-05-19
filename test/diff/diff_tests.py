import csv
import json
import os
from pathlib import Path

from custom_json_diff.custom_diff import compare_dicts, get_diffs

with open('/home/runner/work/cdxgen/cdxgen/test/diff/repos.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    repo_data = list(reader)

Failed = False
failed_diffs = {}

for i in repo_data:
    bom_file = f'{i["project"]}-bom.json'
    bom_1 = Path("/home/runner/work/samples", bom_file)
    bom_2 = Path("/home/runner/work/cdxgen-samples", bom_file)
    if not os.path.exists(bom_1):
        print(f'{bom_file} does not exist in cdxgen-samples repository.')
        failed_diffs[i["project"]] = f'{bom_file} does not exist in cdxgen-samples repository.'
        continue
    result, j1, j2 = compare_dicts(bom_1, bom_2, preset="cdxgen")
    if result == 0:
        print(f'{i["project"]} BOM passed.')
    else:
        print(f'{i["project"]} BOM failed.')
        Failed = True
        diffs = get_diffs(bom_1, bom_2, j1, j2)
        failed_diffs[i["project"]] = diffs

if failed_diffs:
    with open('/home/runner/work/cdxgen-samples/diffs.json', 'w') as f:
        json.dump(failed_diffs, f, indent=2)