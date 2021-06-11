import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { SpawnType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

export default class SourceArea extends BaseArea {
  source: Source;
  room: Room;
  maxWorkerCount: number;
  controllerLevel: number;
  containerNextToSource: StructureContainer | null;
  linkNextToSource: StructureLink | null;
  linksForDeposits: StructureLink[];
  containerConstructionSiteNextToSource: ConstructionSite | null;

  constructor(source: Source, controller: StructureController) {
    super("SourceArea", source.id, source.pos);
    this.source = source;
    this.room = source.room;
    this.maxWorkerCount = 1;
    this.controllerLevel = controller.level;
    this.containerNextToSource = GetRoomObjects.getWithinRangeContainer(source.pos, 2);
    this.containerConstructionSiteNextToSource = GetRoomObjects.getWithinRangeConstructionSite(source.pos, 1, STRUCTURE_CONTAINER);
    this.linkNextToSource = GetRoomObjects.getWithinRangeLink(source.pos, 2);
    this.linksForDeposits = this.populateLinksForDeposits();
  }

  public handleSourceArea(): SpawnTask[]{
    let tasksForThisArea: SpawnTask[] = this.handleCreeps();
    this.handleLinks();
    return tasksForThisArea;
  }

  private handleCreeps(): SpawnTask[] {
    let tasksForThisSourceArea: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount + this.getNumberOfDyingCreeps()) {
      let task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisSourceArea.push(task);
      }
    }
    if (this.containerConstructionSiteNextToSource) {
      for (let i: number = 0; i < this.creeps.length; i++){
        if(this.creeps[i].store.energy == 0 && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
        if(this.creeps[i].isFull() && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Construct, this.containerConstructionSiteNextToSource.pos))
      }
    }
    if (this.containerNextToSource){
      for (let i: number = 0; i < this.creeps.length; i++){
        if(!this.creeps[i].isFull() && this.creeps[i].isFree()){
          if(!Helper.isSamePosition(this.containerNextToSource.pos, this.creeps[i].pos)){
            this.creeps[i].addTask(new CreepTask(Activity.Move, this.containerNextToSource.pos))
          }else{
            this.creeps[i].addTask(new CreepTask(Activity.Harvest, this.source.pos))
          }
        }
        if(this.creeps[i].isFull() && this.creeps[i].isFree())
          this.creeps[i].addTask(new CreepTask(Activity.Deposit, this.containerNextToSource.pos))
      }
    }
    return tasksForThisSourceArea;
  }

  private handleLinks(){
    if(!this.linkNextToSource || this.linkNextToSource.store.energy != 800)
      return;
    for(let i = 0; i < this.linksForDeposits.length; i ++){
      if(this.linksForDeposits[i].store.energy > 100)
        continue;
      this.linkNextToSource.transferEnergy(this.linksForDeposits[i])
    }
  }
  
  private populateLinksForDeposits(): StructureLink[] {
    let links: StructureLink[] = []
    let spawn = GetRoomObjects.getRoomSpawns(this.room, true)[0];
    let storage = GetRoomObjects.getRoomStorage(this.room);
    let potentialLink: StructureLink | null;
    if(spawn){
      potentialLink = GetRoomObjects.getWithinRangeLink(spawn.pos, 4);
      if(potentialLink){
        links.push(potentialLink);
      }
    }
    if(storage){
      potentialLink = GetRoomObjects.getWithinRangeLink(storage.pos, 4);
      if(potentialLink){
        links.push(potentialLink);
      }
    }
    return links;
  }

  private createCreepForThisArea(): SpawnTask | null {
    let bodyPartConstants: BodyPartConstant[] =[]
    let buildCheapestCreep = this.creeps.length == 0;//We might get in a deadend where resources will never be more available.
    if(this.containerNextToSource){
      let segments = Math.floor(this.room.energyCapacityAvailable / 150);//Work-100; Move-50
      segments = buildCheapestCreep ? this.room.energyAvailable / 150 : segments;
      if(segments < 2){
        console.log("Something wrong with room capacity")
      } else if(segments == 2){//300 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE]
      } else if(segments == 3){//450 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE]
      } else if(segments == 4){//600 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE]
      } else if(segments >= 5){//800 energy - This is the ideal creep with 10 energy collected per tick, enough for source refresh.
        bodyPartConstants = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE]
      }
    }else{
      let segments = Math.floor(this.room.energyCapacityAvailable / 200);//Work-100; Move-50; Carry-50
      segments = buildCheapestCreep ? this.room.energyAvailable / 200 : segments;
      if(segments < 1){
        console.log("Something wrong with room capacity")
      } else if(segments == 1){//200 energy
        bodyPartConstants = [WORK, MOVE, CARRY]
      } else if(segments == 2){//400 energy
        bodyPartConstants = [WORK, WORK, MOVE, MOVE, CARRY, CARRY]
      } else if(segments == 3){//600 energy
        bodyPartConstants = [WORK, WORK, WORK, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY]
      } else if(segments >= 4){//800 energy
        bodyPartConstants = [WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY]
      }
    }
    return new SpawnTask(SpawnType.Harvester, this.source.id, "Harvester", bodyPartConstants);
  }
}
