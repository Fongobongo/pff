# Conversation Log (EN)

This file tracks key decisions and requirements from our chats.

## 2026-01-31

- Created a new `pff` project directory and initialized a git repository.
- Added basic repo files: `README.md`, `.gitignore`, and an initial commit.
- Connected GitHub remote and pushed branch `main` to: https://github.com/Fongobongo/pff
- Project definition: a React/Next.js fan site for the game **pro.football.fun**.
- Requirements:
  - Blockchain: **Base** (Ethereum L2). We need to analyze a player's portfolio history by wallet address.
  - Player stats: must be pulled from the internet; includes **all data points used by the game to calculate points**.
  - Scope: “everything” (full solution, not just frontend).
- Policies:
  - Keep chat history and a project changelog in separate files, **English only**, committed to git.
  - The entire project must be in **English**, including code and comments.
  - Dev runs on a VPS (Debian 12) and production deploy is Vercel (or Netlify).
  - All resources must be free-tier (hosting, DB, APIs). Prefer Supabase for the database.
