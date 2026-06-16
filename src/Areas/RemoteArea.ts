import { Helper } from "Helpers/Helper";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { CreepBase } from "CreepBase";

export default class RemoteArea extends BaseArea {
  private static readonly ROOM_NAME_PATTERN = /^[WE]\d+[NS]\d+$/;

  controller: StructureController | null;
  roomName: string;
  sources: Source[];
  containers: StructureContainer[];
  containerConstructionSites: ConstructionSite[];
  baseRoom: Room;
  resources: Resource[];
  claimersPerRoom: number;
  harvestersPerSource: number;
  carriersPerRoom: number;
  repairersPerRoom: number;
  claimThisRoom: boolean;

  constructor(roomName: string, claimThisRoom: boolean, baseRoomName?: string) {
    super("RemoteArea", roomName, new RoomPosition(25, 25, roomName), Game.rooms[roomName]);
    this.roomName = roomName;
    this.baseRoom = this.findBaseRoom(baseRoomName);

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
    this.resources = [];
    // TODO: We still need to create a claimer even if we need to claim this room, if the room is not ours yet
    this.claimersPerRoom = claimThisRoom ? 0 : 1; // Default value, can be adjusted based on strategy
    // TODO: Find a proper way to increase harvester per source, we've incresed for this room because it is too far away from our base and we need more harvesters to make it work (creeps die too quickly)
    this.harvestersPerSource = 1; // Default value, can be adjusted based on strategy
    this.carriersPerRoom = claimThisRoom ? 0 : 1; // Default value, can be adjusted based on strategy
    this.repairersPerRoom = 1; // Default value, can be adjusted based on strategy
    this.claimThisRoom = claimThisRoom;

    if (Game.rooms[roomName]) {
      this.sources = GetRoomObjects.getRoomSources(Game.rooms[roomName]);
      this.resources = GetRoomObjects.getRoomDroppedResources(Game.rooms[roomName]);
      this.updateContainers();
    }
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];

    // Handle Claimer spawning
    if (
      this.controller &&
      this.controller.reservation &&
      this.controller.reservation.username === Helper.getUserName() &&
      this.controller.reservation.ticksToEnd < 2000
    ) {
      // Skip creating a claimer if already reserved by me and has plenty of ticks left.
    } else {
      const claimerCount = this.getCreepCountByType("Claimer");
      if (claimerCount < this.claimersPerRoom) {
        tasksForThisArea.push(this.createClaimer());
      }
    }

    if (
      this.sources.length > 0 &&
      this.getCreepCountByType("Harvester") < this.harvestersPerSource * this.sources.length
    ) {
      tasksForThisArea.push(this.createHarvester());
    }

    // Handle Carrier spawning
    const carrierCount = this.getCreepCountByType("Carrier");
    if (carrierCount < this.carriersPerRoom) {
      tasksForThisArea.push(this.createCarrier());
    }

    // Handle Repairer spawning for remote maintenance
    const repairerCount = this.getCreepCountByType("Repairer");
    if (repairerCount < this.repairersPerRoom && this.shouldSpawnRepairer()) {
      tasksForThisArea.push(this.createRepairer());
    }

