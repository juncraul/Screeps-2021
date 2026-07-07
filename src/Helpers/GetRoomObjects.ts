// Flags: Primary - Secondary
// PURPLE - PURPLE Reserve this room
// PURPLE - BLUE Reserve this room for mineral-only harvesting
// BLUE - any Claim this room
// any - any ReserveAttack this room when the flag name starts with ReserveAttack

import { Helper } from "./Helper";

export enum RemoteRoomMode {
  Reserve = "Reserve",
  Claim = "Claim",
  ReserveAttack = "ReserveAttack"
}

export interface RemoteRoomTarget {
  roomName: string;
  baseRoomName?: string;
  mineralOnly: boolean;
  mode: RemoteRoomMode;
}

export class GetRoomObjects {
  public static readonly ROOM_NAME_PATTERN = /^[WE]\d+[NS]\d+$/;
  public static readonly REROUTE_FLAG_PATTERN = /^ReRoute-([WE]\d+[NS]\d+)-From-([WE]\d+[NS]\d+)(?:-.+)?$/;

  // --------------------------
  // Get All Functions
  // Functions to return all objects in the game
  // --------------------------
  public static getAllMyCreeps(includingSpawning = false): Creep[] {
    return _.filter(Game.creeps, creep => creep.spawning === includingSpawning);
  }

  public static getAllRoomsToRemote(baseRoom?: Room): RemoteRoomTarget[] {
    const flags = _.filter(Game.flags, flag => flag.name.startsWith("Reserve"));
    const roomTargets: RemoteRoomTarget[] = [];
    flags.forEach(flag => {
      const mode = this.getRemoteRoomModeFromFlag(flag);
      if (!mode) {
        return;
      }

      const baseRoomNameFlag = this.getBaseRoomNameFromReserveFlag(flag.name);
      if (baseRoom && baseRoomNameFlag !== baseRoom.name) {
        return;
      }

      roomTargets.push({
        roomName: flag.pos.roomName,
        baseRoomName: baseRoomNameFlag,
        mineralOnly: mode === RemoteRoomMode.Reserve && flag.secondaryColor === COLOR_BLUE,
        mode
      });
    });
    return roomTargets;
  }

  private static getRemoteRoomModeFromFlag(flag: Flag): RemoteRoomMode | null {
    if (flag.color === COLOR_RED) {
      return RemoteRoomMode.ReserveAttack;
    }

    if (flag.color === COLOR_BLUE) {
      return RemoteRoomMode.Claim;
    }

    if (flag.color === COLOR_PURPLE) {
      return RemoteRoomMode.Reserve;
    }

    return null;
  }

  private static getBaseRoomNameFromReserveFlag(flagName: string): string | undefined {
    const splitName = flagName.split("-");
    if (splitName.length < 2) {
      return undefined;
    }

    const candidateBaseRoomName = splitName[1];
    if (!this.ROOM_NAME_PATTERN.test(candidateBaseRoomName)) {
      return undefined;
    }

    return candidateBaseRoomName;
  }

  public static getAllRemoteRebuildTargets(): { remoteRoomName: string; baseRoomName: string; flag: Flag }[] {
    const pattern = /^RemoteRebuild-([WE]\d+[NS]\d+)(?:-.+)?$/;
    const targets: { remoteRoomName: string; baseRoomName: string; flag: Flag }[] = [];
    _.filter(Game.flags, flag => flag.name.startsWith("RemoteRebuild-")).forEach(flag => {
      const match = pattern.exec(flag.name);
      if (match) {
        targets.push({ remoteRoomName: flag.pos.roomName, baseRoomName: match[1], flag });
      }
    });
    return targets;
  }

