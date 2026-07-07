import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { DEFENSE_TEST_FLAG_PREFIX } from "Areas/Military/DefenseArea";

export class SafeMode {
  public static run(room: Room, towers: StructureTower[]): void {
    const controller = room.controller;
    if (!controller || !controller.my) {
      return;
    }

    if (controller.level < 3) return; // Safe mode is not available until controller level 3

    const hostilePlayers = room.find(FIND_HOSTILE_CREEPS, {
      filter: creep => creep.owner && creep.owner.username !== "Invader" && creep.owner.username !== "Source Keeper"
    });
    const towerEnergy = towers.reduce((sum, tower) => sum + tower.store.getUsedCapacity(RESOURCE_ENERGY), 0);
    const towersOutOfEnergy = towers.length > 0 && towerEnergy === 0;

    // Always manage the Defense flag so it is removed when the threat is gone.
    this.updateDefenseFlag(room, hostilePlayers);

    const testFlags = this.getDefenseTestFlags(room);
    if (testFlags.length > 0) {
      const testSafeModeTriggered = this.testFlagsHavePathToSpawn(room, testFlags);
      this.drawDefenseVisuals(
        room,
        hostilePlayers.length,
        testSafeModeTriggered,
        false,
        towersOutOfEnergy,
        false,
        false,
        false,
        towerEnergy,
        towers.length,
        testSafeModeTriggered ? "SAFE MODE WOULD TRIGGER (TEST)" : "TEST DEFENSE: spawn path blocked",
        true
      );
      if (testSafeModeTriggered) {
        this.drawTestFlagHighlights(room, testFlags);
      }
    }

    if (hostilePlayers.length === 0) {
      return;
    }

    const spawnReachable = this.hostilesHavePathToSpawn(room, hostilePlayers);
    const strongHostiles = this.hasStrongHostiles(hostilePlayers);

    if (spawnReachable) {
      this.removeDefenseTestFlags(room);
    }

    const breachDetected = spawnReachable;

    const shouldActivateSafeMode =
      hostilePlayers.length > 0 &&
      breachDetected &&
      controller.safeMode === undefined &&
      controller.safeModeAvailable > 0 &&
      !controller.safeModeCooldown;

    let safeModeActivated = false;
    if (shouldActivateSafeMode) {
      console.log(`Activate safe mode in room ${room.name}`);
      safeModeActivated = controller.activateSafeMode() === OK;
    }

    this.drawDefenseVisuals(
      room,
      hostilePlayers.length,
      breachDetected,
      strongHostiles,
      towersOutOfEnergy,
      spawnReachable,
      shouldActivateSafeMode,
      safeModeActivated,
      towerEnergy,
      towers.length
    );
  }

  private static hasStrongHostiles(hostiles: Creep[]): boolean {
    if (hostiles.length === 0) {
      return false;
    }

    let totalOffense = 0;
    for (const hostile of hostiles) {
      const activeParts =
        hostile.getActiveBodyparts(ATTACK) +
        hostile.getActiveBodyparts(RANGED_ATTACK) +
        hostile.getActiveBodyparts(HEAL) +
        hostile.getActiveBodyparts(WORK);
      totalOffense += activeParts;

      const boosted = hostile.body.some(part => !!part.boost);
      if (boosted || activeParts >= 10) {
        return true;
      }
    }

    return totalOffense >= 15;
  }

  private static hostilesHavePathToSpawn(room: Room, hostiles: Creep[]): boolean {
    const spawns = GetRoomObjects.getRoomSpawns(room, true);
    if (spawns.length === 0 || hostiles.length === 0) {
      return false;
    }

    for (const hostile of hostiles) {
      for (const spawn of spawns) {
        const result = PathFinder.search(
          hostile.pos,
          { pos: spawn.pos, range: 0 },
          {
            maxRooms: 1,
            plainCost: 2,
            swampCost: 10,
            roomCallback: roomName => this.buildSpawnPathMatrix(roomName, room.name)
          }
        );

        if (!result.incomplete) {
          return true;
        }
      }
    }

    return false;
  }

  private static getDefenseTestFlags(room: Room): Flag[] {
    return _.filter(
      Game.flags,
      flag => flag.name.startsWith(DEFENSE_TEST_FLAG_PREFIX) && flag.pos.roomName === room.name
    );
  }

  private static testFlagsHavePathToSpawn(room: Room, testFlags: Flag[]): boolean {
    const spawns = GetRoomObjects.getRoomSpawns(room, true);
    if (spawns.length === 0 || testFlags.length === 0) {
      return false;
    }

    for (const flag of testFlags) {
      for (const spawn of spawns) {
        const result = PathFinder.search(
          flag.pos,
          { pos: spawn.pos, range: 0 },
          {
            maxRooms: 1,
            plainCost: 2,
            swampCost: 10,
            roomCallback: roomName => this.buildSpawnPathMatrix(roomName, room.name)
          }
        );

        if (!result.incomplete) {
          return true;
        }
      }
    }

    return false;
  }

