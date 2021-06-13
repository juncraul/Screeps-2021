import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";

export class CreepBase {
  creep: Creep; 						// The creep that this wrapper class will control
  body: BodyPartDefinition[];    	 	// These properties are all wrapped from this.creep.* to this.*
  store: StoreDefinition;				// |
  carryCurrent: number
  carryCapacity: number;				// |
  fatigue: number;					// |
  hits: number;						// |
  hitsMax: number;					// |
  id: string;							// |
  memory: CreepMemory;				// | See the ICreepMemory interface for structure
  my: boolean;						// |
  name: string;						// |
  owner: Owner; 						// |
  pos: RoomPosition;					// |
  //ref: string;						// |
  roleName: string;					// |
  room: Room;							// |
  saying: string;						// |
  spawning: boolean;					// |
  ticksToLive: number | undefined;	// |
  //lifetime: number;
  actionLog: { [actionName: string]: boolean }; // Tracks the actions that a creep has completed this tick
  task: CreepTask;

  constructor(creep: Creep) {
    this.creep = creep;
    this.body = creep.body;
    this.store = creep.store;
    this.carryCurrent = creep.store.getUsedCapacity();
    this.carryCapacity = creep.carryCapacity;
    this.fatigue = creep.fatigue;
    this.hits = creep.hits;
    this.hitsMax = creep.hitsMax;
    this.id = creep.id;
    this.memory = creep.memory;
    this.my = creep.my;
    this.name = creep.name;
    this.owner = creep.owner;
    this.pos = creep.pos;
    this.roleName = creep.memory.role;
    this.room = creep.room;
    this.saying = creep.saying;
    this.spawning = creep.spawning;
    this.ticksToLive = creep.ticksToLive;
    //this.lifetime = this.getBodyparts(CLAIM) > 0 ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
    this.actionLog = {};
    this.task = creep.memory.task;
    //this.task.targetPlace = new RoomPosition(this.task.targetPlace.x, this.task.targetPlace.y, this.task.targetPlace.roomName)//This to make it back to an object
  }

  addTask(task: CreepTask){
    this.task = task;
    this.creep.memory.task = task;
  }

