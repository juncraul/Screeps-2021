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

## Season configuration

Season-specific behavior is disabled by default. Enable each season independently
in the Screeps console:

```js
Memory.Keys = Memory.Keys || {};
Memory.Keys.IsSeason10 = true; // Season 10 scout collectors and score collection
Memory.Keys.IsSeason11 = true; // Season 11 thorium harvesting
```

Only the boolean value `true` enables a season. Missing keys, `false`, and other
values disable it, including its area setup, creep management, and spawn tasks.
The old `Memory.Keys.IsSeason` flag no longer enables any season. Ordinary source
and mineral harvesting do not require a season flag.

## Scouting

Scouts only spawn when an eligible room exists within two exits of their base.
Target selection skips rooms we own or reserve, but scouts may travel through
them to reach other rooms. Rooms with hostile creeps or another player's
ownership/reservation are retried after 5,000 ticks without a new enemy sighting.
The last sighting is stored as `Memory.scoutIntel[roomName].lastEnemySeen`;
older intel without this field uses `lastSeen` for the retry interval.

## Base Layouts

Each diagram shows the highest level defined in its JSON plan, not a merge of
lower levels. North is up; each symbol occupies one room tile. Empty outer rows
and columns are trimmed. Origins and anchors below use the JSON coordinates;
the flag marks the anchor, which is not an extra structure.

For selectable layouts, a `Base-*` flag uses primary white to preview and primary
grey to save/build; its secondary color selects the pattern.

| Layout | Highest defined level | Selection |
|---|---|---|
| [Bunker](src/BaseBuilder/Layouts/LayoutBunker.json) | 8 | Secondary green |
| [FourWays](src/BaseBuilder/Layouts/LayoutFourWays.json) | 8 | Secondary orange |
| [Utility](src/BaseBuilder/Layouts/LayoutUtility.json) | 8 | Secondary cyan |
| [Fixed Extensions](src/BaseBuilder/Layouts/LayoutFixedExtension.json) | 8 | Secondary yellow |
| [5E](src/BaseBuilder/Layouts/Layout5E.json) | 0 (controller-independent additive plan) | `Base-5E-Autoplaced[-N]`, secondary purple |
| [Labs](src/BaseBuilder/Layouts/LayoutLabs.json) | 8 | Secondary white |

Legend: `.` empty, `R` road, `S` spawn, `E` extension, `C` container,
`F` stationary filler position, `G` storage, `K` link, `D` tower, `T` terminal,
`L` lab, `O` observer, `P` power spawn, `N` nuker, `Y` factory.

### Bunker

Level 8. Origin `(0, 0)`; anchor `(6, 6)`.

```text
. . . R R R R R R R . . .
. . R E E E R L L L R . .
. R E E R E R L R L L R .
R E E R E R S R L R L E R
R E R E E R D R L L R O R
R R E E D R T R D R E R R
R E E N R K . Y R E E E R
R R E E D R G R D E E R R
R E R E S R D R S E R E R
R E E R E R P R E R E E R
. R E E R E R E R E E R .
. . R E E E R E E E R . .
. . . R R R R R R R . . .
```

The factory is present in the JSON pattern but is not currently included in the
builder's supported structure types.

### FourWays

Level 8. Origin `(0, 0)`; anchor `(5, 5)`.

```text
E E E . . R . . E E E
E R E E R D R E E R E
E E R E E R E E R E E
. E E R E R E R E E .
. R E E R S R E E R .
R D R R S G S R R D R
. R E E R K R E E R .
. E E R E R E R E E .
E E R E E R E E R E E
E R E E R D R E E R E
E E E . . R . . E E E
```

### Utility

Level 8. Origin `(23, 20)`; anchor `(25, 25)`.

```text
R R R R R R
R D P K D R
R O R R N R
R R T G R R
R R L L R R
R L L L L R
R L L L L R
R R R R R R
```

### Fixed Extensions

Level 8. Origin `(0, 0)`; anchor `(3, 3)`.

```text
. R R R R R .
R E E C E E R
R E F E F E R
R E E E E E R
R E F E F E R
R E E S E E R
. R R R R R .
```

The four `F` tiles are stationary filler positions, not structures. Fillers stand
there to collect and distribute energy to adjacent extensions and the spawn.
The level-8 JSON lists both an extension and a container at `(3, 1)`;
the diagram shows the container as `C` rather than hiding that overlap.

