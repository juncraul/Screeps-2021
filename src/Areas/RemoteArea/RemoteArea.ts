import { Helper } from "Helpers/Helper";
import { GetRoomObjects, RemoteRoomMode } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./../BaseArea";
import { CreepBase } from "CreepBase";
import {
  assignHarvesterToSource,
  createHarvester,
  findSourceWithFewestHarvesters,
  getHarvestersForSource,
  getSourceForCreep,
  handleHarvester
} from "./RemoteSourceArea";
import {
  createCarrier,
  findClosestDeposit,
  findContainerWithEnergy,
  findNearbyRemoteEnergy,
  findResourceWithEnergy,
  handleCarrier
} from "./RemoteCarryArea";
import { createClaimer, handleClaimer, shouldSpawnClaimer } from "./RemoteClaimerArea";
import { createRepairer, handleRepairer, shouldSpawnRepairer } from "./RemoteRepairArea";
import { createMineralHarvester, handleMineralHarvester } from "./RemoteMineralHarvesterArea";
import { createMineralCarrier, handleMineralCarrier } from "./RemoteMineralCarrierArea";

export default class RemoteArea extends BaseArea {
  private static readonly ROOM_NAME_PATTERN = /^[WE]\d+[NS]\d+$/;
  private static readonly ROAD_WORK_DONE = "RemoteArea-RoadWorkDone-";
  private static readonly INVADER_DEFENDER = "Attack-1-6-Invader-";

  controller: StructureController | null;
  roomName: string;
  sources: Source[];
  containers: StructureContainer[];
  containerConstructionSites: ConstructionSite[];
  baseRoom: Room;
  baseRoomController: StructureController | null;
  resources: Resource[];
  claimersPerRoom: number;
  harvestersPerSource: number;
  carriersPerRoom: number;
  repairersPerRoom: number;
  remoteMode: RemoteRoomMode;
  mineralOnly: boolean;
  mineral: Mineral | null;
  mineralContainer: StructureContainer | null;
  mineralType: ResourceConstant | null;
  roadWorkDone: boolean;

  public static addRemoteRoomCollectedEnergy(roomName: string, amount: number): void {
    if (amount <= 0) {
      return;
    }

    const economy = Memory.remoteRoomEconomy ?? {};
    const current = economy[roomName] ?? { energyCollected: 0, energySpent: 0 };
    current.energyCollected += amount;
    economy[roomName] = current;
    Memory.remoteRoomEconomy = economy;
  }

  public static addRemoteRoomExpense(roomName: string, amount: number): void {
    if (amount <= 0) {
      return;
    }

    const economy = Memory.remoteRoomEconomy ?? {};
    const current = economy[roomName] ?? { energyCollected: 0, energySpent: 0 };
    current.energySpent += amount;
    economy[roomName] = current;
    Memory.remoteRoomEconomy = economy;
  }

  public static getRemoteRoomEconomy(roomName: string): RemoteRoomEconomy {
    const economy = Memory.remoteRoomEconomy ?? {};
    return economy[roomName] ?? { energyCollected: 0, energySpent: 0 };
  }

