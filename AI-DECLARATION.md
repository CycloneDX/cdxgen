---
version: "0.1.2"
level: auto
components:
  lib/inventory/ciParsers: pair
  lib/inventory/table.js: pair
---

This format is based on [AI-DECLARATION.md](https://ai-declaration.md/en/0.1.2).

## Notes

- Before July 2025, most of cdxgen was written by maintainers and contributors. Pull requests made with AI assistance started in July 2025 (labelled `AI-assisted`, now `ai-assist`). The `ai-pair` and `ai-auto` labels and GitHub Copilot's coding agent followed in April 2026, and since then AI agents have made most changes.
- A maintainer sets each task. Most work is written by one AI model and reviewed by a different one, and merges automatically once the required checks pass. Maintainers scrutinise and review high-risk changes and security fixes themselves.
- Across the cdxgen organization, the models and tools used include Claude (Claude Code), GLM and DeepSeek (through opencode), Gemini, GPT and Codex, Qwen, and GitHub Copilot, along with other models from time to time.
- Each pull request carries an `ai-*` label for the level of that change, as described in the organization's [CONTRIBUTING.md](https://github.com/cdxgen/.github/blob/main/CONTRIBUTING.md). Contributions from other people disclose their own AI use in the pull request.

## Checking provenance with git-ai

Since July 2026, many commits in this repository carry AI attribution recorded by [git-ai](https://usegitai.com) as git notes under `refs/notes/ai`. A note lists the line ranges each agent session wrote in each changed file, with the agent, the model and the person who ran it. Prompts are not stored.

To read the notes with plain git:

```sh
git fetch origin refs/notes/ai:refs/notes/ai
git log --notes=ai -5
```

With git-ai installed:

```sh
git-ai fetch-notes                    # fetch the notes
git-ai blame <file>                   # git blame that names the agent for AI-written lines
git-ai blame --json -L 10,20 <file>   # agent, model and session for a range of lines
git-ai stats <commit> --json          # AI and human line counts, by tool and model
git-ai diff <commit>                  # the commit's diff with AI-written lines marked
git-ai log                            # git log with AI stats for each commit
git-ai show <commit>                  # the raw note for a commit
```

Not every commit has a note, for example commits from before git-ai was adopted or made outside a tracked agent session. For those, `git-ai blame` shows the git author and `git-ai stats` reports the lines as untracked. A missing note means no attribution was recorded, not that a person wrote the code.
