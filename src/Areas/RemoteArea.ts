import { Helper } from "Helpers/Helper";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "CreepBase";

export default class RemoteArea extends BaseArea {
  controller: StructureController | null;
  roomName: string;
  sources: Source[];
  containers: StructureContainer[];
  containerConstructionSites: ConstructionSite[];
  baseRoom: Room | null;
  resources: Resource[];

  constructor(roomName: string) {
    super("RemoteArea", roomName, new RoomPosition(25, 25, roomName), Game.rooms[roomName]);
    this.roomName = roomName;
    this.baseRoom = this.findBaseRoom();
    
    if (Game.rooms[roomName] && Game.rooms[roomName].controller) {
      this.controller = Game.rooms[roomName].controller!;
    } else {
      // We have no visiblity to this room.
      this.controller = null;
    }
    
    // Initialize sources and containers
    this.sources = [];
    this.containers = [];
    this.containerConstructionSites = [];
    
    if (Game.rooms[roomName]) {
      this.sources = GetRoomObjects.getRoomSources(Game.rooms[roomName]);
      this.updateContainers();
    }
    this.resources = GetRoomObjects.getRoomDroppedResources(Game.rooms[roomName]);
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    
    // Handle Claimer spawning
    if (
      this.controller &&
      this.controller.reservation &&
      this.controller.reservation.username === Helper.getUserName() &&
      this.controller.reservation.ticksToEnd < 1000
    ) {
      // Skip creating a claimer if already reserved by me and has plenty of ticks left.
    } else {
      const claimerCount = this.getCreepCountByType("Claimer");
      if (claimerCount < 1) {
        tasksForThisArea.push(this.createClaimer());
      }
    }
    
    // Handle Harvester spawning (one per source)
    const harvesterCount = this.getCreepCountByType("Harvester");
    if (this.sources.length > 0 && harvesterCount < this.sources.length) {
      console.log("RemoteArea: Creating harvester for room " + this.roomName);
      tasksForThisArea.push(this.createHarvester());
    }
    
    // Handle Carrier spawning
    const carrierCount = this.getCreepCountByType("Carrier");
    if (this.sources.length > 0 && carrierCount < 1) {
      console.log("RemoteArea: Creating carrier for room " + this.roomName);
      tasksForThisArea.push(this.createCarrier());
    }
    
    return tasksForThisArea;
  }