    return tasksForThisArea;
  }

  public handleThisArea() {
    this.updateContainers();
    this.setup();
    this.handleInvaderDefenseFlag();
    this.drawLegend();

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
        case "Repairer":
          this.handleRepairer(this.creeps[i]);
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

  private drawLegend(): void {
    if (!this.room) {
      return;
    }

    const visual = this.room.visual;
    const x = 1;
    let y = 3;
    const title: TextStyle = { align: "left", opacity: 1, font: 0.6, color: "#ffffff" };
    const plain: TextStyle = { align: "left", opacity: 0.85, font: 0.5 };

    visual.text("=== Remote Room ===", x, y, title);
    y += 0.7;
    visual.text("Claimers " + this.getCreepCountByType("Claimer") + "/" + this.claimersPerRoom, x, y, plain);
    y += 0.7;
    visual.text(
      "Harvesters " + this.getCreepCountByType("Harvester") + "/" + this.harvestersPerSource * this.sources.length,
      x,
      y,
      plain
    );
    y += 0.7;
    visual.text("Carriers " + this.getCreepCountByType("Carrier") + "/" + this.carriersPerRoom, x, y, plain);
    y += 0.7;
    visual.text("Repairers " + this.getCreepCountByType("Repairer") + "/" + this.repairersPerRoom, x, y, plain);
    y += 0.7;
    visual.text("The base room is " + this.baseRoom.name, x, y, plain);
  }

  private setup() {
    for (const source of this.sources) {
      const container = GetRoomObjects.getWithinRangeContainer(source.pos, 2);
      const constructionSite = GetRoomObjects.getWithinRangeConstructionSite(source.pos, 1, STRUCTURE_CONTAINER);

      if (!container && !constructionSite) {
        const positionForContainer = Helper.getFreeAdjacentPositions(source.pos, this.room)[0];
        if (positionForContainer) {
          this.room.createConstructionSite(positionForContainer, STRUCTURE_CONTAINER);
        }
      }
    }
  }

  private handleInvaderDefenseFlag() {
    if (!this.room) {
      return;
    }

    const hostileInvaders = this.room.find(FIND_HOSTILE_CREEPS, {
      filter: creep => creep.owner && creep.owner.username === "Invader"
    });
    const invaderFlag = Game.flags["Attack-1-6-Invader-" + this.roomName];
    if (hostileInvaders.length === 0) {
      // Threat gone: remove managed invader-defense flag.
      if (invaderFlag) {
        invaderFlag.remove();
      }
      return;
    }

    // Create a managed invader-defense flag.
    if (!invaderFlag) {
      const targetPos = hostileInvaders[0].pos;
      const flagName = `Attack-1-6-Invader-${this.roomName}`;
      targetPos.createFlag(flagName, COLOR_RED, COLOR_BLUE);
    }
  }

  private handleClaimer(creep: CreepBase) {
    if (creep.pos.roomName !== this.roomName) {
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.roomName)));
    } else if (this.controller) {
      if (this.claimThisRoom) {
        creep.addTask(new CreepTask(Activity.Claim, this.controller.pos));
      } else {
        creep.addTask(new CreepTask(Activity.Reserve, this.controller.pos));
      }
    }
  }

  private handleHarvester(creep: CreepBase) {
    if (!creep.isFree()) return;

    // Look up or assign the source for this creep using per-source memory
    let targetSource = this.getSourceForCreep(creep.name);
    if (!targetSource) {
      targetSource = this.findSourceWithFewestHarvesters();
      if (!targetSource) return;
      this.assignHarvesterToSource(creep.name, targetSource.id);
    }

    const container = GetRoomObjects.getWithinRangeContainer(targetSource.pos, 2);
    const constructionSite = GetRoomObjects.getWithinRangeConstructionSite(targetSource.pos, 1, STRUCTURE_CONTAINER);

    if (constructionSite) {
      if (creep.isFull()) {
        creep.addTask(new CreepTask(Activity.Construct, constructionSite.pos));
      } else {
        creep.addTask(new CreepTask(Activity.Harvest, targetSource.pos));
      }
    } else if (container) {
      if (!Helper.isSamePosition(container.pos, creep.pos)) {
        creep.addTask(new CreepTask(Activity.Move, container.pos));
      } else {
        creep.addTask(new CreepTask(Activity.HarvestAndDeposit, targetSource.pos));
      }
    }
  }

  private handleCarrier(creep: CreepBase) {
    if (!creep.isFree()) return;

    if (creep.pos.roomName === this.baseRoom.name) {
      // We are at the base
      if (creep.isEmpty()) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.roomName)));
      } else {
        // Find closest deposit location in base room
        const depositLocation = this.findClosestDeposit(creep);
        if (depositLocation) {
          creep.addTask(new CreepTask(Activity.Deposit, depositLocation.pos));
        }
      }
    } else if (creep.pos.roomName === this.roomName) {
      // We are in the remote room
      if (creep.isFull()) {
        // Move to base room
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.baseRoom.name)));
      } else {
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
      }
    }
  }

  private handleRepairer(creep: CreepBase) {
    if (!creep.isFree()) return;

    if (creep.isEmpty()) {
      const energySource = this.findNearbyRemoteEnergy(creep);
      if (energySource) {
        creep.addTask(new CreepTask(Activity.Collect, energySource.pos));
        return;
      }

      const fallbackSource = creep.pos.findClosestByRange(this.sources);
      if (fallbackSource) {
        creep.addTask(new CreepTask(Activity.Harvest, fallbackSource.pos));
      }
      return;
    }

    const criticalStructure = GetRoomObjects.getClosestStructureToRepairByRange(creep.pos, 0.4);
    if (criticalStructure) {
      creep.addTask(new CreepTask(Activity.Repair, criticalStructure.pos));
      return;
    }

    const constructionSite = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
    if (constructionSite) {
      creep.addTask(new CreepTask(Activity.Construct, constructionSite.pos));
      return;
    }

    const nonCriticalStructure = GetRoomObjects.getClosestStructureToRepairByRange(creep.pos, 0.7);
    if (nonCriticalStructure) {
      creep.addTask(new CreepTask(Activity.Repair, nonCriticalStructure.pos));
      return;
    }

    const anyDamagedStructure = GetRoomObjects.getClosestStructureToRepairByRange(creep.pos, 1, true);
    if (anyDamagedStructure) {
      creep.addTask(new CreepTask(Activity.Repair, anyDamagedStructure.pos));
    }
  }

  private getHarvestersForSource(sourceId: string): CreepBase[] {
    const key = `RemoteArea-Harvester-${sourceId}`;
    const creepNames: string[] = Helper.getCashedMemory(key, []);
    const creeps: CreepBase[] = [];
    for (let i = creepNames.length - 1; i >= 0; i--) {
      const creep = Game.creeps[creepNames[i]];
      if (creep && creep.hits > 0) {
        creeps.push(new CreepBase(creep));
      } else {
        creepNames.splice(i, 1);
      }
    }
    Helper.setCashedMemory(key, creepNames);
    return creeps;
  }

  private assignHarvesterToSource(creepName: string, sourceId: string): void {
    const key = `RemoteArea-Harvester-${sourceId}`;
    const creepNames: string[] = Helper.getCashedMemory(key, []);
    if (!creepNames.includes(creepName)) {
      creepNames.push(creepName);
      Helper.setCashedMemory(key, creepNames);
    }
  }

  private getSourceForCreep(creepName: string): Source | null {
    for (const source of this.sources) {
      const key = `RemoteArea-Harvester-${source.id}`;
      const creepNames: string[] = Helper.getCashedMemory(key, []);
      if (creepNames.includes(creepName)) {
        return source;
      }
    }
    return null;
  }

  private findSourceWithFewestHarvesters(): Source | null {
    let minCount = Infinity;
    let targetSource: Source | null = null;
    for (const source of this.sources) {
      const count = this.getHarvestersForSource(source.id).length;
      if (count < minCount) {
        minCount = count;
        targetSource = source;
      }
    }
    return targetSource;
  }

  private findBaseRoom(baseRoomName?: string): Room {
    if (baseRoomName && RemoteArea.ROOM_NAME_PATTERN.test(baseRoomName)) {
      const requestedRoom = Game.rooms[baseRoomName];
      if (requestedRoom && requestedRoom.controller && requestedRoom.controller.my) {
        const requestedRoomSpawns = GetRoomObjects.getRoomSpawns(requestedRoom, true);
        if (requestedRoomSpawns.length > 0) {
          return requestedRoom;
        }
      }
    }

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
    throw new Error("No base room found");
  }

  private updateContainers() {
    if (!this.room) return;

    this.containers = [];
    this.containerConstructionSites = [];
    this.resources = GetRoomObjects.getRoomDroppedResources(this.room);

    // Find all containers in the room
    const structures = this.room.find(FIND_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_CONTAINER
    });
    this.containers = structures as StructureContainer[];

    // Find all container construction sites
    const constructionSites = this.room.find(FIND_CONSTRUCTION_SITES, {
      filter: site => site.structureType === STRUCTURE_CONTAINER
    });
    this.containerConstructionSites = constructionSites;
  }

  private shouldSpawnRepairer(): boolean {
    if (!this.room) {
      return false;
    }

    if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
      return true;
    }

    return (
      this.room.find(FIND_STRUCTURES, {
        filter: structure =>
          structure.structureType !== STRUCTURE_WALL &&
          structure.structureType !== STRUCTURE_RAMPART &&
          structure.hits < structure.hitsMax * 0.5
      }).length > 0
    );
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

  private findNearbyRemoteEnergy(creep: CreepBase): StructureContainer | Resource | null {
    const resource = this.findResourceWithEnergy(creep);
    if (resource) {
      return resource;
    }

    const container = this.findContainerWithEnergy(creep);
    if (container) {
      return container;
    }

    return null;
  }

  private findClosestDeposit(creep: CreepBase): Structure | null {
    if (!this.baseRoom) return null;

    let bestStructure: Structure | null = null;
    let bestDistance = Infinity;

    // Check links
    const links = this.baseRoom.find(FIND_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_LINK && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
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
      filter: structure =>
        structure.structureType === STRUCTURE_CONTAINER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
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
    const bodyPartConstants: BodyPartConstant[] = [];
    const segments = Math.min(3, Math.floor(this.baseRoom.energyCapacityAvailable / 650));
    for (let i = 0; i < segments; i++) bodyPartConstants.push(CLAIM);
    for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);

    return new SpawnTask(
      SpawnType.Claimer,
      this.areaId,
      "Claimer",
      bodyPartConstants,
      this,
      "Claimer-" + this.roomName
    );
  }

  private createHarvester(): SpawnTask {
    // plain=1,2  road=1,1  swamp=5,6
    const bodyPartConstants: BodyPartConstant[] = [];
    const segments = Math.min(5, Math.floor((this.baseRoom.energyCapacityAvailable - 50) / 150));
    for (let i = 0; i < segments; i++) bodyPartConstants.push(WORK);
    bodyPartConstants.push(CARRY);
    for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);

    return new SpawnTask(
      SpawnType.Harvester,
      this.areaId,
      "Harvester",
      bodyPartConstants,
      this,
      "Harvester-" + this.roomName
    );
  }

  private createCarrier(): SpawnTask {
    const bodyPartConstants: BodyPartConstant[] = [];
    const segments = Math.min(12, Math.floor(this.baseRoom.energyCapacityAvailable / 100));
    for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
    for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);
    return new SpawnTask(
      SpawnType.Carrier,
      this.areaId,
      "Carrier",
      bodyPartConstants,
      this,
      "Carrier-" + this.roomName
    );
  }

  private createRepairer(): SpawnTask {
    const bodyPartConstants: BodyPartConstant[] = [];
    const segments = Math.min(4, Math.floor(this.baseRoom.energyCapacityAvailable / 200));
    for (let i = 0; i < segments; i++) bodyPartConstants.push(WORK);
    for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
    for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);
    return new SpawnTask(
      SpawnType.Repairer,
      this.areaId,
      "Repairer",
      bodyPartConstants,
      this,
      "Repairer-" + this.roomName
    );
  }
}
