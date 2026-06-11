import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";

export class CreepBase {
  public creep: Creep; // The creep that this wrapper class will control
  public body: BodyPartDefinition[]; // These properties are all wrapped from this.creep.* to this.*
  public store: StoreDefinition; // |
  public carryCurrent: number;
  public carryCapacity: number; // |
  public fatigue: number; // |
  public hits: number; // |
  public hitsMax: number; // |
  public id: string; // |
  public memory: CreepMemory; // | See the ICreepMemory interface for structure
  public my: boolean; // |
  public name: string; // |
  public owner: Owner; // |
  public pos: RoomPosition; // |
  // public ref: string;						// |
  public roleName: string; // |
  public room: Room; // |
  public saying: string; // |
  public spawning: boolean; // |
  public ticksToLive: number | undefined; // |
  // public lifetime: number;
  public actionLog: { [actionName: string]: boolean }; // Tracks the actions that a creep has completed this tick
  public task: CreepTask | undefined;

  public constructor(creep: Creep) {
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
    // this.lifetime = this.getBodyparts(CLAIM) > 0 ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
    this.actionLog = {};
    this.task = creep.memory.task as CreepTask | undefined;
    // this.task.targetPlace = new RoomPosition(this.task.targetPlace.x, this.task.targetPlace.y, this.task.targetPlace.roomName)//This to make it back to an object
  }

  public addTask(task: CreepTask): void {
    this.task = task;
    this.creep.memory.task = task;
  }

