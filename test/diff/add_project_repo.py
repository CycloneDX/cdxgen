import pandas as pd

default_build_cmds = {
    "python": "python -m venv venv; source venv/bin/activate",
    # Add more languages and their default build commands
}

default_pre_build_cmds = {
    "python": None,
    "java": "skd use java8.0.392-zulu"
    # Add more languages and their default pre build commands
}

class Project:
    def __init__(self):
        self.name = None
        self.git_link = None
        self.language = None
        self.pre_build_cmd = None
        self.build_cmd = None
        self.git_commit_hash = None

    def get_name(self):
        if self.name is None:
            self.name = input("Name of Project: ")

    def get_git_link(self):
        if self.git_link is None:
            self.git_link = input("Git link for Project: ")

    def get_language(self):
        if self.language is None:
            self.language = input("Programming Language for Project: ")

            # Assign build command if available in default_build_cmds
            if self.language in default_build_cmds:
                self.build_cmd = default_build_cmds[self.language]
                print(f"Using default build comman1d for {self.language}: {self.build_cmd}")
            
            if self.language in default_pre_build_cmds:
                self.pre_build_cmd = default_pre_build_cmds[self.language]
                print(f"Using default build comman1d for {self.language}: {self.build_cmd}")

    def get_pre_build_cmd(self):
        if self.pre_build_cmd:
            ans = input(f"default pre build command for {self.language} is {self.pre_build_cmd}, continue y|n")
            if ans=='n':
                self.pre_build_cmd=None
            if ans!='y' and ans!='n':
                print("only y or n accepted, changing default")
                self.pre_build_cmd=None
                
        if self.pre_build_cmd is None:
            self.pre_build_cmd = input("Enter command required before building the Project: ")

    def get_build_cmd(self):
        if self.pre_build_cmd:
            ans = input(f"default build command for {self.language} is {self.build_cmd}, continue y|n")
            if ans=='n':
                self.pre_build_cmd=None
            if ans!='y' and ans!='n':
                print("only y or n accepted, changing default")
                self.pre_build_cmd=None
        if self.build_cmd is None:
            self.build_cmd = input("Enter the command required to build the Project: ")

    def get_git_commit_hash(self):
        if self.git_commit_hash is None:
            self.git_commit_hash = input("Enter the hash of the commit used for reference: ")
    
    def return_list(self):
        return [self.name, self.git_link, self.language, self.pre_build_cmd, self.build_cmd, self.git_commit_hash]


def add_row_csv(csv_file, new_row):
    df = pd.read_csv(csv_file)
    new_row_series = pd.Series(new_row, index=df.columns)
    df = df.append(new_row_series, ignore_index=True)
    df.to_csv(csv_file, index=False)


# Function to take user inputs for new repositories
def new_repo_data():
    project = Project()
    project.get_name()
    project.get_git_link()
    project.get_language()  # This will also handle build_cmd assignment if possible
    project.get_pre_build_cmd()
    project.get_build_cmd()  # this gives a default prompt for language for faster input
    project.get_git_commit_hash()
    return project.return_list()

repos_csv_file = "repos.csv"