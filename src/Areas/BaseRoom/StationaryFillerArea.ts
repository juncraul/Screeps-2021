import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { CreepBase } from "CreepBase";

export default class StationaryFillerArea extends BaseArea {
  containers: StructureContainer[];
  stationaryPositions: RoomPosition[];
  maxWorkerCount: number;
  extensionsAndSpawns: (StructureExtension | StructureSpawn)[];

  constructor(room: Room) {
    super(
      "StationaryFillerArea",
      room.name,
      room.controller ? room.controller.pos : new RoomPosition(25, 25, room.name),
      room
    );
    this.containers = StationaryFillerArea.getContainers(room);
    this.extensionsAndSpawns = this.getExtensionsAndSpawns();
    this.stationaryPositions = this.getStationaryPositions();
    this.maxWorkerCount = this.extensionsAndSpawns.length < 7 ? 1 : this.stationaryPositions.length;
  }

  public handleThisArea() {
    this.handleCreeps();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    const roomController = GetRoomObjects.getRoomController(this.room);

    if (!roomController || roomController.level < 3) return tasksForThisArea;

    // Only create creeps if we have a valid position
    if (this.stationaryPositions.length === 0) {
      return tasksForThisArea;
    }

    if (this.creeps.length < this.maxWorkerCount) {
      const task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }
    return tasksForThisArea;
  }

  private handleCreeps() {
    for (const creep of this.creeps) {
      // Move to stationary position if not already there
      if (this.stationaryPositions.length > 0) {
        const areWeAtAnyStationaryPosition = this.stationaryPositions.some(pos => creep.pos.isEqualTo(pos));
        if (!areWeAtAnyStationaryPosition) {
          const emptyStationaryPositions = this.stationaryPositions.filter(pos => {
            return !this.creeps.some(c => c.pos.isEqualTo(pos));
          });
          if (emptyStationaryPositions.length > 0) {
            const targetPosition = emptyStationaryPositions[0];
            if (!creep.pos.isEqualTo(targetPosition)) {
              creep.addTask(new CreepTask(Activity.Move, targetPosition, null, null, true));
              continue;
            }
          }
        }
      }

      // Handle energy collection and deposit
      if (!creep.isFull()) {
        const droppedResourceUnderCreep = creep.pos
          .lookFor(LOOK_RESOURCES)
          .find(resource => resource.resourceType === RESOURCE_ENERGY);
        if (droppedResourceUnderCreep) {
          creep.addTask(new CreepTask(Activity.Pickup, droppedResourceUnderCreep.pos));
          continue;
        }
        const container = creep.pos.findInRange(this.containers, 1)[0];
        if (container && container.store.energy > 0) {
          creep.addTask(new CreepTask(Activity.Collect, container.pos, null, null, true));
        } else {
          const collectableExtensions = this.getExtensionsThatWeCanCollectFrom(creep);
          if (collectableExtensions.length > 0) {
            const closestExtension = creep.pos.findInRange(collectableExtensions, 1)[0];
            if (closestExtension) {
              creep.addTask(new CreepTask(Activity.Collect, closestExtension.pos, null, null, true));
            }
          }
        }
      } else {
        const haveContainerNearby = creep.pos.findInRange(this.containers, 1).length > 0;
        const structureToDeposit = this.getNearbyExtensionOrSpawn(creep.pos, !haveContainerNearby);
        if (structureToDeposit) {
          creep.addTask(new CreepTask(Activity.Deposit, structureToDeposit.pos, null, null, true));
        }
      }
    }
  }