### 5E

Level 0, reused at every eligible controller level. Origin `(0, 0)`; anchor `(2, 2)`.
Five extensions with an outer road ring supplement an existing base plan.

```text
. . R . .
. R E R .
R E E E R
. R E R .
. . R . .
```

### Labs

Level 8. Origin `(0, 0)`; anchor `(4, 2)`. Select with secondary white.
The plan builds three labs at controller level 6, six at level 7, and ten at level 8.

```text
. . R . . . R . .
. R L R L R L R .
R . L L R L L . R
. R L R L R L R .
. . R . . . R . .
```

## Automatic extension plans

After the main base plan is saved, automatic placement creates a
`Base-5E-Autoplaced` preview when more extensions are needed. Change its primary
color to grey to save the five-extension plan. If extension capacity remains,
another preview is created with a unique name such as `Base-5E-Autoplaced-2`.
Saved extension positions, built extensions, and construction sites count toward
the current controller limit without double-counting shared positions. Additional
plans avoid saved footprints, and placement resumes as controller upgrades allow
more extensions.

## Flags

This project uses flags as the primary runtime configuration system for remote expansion, military behavior, and emergency defense.

All current flags are documented here so you only need this section.

### Quick Reference

| Flag | Example | What it does | Spawn room selection |
|---|---|---|---|
| `Reserve-SpawnRoom[-AnyIgnoredText]` (purple/blue/grey) | `Reserve-E29S25` | Reserve, claim, or collect from a remote room | Required part 2 (`SpawnRoom`) or `X` |
| `RemoteRebuild-SpawnRoom[-AnyIgnoredText]` | `RemoteRebuild-E29S25-First` | Rebuild remote room from spawn room | Required part 2 (`SpawnRoom`) or `X` |
| `Attack-SpawnRoom-SquadSize[-PowerRank][-AnyIgnoredText]` | `Attack-E29S25-4-5-Healers` | Melee, ranged, mixed, healer-supported, or dismantler squad | Required part 2 (`SpawnRoom`) or `X` |
| `SourceKeeper-SpawnRoom[-AnyIgnoredText]` | `SourceKeeper-E29S25` | Source Keeper hunting squad | Required part 2 (`SpawnRoom`) or `X` |
| `Looter-SpawnRoom[-AnyIgnoredText]` | `Looter-E29S25` | Looter carrier unit | Required part 2 (`SpawnRoom`) or `X` |
| `Defense-RoomName` | `Defense-E29S25` | Emergency in-room defense team | Auto-placed by SafeMode logic |
| `Market-Sell-Resource-Amount-PriceModeOrValue` | `Market-Sell-Energy-10000-MarketValue` | Creates and tracks sell orders from terminal stock, or deals existing orders (`MarketValueDeal`) | Uses room where the flag is placed |
| `ReRoute-TargetRoom-From-CurrentRoom[-AnyText]` | `ReRoute-E29S25-From-E30S25` | Forces cross-room movement through the flag room | N/A (movement helper) |
| `Season[-SquadSize]` | `Season-5` | Creates 5 collectors when `Memory.Keys.IsSeason10 === true` | Spawns from the room where the flag is placed in |

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
3. **Primary color `COLOR_GREY`**: room is treated as a **resource-collection-only target**. The remote uses carrier creeps to collect available dropped resources, tombstone contents, and energy from containers. It does not spawn claimers, harvesters, or repairers.
- Spawn room binding is parsed from part 2 (`Reserve-<SpawnRoom>`).
- `Reserve-X` means any room may handle the remote.
- For reserve flags, `secondaryColor === COLOR_BLUE` enables **mineral-only** remote mode.

Examples:
- `Reserve-E29S25` → only spawn room `E29S25` handles it.
- `Reserve-X` → any spawn room may handle it.
- To collect without reserving or harvesting, place `Reserve-<SpawnRoom>` in the remote room and set its **primary color to grey**.

Combat in collection-only rooms:
- A grey `Reserve-*` flag does not create an attack squad; add an `Attack-*` flag separately if needed.
- Attack squads in that room spare non-combat workers and claimers (creeps with active `WORK` or `CLAIM` parts).
- Carriers without active `WORK`/`CLAIM` parts remain valid targets, so enemy haulers can be intercepted without killing the workers producing resources.
- Active `ATTACK`, `RANGED_ATTACK`, or `HEAL` parts override that protection: combat-capable workers/claimers are still valid targets.
- This filtering applies to both red-secondary (attack everything) and blue-secondary (creeps only) targeting, including passive melee/ranged attacks. Exempt players remain excluded.

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