  public static getAllClaimedRooms(): Room[] {
    const claimedRooms: Room[] = [];
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (room.controller && room.controller.my) {
        claimedRooms.push(room);
      }
    }
    return claimedRooms;
  }

  public static getAllRoomsWithSpawns(): Room[] {
    const mySpawns = Object.getOwnPropertyNames(Game.spawns);
    const roomsWithSpawns: Room[] = [];
    for (const spawnName of mySpawns) {
      const spawnRoom = Game.spawns[spawnName].room;
      if (roomsWithSpawns.filter(room => room.name === spawnRoom.name).length !== 0) continue; // Skip adding the same room again if we have more than one spawner in the same room
      roomsWithSpawns.push(spawnRoom);
    }
    return roomsWithSpawns;
  }

  /**
   * Returns the next room to route through for a specific (target, from) pair.
   *
   * Flag format:
   * ReRoute-<TargetRoom>-From-<CurrentRoom>[-AnySuffix]
   *
   * The reroute room is the room where the flag is physically placed.
   */
  public static getReRouteRoom(targetRoomName: string, fromRoomName: string): string | undefined {
    const flags = _.filter(Game.flags, flag => flag.name === "ReRoute" || flag.name.startsWith("ReRoute-"));

    for (const flag of flags) {
      const match = this.REROUTE_FLAG_PATTERN.exec(flag.name);
      if (!match) continue;

      const targetFromName = match[1];
      const routeFromName = match[2];

      if (targetFromName === targetRoomName && routeFromName === fromRoomName) {
        return flag.pos.roomName;
      }
    }

    return undefined;
  }

  // --------------------------
  // Get Room Functions
  // Functions to return objects within the room
  // --------------------------
  public static getRoomController(room: Room): StructureController | null {
    return room.controller ? room.controller : null;
  }

  public static getRoomSources(room: Room): Source[] {
    return room.find(FIND_SOURCES);
  }

  public static getRoomConstructions(room: Room, mine?: boolean): ConstructionSite[] {
    if (mine) {
      return room.find(FIND_MY_CONSTRUCTION_SITES);
    }
    return room.find(FIND_CONSTRUCTION_SITES);
  }

  public static getRoomSpawns(room: Room, mine?: boolean): StructureSpawn[] {
    if (mine) {
      return room.find(FIND_MY_SPAWNS);
    }
    return room.find(FIND_HOSTILE_SPAWNS);
  }

  public static getRoomExtensions(room: Room, mine?: boolean): StructureExtension[] {
    let structures: Structure[];
    const extensions: StructureExtension[] = [];
    if (mine) {
      structures = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    } else {
      structures = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    }
    structures.forEach(structure => {
      if (structure instanceof StructureExtension) {
        extensions.push(structure);
      }
    });
    return extensions;
  }

  public static getRoomCreepsMineNoTask(room: Room): Creep[] {
    return room.find(FIND_MY_CREEPS).filter(creep => creep.memory.task === null || creep.memory.task.taskDone);
  }

  public static getRoomCreeps(room: Room, mine?: boolean): Creep[] {
    if (mine) {
      return room.find(FIND_MY_CREEPS);
    }
    return room.find(FIND_CREEPS);
  }

  public static getRoomMineral(room: Room, onlyActive = false): Mineral | null {
    const mineral = room.find(FIND_MINERALS, { filter: mineral => (onlyActive ? mineral.mineralAmount > 0 : true) })[0];
    return mineral;
  }

  public static getRoomTowers(room: Room): StructureTower[] {
    const towers = room.find(FIND_MY_STRUCTURES, {
      filter: object => {
        return object.structureType === STRUCTURE_TOWER;
      }
    });
    const towerStructures: StructureTower[] = [];
    towers.forEach(function (tower) {
      if (tower instanceof StructureTower) {
        towerStructures.push(tower);
      }
    });
    return towerStructures;
  }

  public static getRoomStorage(room: Room): StructureStorage | null {
    const deposit = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_STORAGE
    })[0];
    return deposit instanceof StructureStorage ? deposit : null;
  }

  public static getRoomConstructionSites(room: Room): ConstructionSite[] {
    const construnctionSites = room.find(FIND_CONSTRUCTION_SITES);
    return construnctionSites;
  }

  public static getRoomDroppedResources(room: Room): Resource[] {
    const resources = room.find(FIND_DROPPED_RESOURCES, { filter: res => res.amount > 100 });
    return resources;
  }

  public static getRoomDroppedResource(pos: RoomPosition): Resource | null {
    const resource = pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: res => res.amount > 100 });
    return resource;
  }

  public static getRoomEnemy(room: Room): Creep | null {
    return room.find(FIND_HOSTILE_CREEPS)[0];
  }

  public static getRoomTerminal(room: Room): StructureTerminal | null {
    const structure = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_TERMINAL
    })[0];
    if (structure instanceof StructureTerminal) {
      return structure;
    }
    return null;
  }

  public static getRoomLabs(room: Room): StructureLab[] {
    const structures = room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_LAB
    });
    const labs: StructureLab[] = [];
    for (const i in structures) {
      const lab = structures[i];
      if (lab instanceof StructureLab) {
        labs.push(lab);
      }
    }
    return labs;
  }

  // --------------------------
  // Get Within Range construction site
  // --------------------------
  public static getWithinRangeConstructionSite(
    pos: RoomPosition,
    range: number,
    structureType: StructureConstant
  ): ConstructionSite | null {
    const construnctionSite = pos.findInRange(FIND_CONSTRUCTION_SITES, range, {
      filter: (structure: any) => structure.structureType === structureType
    })[0];
    return construnctionSite;
  }

  // --------------------------
  // Get Within Range construction sites
  // --------------------------
  public static getWithinRangeConstructionSites(
    pos: RoomPosition,
    range: number,
    structureType: StructureConstant
  ): ConstructionSite[] {
    const construnctionSites = pos.findInRange(FIND_CONSTRUCTION_SITES, range, {
      filter: (structure: any) => structure.structureType === structureType
    });
    return construnctionSites;
  }

  public static getWithinRangeStructures(
    roomPosition: RoomPosition,
    range: number,
    structureToLookFor: StructureConstant
  ): Structure[] {
    const structures = roomPosition.findInRange(FIND_STRUCTURES, range);
    const structuresFiltered: Structure[] = [];
    structures.forEach(function (structure) {
      if (structure.structureType === structureToLookFor) {
        structuresFiltered.push(structure);
      }
    });
    return structuresFiltered;
  }

  public static getWithinRangeContainer(pos: RoomPosition, range: number): StructureContainer | null {
    const structure = pos.findInRange(FIND_STRUCTURES, range, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
    return structure instanceof StructureContainer ? structure : null;
  }

  public static getWithinRangeContainers(pos: RoomPosition, range: number): StructureContainer[] {
    const structures = pos.findInRange(FIND_STRUCTURES, range, { filter: { structureType: STRUCTURE_CONTAINER } });
    return structures.length > 0 ? (structures as StructureContainer[]) : [];
  }

  public static getWithinRangeLink(pos: RoomPosition, range: number): StructureLink | null {
    const structure = pos.findInRange(FIND_STRUCTURES, range, { filter: { structureType: STRUCTURE_LINK } })[0];
    return structure instanceof StructureLink ? structure : null;
  }

  public static getWithinRangeExtensions(pos: RoomPosition, range: number): StructureExtension[] {
    const structures = pos.findInRange(FIND_STRUCTURES, range, { filter: { structureType: STRUCTURE_EXTENSION } });
    return structures.length > 0 ? (structures as StructureExtension[]) : [];
  }

  // --------------------------
  // Get Closest By Path Functions
  // Functions to return objects which are closest by path from position
  // --------------------------
  public static getClosestByPathStructureToRepair(
    pos: RoomPosition,
    damageProportionForNonWallRamp: number,
    includeRampartsWalls = false
  ): Structure | null {
    let structure = pos.findClosestByPath(FIND_STRUCTURES, {
      filter: structure =>
        structure.hits < structure.hitsMax * damageProportionForNonWallRamp &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART
    });
    if (!structure && includeRampartsWalls) {
      for (let i = 0.00001; i < 1 && !structure; i *= 2) {
        structure = pos.findClosestByPath(FIND_STRUCTURES, {
          filter: structure =>
            (structure.structureType !== STRUCTURE_RAMPART && structure.hits < structure.hitsMax * i) ||
            (structure.structureType === STRUCTURE_RAMPART && structure.hits < structure.hitsMax * i * 300) // Ramparts are 300 times smaller than wall
        });
      }
    }
    return structure;
  }

  public static getClosestEnemyByPath(fromThis: RoomPosition, containsBodyPart?: BodyPartConstant): Creep | null {
    if (containsBodyPart) {
      return fromThis.findClosestByPath(FIND_HOSTILE_CREEPS, {
        filter: enemy => enemy.body.find(body => body.type === containsBodyPart) !== undefined
      });
    }
    return fromThis.findClosestByPath(FIND_HOSTILE_CREEPS);
  }

  public static getClosestByPathDamagedUnit(pos: RoomPosition): Creep | null {
    return pos.findClosestByPath(FIND_MY_CREEPS, { filter: creep => creep.hits < creep.hitsMax });
  }

  // --------------------------
  // Get Closest By Range Functions
  // Functions to return objects which are closest by range from position
  // --------------------------
  public static getClosestStructureToRepairByRange(pos: RoomPosition, damageProportion: number): Structure | null {
    let structure = pos.findClosestByRange(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_RAMPART && structure.hits < 5000 // Just choose low life ramparts first, as they degrade quickly
    });
    if (!structure) {
      structure = pos.findClosestByRange(FIND_STRUCTURES, {
        filter: structure =>
          structure.hits < structure.hitsMax * damageProportion &&
          structure.structureType !== STRUCTURE_WALL &&
          structure.structureType !== STRUCTURE_RAMPART
      });
    }
    return structure;
  }

  // --------------------------
  // Get Closest By Range Functions
  // Functions to return objects which are closest by range from position
  // --------------------------
  public static getClosestWallRampartToRepairByRange(pos: RoomPosition): Structure | null {
    let structure: AnyStructure | null = null;

    for (let i = 0.00001; i < 1 && !structure; i *= 2) {
      structure = pos.findClosestByRange(FIND_STRUCTURES, {
        filter: structure =>
          (structure.structureType !== STRUCTURE_RAMPART &&
            structure.hits < (structure.hitsMax * i * this.getDistanceToCenterOfRoom(structure.pos)) / 2) ||
          (structure.structureType === STRUCTURE_RAMPART &&
            structure.hits < (structure.hitsMax * i * 30 * this.getDistanceToCenterOfRoom(structure.pos)) / 2) // Distance from center of room, as walls are more important the closer they are to the center of the room
      });
    }
    return structure;
  }

  // --------------------------
  // Get Closest By Path Functions
  // Functions to return objects which are closest by path from position
  // --------------------------
  public static getClosestStructureToRepairByPath(pos: RoomPosition, damageProportion: number): Structure | null {
    let structure = pos.findClosestByPath(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_RAMPART && structure.hits < 5000 // Just choose low life ramparts first, as they degrade quickly
    });
    if (!structure) {
      structure = pos.findClosestByPath(FIND_STRUCTURES, {
        filter: structure =>
          structure.hits < structure.hitsMax * damageProportion &&
          structure.structureType !== STRUCTURE_WALL &&
          structure.structureType !== STRUCTURE_RAMPART
      });
    }
    return structure;
  }

  // --------------------------
  // Get Closest By Path Functions
  // Functions to return objects which are closest by path from position
  // --------------------------
  public static getClosestWallRampartToRepairByPath(pos: RoomPosition): Structure | null {
    let structure: AnyStructure | null = null;

    for (let i = 0.00001; i < 1 && !structure; i *= 2) {
      structure = pos.findClosestByPath(FIND_STRUCTURES, {
        filter: structure =>
          (structure.structureType !== STRUCTURE_RAMPART &&
            structure.hits < (structure.hitsMax * i * this.getDistanceToCenterOfRoom(structure.pos)) / 2) ||
          (structure.structureType === STRUCTURE_RAMPART &&
            structure.hits < (structure.hitsMax * i * 30 * this.getDistanceToCenterOfRoom(structure.pos)) / 2) // Distance from center of room, as walls are more important the closer they are to the center of the room
      });
    }
    return structure;
  }

  // Used for debugging, to see all walls and ramparts in the room, and their order of repair
  public static getClosestWallRampartToRepairAll(room: Room): Structure[] {
    let structures: AnyStructure[] = [];

    for (let i = 0.00001; i < 1; i *= 2) {
      structures = room.find(FIND_STRUCTURES, {
        filter: structure =>
          (structure.structureType === STRUCTURE_WALL &&
            structure.hits < (structure.hitsMax * i * this.getDistanceToCenterOfRoom(structure.pos)) / 2) ||
          (structure.structureType === STRUCTURE_RAMPART &&
            structure.hits < (structure.hitsMax * i * 30 * this.getDistanceToCenterOfRoom(structure.pos)) / 2) // Distance from center of room, as walls are more important the closer they are to the center of the room
      });
    }
    console.log(JSON.stringify(structures.map(s => ({ id: s.id, hits: s.hits, hitsMax: s.hitsMax, pos: s.pos }))));
    // Use room visual to draw index on each structure
    for (let i = 0; i < structures.length; i++) {
      const structure = structures[i];
      room.visual.text(i.toString(), structure.pos.x, structure.pos.y, { color: "red", font: 0.5 });
    }
    return structures;
  }

  private static getDistanceToCenterOfRoom(pos: RoomPosition): number {
    const dx = pos.x - 25;
    const dy = pos.y - 25;
    return Math.sqrt(dx * dx + dy * dy);
  }

  public static getClosestEnemyByRange(fromThis: RoomPosition, containsBodyPart?: BodyPartConstant): Creep | null {
    if (containsBodyPart) {
      return fromThis.findClosestByRange(FIND_HOSTILE_CREEPS, {
        filter: enemy => enemy.body.find(body => body.type === containsBodyPart) !== undefined
      });
    }
    return fromThis.findClosestByRange(FIND_HOSTILE_CREEPS);
  }

  public static getClosestMyCreepByRange(fromThis: RoomPosition, containsBodyPart?: BodyPartConstant): Creep | null {
    if (containsBodyPart) {
      return fromThis.findClosestByRange(FIND_MY_CREEPS, {
        filter: creep => creep.body.find(body => body.type === containsBodyPart) !== undefined
      });
    }
    return fromThis.findClosestByRange(FIND_MY_CREEPS);
  }

  public static getClosestByRangeDamagedUnit(pos: RoomPosition): Creep | null {
    return pos.findClosestByRange(FIND_MY_CREEPS, { filter: creep => creep.hits < creep.hitsMax });
  }

  public static usesLayoutFixedExtension(room: Room): boolean {
    // Check if this room uses LayoutFixedExtension by checking the build plans
    const buildData = Helper.getCashedMemory(`Base-Build-Plans-${room.name}`, {
      plans: [],
      ramparts: []
    });

    if (!buildData || !buildData.plans) {
      return false;
    }

    // LayoutFixedExtension is associated with COLOR_YELLOW secondary color
    return buildData.plans.some((plan: any) => plan.secondaryColor === COLOR_YELLOW);
  }

  public static getRoomContainers(room: Room): StructureContainer[] {
    const containers = room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });
    return containers as StructureContainer[];
  }

  // public static getSources(room: Room, onlyActive: boolean = false): Source[] {
  //  let roomMemory = MemoryManager.getRoomMemory(room.name);
  //  let sources: Source[] = [];
  //  if (!roomMemory)
  //    return [];
  //  for (let sourceIndex in roomMemory.sources) {
  //    let source = Game.getObjectById(roomMemory.sources[sourceIndex]);
  //    if (source instanceof Source && (onlyActive ? source.energy > 0 : true)) {
  //      sources.push(source)
  //    }
  //  }
  //  return sources;
  // }

  // public static getClosestEmptyDeposit(probe: Probe): Structure | null {
  //  let deposit;
  //  if (probe.carry[RESOURCE_ENERGY] === 0) {
  //    deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //      filter: structure => ((structure.structureType === STRUCTURE_CONTAINER || structure.structureType === STRUCTURE_STORAGE || structure.structureType === STRUCTURE_TERMINAL)
  //        && _.sum(structure.store) < structure.storeCapacity)
  //    });
  //  }
  //  else {
  //    deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //      filter: structure => (structure.structureType === STRUCTURE_CONTAINER && _.sum(structure.store) < structure.storeCapacity)
  //        || ((structure.structureType === STRUCTURE_SPAWN ||
  //          structure.structureType === STRUCTURE_EXTENSION ||
  //          structure.structureType === STRUCTURE_LINK) && structure.energy < structure.energyCapacity)
  //    });
  //  }
  //  return deposit;
  // }

  // public static getClosestFilledDeposit(probe: Probe, excludeControllerDeposit: boolean, excludeStorage: boolean, excludeSpawn: boolean, whenIsMoreThan: number, onlyEnergy: boolean = true): Structure | null {
  //  let controllerDeposits = GetRoomObjects.getDepositNextToController(probe.room, false);
  //  let previousDeposit = probe.room.find(FIND_STRUCTURES, {
  //    filter: structure => structure.id === probe.memory.targetId &&
  //      ((structure.structureType === STRUCTURE_LINK && structure.energy > whenIsMoreThan) ||
  //      ((structure.structureType === STRUCTURE_CONTAINER || (!excludeStorage && structure.structureType === STRUCTURE_STORAGE))
  //          && ((onlyEnergy && structure.store[RESOURCE_ENERGY] > whenIsMoreThan) || (!onlyEnergy && _.sum(structure.store) > whenIsMoreThan))))
  //  })[0]
  //  if (previousDeposit) {
  //    return previousDeposit;
  //  } else {
  //    let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //      filter: structure =>
  //        ((((structure.structureType === STRUCTURE_CONTAINER ||
  //          (!excludeStorage && structure.structureType === STRUCTURE_STORAGE))
  //          && ((onlyEnergy && structure.store[RESOURCE_ENERGY] > whenIsMoreThan) || (!onlyEnergy && _.sum(structure.store) > whenIsMoreThan))) ||
  //          (structure.structureType === STRUCTURE_LINK && structure.energy > whenIsMoreThan))
  //          && (!excludeControllerDeposit || (excludeControllerDeposit && !controllerDeposits.includes(structure))))
  //    })
  //    if (!deposit && !excludeSpawn) {
  //      deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //        filter: structure => structure.structureType === STRUCTURE_SPAWN && structure.energy > whenIsMoreThan
  //      })
  //    }
  //    return deposit;
  //  }
  // }

  // public static getSpawn(probeOrRoom: Probe | Room): StructureSpawn | null {
  //  let target: any;
  //  if (probeOrRoom instanceof Probe) {
  //    target = probeOrRoom.room.find(FIND_STRUCTURES, { filter: structure => (structure.structureType === STRUCTURE_SPAWN) })[0];
  //  }
  //  else {
  //    target = probeOrRoom.find(FIND_STRUCTURES, { filter: structure => (structure.structureType === STRUCTURE_SPAWN) })[0];
  //  }
  //  return target instanceof StructureSpawn ? target : null;
  // }

  // public static getClosestConstructionSite(probe: Probe): ConstructionSite | null {
  //  let construnctionSite = probe.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  //  return construnctionSite;
  // }

  // public static getStructureToSupplyForReproduction(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => ((
  //      structure.structureType === STRUCTURE_SPAWN ||
  //      structure.structureType === STRUCTURE_EXTENSION) && structure.energy < structure.energyCapacity)
  //  });
  //  return deposit
  // }

  // public static getTowerToSupply(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => (
  //    (structure.structureType === STRUCTURE_TOWER && structure.energy < structure.energyCapacity * 0.90))
  //  });
  //  return deposit
  // }

  // public static getStructureDepositToSupply(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => (
  //      ((structure.structureType === STRUCTURE_STORAGE ||
  //        structure.structureType === STRUCTURE_TERMINAL) && _.sum(structure.store) < structure.storeCapacity))
  //  });
  //  return deposit
  // }

  // public static getStructureToSupplyPriority(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => (
  //      (structure.structureType === STRUCTURE_TOWER && structure.energy < structure.energyCapacity * 0.45)
  //    )
  //  });
  //  return deposit
  // }

  // public static getStructureToSupplyByRemoteWorkers(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => ((
  //      structure.structureType === STRUCTURE_SPAWN ||
  //      structure.structureType === STRUCTURE_EXTENSION ||
  //      structure.structureType === STRUCTURE_LINK) && structure.energy < structure.energyCapacity) ||
  //      ((structure.structureType === STRUCTURE_STORAGE ||
  //        structure.structureType === STRUCTURE_CONTAINER ||
  //        structure.structureType === STRUCTURE_TERMINAL) && _.sum(structure.store) < structure.storeCapacity) ||
  //      (structure.structureType === STRUCTURE_TOWER && structure.energy < structure.energyCapacity * 0.75)
  //  });
  //  return deposit
  // }

  // public static getClosestTombstone(pos: RoomPosition): Tombstone | null {
  //  let tombstone = pos.findClosestByPath(FIND_TOMBSTONES, {
  //    filter: (res) =>
  //      (res.store[RESOURCE_ENERGY] === _.sum(res.store) && res.store[RESOURCE_ENERGY] > 100) || //If just energy, don't bother if is less than 100
  //      (res.store[RESOURCE_ENERGY] !== _.sum(res.store)) //Collect tomstone if it has minerals
  //  });
  //  return tombstone;
  // }
}
