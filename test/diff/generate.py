import csv
import logging
import pathlib
import subprocess
import argparse

from pathlib import Path


def build_args():
    """
    Builds the argument parser for the command line interface (CLI).
    """
    parser = argparse.ArgumentParser()
    parser.set_defaults(slice_types=['usages', 'reachables'])
    parser.add_argument(
        '--repo-csv',
        type=Path,
        default='test/diff/repos.csv',
        help='Path to sources repo csv',
        dest='repo_csv'
    )
    parser.add_argument(
        '--clone-dir',
        type=Path,
        default=Path('/home/runner/work/src_repos'),
        help='Path to src_repos',
        dest='clone_dir'
    )
    parser.add_argument(
        '-o',
        '--output-dir',
        type=Path,
        default='/home/runner/work/cdxgen-samples',
        help='Path to output',
        dest='output_dir',
    )
    parser.add_argument(
        '-p',
        '--projects',
        help='Filter to these sample projects',
        dest='projects',
        nargs='*'
    )
    parser.add_argument(
        '--skip-clone',
        action='store_false',
        dest='skip_clone',
        default=True,
        help='Skip cloning the repositories (must be used with the --repo-dir argument)'
    )
    parser.add_argument(
        '--debug-cmds',
        action='store_true',
        dest='debug_cmds',
        help='For use in workflow'
    )
    parser.add_argument(
        '--skip-build',
        action='store_true',
        dest='skip_build',
        default=False,
        help='Skip building the samples and just run cdxgen. Should be used with --skip-clone'
    )
    return parser.parse_args()


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
    if not args.debug_cmds:
        check_dirs(args.skip_clone, args.clone_dir, args.output_dir)

    repo_data = read_csv(args.repo_csv, args.projects, args.clone_dir)
    processed_repos = process_repo_data(repo_data, args.clone_dir)

    if not args.skip_build:
        run_pre_builds(repo_data, args.output_dir, args.debug_cmds)

    commands = ''.join(
        exec_on_repo(args.skip_clone, args.output_dir, args.skip_build, repo)
        for repo in processed_repos
    )
    sh_path = Path.joinpath(args.output_dir, 'cdxgen_commands.sh')
    write_script_file(sh_path, commands, args.debug_cmds)


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


def exec_on_repo(clone, output_dir, skip_build, repo):
    """
    Determines a sequence of commands on a repository.

    Args:
        clone (bool): Indicates whether to clone the repository.
        output_dir (pathlib.Path): The directory to output the slices.
        skip_build (bool): Indicates whether to skip the build phase.
        slice_types (list): The types of slices to be generated.
        repo (dict): The repository information.


    Returns:
        str: The sequence of commands to be executed.
    """
    repo_dir = repo['repo_dir']
    commands = ''

    if clone:
        commands += f'\n{clone_repo(repo["link"], repo["repo_dir"])}'
        commands += f'\n{subprocess.list2cmdline(["cd", repo["repo_dir"]])}'
        commands += f'\n{checkout_commit(repo["commit"])}'
    if not skip_build and len(repo['pre_build_cmd']) > 0:
        cmds = repo['pre_build_cmd'].split(';')
        cmds = [cmd.lstrip().rstrip() for cmd in cmds]
        for cmd in cmds:
            new_cmd = list(cmd.split(' '))
            commands += f"\n{subprocess.list2cmdline(new_cmd)}"
    if not skip_build and len(repo['build_cmd']) > 0:
        cmds = repo['build_cmd'].split(';')
        cmds = [cmd.lstrip().rstrip() for cmd in cmds]
        for cmd in cmds:
            new_cmd = list(cmd.split(' '))
            commands += f"\n{subprocess.list2cmdline(new_cmd)}"
    commands += f'\n{run_cdxgen(repo, output_dir)}'
    commands += '\n\n'
    return commands


def read_csv(csv_file, projects, clone_dir):
    """
    Reads a CSV file and filters the data based on a list of languages.

    Parameters:
        csv_file (pathlib.Path): The path to the CSV file.
        projects (list): A list of projects names to filter on.
        clone_dir (pathlib.Path): The directory storing the cloned repositories.

    Returns:
        list: A filtered list of repository data.
    """
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        repo_data = list(reader)
    if projects:
        repo_data = [repo for repo in repo_data if repo['project'] in projects]
    return add_repo_dirs(clone_dir, repo_data)


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
    return subprocess.list2cmdline(clone_cmd)


def checkout_commit(commit):
    """
    Checks out a specific commit in a repository.

    Args:
        commit (str): The commit hash to check out.

    Returns:
        str: The command to check out the commit.
    """
    checkout_cmd = ['git', 'checkout', commit]
    return subprocess.list2cmdline(checkout_cmd)


def run_pre_builds(repo_data, output_dir, debug_cmds):
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
        if row['pre_build_cmd']
    ]
    cmds = [cmd.lstrip().rstrip() for cmd in cmds]
    cmds = set(cmds)

    commands = [c.replace('use', 'install') for c in cmds]
    commands.append('sdk install java 21.0.1-zulu')
    commands = '\n'.join(commands)
    sh_path = Path.joinpath(output_dir, 'sdkman_installs.sh')
    write_script_file(sh_path, commands, debug_cmds)


def write_script_file(file_path, commands, debug_cmds):
    """
    Write a script to execute a series of commands in a file.

    Args:
        file_path (pathlib.Path): The path to write the file to
        commands (str): The commands to be written to the file
        debug_cmds (bool): Flag indicating whether to include debug output

    Returns:
        None
    """
    with open(file_path, 'w', encoding='utf-8') as f:
        sdkman_path = Path.joinpath(Path('$SDKMAN_DIR'), 'bin', 'sdkman-init.sh')
        f.write(f'#!/usr/bin/bash\nsource {sdkman_path}\n\n')
        f.write(commands)
    if debug_cmds:
        print(commands)


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


def run_cdxgen(repo, output_dir):
    """
    Generates cdxgen commands.

    Args:
        repos (list[dict]): Repository data

    Returns:
        str: The repository data with cdxgen commands
    """
    cdxgen_cmd = [
        'cdxgen',
        '-t',
        repo['language'],
        '-o',
        Path.joinpath(output_dir, f'{repo["project"]}-bom.json'),
        repo['repo_dir']
    ]
    return subprocess.list2cmdline(cdxgen_cmd)


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


def main():
    """
    Runs the main function of the program.
    """
    args = build_args()
    generate(args)


if __name__ == '__main__':
    main()
