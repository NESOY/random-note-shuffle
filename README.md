# Random Note Shuffle

Open a random note from your Obsidian vault with optional weighted spaced repetition.

## Features

- **Random** — Pick a completely random note
- **Weighted Random (Spaced Repetition)** — Notes with older frontmatter dates are more likely to appear, helping you revisit forgotten notes
- **Exclude Folders** — Skip specific folders (e.g. Templates, Archive)
- **Configurable Weight** — Adjust intensity from 1 (nearly equal) to 100 (strongly favor older notes)
- **Update Date on Open** — Write the current time to the weight property when a note is opened, so recently reviewed notes come up less often

## Usage

- Click the dice icon in the left ribbon, or
- Open Command Palette (`Cmd+P`) → **Open random note**

## Settings

| Setting | Description |
|---------|-------------|
| Selection mode | Random or Weighted random |
| Weight property | Frontmatter date property to calculate weight (e.g. `updated`, `created`) |
| Weight intensity | 1–100, how strongly to favor older notes |
| Update date on open | Set the weight property to now when a note is opened (weighted mode) |
| Date format | Moment.js format for the written date (default `YYYY-MM-DD HH:mm`) |
| Exclude folder | Folders to exclude from selection |

## Installation

Copy `main.js`, `styles.css`, `manifest.json` to your vault's `.obsidian/plugins/random-note-shuffle/` folder.
