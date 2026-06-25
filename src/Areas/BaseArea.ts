import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import { CreepBase } from "../CreepBase";

export default class SourceArea {
  memoryType: string;
  areaId: string;
  areaPos: RoomPosition;
  creeps: CreepBase[];
  room: Room;

  constructor(memoryType: string, areaId: string, areaPos: RoomPosition, room: Room) {
    this.memoryType = memoryType;
    this.areaId = areaId;
    this.areaPos = areaPos;
    this.creeps = this.getCreepsAssignedToThisArea();
    this.room = room;
  }

  public handleNewCreepMemory(creepName: string): string {
    const creepNames = Helper.getCashedMemory(`${this.memoryType}-${this.areaId}`, []);
    creepNames.push(creepName);
    Helper.setCashedMemory(`${this.memoryType}-${this.areaId}`, creepNames);
    return creepName;
  }

  getCreepsAssignedToThisArea(): CreepBase[] {
    const creepsNames: string[] = Helper.getCashedMemory(`${this.memoryType}-${this.areaId}`, []);
    const creeps: CreepBase[] = [];
    for (let i: number = creepsNames.length - 1; i >= 0; i--) {
      const creep: Creep | null = Game.creeps[creepsNames[i]];
      if (creep && creep.hits > 0) {
        creeps.push(new CreepBase(creep));
      } else {
        // Clean up any dead creeps.
        creepsNames.splice(i, 1);
      }
    }
    Helper.setCashedMemory(`${this.memoryType}-${this.areaId}`, creepsNames);
    return creeps;
  }

  getGeneralStoreToCollectFrom(): (StructureContainer | Ruin)[] {
    const containers: (StructureContainer | Ruin)[] = [];
    const sources: Source[] = Game.rooms[this.areaPos.roomName].find(FIND_SOURCES);
    for (let i: number = sources.length - 1; i >= 0; i--) {
      const potentialContainer = sources[i].pos.findInRange(FIND_STRUCTURES, 1, {
        filter: { structureType: STRUCTURE_CONTAINER }
      })[0];
      if (potentialContainer && potentialContainer instanceof StructureContainer) {
        containers.push(potentialContainer);
      }
    }
    // Get all the containers on the edge which are used by remote carries.
    const edgeContainers: StructureContainer[] = Game.rooms[this.areaPos.roomName].find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER && (s.pos.x < 3 || s.pos.x > 47 || s.pos.y < 3 || s.pos.y > 47)
    }) as StructureContainer[];
    containers.push(...edgeContainers);

    const ruins: Ruin[] = Game.rooms[this.areaPos.roomName].find(FIND_RUINS);
    for (let i: number = ruins.length - 1; i >= 0; i--) {
      if (ruins[i].store.getUsedCapacity(RESOURCE_ENERGY) !== 0) containers.push(ruins[i]);
    }
    return containers;
  }

  getLimitedStoreToCollectFrom(): StructureLink[] {
    const links: StructureLink[] = [];
    const spawn = GetRoomObjects.getRoomSpawns(this.room, true)[0];
    const storage = GetRoomObjects.getRoomStorage(this.room);
    let potentialLink: StructureLink | null;
    if (spawn) {
      potentialLink = GetRoomObjects.getWithinRangeLink(spawn.pos, 4);
      if (potentialLink) {
        links.push(potentialLink);
      }
    }
    if (storage) {
      potentialLink = GetRoomObjects.getWithinRangeLink(storage.pos, 4);
      if (potentialLink) {
        links.push(potentialLink);
      }
    }
    return links;
  }

  getDroppedResourcesToCollectFrom(resourceType: ResourceConstant): Resource[] {
    const resources: Resource[] = Game.rooms[this.areaPos.roomName].find(FIND_DROPPED_RESOURCES, {
      filter: { resourceType }
    });
    return resources;
  }

  getNumberOfDyingCreeps(): number {
    return this.creeps.filter(function (creep) {
      return creep.ticksToLive && creep.ticksToLive < 75;
    }).length;
  }
}
