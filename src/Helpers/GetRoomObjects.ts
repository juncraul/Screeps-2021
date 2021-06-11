
//Flags: Primary - Secondary
//PURPLE - PURPLE Reserve this room

export class GetRoomObjects {

  //--------------------------
  //Get All Functions
  //Functions to return all objects in the game
  //--------------------------
  public static getAllMyCreeps(includingSpawning: boolean = false): Creep[] {
    return _.filter(Game.creeps, (creep) => creep.spawning == includingSpawning);
  }

  public static getAllRoomsToReserve(): string[] {
    let flags = _.filter(Game.flags, (flag) => flag.color == COLOR_PURPLE);
    let roomNames: string[] = [];
    flags.forEach(flag => {
      roomNames.push(flag.pos.roomName)
    })
    return roomNames;
  }

  public static getAllRoomsWithSpawns(): Room[] {
    var mySpawns = Object.getOwnPropertyNames(Game.spawns)
    var roomsWithSpawns = []
    for (var i = 0; i < mySpawns.length; i++) {
      if(roomsWithSpawns.filter(room => room.name == Game.spawns[mySpawns[i]].room.name).length != 0)
        continue;//Skip adding the same room again if we have more than one spawner in the same room
      roomsWithSpawns.push(Game.spawns[mySpawns[i]].room)
    }
    return roomsWithSpawns;
  }

  //--------------------------
  //Get Room Functions
  //Functions to return objects within the room
  //--------------------------
  public static getRoomController(room: Room): StructureController | null {
    return room.controller ? room.controller : null;
  }

  public static getRoomSources(room: Room): Source[] {
    return room.find(FIND_SOURCES);
  }

  public static getRoomConstructions(room: Room, mine?: boolean): ConstructionSite[] {
    if(mine){
      return room.find(FIND_MY_CONSTRUCTION_SITES);
    }
    return room.find(FIND_CONSTRUCTION_SITES);
  }

  public static getRoomSpawns(room: Room, mine?: boolean): StructureSpawn[] {
    if(mine){
      return room.find(FIND_MY_SPAWNS);
    }
    return room.find(FIND_HOSTILE_SPAWNS);
  }

