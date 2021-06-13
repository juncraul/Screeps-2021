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
  linkNextToSource: StructureLink | null;
  linksForDeposits: StructureLink[];
  containerConstructionSiteNextToSource: ConstructionSite | null;

  constructor(source: Source, controller: StructureController) {
    super("SourceArea", source.id, source.pos, source.room);
    this.source = source;
    this.maxWorkerCount = 1;
    this.controllerLevel = controller.level;
    this.containerNextToSource = GetRoomObjects.getWithinRangeContainer(source.pos, 2);
    this.containerConstructionSiteNextToSource = GetRoomObjects.getWithinRangeConstructionSite(source.pos, 1, STRUCTURE_CONTAINER);
    this.linkNextToSource = GetRoomObjects.getWithinRangeLink(source.pos, 2);
    this.linksForDeposits = this.populateLinksForDeposits();
  }

  public handleSpawnTasks(): SpawnTask[] {
    let tasksForThisArea: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount + this.getNumberOfDyingCreeps()) {
      let task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }
    return tasksForThisArea;
  }

  public handleThisArea() {
    this.handleCreeps();
    this.handleLinks();
  }

  private handleCreeps() {
    for (let i: number = 0; i < this.creeps.length; i++) {
      if (this.containerConstructionSiteNextToSource) {
        if (this.creeps[i].store.energy == 0 && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
        if (this.creeps[i].isFull() && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToSource.pos))
      }
      if (this.linkNextToSource && this.containerNextToSource){
        if (this.creeps[i].store.energy == 0 && this.creeps[i].isFree()){
          if (!Helper.isSamePosition(this.containerNextToSource.pos, this.creeps[i].pos)) {
            this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos))
          } else {
            this.creeps[i].addTask(new CreepTask(Activity.HarvestAndDeposit, this.source.pos, this.linkNextToSource.pos))
          }
        }
      }else if (this.containerNextToSource) {
        if (!this.creeps[i].isFull() && this.creeps[i].isFree()) {
          if (!Helper.isSamePosition(this.containerNextToSource.pos, this.creeps[i].pos)) {
            this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos))
          } else {
            this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
          }
        }
        if (this.creeps[i].isFull() && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToSource.pos))
      }
    }
  }

  private handleLinks() {
    if (!this.linkNextToSource || this.linkNextToSource.store.energy != 800)
      return;
    for (let i = 0; i < this.linksForDeposits.length; i++) {
      if (this.linksForDeposits[i].store.energy > 300)
        continue;
      this.linkNextToSource.transferEnergy(this.linksForDeposits[i])
      break;
    }
  }

  private populateLinksForDeposits(): StructureLink[] {
    let links: StructureLink[] = []
    let spawn = GetRoomObjects.getRoomSpawns(this.room, true)[0];
    let storage = GetRoomObjects.getRoomStorage(this.room);
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
    let bodyPartConstants: BodyPartConstant[] = []
    let buildCheapestCreep = this.creeps.length == 0;//We might get in a deadend where resources will never be more available.
    if (this.containerNextToSource) {
      let segments = Math.floor(this.room.energyCapacityAvailable / 150);//Work-100; Move-50
      segments = buildCheapestCreep ? this.room.energyAvailable / 150 : segments;
      if (segments < 2) {
        console.log("Something wrong with room capacity")
      } else if (segments == 2) {//300 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE]
      } else if (segments == 3) {//450 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE]
      } else if (segments == 4) {//600 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE]
      } else if (segments >= 5) {//800 energy - This is the ideal creep with 10 energy collected per tick, enough for source refresh.
        bodyPartConstants = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE]
      }
    } if (this.linkNextToSource) {
      if (buildCheapestCreep && this.room.energyAvailable < 700) {
        bodyPartConstants = [WORK, WORK, MOVE, CARRY]
      } else {
        //5 X Work; 3 X Move; 1 X Carry. 700 Ene. Walk time empty/full: plain=2/2 road=1/1 swamp=9/10  
        bodyPartConstants = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY]
      }
    } else {
      let segments = Math.floor(this.room.energyCapacityAvailable / 200);//Work-100; Move-50; Carry-50
      segments = buildCheapestCreep ? this.room.energyAvailable / 200 : segments;
      if (segments < 1) {
        console.log("Something wrong with room capacity")
      } else if (segments == 1) {//200 energy
        bodyPartConstants = [WORK, MOVE, CARRY]
      } else if (segments == 2) {//400 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE, CARRY, CARRY]
      } else if (segments == 3) {//600 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY]
      } else if (segments >= 4) {//800 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY]
      }
    }
    return new SpawnTask(SpawnType.Harvester, this.source.id, "Harvester", bodyPartConstants, this);
  }
}