  private static buildSpawnPathMatrix(roomName: string, targetRoomName: string): CostMatrix | false {
    if (roomName !== targetRoomName) {
      return false;
    }

    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);

    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
          matrix.set(x, y, 255);
        }
      }
    }

    const room = Game.rooms[roomName];
    if (room) {
      for (const structure of room.find(FIND_STRUCTURES)) {
        if (
          structure.structureType === STRUCTURE_ROAD ||
          structure.structureType === STRUCTURE_CONTAINER ||
          structure.structureType === STRUCTURE_RAMPART
        ) {
          continue;
        }

        matrix.set(structure.pos.x, structure.pos.y, 255);
      }
    }

    return matrix;
  }

  /**
   * Places a "Defense-{roomName}" flag at the spawn when any hostile player is
   * within 15 tiles of a spawn. Removes the flag once no such threat is present.
   */
  private static updateDefenseFlag(room: Room, hostilePlayers: Creep[]): void {
    const defenseFlagName = `Defense-${room.name}`;
    const existingFlag = Game.flags[defenseFlagName];
    const spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);

    const enemyBreachedOutsideWall = hostilePlayers.some(
      enemy => enemy.pos.x > 2 && enemy.pos.x < 47 && enemy.pos.y > 2 && enemy.pos.y < 47
    );

    if (enemyBreachedOutsideWall && !existingFlag && spawns.length > 0) {
      room.createFlag(spawns[0].pos, defenseFlagName, COLOR_RED, COLOR_RED);
      console.log(`DefenseArea: Placed flag in ${room.name}`);
    } else if (!enemyBreachedOutsideWall && existingFlag) {
      existingFlag.remove();
      console.log(`DefenseArea: Removed flag from ${room.name}`);
    }
  }

  private static drawDefenseVisuals(
    room: Room,
    hostileCount: number,
    breachDetected: boolean,
    strongHostiles: boolean,
    towersOutOfEnergy: boolean,
    coreStructuresDamaged: boolean,
    shouldActivateSafeMode: boolean,
    safeModeActivated: boolean,
    towerEnergy: number,
    towerCount: number,
    safeModeMessage?: string,
    forceVisual = false
  ): void {
    if (hostileCount === 0 && !shouldActivateSafeMode && !safeModeActivated && !forceVisual) {
      return;
    }

    const x = 1;
    let y = 25;
    const header: TextStyle = { align: "left", opacity: 1, font: 0.65, color: "#ff5555" };
    const warning: TextStyle = { align: "left", opacity: 0.95, font: 0.5, color: "#ff9966" };
    const danger: TextStyle = { align: "left", opacity: 1, font: 0.52, color: "#ff3333" };

    room.visual.text("UNDER ATTACK", x, y, header);
    y += 0.7;
    room.visual.text(`Hostiles: ${hostileCount}`, x, y, warning);
    y += 0.6;
    room.visual.text(`Wall breach: ${breachDetected ? "YES" : "NO"}`, x, y, warning);
    y += 0.6;
    room.visual.text(`Strong hostiles: ${strongHostiles ? "YES" : "NO"}`, x, y, warning);
    y += 0.6;
    room.visual.text(`Tower energy: ${towerEnergy} (${towerCount} towers)`, x, y, warning);
    y += 0.6;
    room.visual.text(`Core structures damaged: ${coreStructuresDamaged ? "YES" : "NO"}`, x, y, warning);

    if (shouldActivateSafeMode || safeModeActivated || (breachDetected && strongHostiles)) {
      y += 0.7;
      room.visual.text(
        safeModeMessage ?? (safeModeActivated ? "SAFE MODE ACTIVATED" : "SAFE MODE READY: close to trigger"),
        x,
        y,
        danger
      );
    }

    if (towersOutOfEnergy) {
      y += 0.6;
      room.visual.text("TOWERS OUT OF ENERGY", x, y, danger);
    }
  }

  private static removeDefenseTestFlags(room: Room): void {
    const flag = _.filter(Game.flags, f => f.name.startsWith(DEFENSE_TEST_FLAG_PREFIX) && f.pos.roomName === room.name);
    for (const f of flag) {
      f.remove();
      console.log(`DefenseArea: Removed test flag ${f.name} from ${room.name}`);
    }
  }

  private static drawTestFlagHighlights(room: Room, testFlags: Flag[]): void {
    const spawns = GetRoomObjects.getRoomSpawns(room, true);
    if (spawns.length === 0) return;

    for (const flag of testFlags) {
      for (const spawn of spawns) {
        room.visual.line(flag.pos, spawn.pos, { color: "#ff3333", opacity: 0.7, width: 0.15 });
      }
      room.visual.text("SAFE MODE WOULD TRIGGER", flag.pos.x + 1, flag.pos.y - 1, {
        align: "left",
        opacity: 1,
        font: 0.55,
        color: "#ff3333"
      });
    }
  }
}
