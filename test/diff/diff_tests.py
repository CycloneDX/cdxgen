from custom_json_diff.custom_json_diff import compare_dicts


def test_java_bom():
    assert compare_dicts('test/diff/java-sec-code-bom.json', '/home/runner/work/cdxgen-samples/java-sec-code-bom.json', False,
                         {"serialNumber", "metadata.timestamp"}, False) == "JSON files are equal"


def test_python_bom():
    assert compare_dicts('test/diff/django-goat-bom.json', '/home/runner/work/cdxgen-samples/django-goat-bom.json', False,
                         {"serialNumber", "metadata.timestamp"}, False) == "JSON files are equal"


def test_javascript_bom():
    assert compare_dicts('test/diff/node-goat-bom.json', '/home/runner/work/cdxgen-samples/node-goat-bom.json', False,
                         {"serialNumber", "metadata.timestamp"}, False) == "JSON files are equal"