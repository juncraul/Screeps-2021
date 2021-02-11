import { Helper } from "Helper";
import SourceSite from "SourceSite";
import Task, { Activity } from "Task";

export default class Overseer implements IOverseer {


    refresh(): void{
        let currentRoom: Room = Game.rooms["W8N3"];
        let tasks: Task[] = [];

        if(currentRoom.controller?.level == 1){
            tasks = tasks.concat(this.overseeRoomControllerLevel1(currentRoom));
        }

        this.handleRoomTasks(currentRoom, tasks);
    }

    private overseeRoomControllerLevel1(room: Room): Task[]{
        let tasks: Task[] = [];
        tasks = tasks.concat(this.handleHarvestSite(room));
        return tasks;
    }

    private handleHarvestSite(room: Room): Task[]{
        if(!room.controller)
            return [];
        let tasks: Task[] = [];
        let sources: Source[] = Helper.getRoomSources(room);
        sources.forEach(source => {
            let sourceSite: SourceSite = new SourceSite(source, room.controller!);
            //Issue to look here, tasks.concat is failing
            tasks = tasks.concat(sourceSite.handleSourceSite());
        });
        return tasks;
    }

    private handleRoomTasks(room: Room, newTasks: Task[]){
        newTasks.forEach(task => {
            console.log(`Handeling new task ${JSON.stringify(task)}`)
            switch(task.activity){
                case Activity.Harvest:
                    let creeps: Creep[] = Helper.getRoomCreepsMineNoTask(room);
                    //Get first available creep or create a new one.
                    let creepToBeAssigned: Creep | null = creeps.length == 0 ? this.createNewCreep(task.source) : creeps[0]
                    if(creepToBeAssigned){
                        this.assignTaskToCreep(task, creepToBeAssigned);
                    }
                break;
            }
        });
    }

    private assignTaskToCreep(task: Task, creep: Creep){
        switch(task.activity){
            case Activity.Harvest:
                creep.memory = {role: "Harvester", room: task.source.room.name, working: false, task: task};
                Helper.setCashedMemory(`Source-${task.source.id}`, [creep.id]);
            break;
        }
    }

    private createNewCreep(source: Source): Creep | null{
        let spawns: StructureSpawn[] = Helper.getRoomSpawns(source.room);
        let theNewCreep: Creep | null = null;
        spawns.forEach(spawn =>{
            if(spawn.spawning == null){
                let creepName: string = `Harvester-${Game.time}`
                if(spawn.spawnCreep([WORK, CARRY, MOVE], creepName) == OK){
                    theNewCreep = Game.creeps[creepName];
                }
            }
        })
        return theNewCreep;
    }
}

interface IOverseer {
    refresh(): void;
}
