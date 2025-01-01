import csv
import logging
import os
import pathlib
import argparse
from copy import deepcopy

from pathlib import Path

from custom_json_diff.lib.utils import file_write


def build_args():
    """
    Builds the argument parser for the command line interface (CLI).
    """
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--repo-csv',
        type=Path,
        default='cdxgen_src/test/diff/repos.csv',
        help='Path to sources.csv',
        dest='repo_csv'
    )
    parser.add_argument(
        '--clone-dir',
        type=Path,
        default=f'{os.getenv("GITHUB_WORKSPACE")}/src_repos',
        help='Path to src_repos',
        dest='clone_dir'
    )
    parser.add_argument(
        '--output-dir',
        '-o',
        type=Path,
        default=f'{os.getenv("GITHUB_WORKSPACE")}/new_snapshots',
        help='Path to output',
        dest='output_dir',
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
        '--skip-clone',
        action='store_false',
        default=True,
        dest='clone',
        help='Skip cloning the repositories.)'
    )
    parser.add_argument(
        '--debug-cmds',
        action='store_true',
        help='Prints the commands out in the console.'
    )
    parser.add_argument(
        '--build',
        action='store_true',
        default=False,
        help='Build the samples before invoking cdxgen.'
    )
    parser.add_argument(
        '--skip-prebuild',
        action='store_false',
        default=True,
        dest='prebuild',
        help='Build the samples before invoking cdxgen.'
    )
    parser.add_argument(
        '--skip-projects',
        '-s',
        help='Skip these projects',
    )
    parser.add_argument(
        '--sdkman-sh',
        help='Location to activate sdkman.',
        default='~/.sdkman/bin/sdkman-init.sh'
    )
    parser.add_argument(
        '--uv-location'
        '-uv',
        help='Location of uv Python installations.',
        default='~/.local/share/uv/python',
        dest='uv_location'
    )
    return parser.parse_args()


def add_repo_dirs(clone_dir, repo_data):
    """
    Adds a key for the repository directory to the repository data.

    Args:
        clone_dir (pathlib.Path): The directory to store sample repositories.
        repo_data (list[dict]): Contains the sample repository data

    Returns:
        list[dict]: The updated repository data with the 'repo_dir' key
    """
    new_data = []
    for r in repo_data:
        r['repo_dir'] = Path.joinpath(clone_dir, r['project'])
        new_data.append(r)
    return new_data


def check_dirs(clone, clone_dir, output_dir):
    """
    Create directories if they don't exist.

    Args:
        clone (bool): Whether to create the clone directory or not.
        clone_dir (pathlib.Path): The path to the clone directory.
        output_dir (pathlib.Path): The path to the output directory.

    Returns:
        None
    """
    if clone and not Path.exists(clone_dir):
        Path.mkdir(clone_dir)
    if not Path.exists(output_dir):
        Path.mkdir(output_dir)


def checkout_commit(commit):
    """
    Checks out a specific commit in a repository.

    Args:
        commit (str): The commit hash to check out.

    Returns:
        str: The command to check out the commit.
    """
    checkout_cmd = ['git', '-c', 'advice.detachedHead=false', 'checkout', commit]
    return list2cmdline(checkout_cmd)


def clone_repo(url, repo_dir):
    """
    Clones a repository from a given URL to a specified directory.

    Args:
        url (str): The URL of the repository to clone.
        repo_dir (pathlib.Path): The directory to store the cloned repository.

    Returns:
        str: The command to clone the repository.
    """
    if Path.exists(repo_dir):
        logging.info('%s already exists, skipping clone.', repo_dir)
        return ''

    clone_cmd = ['git', 'clone', url, repo_dir]
    return list2cmdline(clone_cmd)


def create_python_venvs(repo, uv_location):
    """
    Sets the Python version for each Python repository

    Args:
        repo (dict): Contains the sample repository data

    Returns:
        cmd (str): The command to create the Python virtual environment and install
    """
    vers = repo["language_range"].split(".")
    py_cmd = f"{uv_location}/cpython-{repo['language_range']}-linux-x86_64-gnu/bin/python{vers[0]}.{vers[1]}"
    if repo["package_manager"] == "poetry":
        return f"poetry env use {py_cmd} && {repo['build_cmd']}"
    else:
        return f"{py_cmd} -m venv .venv;source .venv/bin/activate && {repo['build_cmd']}"


