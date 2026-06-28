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

    // Always manage the Defense flag so it is removed when the threat is gone.
    this.updateDefenseFlag(room, hostilePlayers);

    if (hostilePlayers.length === 0) {
      return;
    }

    const defenseStates = Memory.roomDefenseStates ?? {};
    const previousState = defenseStates[room.name] ?? {
      wallAndRampartCount: this.getWallAndRampartCount(room),
      breachDetected: false,
      lastAttackTick: 0
    };

    const currentWallAndRampartCount = this.getWallAndRampartCount(room);
    const coreStructureDamaged = this.getCoreStructureDamaged(room);
    const wallsDestroyed = currentWallAndRampartCount < previousState.wallAndRampartCount;

    const towerEnergy = towers.reduce((sum, tower) => sum + tower.store.getUsedCapacity(RESOURCE_ENERGY), 0);
    const towersOutOfEnergy = towers.length > 0 && towerEnergy === 0;
    const strongHostiles = this.hasStrongHostiles(hostilePlayers);

    let breachDetected = previousState.breachDetected;
    if (hostilePlayers.length > 0 && wallsDestroyed) {
      breachDetected = true;
    }

    const shouldActivateSafeMode =
      hostilePlayers.length > 0 &&
      breachDetected &&
      strongHostiles &&
      (towersOutOfEnergy || coreStructureDamaged > 0) &&
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
      coreStructureDamaged > 0,
      shouldActivateSafeMode,
      safeModeActivated,
      towerEnergy,
      towers.length
    );

    defenseStates[room.name] = {
      wallAndRampartCount: currentWallAndRampartCount,
      coreStructureDamaged,
      breachDetected: hostilePlayers.length > 0 ? breachDetected : false,
      lastAttackTick: hostilePlayers.length > 0 ? Game.time : previousState.lastAttackTick
    };
    Memory.roomDefenseStates = defenseStates;
  }

  private static getWallAndRampartCount(room: Room): number {
    return room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART
    }).length;
  }

  private static getCoreStructureDamaged(room: Room): number {
    return room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType !== STRUCTURE_RAMPART &&
        structure.structureType !== STRUCTURE_LINK && // Exclude links because they can be very outside of our main buildings.
        structure.hits < structure.hitsMax * 0.5
    }).length;
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
    towerCount: number
  ): void {
    if (hostileCount === 0 && !shouldActivateSafeMode && !safeModeActivated) {
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
      room.visual.text(safeModeActivated ? "SAFE MODE ACTIVATED" : "SAFE MODE READY: close to trigger", x, y, danger);
    }

    if (towersOutOfEnergy) {
      y += 0.6;
      room.visual.text("TOWERS OUT OF ENERGY", x, y, danger);
    }
  }
}
