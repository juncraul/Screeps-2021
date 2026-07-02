import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask from "Tasks/SpawnTask";
import BaseArea from "../BaseArea";

export default abstract class HarvestArea extends BaseArea {
  controllerLevel: number;
  harvestPosition: RoomPosition;
  maxWorkerCount: number;
  containerNextToHarvestArea: StructureContainer | null;
  containerConstructionSiteNextToHarvestArea: ConstructionSite | null;
  maxEmptySpaceAroundHarvestArea: number;

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
    this.maxEmptySpaceAroundHarvestArea = Helper.getFreeAdjacentPositions(this.harvestPosition).length;
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    let allowedWorkerCount =
      this.maxWorkerCount + this.getNumberOfDyingCreeps() + (this.doWeNeedToReplaceWeakCreep() ? 1 : 0);
    allowedWorkerCount = this.containerConstructionSiteNextToHarvestArea
      ? allowedWorkerCount + this.maxEmptySpaceAroundHarvestArea - 1
      : allowedWorkerCount;

    if (this.creeps.length < allowedWorkerCount) {
      const task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }

    return tasksForThisArea;
  }

  public handleThisArea() {
    this.handleSetup();
    this.handleCreeps();
    this.checkForSuicide();
  }

  protected handleSetup() {
    if (!this.containerNextToHarvestArea && !this.containerConstructionSiteNextToHarvestArea) {
      const potentialPositionsNextToHarvestArea = Helper.getFreeAdjacentPositions(this.harvestPosition);
      // TODO: Need to work more on this logic, in case container gets destroyed and we already have extensions, a different place might be chosen.
      let maxPositionFound = -1;
      let positionForContainer: RoomPosition | null = null;
      for (const position of potentialPositionsNextToHarvestArea) {
        const possibleExtensionsForFuture = Helper.getFreeAdjacentPositions(position).length - 1; // -1 because we leave one empty for pathing to the harvest area
        if (possibleExtensionsForFuture > maxPositionFound) {
          maxPositionFound = possibleExtensionsForFuture;
          positionForContainer = position;
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
    if (this.creeps.length <= 1) return;
    const mostFreshCreep = this.creeps.reduce((prev, current) =>
      prev.ticksToLive! > current.ticksToLive! ? prev : current
    );
    const finalStageCreep = mostFreshCreep.body.length >= 5;
    const isTheReplacementCreepCloseToHarvestArea = mostFreshCreep.pos.getRangeTo(this.harvestPosition) <= 2;
    for (const creep of this.creeps) {
      if (creep.id !== mostFreshCreep.id && finalStageCreep && isTheReplacementCreepCloseToHarvestArea) {
        if (creep.willSuicideAtTick === undefined) {
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
