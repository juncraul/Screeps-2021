import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

export default class SourceArea extends BaseArea {
  source: Source;
  maxWorkerCount: number;
  controllerLevel: number;
  containerNextToSource: StructureContainer | null;
  containerConstructionSiteNextToSource: ConstructionSite | null;
  linkNextToSource: StructureLink | null;
  linkConstructionSiteNextToSource: ConstructionSite | null;
  linksForDeposits: StructureLink[];
  maxEmptySpaceAroundSource: number;

  constructor(source: Source, controller: StructureController) {
    super("SourceArea", source.id, source.pos, source.room);
    this.source = source;
    this.maxWorkerCount = 1;
    this.controllerLevel = controller.level;
    this.containerNextToSource = GetRoomObjects.getWithinRangeContainer(source.pos, 2);
    this.containerConstructionSiteNextToSource = GetRoomObjects.getWithinRangeConstructionSite(
      source.pos,
      1,
      STRUCTURE_CONTAINER
    );
    this.linkConstructionSiteNextToSource = GetRoomObjects.getWithinRangeConstructionSite(
      source.pos,
      1,
      STRUCTURE_LINK
    );
    this.linkNextToSource = GetRoomObjects.getWithinRangeLink(source.pos, 2);
    this.linksForDeposits = this.populateLinksForDeposits();
    this.maxEmptySpaceAroundSource = Helper.getFreeAdjacentPositions(this.source.pos, this.room).length;
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasksForThisArea: SpawnTask[] = [];
    let allowedWorkerCount =
      this.maxWorkerCount + this.getNumberOfDyingCreeps() + (this.doWeNeedToReplaceWeakCreep() ? 1 : 0);
    allowedWorkerCount = this.containerConstructionSiteNextToSource
      ? allowedWorkerCount + this.maxEmptySpaceAroundSource - 1 // We can have more creeps if there is a construction site for a container, because they can stand around the source and build it at the same time.
      : allowedWorkerCount; // If there is a construction site for a container, we want to spawn an extra creep to help build it.
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
    this.handleLinks();
    this.checkForSuicide();
  }

  private handleSetup() {
    // Make sure we have a container next to the source
    if (!this.containerNextToSource && !this.containerConstructionSiteNextToSource) {
      const positionForContainer = Helper.getFreeAdjacentPositions(this.source.pos, this.room)[0];
      if (positionForContainer) {
        this.room.createConstructionSite(positionForContainer, STRUCTURE_CONTAINER);
      } else {
        console.log("SourceArea: No position for container next to source");
      }
    }

    // After controller level 5, we want to build links next to the source
    if (this.controllerLevel >= 5) {
      if (!this.linkNextToSource && !this.linkConstructionSiteNextToSource && this.containerNextToSource) {
        const positionForLink = Helper.getFreeAdjacentPositions(this.containerNextToSource.pos, this.room)[0];
        if (positionForLink) {
          this.room.createConstructionSite(positionForLink, STRUCTURE_LINK);
        } else {
          console.log("SourceArea: No position for link next to source");
        }
      }
    }
  }

