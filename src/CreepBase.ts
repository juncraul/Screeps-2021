import { Helper } from "Helpers/Helper";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import { CreepType } from "CreepType";
import BaseRoomStats from "Areas/BaseRoom/BaseRoomStats";

export class CreepBase {
  private static readonly HARVEST_DIRECT_COLLECT_INTENT = "__harvest_direct__";

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
    if (this.task.taskDone) return;
    switch (this.task.activity) {
      case Activity.Harvest: // 0
        this.activityHarvest();
        break;
      case Activity.Construct: // 1
        this.activityConstruct();
        break;
      case Activity.Deposit: // 2
        this.activityDeposit();
        break;
      case Activity.Move: // 3
        this.activityMove();
        break;
      case Activity.Collect: // 4
        this.activityCollect();
        break;
      // TODO: There is a tick pause between collection and upgrade.
      case Activity.Upgrade: // 5
        this.activityUpgrade();
        break;
      case Activity.Pickup: // 6
        this.activityPickup();
        break;
      case Activity.Claim: // 7
        this.activityClaim();
        break;
      case Activity.MoveDifferentRoom: // 8
        this.activityMoveDifferentRoom();
        break;
      case Activity.Reserve: // 9
        this.activityReserve();
        break;
      case Activity.HarvestAndDeposit: // 10
        this.activityHarvestAndDeposit();
        break;
      case Activity.Repair: // 11
        this.activityRepair();
        break;
      case Activity.Attack: // 12
        this.activityAttack();
        break;
      case Activity.RangedAttack: // 13
        this.activityRangedAttack();
        break;
      case Activity.HarvestMineral: // 15
        this.activityHarvestMineral();
        break;
      case Activity.DepositMineral: // 16
        this.activityDepositMineral();
        break;
      case Activity.CollectMineral: // 17
        this.activityCollectMineral();
        break;
      case Activity.Drop: // 18
        this.activityDrop();
        break;
      case Activity.Dismantle: // 19
        this.activityDismantle();
        break;
      case Activity.AttackController: // 20
        this.activityAttackController();
        break;
    }

