import { Helper } from "Helper";
import Task, { Activity, CreepType } from "Task";

export default class SourceSite {
    source: Source;
    room: Room;
    creeps: Creep[];
    maxWorkerCount: number;
    controllerLevel: number;

    constructor(source: Source, controller: StructureController){
        this.source = source;
        this.maxWorkerCount = 2;
        this.creeps = this.getCreepsAssignedToASource(source);
        this.room = source.room;
        this.controllerLevel = controller.level;
    }

    public handleSourceSite(): Task[] {
        let tasksForThisSourceSite: Task[] = [];
        if(this.creeps.length < this.maxWorkerCount){
            let task: Task | null = this.createNewHarvesterCreeps(this.room, this.source);
            if(task){
                tasksForThisSourceSite.push(task);
            }
        }
        return tasksForThisSourceSite;
    }

    private getCreepsAssignedToASource(source: Source): Creep[]{
        let creepsIds: string[] = Helper.getCashedMemory(`Source-${source.id}`, []);
        let creeps: Creep[] = [];
        for(let i: number = creepsIds.length; i >= 0; i--){
            let creep: Creep | null = Game.getObjectById(creepsIds[i]);
            if(creep && creep.hits > 0){
                creeps.push(creep);
            }else{
                //Clean up any dead creeps.
                creepsIds.splice(i, 1);
            }
        }
        Helper.setCashedMemory(`Source-${source.id}`, creepsIds);
        return creeps;
    }

    private createNewHarvesterCreeps(room: Room, source: Source): Task | null{
        switch(this.controllerLevel){
            case 1:
            case 2:
            case 3:
                return this.createHarvesterWithCarry(source);
        }
        return null
    }

    private createHarvesterWithCarry(source: Source): Task{
        return new Task(Activity.Harvest, CreepType.HarvesterWithCarry, source.pos);
    }
}
