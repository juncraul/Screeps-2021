import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

export default abstract class HarvestArea extends BaseArea {
  controllerLevel: number;
  harvestPosition: RoomPosition;
  maxWorkerCount: number;
  containerNextToHarvestArea: StructureContainer | null;
  containerConstructionSiteNextToHarvestArea: ConstructionSite | null;

  constructor(memoryType: string, areaId: string, harvestPosition: RoomPosition, controller: StructureController) {
    super(
      memoryType,
      areaId,
      harvestPosition,
      harvestPosition.roomName ? Game.rooms[harvestPosition.roomName] : controller.room
    );
    this.controllerLevel = controller.level;
    this.harvestPosition = harvestPosition;
    this.maxWorkerCount = 1;
    this.containerNextToHarvestArea = GetRoomObjects.getWithinRangeContainer(harvestPosition, 2);
    this.containerConstructionSiteNextToHarvestArea = GetRoomObjects.getWithinRangeConstructionSite(
      harvestPosition,
      1,
      STRUCTURE_CONTAINER
    );
  }

  protected handleThisArea() {
    this.handleSetup();
    this.handleCreeps();
    this.checkForSuicide();
  }

  protected handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    const allowedWorkerCount =
      this.maxWorkerCount + this.getNumberOfDyingCreeps() + (this.doWeNeedToReplaceWeakCreep() ? 1 : 0);

    if (this.creeps.length < allowedWorkerCount) {
      const task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }

    return tasksForThisArea;
  }

  protected handleSetup() {
    if (this.controllerLevel < 3) return;
    const spawns = GetRoomObjects.getRoomSpawns(this.room, true);
    if (spawns.length === 0) return;
    if (!this.containerNextToHarvestArea && !this.containerConstructionSiteNextToHarvestArea) {
      const potentialPositionsNextToHarvestArea = Helper.getFreeAdjacentPositions(this.harvestPosition);
      // TODO: Need to work more on this logic, in case container gets destroyed and we already have extensions, a different place might be chosen.
      let maxPositionFound = -1;
      let positionForContainer: RoomPosition | null = null;
      let pathLengthToSpawn = Infinity;
      let positions: [RoomPosition, number, number][] = [];
      for (const position of potentialPositionsNextToHarvestArea) {
        const possibleExtensionsForFuture = Helper.getFreeAdjacentPositions(position).length - 1; // -1 because we leave one empty for pathing to the harvest area
        const pathToSpawn = Helper.simplePathFinderWithObstacles(position, spawns[0].pos).path.length;
        positions.push([position, possibleExtensionsForFuture, pathToSpawn]);
      }
      // Sort positions by possibleExtensionsForFuture descending, then by pathToSpawn ascending
      positions = positions.sort((a, b) => {
        if (b[1] !== a[1]) {
          return b[1] - a[1]; // Sort by possibleExtensionsForFuture descending
        }
        return a[2] - b[2]; // Sort by pathToSpawn ascending
      });
      for (const [position, possibleExtensionsForFuture, pathToSpawn] of positions) {
        if (possibleExtensionsForFuture > maxPositionFound) {
          maxPositionFound = possibleExtensionsForFuture;
          positionForContainer = position;
          pathLengthToSpawn = pathToSpawn;
        } else if (possibleExtensionsForFuture >= maxPositionFound - 1 && pathToSpawn < pathLengthToSpawn - 6) {
          // We can compromise 1 empty position, if the path to spawn is shorter with at least 6 steps.
          maxPositionFound = possibleExtensionsForFuture;
          positionForContainer = position;
          pathLengthToSpawn = pathToSpawn;
        }
      }
      if (positionForContainer) {
        this.room.createConstructionSite(positionForContainer, STRUCTURE_CONTAINER);
      }
    }
  }

  protected hasCarryCreepsInRoom(): boolean {
    const carryAreaMemoryKey = `CarryArea-${this.room.name}`;
    const carryCreepNames = Helper.getCashedMemory(carryAreaMemoryKey, []);
    return carryCreepNames.length > 0;
  }

  protected doWeNeedToReplaceWeakCreep(): boolean {
    if (this.creeps.length !== 1) {
      return false;
    }
    const creep = this.creeps[0];
    if (creep.body.length < 5 && this.room.energyCapacityAvailable >= 450) {
      return true;
    }
    return false;
  }

  protected checkForSuicide() {
    if (this.creeps.length <= 1 || this.room.energyCapacityAvailable < 1000) return;
    const mostFreshCreep = this.creeps.reduce((prev, current) =>
      prev.ticksToLive! > current.ticksToLive! ? prev : current
    );
    const finalStageCreep = mostFreshCreep.getNumberOfBodyPart(WORK) >= 5;
    const isTheReplacementCreepCloseToHarvestArea = mostFreshCreep.pos.getRangeTo(this.harvestPosition) <= 2;
    for (const creep of this.creeps) {
      if (creep.id !== mostFreshCreep.id && finalStageCreep && isTheReplacementCreepCloseToHarvestArea) {
        if (
          creep.willSuicideAtTick === undefined &&
          (creep.ticksToLive! < 100 || creep.getNumberOfBodyPart(WORK) < 5)
        ) {
          creep.addSuicideTime(Game.time + 3); // Give it 3 ticks before suicide
        }
      }
    }
  }

  protected handleCreepMoveAndHarvest(creep: any): void {
    if (this.containerNextToHarvestArea) {
      if (!Helper.isSamePosition(this.containerNextToHarvestArea.pos, creep.pos)) {
        creep.addTask(new CreepTask(Activity.Move, this.containerNextToHarvestArea.pos));
      } else {
        creep.addTask(new CreepTask(Activity.Harvest, this.harvestPosition));
      }
    }
  }

  protected abstract handleCreeps(): void;
  protected abstract createCreepForThisArea(): SpawnTask | null;
}