  public static getRoomExtensions(room: Room, mine?: boolean): StructureExtension[] {
    let structures: Structure[];
    let extensions: StructureExtension[] = [];
    if(mine){
      structures = room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_EXTENSION}});
    }else{
      structures = room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_EXTENSION}});
    }
    structures.forEach(structure => {
      if(structure instanceof StructureExtension){
        extensions.push(structure)
      }
    })
    return extensions;
  }
  
  public static getRoomCreepsMineNoTask(room: Room): Creep[] {
    return room.find(FIND_MY_CREEPS).filter(creep => creep.memory.task == null || creep.memory.task.taskDone);
  }
  
  public static getRoomCreeps(room: Room, mine?: boolean): Creep[] {
    if(mine){
      return room.find(FIND_MY_CREEPS);
    }
    return room.find(FIND_CREEPS);
  }

  public static getRoomMineral(room: Room, onlyActive: boolean = false): Mineral | null {
    let mineralExtractor = room.find(FIND_STRUCTURES, { filter: (structure) => { return (structure.structureType === STRUCTURE_EXTRACTOR) } })[0];
    let mineral = room.find(FIND_MINERALS, { filter: mineral => (onlyActive ? mineral.mineralAmount > 0 : true) })[0];
    if (mineralExtractor && mineral) {
      return mineral;
    } else {
      return null;
    }
  }

  public static getRoomTowers(room: Room): StructureTower[] {
    let towers = room.find(FIND_MY_STRUCTURES, { filter: object => { return object.structureType == STRUCTURE_TOWER } });
    let towerStructures: StructureTower[] = [];
    towers.forEach(function (tower) {
      if (tower instanceof StructureTower) {
        towerStructures.push(tower);
      }
    });
    return towerStructures;
  }

  public static getRoomStorage(room: Room): StructureStorage | null {
    let deposit = room.find(FIND_STRUCTURES, { filter: structure => (structure.structureType == STRUCTURE_STORAGE) })[0];
    return deposit instanceof StructureStorage ? deposit : null;
  }

  public static getRoomConstructionSites(room: Room): ConstructionSite[] {
    let construnctionSites = room.find(FIND_CONSTRUCTION_SITES);
    return construnctionSites;
  }

  public static getRoomDroppedResource(pos: RoomPosition): Resource | null {
    let resource = pos.findClosestByPath(FIND_DROPPED_RESOURCES, { filter: (res) => res.amount > 100 });
    return resource;
  }
  
  public static getRoomEnemy(room: Room): Creep | null {
    return room.find(FIND_HOSTILE_CREEPS)[0];
  }

  public static getRoomTerminal(room: Room): StructureTerminal | null {
    let structure = room.find(FIND_MY_STRUCTURES, { filter: structure => structure.structureType == STRUCTURE_TERMINAL })[0];
    if (structure instanceof StructureTerminal) {
      return structure;
    }
    return null;
  }

  public static geRoomtLabs(room: Room): StructureLab[] {
    let structures = room.find(FIND_MY_STRUCTURES, { filter: structure => structure.structureType == STRUCTURE_LAB });
    let labs: StructureLab[] = [];
    for (let i in structures) {
      let lab = structures[i];
      if (lab instanceof StructureLab) {
        labs.push(lab)
      }
    }
    return labs;
  }

  //--------------------------
  //Get Within Range Functions
  //Functions to return objects within a certain range from position
  //--------------------------
  public static getWithinRangeConstructionSite(pos: RoomPosition, range: number, structureType: StructureConstant): ConstructionSite | null {
    let construnctionSite = pos.findInRange(FIND_CONSTRUCTION_SITES, range, { filter: (structure: any) => structure.structureType == structureType })[0];
    return construnctionSite;
  }

  public static getWithinRangeStructures(roomPosition: RoomPosition, range: number, structureToLookFor: StructureConstant): Structure[] {
    let structures = roomPosition.findInRange(FIND_STRUCTURES, range);
    let structuresFiltered: Structure[];
    structuresFiltered = [];
    structures.forEach(function (structure) {
      if (structure.structureType == structureToLookFor) {
        structuresFiltered.push(structure);
      }
    })
    return structuresFiltered;
  }

  public static getWithinRangeContainer(pos: RoomPosition, range: number): StructureContainer | null {
    let structure = pos.findInRange(FIND_STRUCTURES, range, { filter: { structureType: STRUCTURE_CONTAINER } })[0]
    return (structure instanceof StructureContainer) ? structure : null;
  }

  public static getWithinRangeLink(pos: RoomPosition, range: number): StructureLink | null {
    let structure = pos.findInRange(FIND_STRUCTURES, range, { filter: { structureType: STRUCTURE_LINK } })[0]
    return (structure instanceof StructureLink) ? structure : null;
  }

  //--------------------------
  //Get Closest By Path Functions
  //Functions to return objects which are closest by path from position
  //--------------------------
  public static getClosestByPathStructureToRepair(pos: RoomPosition, damageProportionForNonWallRamp: number, includeRampartsWalls: boolean = false): Structure | null {
    let structure = pos.findClosestByPath(FIND_STRUCTURES, {
      filter: structure => (structure.hits < structure.hitsMax * damageProportionForNonWallRamp)
        && (structure.structureType != STRUCTURE_WALL && structure.structureType != STRUCTURE_RAMPART)
    });
    if (!structure && includeRampartsWalls) {
      for (let i = 0.00001; i < 1 && !structure; i *= 2) {
        structure = pos.findClosestByPath(FIND_STRUCTURES, {
          filter: structure =>
            (structure.structureType != STRUCTURE_RAMPART && structure.hits < structure.hitsMax * i) ||
            (structure.structureType == STRUCTURE_RAMPART && structure.hits < structure.hitsMax * i * 300) //Ramparts are 300 times smaller than wall
        })
      }
    }
    return structure;
  }

  public static getClosestEnemyByPath(fromThis: RoomPosition, containsBodyPart?: BodyPartConstant): Creep | null {
    if (containsBodyPart) {
      return fromThis.findClosestByPath(FIND_HOSTILE_CREEPS, {
        filter: enemy => enemy.body.find(body => body.type == containsBodyPart) != undefined
      });
    }
    return fromThis.findClosestByPath(FIND_HOSTILE_CREEPS);
  }

  public static getClosestByPathDamagedUnit(pos: RoomPosition): Creep | null {
    return pos.findClosestByPath(FIND_MY_CREEPS, { filter: (creep) => creep.hits < creep.hitsMax });
  }

  //--------------------------
  //Get Closest By Range Functions
  //Functions to return objects which are closest by path from position
  //--------------------------
  public static getClosestStructureToRepairByRange(pos: RoomPosition, damageProportionForNonWallRamp: number, includeRampartsWalls: boolean = false): Structure | null {
    let structure = pos.findClosestByRange(FIND_STRUCTURES, {
      filter: structure =>
        (structure.structureType == STRUCTURE_RAMPART && structure.hits < 5000) //Just choose low life ramparts first, as they degrade quickly
    })
    if (!structure) {
      structure = pos.findClosestByRange(FIND_STRUCTURES, {
        filter: structure => (structure.hits < structure.hitsMax * damageProportionForNonWallRamp)
          && (structure.structureType != STRUCTURE_WALL && structure.structureType != STRUCTURE_RAMPART)
      });
    }
    if (!structure && includeRampartsWalls) {
      for (let i = 0.00001; i < 1 && !structure; i *= 2) {
        structure = pos.findClosestByRange(FIND_STRUCTURES, {
          filter: structure =>
            (structure.structureType != STRUCTURE_RAMPART && structure.hits < structure.hitsMax * i) ||
            (structure.structureType == STRUCTURE_RAMPART && structure.hits < structure.hitsMax * i * 300) //Ramparts are 300 times smaller than wall
        })
      }
    }
    return structure;
  }

  public static getClosestEnemyByRange(fromThis: RoomPosition, containsBodyPart?: BodyPartConstant): Creep | null {
    if (containsBodyPart) {
      return fromThis.findClosestByRange(FIND_HOSTILE_CREEPS, {
        filter: enemy => enemy.body.find(body => body.type == containsBodyPart) != undefined
      });
    }
    return fromThis.findClosestByRange(FIND_HOSTILE_CREEPS);
  }
  
  public static getClosestByRangeDamagedUnit(pos: RoomPosition): Creep | null {
    return pos.findClosestByRange(FIND_MY_CREEPS, { filter: (creep) => creep.hits < creep.hitsMax });
  }

  //public static getSources(room: Room, onlyActive: boolean = false): Source[] {
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
  //}

  //public static getClosestEmptyDeposit(probe: Probe): Structure | null {
  //  let deposit;
  //  if (probe.carry[RESOURCE_ENERGY] == 0) {
  //    deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //      filter: structure => ((structure.structureType == STRUCTURE_CONTAINER || structure.structureType == STRUCTURE_STORAGE || structure.structureType == STRUCTURE_TERMINAL)
  //        && _.sum(structure.store) < structure.storeCapacity)
  //    });
  //  }
  //  else {
  //    deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //      filter: structure => (structure.structureType == STRUCTURE_CONTAINER && _.sum(structure.store) < structure.storeCapacity)
  //        || ((structure.structureType == STRUCTURE_SPAWN ||
  //          structure.structureType == STRUCTURE_EXTENSION ||
  //          structure.structureType == STRUCTURE_LINK) && structure.energy < structure.energyCapacity)
  //    });
  //  }
  //  return deposit;
  //}

  //public static getClosestFilledDeposit(probe: Probe, excludeControllerDeposit: boolean, excludeStorage: boolean, excludeSpawn: boolean, whenIsMoreThan: number, onlyEnergy: boolean = true): Structure | null {
  //  let controllerDeposits = GetRoomObjects.getDepositNextToController(probe.room, false);
  //  let previousDeposit = probe.room.find(FIND_STRUCTURES, {
  //    filter: structure => structure.id == probe.memory.targetId &&
  //      ((structure.structureType == STRUCTURE_LINK && structure.energy > whenIsMoreThan) ||
  //      ((structure.structureType == STRUCTURE_CONTAINER || (!excludeStorage && structure.structureType == STRUCTURE_STORAGE))
  //          && ((onlyEnergy && structure.store[RESOURCE_ENERGY] > whenIsMoreThan) || (!onlyEnergy && _.sum(structure.store) > whenIsMoreThan))))
  //  })[0]
  //  if (previousDeposit) {
  //    return previousDeposit;
  //  } else {
  //    let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //      filter: structure =>
  //        ((((structure.structureType == STRUCTURE_CONTAINER ||
  //          (!excludeStorage && structure.structureType == STRUCTURE_STORAGE))
  //          && ((onlyEnergy && structure.store[RESOURCE_ENERGY] > whenIsMoreThan) || (!onlyEnergy && _.sum(structure.store) > whenIsMoreThan))) ||
  //          (structure.structureType == STRUCTURE_LINK && structure.energy > whenIsMoreThan))
  //          && (!excludeControllerDeposit || (excludeControllerDeposit && !controllerDeposits.includes(structure))))
  //    })
  //    if (!deposit && !excludeSpawn) {
  //      deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //        filter: structure => structure.structureType == STRUCTURE_SPAWN && structure.energy > whenIsMoreThan
  //      })
  //    }
  //    return deposit;
  //  }
  //}

  //public static getSpawn(probeOrRoom: Probe | Room): StructureSpawn | null {
  //  let target: any;
  //  if (probeOrRoom instanceof Probe) {
  //    target = probeOrRoom.room.find(FIND_STRUCTURES, { filter: structure => (structure.structureType == STRUCTURE_SPAWN) })[0];
  //  }
  //  else {
  //    target = probeOrRoom.find(FIND_STRUCTURES, { filter: structure => (structure.structureType == STRUCTURE_SPAWN) })[0];
  //  }
  //  return target instanceof StructureSpawn ? target : null;
  //}

  //public static getClosestConstructionSite(probe: Probe): ConstructionSite | null {
  //  let construnctionSite = probe.pos.findClosestByPath(FIND_CONSTRUCTION_SITES);
  //  return construnctionSite;
  //}

  //public static getStructureToSupplyForReproduction(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => ((
  //      structure.structureType == STRUCTURE_SPAWN ||
  //      structure.structureType == STRUCTURE_EXTENSION) && structure.energy < structure.energyCapacity)
  //  });
  //  return deposit
  //}

  //public static getTowerToSupply(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => (
  //    (structure.structureType == STRUCTURE_TOWER && structure.energy < structure.energyCapacity * 0.90))
  //  });
  //  return deposit
  //}


  //public static getStructureDepositToSupply(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => (
  //      ((structure.structureType == STRUCTURE_STORAGE ||
  //        structure.structureType == STRUCTURE_TERMINAL) && _.sum(structure.store) < structure.storeCapacity))
  //  });
  //  return deposit
  //}

  //public static getStructureToSupplyPriority(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => (
  //      (structure.structureType == STRUCTURE_TOWER && structure.energy < structure.energyCapacity * 0.45)
  //    )
  //  });
  //  return deposit
  //}

  //public static getStructureToSupplyByRemoteWorkers(probe: Probe): Structure | null {
  //  let deposit = probe.pos.findClosestByPath(FIND_STRUCTURES, {
  //    filter: structure => ((
  //      structure.structureType == STRUCTURE_SPAWN ||
  //      structure.structureType == STRUCTURE_EXTENSION ||
  //      structure.structureType == STRUCTURE_LINK) && structure.energy < structure.energyCapacity) ||
  //      ((structure.structureType == STRUCTURE_STORAGE ||
  //        structure.structureType == STRUCTURE_CONTAINER ||
  //        structure.structureType == STRUCTURE_TERMINAL) && _.sum(structure.store) < structure.storeCapacity) ||
  //      (structure.structureType == STRUCTURE_TOWER && structure.energy < structure.energyCapacity * 0.75)
  //  });
  //  return deposit
  //}

  //public static getClosestTombstone(pos: RoomPosition): Tombstone | null {
  //  let tombstone = pos.findClosestByPath(FIND_TOMBSTONES, {
  //    filter: (res) =>
  //      (res.store[RESOURCE_ENERGY] == _.sum(res.store) && res.store[RESOURCE_ENERGY] > 100) || //If just energy, don't bother if is less than 100
  //      (res.store[RESOURCE_ENERGY] != _.sum(res.store)) //Collect tomstone if it has minerals
  //  });
  //  return tombstone;
  //}
}