### `Attack-SpawnRoom-SquadSize[-PowerRank][-AnyIgnoredText]`

- File source: `src/Areas/Military/SoldierArea.ts`
- Prefix: `Attack`.
- Parsed format:
1. `SpawnRoom` (required part 2, or `X`)
2. `SquadSize` (required positive integer; total number of creeps, including healers)
3. Optional `PowerRank` (defaults to `1`)
4. Optional ignored suffix text
- Flags without a valid positive `SquadSize` do not create a squad.

Squad assembly:
- Squads larger than one wait until the full squad has finished spawning and gathered before moving toward the flag.
- They assemble in the specified spawn room. For `Attack-X-*`, the first member's spawn room becomes the shared assembly room; members spawned elsewhere travel there.
- Each creep gets a separate tile in a reachable assembly patch, preferably at least five tiles from every structure except roads, ramparts, and walls. Those exceptions do not make impassable walls or private enemy ramparts valid standing tiles.
- If no suitable patch has five-tile clearance, the squad uses the best available smaller clearance and logs a warning. If no patch is reachable, it waits and retries.
- If casualties make a deployed squad incomplete, survivors return to assemble with replacements before deploying again. Single-creep squads do not wait.

Flag colors control behavior:

Primary color (role composition):

| Color | Squad composition |
|---|---|
| `RED` | One `Melee` (`ATTACK`), remaining slots `Healer` (`HEAL`) |
| `BLUE` | One `Ranged` (`RANGED_ATTACK`), remaining slots `Healer` (`HEAL`) |
| `PURPLE` | Split `Melee` / `Ranged`; melee gets the extra slot for odd squad sizes |
| `YELLOW` | One `Dismantler` (`WORK`), remaining slots `Healer` |

For blue squads, the ranged unit uses twice the flag's `PowerRank`; for red squads, the melee unit uses twice the flag's `PowerRank`; for yellow squads, the dismantler uses twice the flag's `PowerRank`. Healers use the flag's normal rank. Suffixes such as `Healers` or `Dismantle` are labels only; the primary flag color selects the squad type.

Each ranged body segment contains two `RANGED_ATTACK` and two `MOVE` parts.
Ranged bodies are capped at 25 pairs (50 body parts), allowing a final half-segment
at the cap. A blue leader's doubled rank is applied before building its body.

Use blue for ranged-led healer squads and red for melee-led healer squads.
Green is no longer supported for soldier composition: recolor existing green
Attack flags to red. Unsupported primary colors do not spawn soldiers and log a warning.
Secondary targeting colors are unchanged. Blue squads now spawn healers after
their ranged leader instead of additional ranged units; existing extra ranged
units are not removed.

Edge navigation supports entering and retreating through all four room borders.
Incoming members move to separate slots inside the target room; recovering
members step inward from the border in their retreat room to avoid crossing back.

Secondary color (combat targeting):
1. `RED` → attack everything
2. `GREY` → structures only
3. `BLUE` → creeps only
4. `WHITE` → no attack, move/hold

Two-creep squads automatically use `DuoNavigation`, with the attacker as the head
and the other creep as the tail. Both must have zero fatigue before moving.
The tail follows into the head's previous tile; if they separate, the head waits
while the tail catches up. At room exits, the head clears the entry tile as the
tail crosses. Duos share quad-style targeting and retreat/recovery behavior and
honor the flag's secondary targeting color.

Individual attackers, duo formations, and quad formations give up chasing a creep after five
consecutive ticks without reducing their best observed distance to it. Closing
the gap resets the timer; enemies already within attack range are not abandoned.
An abandoned target is ignored by that squad for 25 ticks, allowing another
target to be selected. Nearby passive attacks are still allowed during this period.

In rooms with a grey `Reserve-*` collection-only flag, creep targeting also
protects non-combat workers/claimers while allowing attacks on carriers and
combat creeps, as described in the Reserve section above.

