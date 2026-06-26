import { Helper } from "Helpers/Helper";
import CreepTask, { Activity } from "Tasks/CreepTask";
import { CreepType } from "CreepType";

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
  public creepType: CreepType; // |
  public room: Room; // |
  public saying: string; // |
  public spawning: boolean; // |
  public ticksToLive: number | undefined; // |
  // public lifetime: number;
  public actionLog: { [actionName: string]: boolean }; // Tracks the actions that a creep has completed this tick
  public task: CreepTask | undefined;
  public willSuicideAtTick: number | undefined; // If set, the creep will suicide at this tick

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
    this.creepType = CreepType[creep.memory.role as keyof typeof CreepType] ?? CreepType.Harvester;
    this.room = creep.room;
    this.saying = creep.saying;
    this.spawning = creep.spawning;
    this.ticksToLive = creep.ticksToLive;
    // this.lifetime = this.getBodyparts(CLAIM) > 0 ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
    this.actionLog = {};
    this.task = creep.memory.task as CreepTask | undefined;
    // this.task.targetPlace = new RoomPosition(this.task.targetPlace.x, this.task.targetPlace.y, this.task.targetPlace.roomName)//This to make it back to an object
    this.willSuicideAtTick = creep.memory.willSuicideAtTick;
  }

  public addTask(task: CreepTask): void {
    this.task = task;
    this.creep.memory.task = task;
  }

  public addSuicideTime(tick: number): void {
    this.willSuicideAtTick = tick;
    this.creep.memory.willSuicideAtTick = tick;
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
          const result = this.transfer(structure, RESOURCE_ENERGY);
          if (result === OK) {
            this.creep.say("Transf Done");
            this.task.taskDone = true;
          } else if (result === ERR_FULL) {
            this.creep.say("Str Full");
            this.task.taskDone = true;
          }
        }
        // if (
        //   structure instanceof StructureSpawn ||
        //   structure instanceof StructureExtension ||
        //   structure instanceof StructureTower ||
        //   structure instanceof StructureLink
        // ) {
        //   if (structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        //     this.creep.say("Str Full");
        //     this.task.taskDone = true;
        //   }
        // } else if (
        //   structure instanceof StructureContainer ||
        //   structure instanceof StructureStorage ||
        //   structure instanceof StructureTerminal
        // ) {
        //   if (structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        //     this.creep.say("Str Full");
        //     this.task.taskDone = true;
        //   }
        // } else if (structure instanceof StructureLab) {
        //   if (structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        //     this.creep.say("Str Full");
        //     this.task.taskDone = true;
        //   }
        // }
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
        let targetCollect: Structure | Tombstone | Ruin | null = CreepTask.getStructureFromTargetNoRoadNoRampart(
          this.task.targetPlace
        );
        if (!targetCollect) {
          targetCollect = CreepTask.getTombstoneFromTarget(this.task.targetPlace);
          if (!targetCollect) {
            targetCollect = CreepTask.getRuinFromTarget(this.task.targetPlace);
          }
        }
        if (!targetCollect) {
          targetCollect = CreepTask.getRuinFromTarget(this.task.targetPlace);
          if (!targetCollect) {
            this.creep.say("Col Done"); // Target must have dissappeared.
            this.task.taskDone = true;
          }
        }
        if (targetCollect) {
          const result = this.withdraw(targetCollect, RESOURCE_ENERGY);
          if (result === OK) {
            this.creep.say("Col Done");
            this.task.taskDone = true;
          }
        }
        if (
          targetCollect instanceof StructureContainer ||
          targetCollect instanceof StructureStorage ||
          targetCollect instanceof StructureTerminal ||
          targetCollect instanceof StructureLab ||
          targetCollect instanceof Ruin ||
          targetCollect instanceof Tombstone
        ) {
          if (targetCollect.store.energy === 0) {
            this.creep.say("Col Done");
            this.task.taskDone = true;
          }
        } else if (
          targetCollect instanceof StructureLink ||
          targetCollect instanceof StructureExtension ||
          targetCollect instanceof StructureSpawn ||
          targetCollect instanceof StructureTower
        ) {
          if (targetCollect.store.energy === 0) {
            this.creep.say("Col Done");
            this.task.taskDone = true;
          }
        } else if (targetCollect instanceof Resource) {
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
      // TODO: There is a tick pause between collection and upgrade.
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
          const result = this.pickup(targetPickup);
          if (result === OK) {
            this.creep.say("Pick up Done");
            this.task.taskDone = true;
          }
        }
        if (!targetPickup || this.carryCurrent === this.carryCapacity) {
          this.creep.say("Pick up Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Claim: {
        const controller2: StructureController | null = CreepTask.getControllerFromTarget(this.task.targetPlace);
        if (controller2) {
          const result = this.claim(controller2);
          console.log(
            `Claiming controller in room ${controller2.room.name} with creep ${this.name}, result: ${result}`
          );
          if (result === OK) {
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
        let structure3: Structure | null = CreepTask.getStructureFromTarget(this.task.targetPlace);
        if (structure3) {
          const result = this.repair(structure3);
          if (result === OK && structure3.hits === structure3.hitsMax) {
            // If the structure is fully repaired, check if there is a non-road, non-rampart structure at the same position to repair instead.
            const nonRoadStructure = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task.targetPlace);
            if (nonRoadStructure) {
              structure3 = nonRoadStructure;
              this.repair(structure3);
            }
          }
        }
        if (this.carryCurrent === 0 || !structure3 || structure3.hits === structure3.hitsMax) {
          this.creep.say("Rep Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.Attack: {
        if (!this.task.targetId) {
          break;
        }
        const entityToAttack: Creep | Structure | null = Game.getObjectById(
          this.task.targetId as Id<Creep | Structure>
        );
        // If enemy flee in another room, remove task
        if (entityToAttack) {
          if (entityToAttack.pos.roomName !== this.room.name) {
            this.task.taskDone = true;
            this.creep.say("Enemy fled");
            break;
          }
          this.attack(entityToAttack);
        }
        if (!entityToAttack || entityToAttack.hits === 0) {
          this.task.taskDone = true;
          this.creep.say("Enemy dead");
        }
        break;
      }
      case Activity.HarvestMineral: {
        // targetPlace points at the mineral tile; targetPlaceSecond points at the container to deposit into.
        const mineralAtPos = CreepTask.getMineralFromTarget(this.task.targetPlace);
        if (mineralAtPos && mineralAtPos.mineralAmount > 0) {
          this.harvest(mineralAtPos);
        }
        if (this.task.targetPlaceSecond) {
          const container = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task.targetPlaceSecond);
          if (container instanceof StructureContainer && this.store.getUsedCapacity() > 0) {
            // Deposit any mineral into the container next to the mineral.
            for (const resourceType in this.store) {
              if ((this.store[resourceType as ResourceConstant] ?? 0) > 0) {
                this.transfer(container, resourceType as ResourceConstant);
                break;
              }
            }
          }
        }
        // Task done when mineral is exhausted or container is full.
        if (!mineralAtPos || mineralAtPos.mineralAmount === 0) {
          this.creep.say("Min Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.DepositMineral: {
        // Move minerals from carry to storage; targetPlaceSecond carries the resource type name via targetId.
        const storageStruct = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task.targetPlace);
        if (storageStruct) {
          // Get resource type from creep store
          const resourceType = Object.keys(this.creep.store)[0] as ResourceConstant | undefined;
          if (resourceType) {
            const result = this.transfer(storageStruct, resourceType);
            if (result === OK || result === ERR_FULL) {
              this.creep.say("Min Dep Done");
              this.task.taskDone = true;
            }
          } else {
            this.creep.say("No min");
            this.task.taskDone = true;
          }
        }
        if (this.store.getUsedCapacity() === 0) {
          this.creep.say("Min Dep Done");
          this.task.taskDone = true;
        }
        break;
      }
      case Activity.CollectMineral: {
        // Collect a specific mineral (targetId) or any mineral (non-energy) from resource/store holders at targetPlace.
        const specificMineral = this.task.targetId as ResourceConstant | null;
        const collectTarget = this.getCollectMineralTarget(this.task.targetPlace, specificMineral);

        if (collectTarget instanceof Resource) {
          this.pickup(collectTarget);
        } else if (collectTarget && "store" in collectTarget) {
          const targetResource = this.getStoreMineralResourceType(collectTarget, specificMineral);
          if (targetResource) {
            this.withdraw(collectTarget, targetResource);
          }
        }

        const amountLeft = this.getCollectMineralAmountLeft(collectTarget, specificMineral);
        if (this.store.getFreeCapacity() === 0 || !collectTarget || amountLeft === 0) {
          this.creep.say("Min Col Done");
          this.task.taskDone = true;
        }
        break;
      }
    }

    // Check if needs to suicide
    if (this.willSuicideAtTick) {
      this.creep.say(`Dead in ${this.willSuicideAtTick - Game.time}`);
      if (Game.time >= this.willSuicideAtTick) {
        this.creep.say("💀");
        this.suicide();
      }
    }
  }

  public updateSomeMemoryAtTheEndOfTheTick() {
    if (!this.creep.memory.lastTickEnergy) {
      this.creep.memory.lastTickEnergy = 0;
    }

    const currentEnergy = this.creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const gained = Math.max(0, currentEnergy - this.creep.memory.lastTickEnergy ?? 0);

    if (gained > 0) {
      this.trackRemoteEnergyCollected(gained);
    }

    this.creep.memory.lastTickEnergy = currentEnergy;
  }

  private getCollectMineralTarget(
    targetPlace: RoomPosition,
    specificMineral: ResourceConstant | null
  ): Structure | Ruin | Tombstone | Resource | null {
    const dropped = CreepTask.getResourceFromTarget(targetPlace);
    if (dropped && this.isValidMineralResource(dropped.resourceType, specificMineral) && dropped.amount > 0) {
      return dropped;
    }

    const tombstone = CreepTask.getTombstoneFromTarget(targetPlace);
    if (tombstone && this.getStoreMineralAmount(tombstone, specificMineral) > 0) {
      return tombstone;
    }

    const ruin = CreepTask.getRuinFromTarget(targetPlace);
    if (ruin && this.getStoreMineralAmount(ruin, specificMineral) > 0) {
      return ruin;
    }

    const structure = CreepTask.getStructureFromTargetNoRoadNoRampart(targetPlace);
    if (structure && "store" in structure && this.getStoreMineralAmount(structure, specificMineral) > 0) {
      return structure;
    }

    return null;
  }

  private getCollectMineralAmountLeft(
    target: Structure | Ruin | Tombstone | Resource | null,
    specificMineral: ResourceConstant | null
  ): number {
    if (!target) return 0;
    if (target instanceof Resource) {
      return this.isValidMineralResource(target.resourceType, specificMineral) ? target.amount : 0;
    }
    if (!("store" in target)) return 0;
    return this.getStoreMineralAmount(target, specificMineral);
  }

  private getStoreMineralAmount(
    target: { store: Store<ResourceConstant, boolean> },
    specificMineral: ResourceConstant | null
  ): number {
    const resourceType = this.getStoreMineralResourceType(target, specificMineral);
    if (!resourceType) return 0;

    return target.store.getUsedCapacity(resourceType) ?? 0;
  }

  private getStoreMineralResourceType(
    target: { store: Store<ResourceConstant, boolean> },
    specificMineral: ResourceConstant | null
  ): ResourceConstant | null {
    if (specificMineral) {
      if (!this.isValidMineralResource(specificMineral, specificMineral)) return null;
      const amount = target.store.getUsedCapacity(specificMineral) ?? 0;
      return amount > 0 ? specificMineral : null;
    }

    for (const resourceType in target.store) {
      const resource = resourceType as ResourceConstant;
      if (!this.isValidMineralResource(resource, null)) continue;
      const amount = target.store.getUsedCapacity(resource) ?? 0;
      if (amount > 0) return resource;
    }

    return null;
  }

  private isValidMineralResource(
    resourceType: ResourceConstant | null,
    specificMineral: ResourceConstant | null
  ): boolean {
    if (!resourceType) return false;
    if (specificMineral) return resourceType === specificMineral;
    return resourceType !== RESOURCE_ENERGY;
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

  private trackRemoteEnergyCollected(gainedEnergy: number): void {
    if (this.creepType !== CreepType.Carrier) {
      return;
    }

    const remoteRoomName = this.memory.remoteRoomName;
    if (!remoteRoomName || this.room.name !== remoteRoomName) {
      return;
    }

    const remoteRoomEconomy = Memory.remoteRoomEconomy ?? {};
    const currentStats = remoteRoomEconomy[remoteRoomName] ?? { energyCollected: 0, energySpent: 0 };
    currentStats.energyCollected += gainedEnergy;
    remoteRoomEconomy[remoteRoomName] = currentStats;
    Memory.remoteRoomEconomy = remoteRoomEconomy;
  }

  public upgradeController(controller: StructureController): ScreepsReturnCode {
    if (Game.time % 100 === 0 && controller.sign?.username !== Helper.getUserName()) {
      const result = this.creep.signController(controller, "Upgraded by me!");
      if (result === ERR_NOT_IN_RANGE) {
        this.goTo(controller.pos);
      }
      return result;
    }
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
    if (Game.time % 100 === 0 && controller.sign?.username !== Helper.getUserName()) {
      const result = this.creep.signController(controller, "Reserved by me, no touchy touchy!");
      if (result === ERR_NOT_IN_RANGE) {
        this.goTo(controller.pos);
      }
      return result;
    }
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
    if (result === ERR_NO_BODYPART) {
      result = this.creep.rangedAttack(creep);
    }
    // Always move towards the target.
    this.goTo(creep.pos);
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

  public transferCreepToArea(areaIdFrom: string, areaIdTo: string): void {
    this.registerCreepToArea(areaIdTo);
    this.removeCreepFromThisArea(areaIdFrom);
  }

  /** Add a creep to an area's memory list (idempotent). */
  private registerCreepToArea(areaId: string): void {
    const creepNames: string[] = Helper.getCashedMemory(areaId, []);
    if (!creepNames.includes(this.creep.name)) {
      creepNames.push(this.creep.name);
      Helper.setCashedMemory(areaId, creepNames);
    }
  }

  /** Remove a creep name from this area's memory list. */
  private removeCreepFromThisArea(areaId: string): void {
    const key = `RemoteRebuildArea-${areaId}`;
    const creepNames: string[] = Helper.getCashedMemory(key, []);
    const idx = creepNames.indexOf(this.creep.name);
    if (idx !== -1) {
      creepNames.splice(idx, 1);
      Helper.setCashedMemory(key, creepNames);
    }
  }
}
