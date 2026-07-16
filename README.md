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
| `Reserve-SpawnRoom[-AnyIgnoredText]` (purple/blue) | `Reserve-E29S25` | Reserve/claim remote controller | Required part 2 (`SpawnRoom`) or `X` |
| `RemoteRebuild-SpawnRoom[-AnyIgnoredText]` | `RemoteRebuild-E29S25-First` | Rebuild remote room from spawn room | Required part 2 (`SpawnRoom`) or `X` |
| `Attack-SpawnRoom[-PowerRank][-AnyIgnoredText]` | `Attack-E29S25-2-Healers` | Soldier squad behavior | Required part 2 (`SpawnRoom`) or `X` |
| `SourceKeeper-SpawnRoom[-AnyIgnoredText]` | `SourceKeeper-E29S25` | Source Keeper hunting squad | Required part 2 (`SpawnRoom`) or `X` |
| `Looter-SpawnRoom[-AnyIgnoredText]` | `Looter-E29S25` | Looter carrier unit | Required part 2 (`SpawnRoom`) or `X` |
| `Defense-RoomName` | `Defense-E29S25` | Emergency in-room defense team | Auto-placed by SafeMode logic |
| `Market-Sell-Energy-Amount-PriceModeOrValue` | `Market-Sell-Energy-10000-MarketValue` | Creates and tracks sell orders from terminal stock | Uses room where the flag is placed |
| `ReRoute-TargetRoom-From-CurrentRoom[-AnyText]` | `ReRoute-E29S25-From-E30S25` | Forces cross-room movement through the flag room | N/A (movement helper) |
| `Season[-SquadSize]` | `Season-5` | Creates 5 collectors | Spawns from the room where the flag is placed in |

---

### Unified SpawnRoom Convention

For runtime flags that create/assign creeps, the second segment is now standardized as `SpawnRoom`:

- `FlagType-SpawnRoom-...`
- Use `X` when any spawn room is allowed.

Examples:
- `Attack-X-2-Raid`
- `Reserve-E29S25`
- `SourceKeeper-X`

Exceptions (unchanged):
1. `Market-*`
2. `ReRoute-*`
3. `Season-*`

Note:
- `Defense-*` remains auto-managed by SafeMode and is keyed by defended room.

---

### `Reserve-SpawnRoom[-AnyIgnoredText]`

- File source: `src/Helpers/GetRoomObjects.ts`
- `Reserve` flags are interpreted by color:
1. **Primary color `COLOR_PURPLE`**: room is treated as **reserve target**.
2. **Primary color `COLOR_BLUE`**: room is treated as **claim target**.
- Spawn room binding is parsed from part 2 (`Reserve-<SpawnRoom>`).
- `Reserve-X` means any room may handle the remote.
- For reserve flags, `secondaryColor === COLOR_BLUE` enables **mineral-only** remote mode.

Examples:
- `Reserve-E29S25` → only spawn room `E29S25` handles it.
- `Reserve-X` → any spawn room may handle it.

---

### `RemoteRebuild-SpawnRoom[-AnyIgnoredText]`

- File source: `src/Helpers/GetRoomObjects.ts`, `src/Areas/RemoteRebuildArea.ts`
- Detects flags with prefix `RemoteRebuild-`.
- Part 2 is parsed as `SpawnRoom`.
- `RemoteRebuild-X` is supported and allows any room to spawn rebuild transit creeps.
- Flag must be placed **inside the remote room** that needs rebuilding.
- The selected spawn room(s) spawn transit rebuild creeps (Constructor, Carrier, Harvester, Upgrader), then they are reassigned into local area memories once they arrive.

Color behavior in `RemoteRebuildArea`:
1. `COLOR_WHITE`: full rebuild set (constructor/carrier/harvester/upgrader).
2. `COLOR_GREY`: carrier-only mode.

Example:
- `RemoteRebuild-E29S25-First` placed in remote room `W10N20` means spawn room `E29S25` rebuilds `W10N20`.
- `RemoteRebuild-X-First` means any spawn room can contribute.

---

### `Attack-SpawnRoom[-PowerRank][-AnyIgnoredText]`