Examples:
- `Attack-E29S25-4-5-Healers` with a red primary color: one melee unit and three healers, rank `5` (melee rank `10`).
- `Attack-E29S25-4-5-RangedHealers` with a blue primary color: one ranged unit and three healers, rank `5` (ranged rank `10`).
- `Attack-E29S25-4-5-Dismantle` with a yellow primary color: one dismantler and three healers, rank `5` (dismantler rank `10`).
- `Attack-X-2` with a purple primary color: one melee and one ranged unit, default rank `1`, spawning from any base.

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

### `Market-Sell-Resource-Amount-PriceModeOrValue`

- File source: `src/Areas/BaseRoom/MarketArea.ts`
- Prefix: `Market`.
- Supported operations: `Sell`, `Buy`.
- Parsed format:
1. `Market`
2. `Sell` or `Buy`
3. Resource type, such as `Energy`, `H`, or `Utrium`
4. `Amount` (positive integer)
5. Price mode/value (`MarketValue`, `MarketValueDeal`, `Undercut`, or fixed numeric price)

Examples:
- `Market-Sell-Energy-10000-MarketValue`
- `Market-Sell-Energy-10000-MarketValueDeal`
- `Market-Sell-Energy-10000-Undercut`
- `Market-Sell-Energy-10000-0.25`

Manual flag behavior:
1. Terminal energy baseline is maintained at `10000` whenever possible (clerk will refill from storage).
2. If the terminal has less than `Amount` of the target resource, a market clerk creep will move that resource from storage to terminal. The clerk is `2 CARRY / 2 MOVE` when `50000` or more needs to be moved, otherwise `1 CARRY / 1 MOVE`.
3. If terminal already has enough energy, transfer step is skipped.
4. When selling `Energy`, the clerk fills the terminal with `Amount + 10000` so the `10000` energy baseline stays available for transfer fees; deals never sell into that baseline.
5. Once terminal has enough, a `ORDER_SELL` market order is created and the flag turns `COLOR_YELLOW`.
6. While the order is active, the flag stays `COLOR_YELLOW`.
7. When the order is fully completed (or no longer exists), the flag turns `COLOR_GREEN`.
8. Green market flags are automatically removed after `10000` ticks.

Automatic overflow behavior:
1. If room storage is more than 90% full, MarketArea creates a sell flag for the most abundant stored resource above `150000` units.
2. If a sell flag already exists for that resource in the room, the next most abundant eligible resource is used instead.
3. Automatically created overflow flags sell `50000` units:
   - Storage between 90% and 95% full: `MarketValue` (creates an order).
   - Storage above 95% full: `MarketValueDeal` (deals existing orders immediately).

Price behavior:
1. `MarketValue`: uses latest market history average price.
2. `MarketValueDeal`: does not create an order; deals existing orders of other players (see below).
3. `Undercut`: uses lowest competing sell order minus `0.001` (with floor protection).
4. Fixed numeric value: uses the provided number (minimum `0.001`).

`MarketValueDeal` behavior:
1. `Sell` flags deal `ORDER_BUY` orders, `Buy` flags deal `ORDER_SELL` orders. Own orders and orders in own rooms are ignored.
2. Transfer energy cost per order is `ceil(amount * (1 - e^(-distance / 30)))`, where `distance` is the linear room distance from the terminal.
3. The energy cost is converted to credits (3-day average energy price, or cheapest energy sell order as fallback), giving an effective price:
   - Sell: `price - energyCostPerUnit * energyPrice` (highest first).
   - Buy: `price + energyCostPerUnit * energyPrice` (lowest first).
4. Orders with effective price below 90% (sell) or above 110% (buy) of the 3-day average price are skipped.
5. Deal amount is limited by the amount left on the flag, the order amount, terminal stock (sell) or terminal free capacity and credits (buy), and terminal energy for the transfer cost.
6. One deal per terminal per tick (terminal cooldown respected). The deal is confirmed next tick through the transaction log, and only the actually transferred amount is added to progress.
7. Partial fills are tracked in `Memory.Keys.MarketAreaStates[flagName].dealtAmount`; dealing continues until the full `Amount` is reached. The clerk refills the terminal with the remaining amount for sell flags.
8. Flag is `COLOR_YELLOW` while dealing, turns `COLOR_GREEN` once the full amount is dealt, and is removed after `10000` ticks.

Event logging:
- All market activity (order creation/completion, deals placed/confirmed/failed, terminal balancing sends, overflow flag creation) is pushed to `EventHandler` under the `Market` event type and printed to console.

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
