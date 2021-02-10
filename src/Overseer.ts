import { Helper } from "Helper";
import Task, { Activity, CreepType } from "Task";

export default class Overseer implements IOverseer {


    refresh(): void{
        let currentRoom: Room = Game.rooms["W8N3"];

        if(currentRoom.controller?.level == 1){
            this.overseeRoomControllerLevel1(currentRoom);
        }

        this.handleRoomTasks(currentRoom);
    }

    private overseeRoomControllerLevel1(room: Room): void{
        this.handleHarvestSite(room);
    }

    private handleHarvestSite(room: Room): void{
        let sources: Source[] = Helper.getRoomSources(room);
        sources.forEach(source => {
            let creeps: Creep[] = this.getCreepsAssignedToASource(source);
            if(creeps.length == 0){
                this.createHarvesterWithCarry(room, source);
            }
        });
    }

    private getCreepsAssignedToASource(source: Source): Creep[]{
        let creepsIds: string[] = Helper.getCashedMemory(`Source-${source.id}`, []);
        let creeps: Creep[] = [];
        creepsIds.forEach(creepId =>{
            let creep: Creep | null = Game.getObjectById(creepId);
            if(creep && creep.hits > 0){
                creeps.push(creep);
            }
        })
        return creeps;
    }

    private createHarvesterWithCarry(room: Room, source: Source){
        let tasks: Task[] = Helper.getCashedMemory(`Room-Tasks-${room.name}`, []);
        let needToCreateTask: boolean = true;
        tasks.forEach(task => {
            if(task.activity == Activity.CreateCreep && task.creepType == CreepType.HarvesterWithCarry){
                needToCreateTask = false;
                return;
            }
        });
        if(needToCreateTask){
            let task: Task = new Task(Activity.CreateCreep, CreepType.HarvesterWithCarry, source);
            tasks.push(task);
            Helper.setCashedMemory(`Room-Tasks-${room.name}`, tasks);
        }
    }

    private handleRoomTasks(room: Room){
        let tasks: Task[] = Helper.getCashedMemory(`Room-Tasks-${room.name}`, []);
        let spawns: StructureSpawn[] = Helper.getRoomSpawns(room);
        let taskToRemoveIndex: number = 0;
        tasks.forEach(task => {
            if(task.activity == Activity.CreateCreep && task.creepType == CreepType.HarvesterWithCarry){
                spawns.forEach(spawn =>{
                    if(spawn.spawning == null){
                        let creepName: string = `Harvester-${Game.time}`
                        if(spawn.spawnCreep([WORK, CARRY, MOVE], creepName) == OK){
                            let theNewCreep: Creep = Game.creeps[creepName];
                            theNewCreep.memory = {role: "harvester", room: room.name, working: false};
                            Helper.setCashedMemory(`Source-${task.source.id}`, [theNewCreep.id]);
                        }
                    }
                })
            }
            taskToRemoveIndex ++;
        });
        tasks.splice(taskToRemoveIndex, 1);
    }
}

interface IOverseer {
    refresh(): void;
}