    // Check if needs to suicide
    if (this.willSuicideAtTick) {
      this.creep.say(`Dead in ${this.willSuicideAtTick - Game.time}`);
      if (Game.time >= this.willSuicideAtTick) {
        this.creep.say("💀");
        console.log(`Creep ${this.name} is suiciding at tick ${Game.time} as scheduled.`);
        this.suicide();
      }
    }
  }

  public updateSomeMemoryAtTheEndOfTheTick() {
    if (!this.creep.memory.lastTickEnergy) {
      this.creep.memory.lastTickEnergy = 0;
    }

    const currentEnergy = this.creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const delta = currentEnergy - this.creep.memory.lastTickEnergy;
    const gained = Math.max(0, delta);
    const spent = Math.max(0, -delta);

    if (gained > 0) {
      const collectIntent = this.creep.memory.baseRoomCollectIntentCategory;
      if (collectIntent !== CreepBase.HARVEST_DIRECT_COLLECT_INTENT) {
        const collectedCategory = collectIntent ?? `deltaCollect:${this.getEnergyStatsRole()}`;
        BaseRoomStats.addCollected(this.room.name, gained, collectedCategory);
      }
      this.trackRemoteEnergyCollected(gained);
    }

    if (spent > 0) {
      const spentCategory = this.creep.memory.baseRoomSpendIntentCategory ?? `deltaSpend:${this.getEnergyStatsRole()}`;
      BaseRoomStats.addSpent(this.room.name, spent, spentCategory);
    }

    this.creep.memory.lastTickEnergy = currentEnergy;
    delete this.creep.memory.baseRoomCollectIntentCategory;
    delete this.creep.memory.baseRoomSpendIntentCategory;
  }

  private completeTask(message?: string) {
    if (message && !this.task?.silent) {
      this.creep.say(message);
    }
    if (this.task) {
      this.task.taskDone = true;
    }
  }

  private activityHarvest(): void {
    const source: Source | null = CreepTask.getSourceFromTarget(this.task!.targetPlace);
    if (source) {
      this.harvest(source);
    }
    if (this.carryCapacity > 0 && this.carryCapacity === this.carryCurrent) {
      this.completeTask("⛏️✔️");
    }
  }

  private activityConstruct(): void {
    const constructionSite: ConstructionSite | null = CreepTask.getConstructionSiteFromTarget(this.task!.targetPlace);
    if (constructionSite) {
      this.build(constructionSite);
    }
    if (this.carryCurrent === 0 || !constructionSite) {
      this.completeTask("🚧✔️");
    }
  }

  private activityDeposit(): void {
    const structure: Structure | null = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task!.targetPlace);
    if (structure) {
      const result = this.transfer(structure, RESOURCE_ENERGY);
      if (result === OK) {
        this.completeTask("✉️✔️");
      } else if (result === ERR_FULL) {
        this.completeTask("Str Full");
      }
    } else {
      const roomPos = new RoomPosition(
        this.task!.targetPlace.x,
        this.task!.targetPlace.y,
        this.task!.targetPlace.roomName
      );
      const creep = GetRoomObjects.getClosestMyCreepByRange(roomPos);
      if (creep) {
        const result = this.transfer(creep, RESOURCE_ENERGY);
        if (result === OK) {
          this.completeTask("✉️✔️");
        } else {
          this.completeTask("✉️✔️");
        }
      } else {
        this.completeTask("✉️✔️");
      }
    }
    if (this.carryCurrent === 0) {
      this.completeTask("Dep✔️");
    }
  }

  private activityMove(): void {
    const roomPosition = CreepTask.getRoomPositionFromTarget(this.task!.targetPlace);
    this.goTo(roomPosition);

    if (this.task?.value) {
      if (Helper.isInRange(this.pos, roomPosition, this.task.value)) {
        this.completeTask("👣✔️");
      }
    } else {
      if (Helper.isSamePosition(this.pos, roomPosition)) {
        this.completeTask("👣✔️");
      }
    }
  }

  private activityCollect(): void {
    let targetCollect: Structure | Tombstone | Ruin | null = CreepTask.getStructureFromTargetNoRoadNoRampart(
      this.task!.targetPlace
    );
    if (!targetCollect) {
      targetCollect = CreepTask.getTombstoneFromTarget(this.task!.targetPlace);
      if (!targetCollect) {
        targetCollect = CreepTask.getRuinFromTarget(this.task!.targetPlace);
      }
    }
    if (!targetCollect) {
      targetCollect = CreepTask.getRuinFromTarget(this.task!.targetPlace);
      if (!targetCollect) {
        this.completeTask("📦✔️"); // Target must have dissappeared.
      }
    }
    if (targetCollect) {
      const result = this.withdraw(targetCollect, RESOURCE_ENERGY);
      if (result === OK) {
        this.completeTask("📦✔️");
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
        this.completeTask("📦✔️");
      }
    } else if (
      targetCollect instanceof StructureLink ||
      targetCollect instanceof StructureExtension ||
      targetCollect instanceof StructureSpawn ||
      targetCollect instanceof StructureTower
    ) {
      if (targetCollect.store.energy === 0) {
        this.completeTask("📦✔️");
      }
    } else if (targetCollect instanceof Resource) {
      if (targetCollect.amount === 0) {
        this.completeTask("📦✔️");
      }
    }
    if (this.carryCurrent === this.carryCapacity) {
      this.completeTask("📦✔️");
    }
  }

  private activityUpgrade(): void {
    const controller: StructureController | null = CreepTask.getControllerFromTarget(this.task!.targetPlace);
    if (controller) {
      this.upgradeController(controller);
    }
    if (this.carryCurrent === 0) {
      this.completeTask("Upg✔️");
    }
  }

  private activityPickup(): void {
    const targetPickup: Resource | null = CreepTask.getResourceFromTarget(this.task!.targetPlace);
    if (targetPickup) {
      const result = this.pickup(targetPickup);
      if (result === OK) {
        this.completeTask("🫳✔️");
      }
    }
    if (!targetPickup || this.carryCurrent === this.carryCapacity) {
      this.completeTask("🫳✔️");
    }
  }

  private activityClaim(): void {
    const controller: StructureController | null = CreepTask.getControllerFromTarget(this.task!.targetPlace);
    if (controller) {
      const result = this.claim(controller);
      console.log(
        `Claiming controller in room ${controller.room.name} with creep ${this.name}, result: ${String(result)}`
      );
      if (result === OK) {
        this.completeTask("Claim✔️");
      }
    }
  }

  private activityMoveDifferentRoom(): void {
    const targetPos: RoomPosition = CreepTask.getRoomPositionFromTarget(this.task!.targetPlace);
    const currentRoom = this.room.name;
    if (targetPos.roomName === currentRoom) {
      if (this.creep.pos.x !== 0 && this.creep.pos.x !== 49 && this.creep.pos.y !== 0 && this.creep.pos.y !== 49) {
        this.completeTask("👣✔️");
      } else {
        this.goTo(targetPos);
      }
      return;
    }

    const reRouteRoom = GetRoomObjects.getReRouteRoom(targetPos.roomName, currentRoom);
    // If a ReRoute flag exists for this (target, from) pair, route through that room first.
    let moveTarget =
      reRouteRoom && reRouteRoom !== currentRoom && reRouteRoom !== targetPos.roomName
        ? new RoomPosition(25, 25, reRouteRoom)
        : targetPos;

    const exitDir = Game.map.findExit(this.creep.room.name, targetPos.roomName);
    if (exitDir === ERR_NO_PATH || exitDir === ERR_INVALID_ARGS) return;
    const exits = this.creep.room.find(exitDir);

    moveTarget = exits[0];

    this.goTo(moveTarget, { visualizePathStyle: { stroke: "#ffffff" } });
  }

  private activityReserve(): void {
    const controller: StructureController | null = CreepTask.getControllerFromTarget(this.task!.targetPlace);
    if (controller) {
      this.reserve(controller);
    }
  }

  private activityHarvestAndDeposit(): void {
    const source: Source | null = CreepTask.getSourceFromTarget(this.task!.targetPlace);
    if (source) {
      this.harvest(source);
    }
    const structureEmptyExtensions = GetRoomObjects.getWithinRangeExtensions(this.creep.pos, 1).find(
      a => a.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
    if (structureEmptyExtensions) {
      if (this.transfer(structureEmptyExtensions, RESOURCE_ENERGY) !== OK) {
        this.drop(RESOURCE_ENERGY);
      }
    } else {
      const structureLink = GetRoomObjects.getWithinRangeLink(this.creep.pos, 1);
      if (structureLink) {
        if (this.transfer(structureLink, RESOURCE_ENERGY) !== OK) {
          this.drop(RESOURCE_ENERGY);
        }
      }
    }
  }

  private activityRepair(): void {
    const structures: Structure[] = CreepTask.getStructuresFromTarget(this.task!.targetPlace);
    const structureRampart = structures.find(s => s.structureType === STRUCTURE_RAMPART);
    let foundSomethingToRepair = false;
    for (let i = 0; i < structures.length; i++) {
      if (structures[i].structureType !== STRUCTURE_RAMPART && structures[i].hits < structures[i].hitsMax) {
        this.repair(structures[i]);
        foundSomethingToRepair = true;
        break;
      }
    }
    if (!foundSomethingToRepair && structureRampart && structureRampart.hits < structureRampart.hitsMax) {
      this.repair(structureRampart);
      foundSomethingToRepair = true;
    }
    if (this.carryCurrent === 0 || !foundSomethingToRepair) {
      this.completeTask("Rep✔️");
    }
  }

  private activityAttack(): void {
    if (!this.task?.targetId) {
      return;
    }
    const entityToAttack: Creep | Structure | null = Game.getObjectById(this.task.targetId as Id<Creep | Structure>);
    if (entityToAttack) {
      if (entityToAttack.pos.roomName !== this.room.name) {
        this.completeTask("Enemy fled");
        this.completeTask("Enemy fled");
        return;
      }
      this.attack(entityToAttack);
    }
    if (!entityToAttack || entityToAttack.hits === 0) {
      this.completeTask("Enemy dead");
    }
  }

  private activityRangedAttack(): void {
    if (!this.task?.targetId) {
      return;
    }
    const entityToAttack: Creep | Structure | null = Game.getObjectById(this.task.targetId as Id<Creep | Structure>);
    if (entityToAttack) {
      if (entityToAttack.pos.roomName !== this.room.name) {
        this.completeTask("Enemy fled");
        this.completeTask("Enemy fled");
        return;
      }
      this.rangedAttack(entityToAttack);
    }
    if (!entityToAttack || entityToAttack.hits === 0) {
      this.completeTask("Enemy dead");
    }
  }

  private activityHarvestMineral(): void {
    const mineralAtPos = CreepTask.getMineralFromTarget(this.task!.targetPlace);
    if (mineralAtPos && mineralAtPos.mineralAmount > 0) {
      this.harvest(mineralAtPos);
    }
    if (this.task!.targetPlaceSecond) {
      const container = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task!.targetPlaceSecond);
      if (container instanceof StructureContainer && this.store.getUsedCapacity() > 0) {
        for (const resourceType in this.store) {
          if ((this.store[resourceType as ResourceConstant] ?? 0) > 0) {
            this.transfer(container, resourceType as ResourceConstant);
            break;
          }
        }
      }
    }
    if (!mineralAtPos || mineralAtPos.mineralAmount === 0) {
      this.completeTask("Min✔️");
    }
  }

  private activityDepositMineral(): void {
    const storageStruct = CreepTask.getStructureFromTargetNoRoadNoRampart(this.task!.targetPlace);
    if (storageStruct) {
      const resourceType = Object.keys(this.creep.store)[0] as ResourceConstant | undefined;
      if (resourceType) {
        const result = this.transfer(storageStruct, resourceType);
        if (result === OK || result === ERR_FULL) {
          this.completeTask("Min Dep✔️");
        }
      } else {
        this.completeTask("No min");
      }
    }
    if (this.store.getUsedCapacity() === 0) {
      this.completeTask("Min Dep✔️");
    }
  }

  private activityCollectMineral(): void {
    const specificMineral = this.task!.targetId as ResourceConstant | null;
    const collectTarget = this.getCollectMineralTarget(this.task!.targetPlace, specificMineral);

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
      this.completeTask("Min Col✔️");
    }
  }

  private activityDrop(): void {
    for (const resourceType in this.store) {
      if ((this.store[resourceType as ResourceConstant] ?? 0) > 0) {
        this.drop(resourceType as ResourceConstant);
      }
    }
    if (this.store.getUsedCapacity() === 0) {
      this.completeTask("Drop✔️");
    }
  }

  private activityDismantle(): void {
    if (!this.task?.targetId) {
      return;
    }
    const entityToAttack: Structure | null = Game.getObjectById(this.task.targetId as Id<Structure>);
    if (entityToAttack) {
      if (entityToAttack.pos.roomName !== this.room.name) {
        this.completeTask("Enemy fled");
        this.completeTask("Enemy fled");
        return;
      }
      this.dismantle(entityToAttack);
    }
    if (!entityToAttack || entityToAttack.hits === 0) {
      this.completeTask("Enemy dead");
    }
  }

  private activityAttackController(): void {
    const controller: StructureController | null = CreepTask.getControllerFromTarget(this.task!.targetPlace);
    if (controller) {
      this.attackController(controller);
    }
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
    if (result === OK) {
      this.markEnergySpendIntent("build");
    }
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(structure.pos);
    }
    return result;
  }

  public repair(structure: Structure): ScreepsReturnCode {
    const result = this.creep.repair(structure);
    if (result === OK) {
      this.markEnergySpendIntent("repair");
    }
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(structure.pos);
    }
    return result;
  }

  public harvest(source: Source | Mineral): ScreepsReturnCode {
    // Don't think will ever have the creep's internal cooldown longer than EXTRACTOR_COOLDOWN
    const result = this.creep.harvest(source);
    if (result === OK && source instanceof Source) {
      const estimatedHarvested = this.creep.getActiveBodyparts(WORK) * HARVEST_POWER;
      if (estimatedHarvested > 0) {
        BaseRoomStats.addCollected(this.room.name, estimatedHarvested, `harvest:${this.getEnergyStatsRole()}`);
      }
      // Harvest is accounted directly above; prevent gain-delta path from double counting it.
      this.creep.memory.baseRoomCollectIntentCategory = CreepBase.HARVEST_DIRECT_COLLECT_INTENT;
    }
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(source.pos);
    }
    return result;
  }

  public goTo(destination: RoomPosition, movementOption: MoveToOpts = {}) {
    return this.creep.moveTo(destination, movementOption);
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
    if (result === OK && resourceType === RESOURCE_ENERGY) {
      this.markEnergySpendIntent(this.getTransferCategory(target));
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
    if (result === OK && resourceType === RESOURCE_ENERGY) {
      this.markEnergyCollectIntent("withdraw");
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
    if (result === OK && resource.resourceType === RESOURCE_ENERGY) {
      this.markEnergyCollectIntent("pickup");
    }
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

  public upgradeController(controller: StructureController): ScreepsReturnCode | ERR_ACCESS_DENIED {
    if (Game.time % 100 === 0 && controller.sign?.username !== Helper.getUserName()) {
      const result = this.creep.signController(controller, "Upgraded by me!");
      if (result === ERR_NOT_IN_RANGE) {
        this.goTo(controller.pos);
      }
      return result;
    }
    const result = this.creep.upgradeController(controller);
    if (result === OK) {
      this.markEnergySpendIntent("upgrade");
    }
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

  public reserve(controller: StructureController): ScreepsReturnCode | ERR_ACCESS_DENIED {
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
    } else if (result === ERR_INVALID_TARGET) {
      this.creep.attackController(controller);
    }
    return result;
  }

  public claim(controller: StructureController): ScreepsReturnCode | ERR_ACCESS_DENIED {
    const result = this.creep.claimController(controller);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(controller.pos);
    }
    return result;
  }

  public drop(resouce: ResourceConstant): ScreepsReturnCode {
    const result = this.creep.drop(resouce);
    if (result === OK && resouce === RESOURCE_ENERGY) {
      this.markEnergySpendIntent("drop");
    }
    return result;
  }

  private markEnergyCollectIntent(action: string): void {
    this.creep.memory.baseRoomCollectIntentCategory = `${action}:${this.getEnergyStatsRole()}`;
  }

  private markEnergySpendIntent(action: string): void {
    this.creep.memory.baseRoomSpendIntentCategory = `${action}:${this.getEnergyStatsRole()}`;
  }

  private getEnergyStatsRole(): string {
    return CreepType[this.creepType] ?? this.memory.role ?? "Unknown";
  }

  private getTransferCategory(target: Creep | CreepBase | Structure): string {
    if (target instanceof CreepBase) {
      return "transfer:CreepBase";
    }
    if (target instanceof Creep) {
      return "transfer:Creep";
    }
    return `transfer:${target.structureType}`;
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

  public rangedAttack(creep: Creep | Structure) {
    this.creep.rangedAttack(creep);

    // Always move towards the target.
    this.goTo(creep.pos);
    return OK;
  }

  public dismantle(structure: Structure) {
    const result = this.creep.dismantle(structure);
    if (result === ERR_NOT_IN_RANGE) {
      this.goTo(structure.pos);
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