  private handleCreeps() {
    for (let i = 0; i < this.creeps.length; i++) {
      if (!this.creeps[i].isFree()) continue;

      if (this.creeps[i].isFull()) {
        if (this.containerConstructionSiteNextToSource) {
          this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToSource.pos));
        }
        if (this.containerNextToSource) {
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToSource.pos));
        }
      } else {
        // When we are not full or partial full
        if (this.containerConstructionSiteNextToSource) {
          this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos));
        } else if (this.linkNextToSource && this.containerNextToSource) {
          if (!Helper.isSamePosition(this.containerNextToSource.pos, this.creeps[i].pos)) {
            this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos));
          } else {
            this.creeps[i].addTask(
              new CreepTask(Activity.HarvestAndDeposit, this.source.pos, this.linkNextToSource.pos)
            );
          }
        } else if (this.containerNextToSource) {
          if (!Helper.isSamePosition(this.containerNextToSource.pos, this.creeps[i].pos)) {
            this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos));
          } else {
            this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos));
          }
        }
      }

      // Old code
      // if (this.containerConstructionSiteNextToSource) {
      //   if (this.creeps[i].store.energy === 0 && this.creeps[i].isFree())
      //     this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos));
      //   if (this.creeps[i].isFull() && this.creeps[i].isFree())
      //     this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToSource.pos));
      // }
      // if (this.linkNextToSource && this.containerNextToSource) {
      // if (this.creeps[i].store.energy === 0 && this.creeps[i].isFree()) {
      //   if (!Helper.isSamePosition(this.containerNextToSource.pos, this.creeps[i].pos)) {
      //     this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos));
      //   } else {
      //     this.creeps[i].addTask(
      //       new CreepTask(Activity.HarvestAndDeposit, this.source.pos, this.linkNextToSource.pos)
      //     );
      //   }
      // }
      // } else if (this.containerNextToSource) {
      //   if (!this.creeps[i].isFull() && this.creeps[i].isFree()) {
      //     if (!Helper.isSamePosition(this.containerNextToSource.pos, this.creeps[i].pos)) {
      //       this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos));
      //     } else {
      //       this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos));
      //     }
      //   }
      //   if (this.creeps[i].isFull() && this.creeps[i].isFree())
      //     this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToSource.pos));
      // }
    }
  }

  private handleLinks() {
    if (!this.linkNextToSource || this.linkNextToSource.store.energy !== 800) return;
    for (let i = 0; i < this.linksForDeposits.length; i++) {
      if (this.linksForDeposits[i].store.energy > 300) continue;
      this.linkNextToSource.transferEnergy(this.linksForDeposits[i]);
      break;
    }
  }

  private hasCarryCreepsInRoom(): boolean {
    const carryAreaMemoryKey = `CarryArea-${this.room.name}`;
    const carryCreepNames = Helper.getCashedMemory(carryAreaMemoryKey, []);
    return carryCreepNames.length > 0;
  }

  private populateLinksForDeposits(): StructureLink[] {
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
    if (this.room.controller) {
      potentialLink = GetRoomObjects.getWithinRangeLink(this.room.controller.pos, 4);
      if (potentialLink) {
        links.push(potentialLink);
      }
    }
    return links;
  }

  private createCreepForThisArea(): SpawnTask | null {
    let bodyPartConstants: BodyPartConstant[] = [];
    const buildCheapestCreep = this.creeps.length === 0 || !this.hasCarryCreepsInRoom(); // We might get in a deadend where resources will never be more available.
    const amountOfEnergyUnused = this.room.energyCapacityAvailable > 500 ? 300 : 0;
    if (this.linkNextToSource) {
      if (buildCheapestCreep && this.room.energyAvailable < 700) {
        bodyPartConstants = [WORK, WORK, MOVE, CARRY];
      } else {
        // 5 X Work; 3 X Move; 1 X Carry. 700 Ene. Walk time empty/full: plain=2/2 road=1/1 swamp=9/10
        bodyPartConstants = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY];
      }
    } else if (this.containerNextToSource) {
      let segments = Math.floor((this.room.energyCapacityAvailable - amountOfEnergyUnused) / 150); // Work-100; Move-50
      segments = buildCheapestCreep ? Math.floor(this.room.energyAvailable / 150) : segments;
      if (segments < 2) {
        console.log("SourceArea, containerNextToSource: Something wrong with room capacity");
      } else if (segments === 2) {
        // 300 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE];
      } else if (segments === 3) {
        // 450 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE];
      } else if (segments === 4) {
        // 600 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE];
      } else if (segments >= 5) {
        // 800 energy - This is the ideal creep with 10 energy collected per tick, enough for source refresh.
        bodyPartConstants = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE];
      }
    } else {
      let segments = Math.floor((this.room.energyCapacityAvailable - amountOfEnergyUnused) / 200); // Work-100; Move-50; Carry-50
      segments = buildCheapestCreep ? Math.floor(this.room.energyAvailable / 200) : segments;
      if (segments === 1) {
        // 200 energy
        bodyPartConstants = [WORK, MOVE, CARRY];
      } else if (segments === 2) {
        // 400 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE, CARRY, CARRY];
      } else if (segments === 3) {
        // 600 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY];
      } else if (segments >= 4) {
        // 800 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY];
      }
    }
    return new SpawnTask(SpawnType.Harvester, this.source.id, "Harvester", bodyPartConstants, this);
  }

  private doWeNeedToReplaceWeakCreep(): boolean {
    if (this.creeps.length !== 1) {
      return false; // We might need to create a weak one instead if there 0, or we replace a dead one if there are more than 1
    }
    const creep = this.creeps[0];
    if (creep.body.length < 5) {
      return true;
    }
    return false;
  }

  private checkForSuicide() {
    // If a fresh creep arrived at the source and we need to replace the old one, we should suicide the old one
    if (this.creeps.length <= 1) return;
    const mostFreshCreep = this.creeps.reduce((prev, current) =>
      prev.ticksToLive! > current.ticksToLive! ? prev : current
    );
    const finalStageCreep = mostFreshCreep.body.length >= 5;
    const isTheReplacementCreepCloseToSource = mostFreshCreep.pos.getRangeTo(this.source) <= 2;
    for (const creep of this.creeps) {
      if (creep.id !== mostFreshCreep.id && finalStageCreep && isTheReplacementCreepCloseToSource) {
        creep.suicide();
        continue;
      }
    }
  }
}