  public workTheTask(): void {
    if (!this.task) return;
    switch (this.task.activity) {
      case Activity.Harvest: {
        const source: Source | null = CreepTask.getSourceFromTarget(this.task.targetPlace);
        if (source) {
          this.harvest(source);
        }
        if (this.carryCapacity > 0 && this.carryCapacity === this.carryCurrent) {
          this.creep.say("Har Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Construct: {
        const constructionSite: ConstructionSite | null = CreepTask.getConstructionSiteFromTarget(
          this.task.targetPlace
        );
        if (constructionSite) {
          this.build(constructionSite);
        }
        if (this.carryCurrent === 0 || !constructionSite) {
          this.creep.say("Con Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Deposit: {
        const structure: Structure | null = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task.targetPlace);
        if (structure) {
          this.transfer(structure, RESOURCE_ENERGY);
        }
        if (
          structure instanceof StructureSpawn ||
          structure instanceof StructureExtension ||
          structure instanceof StructureTower ||
          structure instanceof StructureLink
        ) {
          if (structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            this.creep.say("Str Full");
            this.task.taskDone = true;
          }
        }
        if (this.carryCurrent === 0) {
          this.creep.say("Dep Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Move: {
        const roomPosition = CreepTask.getRoomPositionFromTarget(this.task.targetPlace);
        this.goTo(roomPosition);
        if (Helper.isSamePosition(this.pos, roomPosition)) {
          this.creep.say("Move Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Collect: {
        let targetCollect: Structure | Ruin | Resource | null = CreepTask.getResourceFromTarget(this.task.targetPlace);
        if (!targetCollect) {
          targetCollect = CreepTask.getRuinFromTarget(this.task.targetPlace);
          if(!targetCollect) {
            targetCollect = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task.targetPlace);
          }
        }
        if (targetCollect && !(targetCollect instanceof Resource)) {
          this.withdraw(targetCollect, RESOURCE_ENERGY);
        }
        if (targetCollect instanceof Resource) {
          this.pickup(targetCollect);
        }
        if (
          targetCollect instanceof StructureContainer ||
          targetCollect instanceof StructureStorage ||
          targetCollect instanceof StructureTerminal ||
          targetCollect instanceof StructureLab
        ) {
          if (targetCollect.store.energy === 0) {
            this.creep.say("Col Done");
            this.task.taskDone = true;
          }
        }
        else if (
          targetCollect instanceof StructureLink ||
          targetCollect instanceof StructureExtension ||
          targetCollect instanceof StructureLab ||
          targetCollect instanceof StructureSpawn ||
          targetCollect instanceof StructureTower
        ) {
          if (targetCollect.store.energy === 0) {
            this.creep.say("Col Done");
            this.task.taskDone = true;
          }
        }
        else if (targetCollect instanceof Resource) {
          if (targetCollect.amount === 0) {
            this.creep.say("Col Done");
            this.task.taskDone = true;
          }
        }
        if (this.carryCurrent === this.carryCapacity) {
          this.creep.say("Col Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Upgrade: {
        const controller: StructureController | null = CreepTask.getControllerFromTarget(this.task.targetPlace);
        if (controller) {
          this.upgradeController(controller);
        }
        if (this.carryCurrent === 0) {
          this.creep.say("Upg Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Pickup: {
        const targetPickup: Resource | null = CreepTask.getResourceFromTarget(this.task.targetPlace);
        if (targetPickup) {
          this.pickup(targetPickup);
        }
        if (this.carryCurrent === this.carryCapacity) {
          this.creep.say("Pick Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Claim: {
        const controller2: StructureController | null = CreepTask.getControllerFromTarget(this.task.targetPlace);
        if (controller2) {
          if (this.claim(controller2) === OK) {
            this.creep.say("Claim Done");
            this.task.taskDone = true;
          }
        }
        break;
      }
      case Activity.MoveDifferentRoom: {
        const pos: RoomPosition = CreepTask.getRoomPositionFromTarget(this.task.targetPlace);
        this.goTo(pos);
        if (pos.roomName === this.room.name) {
          this.creep.say("Move Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Reserve: {
        const controller3: StructureController | null = CreepTask.getControllerFromTarget(this.task.targetPlace);
        if (controller3) {
          if (controller3.reservation && controller3.reservation.username !== Helper.getUserName()) {
            this.attackController(controller3);
          } else {
            this.reserve(controller3);
          }
        }
        break;
      }
      case Activity.HarvestAndDeposit: {
        const source2: Source | null = CreepTask.getSourceFromTarget(this.task.targetPlace);
        if (source2) {
          this.harvest(source2);
        }
        if (this.task.targetPlaceSecond) {
          const structure2: Structure | null = CreepTask.getStructureFromTargetNoRoadNoRampart(
            this.task.targetPlaceSecond
          );
          if (structure2) {
            if (this.transfer(structure2, RESOURCE_ENERGY) !== OK) {
              this.drop(RESOURCE_ENERGY);
            }
          }
        } else {
          this.drop(RESOURCE_ENERGY);
        }
        break;
      }
      case Activity.Repair: {
        const structure3: Structure | null = CreepTask.getStructureFromTarget(this.task.targetPlace);
        if (structure3) {
          this.repair(structure3);
        }
        if (this.carryCurrent === 0 || !structure3 || structure3.hits == structure3.hitsMax) {
          this.creep.say("Rep Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Attack: {
        if (!this.task.targetId) {
          break;
        }
        const creepToAttack: Creep | null = Game.creeps[this.task.targetId] as Creep | null;
        if (creepToAttack) {
          this.attack(creepToAttack);
        }
        break;
      }
    }
  }

  public build(structure: ConstructionSite): ScreepsReturnCode {
    const result = this.creep.build(structure);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(structure.pos);
    }
    return result;
  }

  public repair(structure: Structure): ScreepsReturnCode {
    const result = this.creep.repair(structure);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(structure.pos);
    }
    return result;
  }

  public harvest(source: Source | Mineral): ScreepsReturnCode {
    // Don't think will ever have the creep's internal cooldown longer than EXTRACTOR_COOLDOWN
    const result = this.creep.harvest(source);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(source.pos);
    }
    return result;
  }

  public goTo(
    destination: RoomPosition // , movementOption: MovementOption = {}
  ) {
    return this.creep.moveTo(destination);
  }

  public isEmpty(): boolean {
    return this.store.getUsedCapacity() === 0;
  }

  public isFree(): boolean {
    return this.task == null || this.task.taskDone;
  }

  public isFull(): boolean {
    return this.store.getFreeCapacity() === 0;
  }

  public say(whatToSay: string, toPublic?: boolean): ScreepsReturnCode {
    return this.creep.say(whatToSay, toPublic);
  }

  public suicide(): ScreepsReturnCode {
    this.say("💀");
    return this.creep.suicide();
  }

  public transfer(
    target: Creep | CreepBase | Structure,
    resourceType: ResourceConstant,
    amount?: number
  ): ScreepsReturnCode {
    let result: ScreepsReturnCode;
    if (target instanceof CreepBase) {
      if (amount) {
        result = this.creep.transfer(
          target.creep,
          resourceType,
          this.store[resourceType]! < amount ? this.store[resourceType]! : amount
        );
      } else {
        result = this.creep.transfer(target.creep, resourceType);
      }
    } else {
      if (amount) {
        result = this.creep.transfer(
          target,
          resourceType,
          this.store[resourceType]! < amount ? this.store[resourceType]! : amount
        );
      } else {
        result = this.creep.transfer(target, resourceType);
      }
    }
    if (result === ERR_NOT_IN_RANGE) {
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

  public withdraw(
    target: Tombstone | Structure | Ruin,
    resourceType: ResourceConstant,
    amount?: number
  ): ScreepsReturnCode {
    let result: ScreepsReturnCode;
    if (amount) {
      const freeSpace = this.store.getFreeCapacity();
      result = this.creep.withdraw(target, resourceType, freeSpace < amount ? freeSpace : amount);
    } else {
      result = this.creep.withdraw(target, resourceType);
    }
    if (result === ERR_NOT_IN_RANGE) {
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

  public pickup(resource: Resource): ScreepsReturnCode {
    const result = this.creep.pickup(resource);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(resource.pos);
    }
    return result;
  }

  public upgradeController(controller: StructureController): ScreepsReturnCode {
    const result = this.creep.upgradeController(controller);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  public attackController(controller: StructureController): ScreepsReturnCode {
    const result = this.creep.attackController(controller);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  public reserve(controller: StructureController): ScreepsReturnCode {
    const result = this.creep.reserveController(controller);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  public claim(controller: StructureController): ScreepsReturnCode {
    const result = this.creep.claimController(controller);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  public drop(resouce: ResourceConstant): ScreepsReturnCode {
    const result = this.creep.drop(resouce);
    return result;
  }

  public attack(creep: Creep | Structure) {
    let result = this.creep.attack(creep);
    if (result == ERR_NOT_IN_RANGE) {
      this.goTo(creep.pos);
    }
    return result;
  }

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

  public getNumberOfBoostedBodyPart(bodyType: BodyPartConstant): number {
    let total = 0;
    for (const part of this.creep.body) {
      if (part.type === bodyType && part.boost) {
        total++;
      }
    }
    return total;
  }

  public getNumberOfBodyPart(bodyType: BodyPartConstant): number {
    let total = 0;
    for (const part of this.creep.body) {
      if (part.type === bodyType) {
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