  public handleThisArea() {
    this.updateContainers();
    this.setup();
    
    for (let i = 0; i < this.creeps.length; i++) {
      if (!this.creeps[i].isFree()) continue;
      
      const creepType = this.getCreepType(this.creeps[i]);
      
      // Move to the remote room if not there (except for carriers who need to go to base)
      if (this.creeps[i].pos.roomName !== this.roomName && creepType !== "Carrier") {
        this.creeps[i].addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.roomName)));
        continue;
      }
      
      // Handle based on creep type
      switch (creepType) {
        case "Claimer":
          this.handleClaimer(this.creeps[i]);
          break;
        case "Harvester":
          this.handleHarvester(this.creeps[i]);
          break;
        case "Carrier":
          this.handleCarrier(this.creeps[i]);
          break;
        default:
          // Handle unknown creep type - default to claimer behavior
          if (this.controller) {
            this.creeps[i].addTask(new CreepTask(Activity.Reserve, this.controller.pos));
          }
          break;
      }
    }
  }

  private setup() {
    for (const source of this.sources) {
      const container = GetRoomObjects.getWithinRangeContainer(source.pos, 2);
      const constructionSite = GetRoomObjects.getWithinRangeConstructionSite(source.pos, 1, STRUCTURE_CONTAINER);
      
      if (!container && !constructionSite) {
        const positionForContainer = Helper.getFreeAdjacentPositions(source.pos, this.room!)[0];
        if (positionForContainer) {
          this.room!.createConstructionSite(positionForContainer, STRUCTURE_CONTAINER);
        }
      }
    }
  }

  private handleClaimer(creep: CreepBase) {
    if (creep.pos.roomName !== this.roomName) {
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.roomName)));
    } else if (this.controller) {
      creep.addTask(new CreepTask(Activity.Reserve, this.controller.pos));
    }
  }

  private handleHarvester(creep: CreepBase) {    
    if(!creep.isFree()) return;

    // Find all the other harvesters from sources and map them in a list
    const harvestersBySource: { [sourceId: string]: CreepBase[] } = {};
    for (const source of this.sources) {
      const otherHarvesters = this.creeps.filter(cree => Helper.isSamePosition(cree.memory.task.targetPlace, source.pos) && cree.memory.role === "Harvester" && cree.id !== creep.id);
      harvestersBySource[source.id] = otherHarvesters;
    }

    // Get the source with least harvesters
    let minHarvesters = Infinity;
    let targetSourceId = "";
    for (const [sourceId, harvesters] of Object.entries(harvestersBySource)) {
      if (harvesters.length < minHarvesters) {
        minHarvesters = harvesters.length;
        targetSourceId = sourceId;
      }
    }
    let targetSource = this.sources.find(source => source.id === targetSourceId) || null;

    const container = GetRoomObjects.getWithinRangeContainer(targetSource!.pos, 2);
    const constructionSite = GetRoomObjects.getWithinRangeConstructionSite(targetSource!.pos, 1, STRUCTURE_CONTAINER);
    
    if(constructionSite){
      if(creep.isFull()){
        // Build construction site
        creep.addTask(new CreepTask(Activity.Construct, constructionSite.pos));
      }
      else{
        // Harvest the source
        creep.addTask(new CreepTask(Activity.Harvest, targetSource!.pos));  
      }
    }
    else if (container){
      if (!Helper.isSamePosition(container.pos, creep.pos)) {
        creep.addTask(new CreepTask(Activity.Move, container.pos));
      } else {
        // Withdraw energy from container
        creep.addTask(new CreepTask(Activity.HarvestAndDeposit, targetSource!.pos));
      }
    }
    
  }

  private handleCarrier(creep: CreepBase) {
    if(!creep.isFree()) return;

    // If in remote room and carrying energy, return to base
    if (creep.isFull()) {
      if (!this.baseRoom) return;
      
      // Move to base room
      if (creep.pos.roomName !== this.baseRoom.name) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.baseRoom.name)));
        return;
      }
      
      // Find closest deposit location in base room
      const depositLocation = this.findClosestDeposit(creep);
      if (depositLocation) {
        creep.addTask(new CreepTask(Activity.Deposit, depositLocation.pos));
      }
    } else {
      // If empty or part empty, collect energy from remote room
      if (creep.pos.roomName !== this.roomName) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.roomName)));
        return;
      }
      
      // Collect from resources
      const sourceResource = this.findResourceWithEnergy(creep);
      if (sourceResource) {
        creep.addTask(new CreepTask(Activity.Collect, sourceResource.pos));
        return;
      }
      
      // Collect from containers
      const sourceContainer = this.findContainerWithEnergy(creep);
      if (sourceContainer) {
        creep.addTask(new CreepTask(Activity.Collect, sourceContainer.pos));
        return;
      }
      
      // If no containers, harvest directly from sources (fallback)
      // if (this.sources.length > 0) {
      //   const source = this.sources[0];
      //   const container = GetRoomObjects.getWithinRangeContainer(source.pos, 2);
      //   if (container) {
      //     if (!Helper.isSamePosition(container.pos, creep.pos)) {
      //       creep.addTask(new CreepTask(Activity.Move, container.pos));
      //     } else {
      //       creep.addTask(new CreepTask(Activity.Harvest, source.pos));
      //     }
      //   } else {
      //     creep.addTask(new CreepTask(Activity.Harvest, source.pos));
      //   }
      // }
    }
  }

  private findBaseRoom(): Room | null {
    // Find a room that has a spawn or storage - this is likely our base
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (room.controller && room.controller.my) {
        const spawns = GetRoomObjects.getRoomSpawns(room, true);
        
        if (spawns.length > 0) {
          return room;
        }
      }
    }
    return null;
  }

  private updateContainers() {
    if (!this.room) return;
    
    this.containers = [];
    this.containerConstructionSites = [];
    
    // Find all containers in the room
    const structures = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
    });
    this.containers = structures as StructureContainer[];
    
    // Find all container construction sites
    const constructionSites = this.room.find(FIND_CONSTRUCTION_SITES, {
      filter: (site) => site.structureType === STRUCTURE_CONTAINER
    });
    this.containerConstructionSites = constructionSites as ConstructionSite[];
  }

  private findContainerWithEnergy(creep: CreepBase): StructureContainer | null {
    let bestContainer: StructureContainer | null = null;
    let bestDistance = Infinity;
    
    for (const container of this.containers) {
      if (container.store.energy > 0) {
        const distance = creep.pos.getRangeTo(container.pos);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestContainer = container;
        }
      }
    }
    
    return bestContainer;
  }

  private findResourceWithEnergy(creep: CreepBase): Resource | null {
    let bestResource: Resource | null = null;
    let bestDistance = Infinity;
    
    for (const resource of this.resources) {
      if (resource.amount > 300) {
        const distance = creep.pos.getRangeTo(resource.pos);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestResource = resource;
        }
      }
    }
    
    return bestResource;
  }

  private findClosestDeposit(creep: CreepBase): Structure | null {
    if (!this.baseRoom) return null;
    
    let bestStructure: Structure | null = null;
    let bestDistance = Infinity;
    
    // Check links
    const links = this.baseRoom.find(FIND_STRUCTURES, {
      filter: (structure) => 
        structure.structureType === STRUCTURE_LINK && 
        (structure as StructureLink).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureLink[];
    
    for (const link of links) {
      const distance = creep.pos.getRangeTo(link.pos);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStructure = link;
      }
    }
    
    // Check storage
    const storage = GetRoomObjects.getRoomStorage(this.baseRoom);
    if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      const distance = creep.pos.getRangeTo(storage.pos);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStructure = storage;
      }
    }
    
    // Check containers
    const containers = this.baseRoom.find(FIND_STRUCTURES, {
      filter: (structure) => 
        structure.structureType === STRUCTURE_CONTAINER && 
        (structure as StructureContainer).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureContainer[];
    
    for (const container of containers) {
      const distance = creep.pos.getRangeTo(container.pos);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStructure = container;
      }
    }
    
    return bestStructure;
  }

  private getCreepType(creep: CreepBase): string {
    // Use the role name from creep memory to determine type
    return creep.roleName || "Claimer"; // Default to Claimer for backwards compatibility
  }

  private getCreepCountByType(type: string): number {
    let count = 0;
    for (const creep of this.creeps) {
      if (this.getCreepType(creep) === type) {
        count++;
      }
    }
    return count;
  }

  private createClaimer(): SpawnTask {
    const bodyPartConstants: BodyPartConstant[] = [CLAIM, CLAIM, MOVE, MOVE];
    return new SpawnTask(SpawnType.Claimer, this.areaId, "Claimer", bodyPartConstants, this);
  }

  private createHarvester(): SpawnTask { // plain=2,2  road=1,1  swamp=9,10  
    const bodyPartConstants: BodyPartConstant[] = [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];
    return new SpawnTask(SpawnType.Harvester, this.areaId, "Harvester", bodyPartConstants, this);
  }

  private createCarrier(): SpawnTask {
    const bodyPartConstants: BodyPartConstant[] = [
      CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
      MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
    ];
    return new SpawnTask(SpawnType.Carrier, this.areaId, "Carrier", bodyPartConstants, this);
  }
}