  workTheTask() {
    if(!this.task)
      return;
    switch (this.task.activity) {
      case Activity.Harvest://0
        let source: Source | null = CreepTask.getSourceFromTarget(this.task.targetPlace);
        if (source) {
          this.harvest(source);
        }
        if (this.carryCapacity > 0 && this.carryCapacity == this.carryCurrent) {
          this.creep.say("Har Done");
          this.task.taskDone = true;
        }
        break;
      case Activity.Construct://1
        let constructionSite: ConstructionSite | null = CreepTask.getConstructionSiteFromTarget(this.task.targetPlace);
        if (constructionSite) {
          this.build(constructionSite);
        }
        if (this.carryCurrent == 0 || !constructionSite) {
          this.creep.say("Con Done");
          this.task.taskDone = true;
        }
        break;
      case Activity.Deposit://2
        let structure: Structure | null = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task.targetPlace);
        if (structure) {
          this.transfer(structure, RESOURCE_ENERGY);
        }
        if(structure instanceof StructureSpawn || structure instanceof StructureExtension || structure instanceof StructureTower || structure instanceof StructureLink){
          if(structure.store.getFreeCapacity(RESOURCE_ENERGY) == 0){
            this.creep.say("Str Full");
            this.task.taskDone = true;
          }
        }
        if (this.carryCurrent == 0) {
          this.creep.say("Dep Done");
          this.task.taskDone = true;
        }
        break;
      case Activity.Move://3
        let roomPosition = CreepTask.getRoomPositionFromTarget(this.task.targetPlace)
        this.goTo(roomPosition);
        if (Helper.isSamePosition(this.pos, roomPosition)) {
          this.creep.say("Move Done");
          this.task.taskDone = true;
        }
        break;
      case Activity.Collect://4
        let targetCollect: Structure | Ruin | null = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task.targetPlace);
        if (!targetCollect){
          targetCollect = CreepTask.getRuinFromTarget(this.task.targetPlace);
        }
        if (targetCollect) {
          this.withdraw(targetCollect, RESOURCE_ENERGY);
        }
        if(targetCollect instanceof StructureContainer 
          || targetCollect instanceof StructureStorage
          || targetCollect instanceof StructureTerminal
          || targetCollect instanceof StructureLab){
          if(targetCollect.store.energy == 0){
            this.creep.say("Col Done");
            this.task.taskDone = true;
          }
        }
        if(targetCollect instanceof StructureLink
          || targetCollect instanceof StructureExtension
          || targetCollect instanceof StructureLab
          || targetCollect instanceof StructureSpawn
          || targetCollect instanceof StructureTower){
          if(targetCollect.energy == 0){
            this.creep.say("Col Done");
            this.task.taskDone = true;
          }
        }
        if (this.carryCurrent == this.carryCapacity) {
          this.creep.say("Col Done");
          this.task.taskDone = true;
        }
        break;
      case Activity.Upgrade://5
        let controller: StructureController | null = CreepTask.getControllerFromTarget(this.task.targetPlace);
        if (controller) {
          this.upgradeController(controller);
        }
        if (this.carryCurrent == 0) {
          this.creep.say("Upg Done");
          this.task.taskDone = true;
        }
        break;
      case Activity.Pickup://6
        let targetPickup: Resource | null = CreepTask.getResourceFromTarget(this.task.targetPlace);
        if (targetPickup) {
          this.pickup(targetPickup);
        }
        if (this.carryCurrent == this.carryCapacity) {
          this.creep.say("Pick Done");
          this.task.taskDone = true;
        }
        break;
      case Activity.Claim://7
        let controller2: StructureController | null = CreepTask.getControllerFromTarget(this.task.targetPlace);
        if (controller2) {
          if(this.claim(controller2) == OK){
            this.creep.say("Claim Done");
            this.task.taskDone = true;
          }
        }
        break;
      case Activity.MoveDifferentRoom://8
        let pos: RoomPosition = CreepTask.getRoomPositionFromTarget(this.task.targetPlace)
        this.goTo(pos);
        if (pos.roomName == this.room.name) {
          this.creep.say("Move Done");
          this.task.taskDone = true;
        }
        break;
      case Activity.Reserve://9
          let controller3: StructureController | null = CreepTask.getControllerFromTarget(this.task.targetPlace);
          if (controller3) {
            if(controller3.reservation && controller3.reservation.username != Helper.getUserName()){
              this.attackController(controller3)
            }else{
              this.reserve(controller3);
            }
          }
          break;
      case Activity.HarvestAndDeposit://10
        let source2: Source | null = CreepTask.getSourceFromTarget(this.task.targetPlace);
        if (source2) {
          this.harvest(source2);
        }
        if(this.task.targetPlaceSecond){
          let structure2: Structure | null = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task.targetPlaceSecond);
          if (structure2) {
            if(this.transfer(structure2, RESOURCE_ENERGY) != OK){
              this.drop(RESOURCE_ENERGY);
            }
          }
        }else{
          this.drop(RESOURCE_ENERGY);
        }
        break;
    }
  }

  build(structure: ConstructionSite) {
    let result = this.creep.build(structure);
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(structure.pos);
    }
    return result;
  }

  // repair(structure: Structure) {
  //   let result = this.creep.repair(structure);
  //   if (result == ERR_NOT_IN_RANGE) {
  //     this.goTo(structure.pos);
  //   }
  //   this.memory.targetId = structure.id;
  //   return result;
  // }

  harvest(source: Source | Mineral) {//Don't think will ever have the creep's internal cooldown longer than EXTRACTOR_COOLDOWN
    let result = this.creep.harvest(source);
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(source.pos);
    }
    return result;
  }

  goTo(destination: RoomPosition//, movementOption: MovementOption = {}
  ) {
    return this.creep.moveTo(destination);
  };

  isEmpty(): boolean{
    return this.store.getUsedCapacity() == 0;
  }

  isFree(): boolean{
    return this.task == null || this.task.taskDone;
  }

  isFull(): boolean{
    return this.store.getFreeCapacity() == 0;
  }

  say(whatToSay: string, toPublic?: boolean){
    this.creep.say(whatToSay, toPublic);
  }

  transfer(target: Creep | CreepBase | Structure, resourceType: ResourceConstant, amount?: number) {
    let result: ScreepsReturnCode;
    if (target instanceof CreepBase) {
      if (amount) {
          result = this.creep.transfer(target.creep, resourceType, this.store[resourceType]! < amount ? this.store[resourceType]! : amount);
      }
      else {
        result = this.creep.transfer(target.creep, resourceType);
      }
    } else {
      if (amount) {
        result = this.creep.transfer(target, resourceType, this.store[resourceType]! < amount ? this.store[resourceType]! : amount);
      }
      else {
        result = this.creep.transfer(target, resourceType);
      }
    }
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(target.pos);
    }
    return result;
  }

  //     transferAll(target: Creep | Probe | Structure) {
  //       let result: ScreepsReturnCode;
  //       result = ERR_NOT_ENOUGH_RESOURCES;
  //       for (let resourceType in this.carry) {
  //         if (this.carry[<ResourceConstant>resourceType]! == 0)
  //           continue;
  //         if (target instanceof Probe) {
  //           result = this.creep.transfer(target.creep, <ResourceConstant>resourceType);
  //         } else {
  //           result = this.creep.transfer(target, <ResourceConstant>resourceType);
  //         }
  //       }
  //       if (result == ERR_NOT_IN_RANGE) {
  //         this.goTo(target.pos, { stroke: "#0000ff" });
  //       }
  //       return result;
  //     }

  withdraw(target: Tombstone | Structure | Ruin, resourceType: ResourceConstant, amount?: number) {
    let result;
    if (amount) {
      let freeSpace = this.store.getFreeCapacity();
      result = this.creep.withdraw(target, resourceType, freeSpace < amount ? freeSpace : amount);
    }
    else {
      result = this.creep.withdraw(target, resourceType);
    }
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(target.pos);
    }
    return result;
  }

  // withdrawAll(target: Tombstone | Structure) {
  //   let result: ScreepsReturnCode;
  //   result = ERR_NOT_ENOUGH_RESOURCES;
  //   if (target instanceof StructureLink) {
  //     result = this.creep.withdraw(target, RESOURCE_ENERGY);
  //   }
  //   else if (target instanceof StructureLab) {
  //     result = this.creep.withdraw(target, <ResourceConstant>target.mineralType);
  //   }
  //   else if (target instanceof Tombstone || target instanceof StructureContainer || target instanceof StructureStorage || target instanceof StructureTerminal) {
  //     for (let resourceType in target.store) {
  //       result = this.creep.withdraw(target, <ResourceConstant>resourceType);
  //     }
  //   }
  //   if (result == ERR_NOT_IN_RANGE) {
  //     this.goTo(target.pos, { stroke: "#00ffff" });
  //   }
  //   return result;
  // }

  pickup(resource: Resource) {
    let result = this.creep.pickup(resource);
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(resource.pos);
    }
    return result;
  }

  upgradeController(controller: StructureController) {
    let result = this.creep.upgradeController(controller);
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  attackController(controller: StructureController) {
    let result = this.creep.attackController(controller);
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  reserve(controller: StructureController) {
    let result = this.creep.reserveController(controller);
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  claim(controller: StructureController) {
    let result = this.creep.claimController(controller);
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  drop(resouce: ResourceConstant) {
    let result = this.creep.drop(resouce);
    return result;
  }

  //     attack(creep: Creep | Structure) {
  //       let result = this.creep.attack(creep);
  //       if (result == ERR_NOT_IN_RANGE) {
  //         this.goTo(creep.pos);
  //       }
  //       this.memory.targetId = creep.id;
  //       return result;
  //     }

  //     rangedAttack(creep: Creep | Structure) {
  //       let result = this.creep.rangedAttack(creep);
  //       if (result == ERR_NOT_IN_RANGE) {
  //         this.goTo(creep.pos);
  //       }
  //       this.memory.targetId = creep.id;
  //       return result;
  //     }

  //     heal(creep: Creep) {
  //       let result = this.creep.heal(creep);
  //       if (result == ERR_NOT_IN_RANGE) {
  //         this.goTo(creep.pos);
  //       }
  //       this.memory.targetId = creep.id;
  //       return result;
  //     }

  //     rangedHeal(creep: Creep) {
  //       let result = this.creep.rangedHeal(creep);
  //       if (result == ERR_NOT_IN_RANGE) {
  //         this.goTo(creep.pos);
  //       }
  //       this.memory.targetId = creep.id;
  //       return result;
  //     }

  //     sign(controller: StructureController, text: string) {
  //       let result = this.creep.signController(controller, text);
  //       if (result == ERR_NOT_IN_RANGE) {
  //         this.goTo(controller.pos);
  //       }
  //       this.memory.targetId = controller.id;
  //       return result;
  //     }

  //     goTo(destination: RoomPosition, movementOption: MovementOption = {}) {
  //       if (this.memory.useCashedPath) {
  //         let creepInSamePosition = JSON.stringify(this.creep.memory.previousPosition) == JSON.stringify(this.creep.pos);
  //         let newDestination = JSON.stringify(this.creep.memory.moveDestination) != JSON.stringify(destination);
  //         if (!this.creep.memory.path || creepInSamePosition) {
  //           this.creep.memory.path = PathLogic.getPath(this.creep.pos, destination, newDestination ? false : creepInSamePosition, this.id == "put a real id");
  //           this.creep.memory.moveDestination = destination;
  //         }
  //         this.creep.memory.previousPosition = this.creep.pos;
  //         let result = this.creep.moveByPath(this.creep.memory.path);
  //         return result;
  //       }
  //       else {
  //         if (movementOption.range) {
  //           let distanceToDestination = this.creep.pos.getRangeTo(destination);
  //           if (distanceToDestination <= movementOption.range) {
  //             return NO_ACTION;
  //           }
  //         }
  //         if (movementOption.stroke) {
  //           return this.creep.moveTo(destination, { reusePath: 10, visualizePathStyle: { stroke: movementOption.stroke } });
  //         }
  //         else {
  //           return this.creep.moveTo(destination);
  //         }
  //       }
  //     };

  //     private goToDifferentRoom(destination: string) {
  //       return this.creep.moveTo(new RoomPosition(25, 25, destination));
  //     }

  //     goToRemoteRoom(roomName: string) {
  //       let path = Tasks.getFarAwayRoomPath(roomName);
  //       if (path.length == 0) {
  //         this.goToDifferentRoom(roomName);
  //       } else {
  //         let foundCurrentRoom = false;
  //         for (let currenRoomIndex in path) {
  //           if (foundCurrentRoom) {
  //             this.goToDifferentRoom(path[currenRoomIndex]);
  //             break;
  //           }
  //           if (path[currenRoomIndex] == this.room.name) {
  //             foundCurrentRoom = true;
  //           }
  //         }
  //       }
  //     }

  getNumberOfBoostedBodyPart(bodyType: BodyPartConstant): number {
    let total = 0;
    for (let i in this.creep.body) {
      if (this.creep.body[i].type == bodyType && this.creep.body[i].boost) {
        total++;
      }
    }
    return total;
  }

  getNumberOfBodyPart(bodyType: BodyPartConstant): number {
    let total = 0;
    for (let i in this.creep.body) {
      if (this.creep.body[i].type == bodyType) {
        total++;
      }
    }
    return total;
  }

  //     static getActiveBodyPartsFromArrayOfProbes(probes: Probe[], bodyPart: BodyPartConstant) {
  //     var bodyParts = 0;
  //       for (var i = 0; i < probes.length; i++) {
  //         bodyParts += probes[i].creep.getActiveBodyparts(bodyPart);
  //     }
  //     return bodyParts;
  //   }
}
