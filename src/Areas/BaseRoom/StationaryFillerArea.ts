import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";
import { GetRoomObjects } from "Helpers/GetRoomObjects";

export default class StationaryFillerArea extends BaseArea {
  containers: StructureContainer[];
  stationaryPositions: RoomPosition[];
  maxWorkerCount: number;

  constructor(room: Room) {
    super(
      "StationaryFillerArea",
      room.name,
      room.controller ? room.controller.pos : new RoomPosition(25, 25, room.name),
      room
    );
    this.containers = this.getContainers();
    this.stationaryPositions = this.getStationaryPositions();
    this.maxWorkerCount = this.stationaryPositions.length;
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];

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

  public handleThisArea() {
    for (let i = 0; i < this.creeps.length; i++) {
      // Move to stationary position if not already there
      if (this.stationaryPositions.length > 0) {
        const areWeAtAnyStationaryPosition = this.stationaryPositions.some(pos => this.creeps[i].pos.isEqualTo(pos));
        if (!areWeAtAnyStationaryPosition) {
          const emptyStationaryPositions = this.stationaryPositions.filter(pos => {
            return !this.creeps.some(creep => creep.pos.isEqualTo(pos));
          });
          if (emptyStationaryPositions.length > 0) {
            const targetPosition = emptyStationaryPositions[0];
            if (!this.creeps[i].pos.isEqualTo(targetPosition)) {
              this.creeps[i].addTask(new CreepTask(Activity.Move, targetPosition, null, null, true));
              continue;
            }
          }
        }
      }

      // Handle energy collection and deposit
      if (this.creeps[i].isEmpty()) {
        const container = this.creeps[i].pos.findInRange(this.containers, 1)[0];
        if (container && container.store.energy > 0) {
          this.creeps[i].addTask(new CreepTask(Activity.Collect, container.pos, null, null, true));
        } else {
          const middleExtensions = this.getMiddleExtensionsThatWeCanCollectFrom();
          if (middleExtensions.length > 0) {
            const closestMiddleExtension = this.creeps[i].pos.findInRange(middleExtensions, 1)[0];
            if (closestMiddleExtension) {
              this.creeps[i].addTask(new CreepTask(Activity.Collect, closestMiddleExtension.pos, null, null, true));
            }
          }
        }
      } else {
        const structureToDeposit = this.getNearbyExtensionOrSpawn(this.creeps[i].pos);
        if (structureToDeposit) {
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, structureToDeposit.pos, null, null, true));
        }
      }
    }
  }

  public static createThisAreaForRoom(room: Room): boolean {
    // Only create creeps if this room uses LayoutFixedExtension and we have a valid position
    return GetRoomObjects.usesLayoutFixedExtension(room);
  }

  private getContainers(): StructureContainer[] {
    // For LayoutFixedExtension, containers are at hardcoded positions relative to the base anchor
    // The layout has containers at (1,3) and (5,3) relative to anchor at (3,3)
    // We'll use the container at (1,3) for now
    const plan = this.getFixedExtensionBuildPlan();
    if (!plan) return [];
    const planStartX = plan.x - 3;
    const planStartY = plan.y - 3;

    const containerPositions: RoomPosition[] = [];
    containerPositions.push(new RoomPosition(planStartX + 1, planStartY + 3, this.room.name));
    containerPositions.push(new RoomPosition(planStartX + 5, planStartY + 3, this.room.name));

    const structures = this.room.find(FIND_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_CONTAINER && containerPositions.some(pos => s.pos.isEqualTo(pos))
    });

    return structures as StructureContainer[];
  }

  private getStationaryPositions(): RoomPosition[] {
    // Hardcoded position where the creep should stand
    // For LayoutFixedExtension, we'll place the filler at position (2,3) relative to anchor
    const plan = this.getFixedExtensionBuildPlan();
    if (!plan) return [];
    const planStartX = plan.x - 3;
    const planStartY = plan.y - 3;

    const stationaryPositions: RoomPosition[] = [];
    stationaryPositions.push(new RoomPosition(planStartX + 2, planStartY + 4, this.room.name));
    stationaryPositions.push(new RoomPosition(planStartX + 4, planStartY + 4, this.room.name));
    stationaryPositions.push(new RoomPosition(planStartX + 2, planStartY + 2, this.room.name));
    stationaryPositions.push(new RoomPosition(planStartX + 4, planStartY + 2, this.room.name));

    // visualize the stationary position for debugging
    stationaryPositions.forEach(stationaryPos => {
      this.room.visual.circle(stationaryPos.x, stationaryPos.y, { fill: "transparent", radius: 0.5, stroke: "yellow" });
    });

    return stationaryPositions;
  }

  private getMiddleExtensionsThatWeCanCollectFrom(): (StructureExtension | StructureSpawn)[] {
    const plan = this.getFixedExtensionBuildPlan();
    if (!plan) return [];

    // eslint-disable-next-line prettier/prettier
    const middleExtensionPos = [[plan.x, plan.y - 2], [plan.x, plan.y - 1], [plan.x, plan.y], [plan.x, plan.y + 1], [plan.x, plan.y + 2]]; // relative positions of middle extensions
    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_EXTENSION &&
        structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
        middleExtensionPos.some(pos => structure.pos.isEqualTo(new RoomPosition(pos[0], pos[1], this.room.name)))
    }) as StructureExtension[];

    const spawns = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_SPAWN &&
        structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
        middleExtensionPos.some(pos => structure.pos.isEqualTo(new RoomPosition(pos[0], pos[1], this.room.name)))
    }) as StructureSpawn[];

    return [...extensions, ...spawns];
  }

  private getNearbyExtensionOrSpawn(currentPosition: RoomPosition): StructureExtension | StructureSpawn | null {
    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_EXTENSION && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureExtension[];

    const spawns = this.room.find(FIND_MY_STRUCTURES, {
      filter: structure =>
        structure.structureType === STRUCTURE_SPAWN && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    }) as StructureSpawn[];

    const structures = [...extensions, ...spawns];

    // Filter to only nearby structures (within range 1)
    const nearbyStructures = structures.filter(structure => currentPosition.getRangeTo(structure.pos) <= 1);

    if (nearbyStructures.length === 0) {
      return null;
    }

    // Return the closest structure
    return currentPosition.findClosestByRange(nearbyStructures);
  }

  private getFixedExtensionBuildPlan(): any {
    const buildData = Helper.getCashedMemory(`Base-Build-Plans-${this.room.name}`, {
      plans: [],
      ramparts: []
    });

    if (!buildData || !buildData.plans || buildData.plans.length === 0) {
      return [];
    }

    // TODO: we need to find the correct build plan, not take the first one.
    return buildData.plans[0];
  }

  private createCreepForThisArea(): SpawnTask | null {
    // Create 1xCarry 1xMove creep as specified
    const bodyPartConstants: BodyPartConstant[] = [CARRY, MOVE];
    return new SpawnTask(CreepType.StationaryFiller, this.areaId, bodyPartConstants, this);
  }
}