- File source: `src/Areas/Military/SoldierArea.ts`
- Prefix: `Attack`.
- Parsed format:
1. `SpawnRoom` (required part 2, or `X`)
2. Optional `PowerRank` (default role body)
3. Optional ignored suffix text
- `SquadSize` currently defaults to `5`.

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
- `Attack-E29S25-2-Healers`
- `Attack-X-1`

---

### `SourceKeeper-SpawnRoom[-AnyIgnoredText]`

- File source: `src/Areas/Military/SourceKeeperArea.ts`
- Prefix: `SourceKeeper`.
- Name part 2 is spawn room (`SourceKeeper-<SpawnRoom>`), or `X`.
- Flag target room is always the room where the flag is placed.
- Spawns a dedicated combat squad from the selected spawn room(s).

Example:
- `SourceKeeper-E29S25`
- `SourceKeeper-X`

---

### `Looter-SpawnRoom[-AnyIgnoredText]`

- File source: `src/Areas/Military/LooterArea.ts`
- Prefix: `Looter`.
- Name part 2 is spawn room (`Looter-<SpawnRoom>`), or `X`.
- Flag target room is where the flag is placed.
- Spawns looter creep(s) from selected spawn room(s) and runs loot/return cycle.

Current behavior notes:
1. Spawns looter role via `CreepType.Looter`.
2. Uses `MoveDifferentRoom` to target room and then returns to spawn room for deposit.
3. Prioritizes non-energy loot paths before energy paths.

Example:
- `Looter-E29S25`
- `Looter-X`

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

### `Market-Sell-Energy-Amount-PriceModeOrValue`

- File source: `src/Areas/BaseRoom/MarketArea.ts`
- Prefix: `Market`.
- Current supported operation/resource pair: `Sell` + `Energy`.
- Parsed format:
1. `Market`
2. `Sell`
3. `Energy`
4. `Amount` (positive integer)
5. Price mode/value (`MarketValue`, `Undercut`, or fixed numeric price)

Examples:
- `Market-Sell-Energy-10000-MarketValue`
- `Market-Sell-Energy-10000-Undercut`
- `Market-Sell-Energy-10000-0.25`

Behavior:
1. Terminal energy baseline is maintained at `10000` whenever possible (clerk will refill from storage).
2. If terminal energy is below `Amount`, a market clerk creep will move energy from storage to terminal.
3. If terminal already has enough energy, transfer step is skipped.
4. Once terminal has enough, a `ORDER_SELL` market order is created and the flag turns `COLOR_YELLOW`.
5. While the order is active, the flag stays `COLOR_YELLOW`.
6. When the order is fully completed (or no longer exists), the flag turns `COLOR_GREEN`.
7. Green market flags are automatically removed after `10000` ticks.

Price behavior:
1. `MarketValue`: uses latest market history average price.
2. `Undercut`: uses lowest competing sell order minus `0.001` (with floor protection).
3. Fixed numeric value: uses the provided number (minimum `0.001`).

---

### `ReRoute-TargetRoom-From-CurrentRoom[-AnyText]`

- File source: `src/Helpers/GetRoomObjects.ts`, `src/CreepBase.ts`
- Prefix: `ReRoute`.
- Parsed format:
1. `TargetRoom` (final destination room)
2. literal `From`
3. `CurrentRoom` (room where reroute should activate)
4. Optional suffix text

How it works:
1. Any creep executing `MoveDifferentRoom` checks for a matching `ReRoute` flag.
2. Match key is: `(targetRoom, currentRoom)`.
3. If matched, the creep temporarily moves to center `(25,25)` of the room where the flag is placed.
4. After entering that room, normal routing continues toward the original target (or next matching reroute).

This supports multi-hop chains by placing multiple flags:
- `ReRoute-E29S25-From-E30S25` in room `E30S24`
- `ReRoute-E29S25-From-E30S24` in another intermediary room

Example:
- Creep in `E30S25` targeting `E29S25`
- Place flag named `ReRoute-E29S25-From-E30S25` in `E30S24`
- Creep will route via `E30S24` first.

---

### Room Name Parsing Rules

The code uses this room regex in multiple flag parsers:

`[WE]\d+[NS]\d+`

Valid examples:
- `E29S25`
- `W10N20`

If a room-name segment does not match this pattern, it is treated as plain suffix text and ignored for base-room binding.


