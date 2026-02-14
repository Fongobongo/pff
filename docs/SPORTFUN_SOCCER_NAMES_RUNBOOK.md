# Sport.fun Soccer Names Runbook

This runbook documents the repeatable process for rebuilding soccer player name mappings in:

- `src/lib/sportfunNameOverrides.json`

It is intended for cases where token IDs are visible but names need to be restored/updated.

## Source of Truth

Use Sport.fun's auth-gated football API:

- `GET https://app.sport.fun/api/football/v1/players/?isTradeable=eq:true&isRetired=eq:false&limit=500`

This returns rows with:

- `oPlayerId` (matches token ID)
- `knownName`, `firstName`, `lastName`

## Why This Source

- On-chain ERC-1155 metadata is not sufficient/reliable for complete soccer naming.
- This endpoint returns the full currently tradeable, non-retired set in one call (`limit=500`).

## Prerequisites

1. Node.js 18+ (for `fetch`).
2. A disposable mailbox provider that can be polled by API (example used: `mail.tm`).
3. No credentials should be committed to the repository.

## Authentication Flow (Privy Passwordless)

1. Read Privy app ID from global config:
   - `GET https://app.sport.fun/api/global/v1/config`
   - use `privy.PRIVY_APP_ID`
2. Create a temporary email inbox.
3. Start passwordless login:
   - `POST https://auth.privy.io/api/v1/passwordless/init`
   - Headers required:
     - `origin: https://app.sport.fun`
     - `referer: https://app.sport.fun/`
     - `privy-app-id: <PRIVY_APP_ID>`
     - `privy-client: js-sdk-core:0.55.0`
   - Body:
     - `{ "email": "<temp-email>" }`
4. Poll mailbox for message from `no-reply@mail.privy.io` and extract 6-digit code.
5. Finish login:
   - `POST https://auth.privy.io/api/v1/passwordless/authenticate`
   - same headers as above
   - body: `{ "email": "<temp-email>", "code": "<6-digit-code>" }`
6. Read `token` from response (Bearer token for Sport.fun API calls).

## Name Extraction Algorithm

For each row in `data` from the players endpoint:

1. `tokenId = String(oPlayerId)`
2. `name = knownName?.trim() || (firstName + " " + lastName).trim()`
3. Skip rows where `name` is empty.
4. Write mapping with soccer contract prefix:
   - key: `0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918:<tokenId>`
   - value: `<name>`

Soccer contract address above is from `src/lib/sportfun.ts`.

## Merge Rule

When updating `src/lib/sportfunNameOverrides.json`:

- Preserve all existing non-soccer mappings (NFL, other keys).
- For soccer keys:
  - add missing keys,
  - update changed names to latest value from Sport.fun API.
- Keep keys sorted lexicographically for stable diffs.

## Verification

After update, verify coverage against market token universe:

- token source: `.cache/sportfun/market/tokens-soccer.json` (`tokenIds`)
- expected result: every token ID has either:
  - `0x71c8b0c5148edb0399d1edf9bf0c8c81dea16918:<tokenId>` in overrides, or
  - fallback `<tokenId>` key (if used)

Recommended checks:

1. `soccerMissing === 0`
2. `soccerEntries === tokens-soccer length`

## Security Notes

- Do not store temporary email credentials, OTP codes, or bearer tokens in the repo.
- Remove any temporary files created during the process.
- Never place auth tokens into `.env.example`, docs, or committed scripts.