def exec_on_repo(args, repo):
    """
    Determines a sequence of commands on a repository.

    Args:
        args (argparse.Namespace): The parsed arguments
        repo (dict): The repository information.


    Returns:
        str: The sequence of commands to be executed.
    """
    commands = []
    if args.clone:
        commands.append(f'{clone_repo(repo["link"], repo["repo_dir"])}')
        commands.append(f'{list2cmdline(["cd", repo["repo_dir"]])}')
        commands.append(f'{checkout_commit(repo["commit"])}')
    if args.prebuild and repo["pre_build_cmd"]:
        cmds = repo["pre_build_cmd"].split(';')
        cmds = [cmd.lstrip().rstrip() for cmd in cmds]
        for cmd in cmds:
            new_cmd = list(cmd.split(" "))
            commands.append(f"{list2cmdline(new_cmd)}")
    if "python" in repo["language"]:
        commands.append(create_python_venvs(repo, args.uv_location))
    elif args.build and repo["build_cmd"]:
        cmds = repo["build_cmd"].split(";")
        cmds = [cmd.lstrip().rstrip() for cmd in cmds]
        for cmd in cmds:
            new_cmd = list(cmd.split(" "))
            commands.append(f"{list2cmdline(new_cmd)}")
    commands.append(run_cdxgen(repo, args.output_dir))
    commands = "\n".join(commands)
    return commands


def expand_multi_versions(repo_data):
    """
    Creates additional entries for repositories testing multiple versions

    Args:
        repo_data (list[dict]): Contains the sample repository data

    Returns:
        list[dict]: The expanded repository data
    """
    new_data = []
    for r in repo_data:
        if "," in r["language_range"]:
            versions = r["language_range"].split(",")
            for version in versions:
                new_repo = deepcopy(r)
                new_repo["project"] = f"{r['project']}_{version}"
                new_repo["language_range"] = version
                new_data.append(new_repo)
        else:
            new_data.append(r)
    return new_data


def filter_repos(repo_data, projects, project_types, skipped_projects):
    if skipped_projects:
        repo_data = [repo for repo in repo_data if repo["project"] not in skipped_projects]
    elif projects:
        if project_types:
            return [repo for repo in repo_data if repo["project"] in projects or repo["language"] in project_types]
        return [repo for repo in repo_data if repo["project"] in projects]
    if project_types:
        return [repo for repo in repo_data if repo["language"] in project_types]
    return repo_data


def generate(args):
    """
    Generate commands for executing a series of tasks on a repository.

    Args:
        args (argparse.Namespace): The parsed arguments

    Returns:
        None
    """
    if args.output_dir == '.':
        args.output_dir = pathlib.Path.cwd()

    project_types = set()
    if args.project_types:
        if ',' in args.project_types:
            project_types = set(args.project_types.split(','))
        else:
            project_types = {args.project_types}

    repo_data = read_csv(args.repo_csv, args.projects, project_types, args.skip_projects)
    processed_repos = add_repo_dirs(args.clone_dir, repo_data)

    if not args.debug_cmds:
        check_dirs(args.clone, args.clone_dir, args.output_dir)

    if args.prebuild:
        run_pre_builds(repo_data, args.output_dir, args.debug_cmds, args.sdkman_sh)

    commands = ""
    cdxgen_log = args.output_dir.joinpath("generate.log")
    for repo in processed_repos:
        commands += f"\necho {repo['project']} started: $(date) >> {cdxgen_log}\n"
        commands += exec_on_repo(args, repo)
        commands += f"\necho {repo['project']} finished: $(date) >> {cdxgen_log}\n\n"

    commands = "".join(commands)
    sh_path = Path.joinpath(args.output_dir, 'cdxgen_commands.sh')
    write_script_file(sh_path, commands, args.debug_cmds, args.sdkman_sh)


def list2cmdline(seq):
    """
    Taken from the subprocess module in the Python Standard Library.

    Translate a sequence of arguments into a command line
    string, using the same rules as the MS C runtime:

    1) Arguments are delimited by white space, which is either a
       space or a tab.

    2) A string surrounded by double quotation marks is
       interpreted as a single argument, regardless of white space
       contained within.  A quoted string can be embedded in an
       argument.

    3) A double quotation mark preceded by a backslash is
       interpreted as a literal double quotation mark.

    4) Backslashes are interpreted literally, unless they
       immediately precede a double quotation mark.

    5) If backslashes immediately precede a double quotation mark,
       every pair of backslashes is interpreted as a literal
       backslash.  If the number of backslashes is odd, the last
       backslash escapes the next double quotation mark as
       described in rule 3.
    """

    # See
    # http://msdn.microsoft.com/en-us/library/17w5ykft.aspx
    # or search http://msdn.microsoft.com for
    # "Parsing C++ Command-Line Arguments"
    result = []
    for arg in map(os.fsdecode, seq):
        bs_buf = []

        # Add a space to separate this argument from the others
        if result:
            result.append(' ')

        needquote = (" " in arg) or ("\t" in arg) or not arg
        if needquote:
            result.append('"')

        for c in arg:
            if c == '\\':
                # Don't know if we need to double yet.
                bs_buf.append(c)
            elif c == '"':
                # Double backslashes.
                result.append('\\' * len(bs_buf)*2)
                bs_buf = []
                result.append('\\"')
            else:
                # Normal char
                if bs_buf:
                    result.extend(bs_buf)
                    bs_buf = []
                result.append(c)

        # Add remaining backslashes, if any.
        if bs_buf:
            result.extend(bs_buf)

        if needquote:
            result.extend(bs_buf)
            result.append('"')

    return ''.join(result)


