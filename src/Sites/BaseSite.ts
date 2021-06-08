import { Helper } from "Helpers/Helper";
import { CreepBase } from "../CreepBase";

export default class SourceSite {
  memoryType: string;
  siteId: string;
  sitePos: RoomPosition;
  creeps: CreepBase[];

  constructor(memoryType: string, siteId: string, sitePos: RoomPosition) {
    this.memoryType = memoryType;
    this.siteId = siteId;
    this.sitePos = sitePos;
    this.creeps = this.getCreepsAssignedToThisSite();
  }

  getCreepsAssignedToThisSite(): CreepBase[] {
    let creepsNames: string[] = Helper.getCashedMemory(`${this.memoryType}-${this.siteId}`, []);
    let creeps: CreepBase[] = [];
    for (let i: number = creepsNames.length - 1; i >= 0; i--) {
      let creep: Creep | null = Game.creeps[creepsNames[i]];
      if (creep && creep.hits > 0) {
        creeps.push(new CreepBase(creep));
      } else {
        //Clean up any dead creeps.
        creepsNames.splice(i, 1);
      }
    }
    Helper.setCashedMemory(`${this.memoryType}-${this.siteId}`, creepsNames);
    return creeps;
  }
  
  getContainersToCollectFrom(): (StructureContainer | Ruin)[]{
    let containers: (StructureContainer | Ruin)[] = [];
    let sources: Source[] = Game.rooms[this.sitePos.roomName].find(FIND_SOURCES);
    for (let i: number = sources.length - 1; i >= 0; i --){
      let potentialContainer = sources[i].pos.findInRange(FIND_STRUCTURES, 1, { filter: { structureType: STRUCTURE_CONTAINER } })[0];
      if(potentialContainer && potentialContainer instanceof StructureContainer){
        containers.push(potentialContainer);
      }
    }
    let ruins: Ruin[] = Game.rooms[this.sitePos.roomName].find(FIND_RUINS);
    for (let i: number = ruins.length - 1; i >= 0; i --){
      if(ruins[i].store.getUsedCapacity(RESOURCE_ENERGY) != 0)
        containers.push(ruins[i]);
    }
    return containers;
  }

  getDroppedResourcesToCollectFrom(resourceType: ResourceConstant): Resource[]{
    let resources: Resource[] = Game.rooms[this.sitePos.roomName].find(FIND_DROPPED_RESOURCES, {filter: {resourceType: resourceType}});
    return resources;
  }

  getNumberOfDyingCreeps(): number{
    return this.creeps.filter(function (creep) {return creep.ticksToLive && creep.ticksToLive < 100}).length;
  }
}