  private getStationaryPositions(): RoomPosition[] {
    const plans = StationaryFillerArea.getFixedExtensionBuildPlans(this.room);
    if (plans.length === 0) return [];

    const stationaryPositions: RoomPosition[] = [];
    const seen = new Set<string>();

    for (const plan of plans) {
      const planStartX = plan.x - 3;
      const planStartY = plan.y - 3;
      const onlyOnePosition = this.extensionsAndSpawns.length < 7;
      const positions = onlyOnePosition
        ? [new RoomPosition(planStartX + 2, planStartY + 4, this.room.name)]
        : [
            new RoomPosition(planStartX + 2, planStartY + 4, this.room.name),
            new RoomPosition(planStartX + 4, planStartY + 4, this.room.name),
            new RoomPosition(planStartX + 2, planStartY + 2, this.room.name),
            new RoomPosition(planStartX + 4, planStartY + 2, this.room.name)
          ];

      for (const pos of positions) {
        const key = `${pos.x}:${pos.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        stationaryPositions.push(pos);
      }
    }

    // visualize the stationary position for debugging
    stationaryPositions.forEach(stationaryPos => {
      this.room.visual.circle(stationaryPos.x, stationaryPos.y, { fill: "transparent", radius: 0.5, stroke: "yellow" });
    });

    return stationaryPositions;
  }

  private getExtensionsThatWeCanCollectFrom(creep: CreepBase): StructureExtension[] {
    const plans = StationaryFillerArea.getFixedExtensionBuildPlans(this.room);
    if (plans.length === 0) return [];

    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_EXTENSION &&
        structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
        structure.pos.y < creep.pos.y
    });

    return extensions as StructureExtension[];
  }

  private getNearbyExtensionOrSpawn(
    currentPosition: RoomPosition,
    excludeAboveExtensions: boolean | null
  ): StructureExtension | StructureSpawn | null {
    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_EXTENSION && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    const spawns = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_SPAWN && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    const structures = [...extensions, ...spawns];

    // Filter to only nearby structures (within range 1)
    const nearbyStructures = structures.filter(structure => currentPosition.getRangeTo(structure.pos) <= 1);

    const candidateStructures = excludeAboveExtensions
      ? nearbyStructures.filter(
          structure => !(structure.structureType === STRUCTURE_EXTENSION && structure.pos.y < currentPosition.y)
        )
      : nearbyStructures;

    if (candidateStructures.length > 0) {
      return currentPosition.findClosestByRange(candidateStructures);
    }

    return null;
  }

  private createCreepForThisArea(): SpawnTask | null {
    // Create 1xCarry 1xMove creep as specified
    const bodyPartConstants: BodyPartConstant[] = [CARRY, MOVE];
    return new SpawnTask(CreepType.StationaryFiller, this.areaId, bodyPartConstants, this);
  }

  private getExtensionsAndSpawns(): (StructureExtension | StructureSpawn)[] {
    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_EXTENSION
    });
    const spawns = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure => structure.structureType === STRUCTURE_SPAWN
    });

    return [...extensions, ...spawns] as (StructureExtension | StructureSpawn)[];
  }

  public static createThisAreaForRoom(room: Room): boolean {
    // Only create creeps if this room uses LayoutFixedExtension and we have a valid position
    return GetRoomObjects.usesLayoutFixedExtension(room);
  }

  public static getContainers(room: Room): StructureContainer[] {
    const plans = StationaryFillerArea.getFixedExtensionBuildPlans(room);
    if (plans.length === 0) return [];

    const containerPositions: RoomPosition[] = [];
    for (const plan of plans) {
      const planStartX = plan.x - 3;
      const planStartY = plan.y - 3;

      containerPositions.push(new RoomPosition(planStartX + 3, planStartY + 1, room.name));
      containerPositions.push(new RoomPosition(planStartX + 1, planStartY + 3, room.name));
      containerPositions.push(new RoomPosition(planStartX + 5, planStartY + 3, room.name));
    }

    const structures = room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && containerPositions.some(pos => s.pos.isEqualTo(pos))
    });

    return structures as StructureContainer[];
  }

  public static getFixedExtensionBuildPlans(room: Room): any[] {
    const buildData = Helper.getCashedMemory(`Base-Build-Plans-${room.name}`, {
      plans: [],
      ramparts: []
    });

    if (!buildData || !buildData.plans || buildData.plans.length === 0) {
      return [];
    }

    return buildData.plans.filter((plan: any) => plan.secondaryColor === COLOR_YELLOW);
  }
}