  constructor(roomName: string, remoteMode: RemoteRoomMode, baseRoomName?: string, mineralOnly = false) {
    super("RemoteArea", roomName, new RoomPosition(25, 25, roomName), Game.rooms[roomName]);
    this.roomName = roomName;
    this.baseRoom = this.findBaseRoom(baseRoomName);
    this.baseRoomController = this.baseRoom ? this.baseRoom.controller! : null;

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
    this.claimersPerRoom = 1;
    // TODO: Find a proper way to increase harvester per source, we've incresed for this room because it is too far away from our base and we need more harvesters to make it work (creeps die too quickly)
    this.harvestersPerSource = 1; // Default value, can be adjusted based on strategy
    this.carriersPerRoom = 1;
    this.repairersPerRoom = 1;
    this.remoteMode = remoteMode;
    this.mineralOnly = mineralOnly;
    this.mineral = null;
    this.mineralContainer = null;
    this.mineralType = null;
    this.roadWorkDone = Helper.getCashedMemory(`${RemoteArea.ROAD_WORK_DONE}${roomName}`, false);

    if (Game.rooms[roomName]) {
      this.sources = GetRoomObjects.getRoomSources(Game.rooms[roomName]);
      this.resources = GetRoomObjects.getRoomDroppedResources(Game.rooms[roomName]);
      this.updateContainers();
      if (mineralOnly) {
        this.mineral = GetRoomObjects.getRoomMineral(Game.rooms[roomName], false);
        this.mineralContainer = this.mineral ? GetRoomObjects.getWithinRangeContainer(this.mineral.pos, 2) : null;
        this.mineralType = this.mineral ? (this.mineral.mineralType as ResourceConstant) : null;
      }
    }

    if (remoteMode === RemoteRoomMode.Claim) {
      this.claimersPerRoom = this.room?.controller?.owner ? 0 : 1;
      this.carriersPerRoom = 0;
    } else if (remoteMode === RemoteRoomMode.ReserveAttack) {
      this.harvestersPerSource = 0;
      this.carriersPerRoom = 0;
      this.repairersPerRoom = 0;
    } else if (mineralOnly) {
      this.claimersPerRoom = 0;
      this.harvestersPerSource = 0;
      this.carriersPerRoom = 0;
      this.repairersPerRoom = 0;
    } else {
      const energyInRoom = this.totalEnergyInRoom();
      if (!this.baseRoomController || this.baseRoomController.level < 3) {
        // We have smaller carriers at this level.
        if (energyInRoom > 1000) {
          this.carriersPerRoom = 3;
        } else if (energyInRoom > 500) {
          this.carriersPerRoom = 2;
        }
      } else {
        if (energyInRoom > 4000) {
          this.carriersPerRoom = 3;
        } else if (energyInRoom > 2000) {
          this.carriersPerRoom = 2;
        }
      }
    }
    if (this.baseRoom.controller && this.baseRoom.controller.level < 3) {
      this.claimersPerRoom = 0;
    }
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    // Check if we have an invader flag
    const invaderFlag = Game.flags[RemoteArea.INVADER_DEFENDER + this.baseRoom.name];
    if (invaderFlag) {
      return [];
    }

    if (this.mineralOnly) {
      if (this.getCreepCountByType(CreepType.MineralHarvester) < 1) {
        const task = this.createMineralHarvester();
        if (task) tasksForThisArea.push(task);
      }
      if (this.getCreepCountByType(CreepType.MineralCarrier) < 1) {
        tasksForThisArea.push(this.createMineralCarrier());
      }
      return tasksForThisArea;
    }

    // Handle Harvester spawning
    if (
      this.sources.length > 0 &&
      this.getCreepCountByType(CreepType.Harvester) < this.harvestersPerSource * this.sources.length
    ) {
      tasksForThisArea.push(this.createHarvester());
    }

    // Handle Carrier spawning
    const carrierCount = this.getCreepCountByType(CreepType.Carrier);
    if (
      carrierCount < this.carriersPerRoom &&
      (this.containers.length > 0 || (this.controller && this.controller.level <= 3))
    ) {
      tasksForThisArea.push(this.createCarrier());
    }

    // Handle Repairer spawning for remote maintenance
    const repairerCount = this.getCreepCountByType(CreepType.Repairer);
    if (repairerCount < this.repairersPerRoom && this.shouldSpawnRepairer()) {
      tasksForThisArea.push(this.createRepairer());
    }

    // Handle Claimer spawning
    const claimers = this.creeps.filter(creep => creep.creepType === CreepType.Claimer);
    const extraClaimers =
      this.remoteMode === RemoteRoomMode.ReserveAttack &&
      claimers.length === 1 &&
      claimers[0].ticksToLive &&
      claimers[0].ticksToLive < 300
        ? 1
        : 0;
    const claimerCount = this.getCreepCountByType(CreepType.Claimer);
    if (claimerCount < this.claimersPerRoom + extraClaimers && this.shouldSpawnClaimer()) {
      const task = this.createClaimer();
      if (task) {
        tasksForThisArea.push(task);
      }
    }

    return tasksForThisArea;
  }