def process_repo_data(repo_data, clone_dir):
    """
    Process the repo data, adding the 'repo_dir' key and filtering as required.

    Args:
        repo_data (list[dict]): Repository data
        clone_dir (pathlib.Path): Destination for cloned repo.

    Returns:
        list[dict]: The processed repository data
    """
    new_data = []
    for r in repo_data:
        r['repo_dir'] = Path.joinpath(clone_dir, r['language'], r['project'])
        new_data.append(r)
    return new_data


def read_csv(csv_file, projects, project_types, skipped_projects):
    """
    Reads a CSV file and filters the data based on a list of languages.

    Parameters:
        csv_file (pathlib.Path| str): The path to the CSV file.
        projects (list): A list of projects names to filter on.
        project_types (set): A set of project types to filter on.
    Returns:
        list: A filtered list of repository data.
    """
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        repo_data = list(reader)
    return expand_multi_versions(filter_repos(repo_data, projects, project_types, skipped_projects))


def run_cdxgen(repo, output_dir):
    """
    Generates cdxgen commands.

    Args:
        repo (dict): Repository data
        output_dir (pathlib.Path): Directory path for bom export

    Returns:
        str: The repository data with cdxgen commands
    """
    if repo["language"] == "python-c":
        cdxgen_cmd = [
            "cdxgen",
            "--no-include-formulation",
            "-t",
            "python",
            "-t",
            "c",
            "-o",
            Path.joinpath(output_dir, f"{repo['project']}-bom.json"),
            repo["repo_dir"]
        ]
    else:
        cdxgen_cmd = [
            "cdxgen",
            "--no-include-formulation",
            "-t",
            repo['language'],
            "-o",
            Path.joinpath(output_dir, f"{repo['project']}-bom.json"),
            repo["repo_dir"]
        ]
    cmd = f"CDXGEN_DEBUG_MODE=debug {list2cmdline(cdxgen_cmd)}"
    if repo["cdxgen_vars"]:
        cmd = f"{repo['cdxgen_vars']} {cmd}"
    if "python" in repo["language"]:
        if repo["package_manager"] == "poetry":
            cmd = f"VIRTUAL_ENV=$(poetry env list --full-path | grep -E -o '(/\S+)+/pypoetry/virtualenvs/\S+') {cmd}"
        else:
            cmd = f"VIRTUAL_ENV={repo['repo_dir']}/.venv {cmd}"
    return cmd


def run_pre_builds(repo_data, output_dir, debug_cmds, sdkman_sh):
    """
    Generates a list of commands to be executed before the build process.

    Args:
        repo_data (list[dict]): Contains the sample repository data
        output_dir (pathlib.Path): Root directory for slices export
        debug_cmds (bool): Flag indicating whether to include debug output

    Returns:
        None
    """
    cmds = []
    [
        cmds.extend(row['pre_build_cmd'].split(';'))
        for row in repo_data
        if row['pre_build_cmd'] and row['pre_build_cmd'].startswith('sdk use ')
    ]
    cmds = [cmd.lstrip().rstrip() for cmd in cmds]
    cmds = set(cmds)

    commands = [c.replace('use', 'install') for c in cmds]
    commands.append('sdk install java 23-tem')
    commands = '\n'.join(commands)
    sh_path = Path.joinpath(output_dir, 'sdkman_installs.sh')
    write_script_file(sh_path, commands, debug_cmds, sdkman_sh)


def write_script_file(file_path, commands, debug_cmds, sdkman_path):
    """
    Write a script to execute a series of commands in a file.

    Args:
        file_path (pathlib.Path): The path to write the file to
        commands (str): The commands to be written to the file
        debug_cmds (bool): Flag indicating whether to include debug output

    Returns:
        None
    """
    cmds = f'#!/usr/bin/bash\nsource {sdkman_path}\nexport PATH=$PATH:/usr/local/go/bin\n\n{commands}'
    file_write(str(file_path), cmds, success_msg=f"Wrote script to {file_path}.")
    if debug_cmds:
        print(commands)


def main():
    """
    Runs the main function of the program.
    """
    args = build_args()
    generate(args)


if __name__ == '__main__':
    main()
