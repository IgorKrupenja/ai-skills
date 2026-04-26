# agent-skills

A collection of AI agent skills for automating personal workflows. Uses the common [Agent Skills](https://agentskills.io/home) format supported by different agentic AI tools: Claude Code, Cursor, Gemini CLI, Codex, OpenClaw and so on.

## Setup

1. Clone this repo into a folder your agentic AI tool uses for skills.
2. Run `cp .env.example .env` and fill in your values in the `.env` file.

## Skills

### lhv-investment-report

Automate the annual LHV investment account tax report (Investeerimiskonto aruanne) and submit to MTA.

| Variable                 | Description                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| `LHV_USERNAME`           | LHV internet bank username                                                      |
| `LHV_ISIKUKOOD`          | Estonian personal ID number (isikukood)                                         |
| `LHV_ACCOUNT_INVESTMENT` | LHV investment account IBAN                                                     |
| `LHV_ACCOUNT_EXTERNAL`   | External account IBAN that is used to make transfers from/to investment account |

### linkedin-connect

Send LinkedIn connection requests (without a note) to people in search results, page by page, until the weekly limit is reached.

| Variable               | Description                                |
| ---------------------- | ------------------------------------------ |
| `LINKEDIN_CONNECT_URL` | LinkedIn people search URL to iterate over |

### linkedin-grow

Send LinkedIn connection requests (without a note) to matching people in the "People you may know" section on the grow page, filtered by job title keywords.

| Variable                 | Description                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `LINKEDIN_GROW_KEYWORDS` | Comma-separated job title keywords to match (case-insensitive)                                |
| `LINKEDIN_GROW_LOCATION` | Location name for the "People you may know in ..." section (e.g. `Tallinn Metropolitan Area`) |

## Security disclaimer

All secrets should be in env variables. Please check skills content and run them at your own risk.
