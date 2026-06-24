export class SafeMode {
  public static run(room: Room, towers: StructureTower[]): void {
    const controller = room.controller;
    if (!controller || !controller.my) {
      return;
    }

    const hostilePlayers = room.find(FIND_HOSTILE_CREEPS, {
      filter: creep => creep.owner && creep.owner.username !== "Invader" && creep.owner.username !== "Source Keeper"
    });

    if (hostilePlayers.length === 0) {
      return;
    }

    const defenseStates = Memory.roomDefenseStates ?? {};
    const previousState = defenseStates[room.name] ?? {
      wallAndRampartCount: this.getWallAndRampartCount(room),
      coreStructureCount: this.getCoreStructureCount(room),
      breachDetected: false,
      lastAttackTick: 0
    };

    const currentWallAndRampartCount = this.getWallAndRampartCount(room);
    const currentCoreStructureCount = this.getCoreStructureCount(room);
    const wallsDestroyed = currentWallAndRampartCount < previousState.wallAndRampartCount;
    const coreStructuresDestroyed = currentCoreStructureCount < previousState.coreStructureCount;

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
      (towersOutOfEnergy || coreStructuresDestroyed) &&
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
      coreStructuresDestroyed,
      shouldActivateSafeMode,
      safeModeActivated,
      towerEnergy,
      towers.length
    );

    defenseStates[room.name] = {
      wallAndRampartCount: currentWallAndRampartCount,
      coreStructureCount: currentCoreStructureCount,
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

  private static getCoreStructureCount(room: Room): number {
    return room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType !== STRUCTURE_RAMPART
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

  private static drawDefenseVisuals(
    room: Room,
    hostileCount: number,
    breachDetected: boolean,
    strongHostiles: boolean,
    towersOutOfEnergy: boolean,
    coreStructuresDestroyed: boolean,
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
    room.visual.text(`Core structures lost: ${coreStructuresDestroyed ? "YES" : "NO"}`, x, y, warning);

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
