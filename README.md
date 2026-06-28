# Screeps Typescript Starter

Screeps Typescript Starter is a starting point for a Screeps AI written in Typescript. It provides everything you need to start writing your AI whilst leaving `main.ts` as empty as possible.

## Basic Usage

You will need:

- [Node.JS](https://nodejs.org/en/download) (10.x)
- A Package Manager ([Yarn](https://yarnpkg.com/en/docs/getting-started) or [npm](https://docs.npmjs.com/getting-started/installing-node))
- Rollup CLI (Optional, install via `npm install -g rollup`)

Download the latest source [here](https://github.com/screepers/screeps-typescript-starter/archive/master.zip) and extract it to a folder.

Open the folder in your terminal and run your package manager to install the required packages and TypeScript declaration files:

```bash
# npm
npm install

# yarn
yarn
```

Fire up your preferred editor with typescript installed and you are good to go!

### Rollup and code upload

Screeps Typescript Starter uses rollup to compile your typescript and upload it to a screeps server.

Move or copy `screeps.sample.json` to `screeps.json` and edit it, changing the credentials and optionally adding or removing some of the destinations.

Running `rollup -c` will compile your code and do a "dry run", preparing the code for upload but not actually pushing it. Running `rollup -c --environment DEST:main` will compile your code, and then upload it to a screeps server using the `main` config from `screeps.json`.

You can use `-cw` instead of `-c` to automatically re-run when your source code changes - for example, `rollup -cw --environment DEST:main` will automatically upload your code to the `main` configuration every time your code is changed.

Finally, there are also NPM scripts that serve as aliases for these commands in `package.json` for IDE integration. Running `npm run push-main` is equivalent to `rollup -c --environment DEST:main`, and `npm run watch-sim` is equivalent to `rollup -cw --dest sim`.

#### Important! To upload code to a private server, you must have [screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth) installed and configured!

## Typings

The type definitions for Screeps come from [typed-screeps](https://github.com/screepers/typed-screeps). If you find a problem or have a suggestion, please open an issue there.

## Documentation

We've also spent some time reworking the documentation from the ground-up, which is now generated through [Gitbooks](https://www.gitbook.com/). Includes all the essentials to get you up and running with Screeps AI development in TypeScript, as well as various other tips and tricks to further improve your development workflow.

Maintaining the docs will also become a more community-focused effort, which means you too, can take part in improving the docs for this starter kit.

To visit the docs, [click here](https://screepers.gitbook.io/screeps-typescript-starter/).

## Flags

This project uses flags as the primary runtime configuration system for remote expansion, military behavior, and emergency defense.

All current flags are documented here so you only need this section.

### Quick Reference

| Flag | Example | What it does | Spawn room selection |
|---|---|---|---|
| `Reserve[-BaseRoom]` (purple) | `Reserve-E29S25` | Reserve remote controller | Optional from name (`BaseRoom`) |
| `Reserve[-BaseRoom]` (blue) | `Reserve-E29S25` | Claim remote controller | Optional from name (`BaseRoom`) |
| `RemoteRebuild-BaseRoom[-AnyText]` | `RemoteRebuild-E29S25-First` | Rebuild remote room from base room | Required in name (`BaseRoom`) |
| `Attack[-SquadSize][-BodySegments][-BaseRoom][-AnyText]` | `Attack-4-2-E29S25-Healers` | Soldier squad behavior | Optional from name (`BaseRoom`) |
| `SourceKeeper-SpawnRoom` | `SourceKeeper-E29S25` | Source Keeper hunting squad | Required from name (`SpawnRoom`) |
| `Looter-SpawnRoom` | `Looter-E29S25` | Looter carrier unit | Required from name (`SpawnRoom`) |
| `Defense-RoomName` | `Defense-E29S25` | Emergency in-room defense team | Auto-placed by SafeMode logic |

---

### `Reserve[-BaseRoom]`

- File source: `src/Helpers/GetRoomObjects.ts`
- `Reserve` flags are interpreted by color:
1. **Primary color `COLOR_PURPLE`**: room is treated as **reserve target**.
2. **Primary color `COLOR_BLUE`**: room is treated as **claim target**.
- Optional base room binding is parsed from flag name part 2 (`Reserve-<BaseRoom>`), only when it matches room pattern `[WE]\d+[NS]\d+`.
- For reserve flags, `secondaryColor === COLOR_BLUE` enables **mineral-only** remote mode.

Examples:
- `Reserve` → reserve/claim room where the flag is placed, spawn from any room.
- `Reserve-E29S25` → same behavior, but only base room `E29S25` handles it.

---

### `RemoteRebuild-BaseRoom[-AnyText]`

- File source: `src/Helpers/GetRoomObjects.ts`, `src/Areas/RemoteRebuildArea.ts`
- Detects flags with prefix `RemoteRebuild-`.
- `BaseRoom` is required and parsed from name (`RemoteRebuild-([WE]\d+[NS]\d+)`).
- Flag must be placed **inside the remote room** that needs rebuilding.
- The specified base room spawns transit rebuild creeps (Constructor, Carrier, Harvester, Upgrader), then they are reassigned into local area memories once they arrive.

Color behavior in `RemoteRebuildArea`:
1. `COLOR_WHITE`: full rebuild set (constructor/carrier/harvester/upgrader).
2. `COLOR_GREY`: carrier-only mode.

Example:
- `RemoteRebuild-E29S25-First` placed in remote room `W10N20` means base room `E29S25` rebuilds `W10N20`.

---

### `Attack[-SquadSize][-BodySegments][-BaseRoom][-AnyText]`

- File source: `src/Areas/Military/SoldierArea.ts`
- Prefix: `Attack`.
- Parsed format:
1. `SquadSize` (default `5`)
2. `BodySegments` (default role body)
3. Optional `BaseRoom`
- If omitted entirely (`Attack`), defaults are used.

Flag colors control behavior:

Primary color (role composition):
1. `RED` → Melee
2. `GREEN` → Ranged
3. `BLUE` → Healer
4. `PURPLE` → Split Melee/Ranged

Secondary color (combat targeting):
1. `RED` → attack everything
2. `GREY` → structures only
3. `BLUE` → creeps only
4. `WHITE` → no attack, move/hold

Examples:
- `Attack`
- `Attack-4-2-E29S25-Healers`
- `Attack-3-1` (spawn from any base)

---

### `SourceKeeper-SpawnRoom`

- File source: `src/Areas/Military/SourceKeeperArea.ts`
- Prefix: `SourceKeeper`.
- Name part 2 is required spawn room (`SourceKeeper-<SpawnRoom>`).
- Flag target room is always the room where the flag is placed.
- Spawns a dedicated combat squad from the specified base room.

Example:
- `SourceKeeper-E29S25`

---

### `Looter-SpawnRoom`

- File source: `src/Areas/Military/LooterArea.ts`
- Prefix: `Looter`.
- Name part 2 is required spawn room (`Looter-<SpawnRoom>`).
- Flag target room is where the flag is placed.
- Spawns looter creep(s) from specified spawn room and runs loot/return cycle.

Current behavior notes:
1. Spawns looter role via `CreepType.Looter`.
2. Uses `MoveDifferentRoom` to target room and then returns to spawn room for deposit.
3. Prioritizes non-energy loot paths before energy paths.

Example:
- `Looter-E29S25`

---

### `Defense-RoomName` (auto-managed)

- File source: `src/Defense/SafeMode.ts`, `src/Areas/Military/DefenseArea.ts`
- Prefix: `Defense`.
- Expected name: `Defense-<RoomName>`.
- **Automatically created and removed** by `SafeMode.updateDefenseFlag`.

Trigger behavior:
1. If hostile player creeps are detected as inside perimeter (`x/y` between 3 and 46), a defense flag is created at spawn position.
2. If that condition is no longer true, the flag is removed.

DefenseArea behavior:
1. Spawns `Defender`, `DefenseRanger`, `DefenseHealer` in room.
2. Fighters reposition to ramparts and track enemy movement.
3. Healer continuously heals the most damaged defense creep.
4. Towers prioritize healing defense creeps before normal tower logic.

Example:
- `Defense-E29S25` (typically auto-created; manual placement also works if room name matches).

---

### Room Name Parsing Rules

The code uses this room regex in multiple flag parsers:

`[WE]\d+[NS]\d+`

Valid examples:
- `E29S25`
- `W10N20`

If a room-name segment does not match this pattern, it is treated as plain suffix text and ignored for base-room binding.