  public handleThisArea() {
    this.updateContainers();
    this.setup();
    this.handleInvaderDefenseFlag();
    this.drawLegend();
    this.drawMapLegend();

    for (let i = 0; i < this.creeps.length; i++) {
      this.suicideCreepDueToBrokenParts(this.creeps[i]);
      if (!this.creeps[i].isFree()) continue;

      const creepType = this.creeps[i].creepType;

      // Move to the remote room if not there (except for carriers who need to go to base)
      if (
        this.creeps[i].pos.roomName !== this.roomName &&
        creepType !== CreepType.Carrier &&
        creepType !== CreepType.MineralCarrier
      ) {
        this.creeps[i].addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.roomName)));
        continue;
      }

      // Handle based on creep type
      switch (creepType) {
        case CreepType.Claimer:
          this.handleClaimer(this.creeps[i]);
          break;
        case CreepType.Harvester:
          this.handleHarvester(this.creeps[i]);
          break;
        case CreepType.Carrier:
          this.handleCarrier(this.creeps[i]);
          break;
        case CreepType.Repairer:
          this.handleRepairer(this.creeps[i]);
          break;
        case CreepType.MineralHarvester:
          this.handleMineralHarvester(this.creeps[i]);
          break;
        case CreepType.MineralCarrier:
          this.handleMineralCarrier(this.creeps[i]);
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
    const economy = RemoteArea.getRemoteRoomEconomy(this.roomName);

    visual.text("=== Remote Room ===", x, y, title);
    y += 0.7;
    visual.text(`Energy collected: ${economy.energyCollected}`, x, y, plain);
    y += 0.7;
    visual.text(`Energy spent: ${economy.energySpent}`, x, y, plain);
    y += 0.7;
    visual.text(`Net energy: ${economy.energyCollected - economy.energySpent}`, x, y, plain);
    y += 0.7;
    if (this.mineralOnly) {
      visual.text("Mode: Mineral Only", x, y, plain);
      y += 0.7;
      visual.text("MineralHarvesters " + this.getCreepCountByType(CreepType.MineralHarvester) + "/1", x, y, plain);
      y += 0.7;
      visual.text("MineralCarriers " + this.getCreepCountByType(CreepType.MineralCarrier) + "/1", x, y, plain);
      y += 0.7;
      visual.text("Mineral: " + (this.mineralType ?? "unknown"), x, y, plain);
    } else {
      visual.text("Mode: " + this.remoteMode, x, y, plain);
      y += 0.7;
      visual.text("Claimers " + this.getCreepCountByType(CreepType.Claimer) + "/" + this.claimersPerRoom, x, y, plain);
      y += 0.7;
      visual.text(
        "Harvesters " +
          this.getCreepCountByType(CreepType.Harvester) +
          "/" +
          this.harvestersPerSource * this.sources.length,
        x,
        y,
        plain
      );
      y += 0.7;
      visual.text("Carriers " + this.getCreepCountByType(CreepType.Carrier) + "/" + this.carriersPerRoom, x, y, plain);
      y += 0.7;
      visual.text(
        "Repairers " + this.getCreepCountByType(CreepType.Repairer) + "/" + this.repairersPerRoom,
        x,
        y,
        plain
      );
    }
    y += 0.7;
    visual.text("The base room is " + this.baseRoom.name, x, y, plain);
  }

  private drawMapLegend(): void {
    if (!this.room) {
      return;
    }

    const visual = Game.map.visual;
    const topRightStyle: MapTextStyle = { align: "right", opacity: 1, fontSize: 5, color: "#ffffff" };
    const plain: MapTextStyle = {
      align: "left",
      opacity: 0.85,
      fontSize: 3,
      backgroundColor: "#000000",
      color: "#eeea0f"
    };
    const harvesterCount = this.getCreepCountByType(CreepType.Harvester);
    const carrierCount = this.getCreepCountByType(CreepType.Carrier);
    const claimerCount = this.getCreepCountByType(CreepType.Claimer);
    const repairerCount = this.getCreepCountByType(CreepType.Repairer);
    visual.text(
      `H/C/Cl/R: ${harvesterCount}/${carrierCount}/${claimerCount}/${repairerCount}`,
      new RoomPosition(49, 1, this.roomName),
      topRightStyle
    );

    const droppedResourceSummary = this.getDroppedResources();
    const containerResourceSummary = this.getContainerResources();
    droppedResourceSummary.forEach(([pos, amount]) => {
      visual.text(`${amount}`, pos, plain);
    });
    containerResourceSummary.forEach(([pos, amount]) => {
      visual.text(`${amount}`, pos, plain);
    });
  }

  private setup() {
    if (this.mineralOnly) {
      // In mineral mode, ensure a container exists next to the mineral deposit.
      if (this.room && this.mineral && !this.mineralContainer) {
        const site = GetRoomObjects.getWithinRangeConstructionSite(this.mineral.pos, 2, STRUCTURE_CONTAINER);
        if (!site) {
          const pos = Helper.getFreeAdjacentPositions(this.mineral.pos)[0];
          if (pos) this.room.createConstructionSite(pos, STRUCTURE_CONTAINER);
        }
      }
      return;
    }
    // Check controller level from base room
    if (this.baseRoom.controller && this.baseRoom.controller.level >= 4) {
      this.createRemoteRoadConnections();
    }

    // Do not create containers if base room controller level is less than 2
    if (this.baseRoom.controller && this.baseRoom.controller.level < 3) return;

    for (const source of this.sources) {
      const container = GetRoomObjects.getWithinRangeContainer(source.pos, 2);
      const constructionSite = GetRoomObjects.getWithinRangeConstructionSite(source.pos, 1, STRUCTURE_CONTAINER);

      if (!container && !constructionSite) {
        const positionForContainer = Helper.getFreeAdjacentPositions(source.pos)[0];
        if (positionForContainer) {
          this.room.createConstructionSite(positionForContainer, STRUCTURE_CONTAINER);
        }
      }
    }
  }

  private createRemoteRoadConnections(): void {
    if (!this.room) {
      return;
    }

    if (Game.time % 25 !== 0 || (this.roadWorkDone && Game.time % 1000 !== 0)) {
      return; // Only run every 25 ticks, and if road work is done, only check every 1000 ticks to see if we need to do more work.
    }

    const roadTarget = this.getBaseRoadTarget();
    const starts: RoomPosition[] = [];

    this.containers.forEach(container => starts.push(container.pos));

    // Probably not needed, but just in case we want to create a road to the controller in the future, we can leave this here.
    // if (this.controller) {
    //   starts.push(this.controller.pos);
    // }

    const seen = new Set<string>();
    starts.forEach(start => {
      const key = `${start.roomName}:${start.x}:${start.y}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);

      const result = Helper.createRoadBetweenPoints(start, roadTarget, false, {
        goalRange: 1,
        maxOps: 6000,
        maxRooms: 8
      });

      console.log(
        `RemoteArea ${this.roomName}: Road creation from ${String(start)} to ${String(
          roadTarget
        )} - Remaining roads to build: ${result.remainingRoadsToBuild}`
      );
      if (result.remainingRoadsToBuild === 0) {
        Helper.setCashedMemory(`${RemoteArea.ROAD_WORK_DONE}${start.roomName}`, true);
        this.roadWorkDone = true;
      } else {
        Helper.setCashedMemory(`${RemoteArea.ROAD_WORK_DONE}${start.roomName}`, false);
        this.roadWorkDone = false;
      }
    });
  }

  private getBaseRoadTarget(): RoomPosition {
    const logisticsStructures = this.baseRoom.find(FIND_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_CONTAINER ||
        structure.structureType === STRUCTURE_STORAGE ||
        structure.structureType === STRUCTURE_LINK
    });

    const exitDirection = Game.map.findExit(this.baseRoom.name, this.roomName);
    if (exitDirection >= 0 && logisticsStructures.length > 0) {
      const exitPositions = this.baseRoom.find(exitDirection as ExitConstant);
      if (exitPositions.length > 0) {
        let bestTargetPos: RoomPosition | null = null;
        let bestDistance = Infinity;

        logisticsStructures.forEach(structure => {
          let nearestExitDistance = Infinity;
          exitPositions.forEach(exitPos => {
            const distance = structure.pos.getRangeTo(exitPos);
            if (distance < nearestExitDistance) {
              nearestExitDistance = distance;
            }
          });

          if (nearestExitDistance < bestDistance) {
            bestDistance = nearestExitDistance;
            bestTargetPos = structure.pos;
          }
        });

        if (bestTargetPos) {
          return bestTargetPos;
        }
      }
    }

    const storage = GetRoomObjects.getRoomStorage(this.baseRoom);
    if (storage) {
      return storage.pos;
    }

    if (logisticsStructures.length > 0) {
      const center = new RoomPosition(25, 25, this.baseRoom.name);
      const closestToCenter = center.findClosestByRange(logisticsStructures);
      if (closestToCenter) {
        return closestToCenter.pos;
      }
    }

    const spawn = GetRoomObjects.getRoomSpawns(this.baseRoom, true)[0];
    if (spawn) {
      return spawn.pos;
    }

    return new RoomPosition(25, 25, this.baseRoom.name);
  }

  private handleInvaderDefenseFlag() {
    if (!this.room) {
      return;
    }

    const hostileInvaders = this.room.find(FIND_HOSTILE_CREEPS, {
      filter: creep => creep.owner && creep.owner.username === "Invader"
    });
    const invaderCores = this.room.find(FIND_HOSTILE_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_INVADER_CORE
    });
    const invaderFlag = Game.flags[RemoteArea.INVADER_DEFENDER + this.baseRoom.name + "-" + this.roomName];
    if (hostileInvaders.length === 0 && invaderCores.length === 0) {
      // Threat gone: remove managed invader-defense flag.
      if (invaderFlag) {
        invaderFlag.remove();
      }
      return;
    }

    // Create a managed invader-defense flag.
    if (!invaderFlag) {
      const targetPos = hostileInvaders[0] ? hostileInvaders[0].pos : invaderCores[0].pos;
      const flagName = `${RemoteArea.INVADER_DEFENDER}${this.baseRoom.name}-${this.roomName}`;
      targetPos.createFlag(flagName, COLOR_RED, COLOR_RED);
    }
  }

  private handleMineralHarvester(creep: CreepBase) {
    handleMineralHarvester(this, creep);
  }

  private handleMineralCarrier(creep: CreepBase) {
    handleMineralCarrier(this, creep);
  }

  private createMineralHarvester(): SpawnTask | null {
    return createMineralHarvester(this);
  }

  private createMineralCarrier(): SpawnTask {
    return createMineralCarrier(this);
  }

  public handleClaimer(creep: CreepBase) {
    handleClaimer(this, creep);
  }

  public shouldSpawnClaimer(): boolean {
    return shouldSpawnClaimer(this);
  }

  public handleHarvester(creep: CreepBase) {
    handleHarvester(this, creep);
  }

  public handleCarrier(creep: CreepBase) {
    handleCarrier(this, creep);
  }

  public handleRepairer(creep: CreepBase) {
    handleRepairer(this, creep);
  }

  public getHarvestersForSource(sourceId: string): CreepBase[] {
    return getHarvestersForSource(this, sourceId);
  }

  public assignHarvesterToSource(creepName: string, sourceId: string): void {
    assignHarvesterToSource(this, creepName, sourceId);
  }

  public getSourceForCreep(creepName: string): Source | null {
    return getSourceForCreep(this, creepName);
  }

  public findSourceWithFewestHarvesters(): Source | null {
    return findSourceWithFewestHarvesters(this);
  }

  private findBaseRoom(baseRoomName?: string): Room {
    if (baseRoomName && RemoteArea.ROOM_NAME_PATTERN.test(baseRoomName)) {
      const requestedRoom = Game.rooms[baseRoomName];
      if (requestedRoom) {
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

  public shouldSpawnRepairer(): boolean {
    return shouldSpawnRepairer(this);
  }

  public findContainerWithEnergy(creep: CreepBase): StructureContainer | null {
    return findContainerWithEnergy(this, creep, 150);
  }

  public findResourceWithEnergy(creep: CreepBase): Resource | null {
    return findResourceWithEnergy(this, creep, 150);
  }

  public findNearbyRemoteEnergy(creep: CreepBase): StructureContainer | Resource | null {
    return findNearbyRemoteEnergy(this, creep);
  }

  public findClosestDeposit(creep: CreepBase): Structure | Creep | null {
    return findClosestDeposit(this, creep);
  }

  private getCreepCountByType(type: CreepType): number {
    let count = 0;
    for (const creep of this.creeps) {
      if (creep.creepType === type) {
        count++;
      }
    }
    return count;
  }

  public createClaimer(): SpawnTask | null {
    return createClaimer(this);
  }

  public createHarvester(): SpawnTask {
    return createHarvester(this);
  }

  public createCarrier(): SpawnTask {
    return createCarrier(this);
  }

  public createRepairer(): SpawnTask {
    return createRepairer(this);
  }

  private getDroppedResources(): [RoomPosition, number][] {
    const amounts: [RoomPosition, number][] = [];
    for (const resource of this.resources) {
      amounts.push([resource.pos, resource.amount]);
    }
    return amounts;
  }

  private getContainerResources(): [RoomPosition, number][] {
    const amounts: [RoomPosition, number][] = [];
    for (const container of this.containers) {
      const storedResources = Object.keys(container.store) as ResourceConstant[];
      for (const resourceType of storedResources) {
        const amount = container.store.getUsedCapacity(resourceType);
        if (amount > 0) {
          amounts.push([container.pos, amount]);
        }
      }
    }
    return amounts;
  }

  private suicideCreepDueToBrokenParts(creep: CreepBase): boolean {
    if (creep.hits < creep.hitsMax / 2 && creep.willSuicideAtTick === undefined) {
      console.log(
        "Creep " +
          creep.name +
          " is critically damaged and will be suicided soon if not repaired. Current hits: " +
          creep.hits +
          "/" +
          creep.hitsMax +
          ". Pos " +
          String(creep.pos)
      );
      creep.addSuicideTime(Game.time + 10); // Give it 10 ticks to get repaired
      return true;
    }
    return false;
  }

  private totalEnergyInRoom(): number {
    if (!this.room) return 0;
    let totalEnergy = 0;
    // Add energy from containers
    for (const container of this.containers) {
      totalEnergy += container.store.getUsedCapacity(RESOURCE_ENERGY);
    }
    // Add energy from dropped resources
    for (const resource of this.resources) {
      if (resource.resourceType === RESOURCE_ENERGY) {
        totalEnergy += resource.amount;
      }
    }
    return totalEnergy;
  }
}
