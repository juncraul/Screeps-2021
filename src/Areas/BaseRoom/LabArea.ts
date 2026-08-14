import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { CreepBase } from "CreepBase";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

const MIN_TERMINAL_RESOURCE = 5000;
const LAB_REAGENT_TARGET = 300;
const LAB_ENERGY_TARGET = 2000;
const REACTION_PLAN_SEARCH_COOLDOWN = 100;

interface LabReactionPlan {
  product: ResourceConstant;
  reagentA: ResourceConstant;
  reagentB: ResourceConstant;
  inputLabAId: Id<StructureLab>;
  inputLabBId: Id<StructureLab>;
  outputLabIds: Id<StructureLab>[];
}

interface ImmediateReaction {
  product: ResourceConstant;
  reagentA: ResourceConstant;
  reagentB: ResourceConstant;
}

interface LabReactionPlanMemory {
  product: ResourceConstant;
  reagentA: ResourceConstant;
  reagentB: ResourceConstant;
  inputLabAId: Id<StructureLab>;
  inputLabBId: Id<StructureLab>;
  outputLabIds: Id<StructureLab>[];
}

interface BoostRequirement {
  bodyPart: BodyPartConstant;
  effect: string;
}

export default class LabArea extends BaseArea {
  private readonly maxWorkerCount: number;
  private readonly storage: StructureStorage;
  private readonly terminal: StructureTerminal | null;
  private readonly labs: StructureLab[];

  public constructor(storage: StructureStorage) {
    super("LabArea", storage.room.name, storage.pos, storage.room);
    this.maxWorkerCount = 1;
    this.storage = storage;
    this.terminal = GetRoomObjects.getRoomTerminal(storage.room);
    this.labs = GetRoomObjects.getRoomLabs(storage.room);
  }

  public handleThisArea(): void {
    if (this.labs.length === 0) {
      return;
    }

    const boostWorkHandled = this.handleBoosting();
    if (boostWorkHandled) {
      return;
    }

    if (!this.terminal || this.labs.length < 3) {
      return;
    }

    const plan = this.getReactionPlan();
    if (plan) {
      this.runLabReactions(plan);
    }
    this.handleCreeps(plan);
  }

  public handleSpawnTasks(): SpawnTask[] {
    if (!this.terminal || this.labs.length < 3) {
      return [];
    }

    const plan = this.getReactionPlan();
    if (!this.hasLaboratoryWork(plan)) {
      return [];
    }

    const tasks: SpawnTask[] = [];
    if (this.creeps.length < this.maxWorkerCount) {
      const spawnTask = this.createCreepForThisArea();
      if (spawnTask) {
        tasks.push(spawnTask);
      }
    }
    return tasks;
  }

  private handleCreeps(plan: LabReactionPlan | null): void {
    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;

      if (creep.isEmpty()) {
        this.assignPickupTask(creep, plan);
      } else {
        this.assignDeliveryTask(creep, plan);
      }
    }
  }

  private assignPickupTask(creep: CreepBase, plan: LabReactionPlan | null): void {
    const terminal = this.terminal;
    if (!terminal) {
      return;
    }

    const cleanupTarget = this.findLabCleanupTarget(plan);
    if (cleanupTarget) {
      const resource = cleanupTarget.mineralType as ResourceConstant;
      creep.addTask(new CreepTask(Activity.CollectMineral, cleanupTarget.pos, null, resource));
      return;
    }

    // const terminalExcess = this.getTerminalExcessResource();
    // if (terminalExcess) {
    //   creep.addTask(
    //     new CreepTask(
    //       Activity.CollectMineral,
    //       terminal.pos,
    //       null,
    //       terminalExcess.resource,
    //       false,
    //       terminalExcess.amount
    //     )
    //   );
    //   return;
    // }

    // const terminalDeficit = this.getTerminalDeficitResource();
    // if (terminalDeficit && this.storage.store.getUsedCapacity(terminalDeficit) > 0) {
    //   creep.addTask(new CreepTask(Activity.CollectMineral, this.storage.pos, null, terminalDeficit));
    //   return;
    // }

    if (plan) {
      const inputLabA = Game.getObjectById(plan.inputLabAId);
      const inputLabB = Game.getObjectById(plan.inputLabBId);

      if (inputLabA !== null && (inputLabA.store.getUsedCapacity(plan.reagentA) ?? 0) < LAB_REAGENT_TARGET) {
        if (this.storage.store.getUsedCapacity(plan.reagentA) > 0) {
          creep.addTask(new CreepTask(Activity.CollectMineral, this.storage.pos, null, plan.reagentA));
          return;
        }
        if (terminal.store.getUsedCapacity(plan.reagentA) > 0) {
          creep.addTask(new CreepTask(Activity.CollectMineral, terminal.pos, null, plan.reagentA));
          return;
        }
      }

      if (inputLabB !== null && (inputLabB.store.getUsedCapacity(plan.reagentB) ?? 0) < LAB_REAGENT_TARGET) {
        if (this.storage.store.getUsedCapacity(plan.reagentB) > 0) {
          creep.addTask(new CreepTask(Activity.CollectMineral, this.storage.pos, null, plan.reagentB));
          return;
        }
        if (terminal.store.getUsedCapacity(plan.reagentB) > 0) {
          creep.addTask(new CreepTask(Activity.CollectMineral, terminal.pos, null, plan.reagentB));
          return;
        }
      }
    }

    const energyHungryLab = this.labs.find(lab => lab.store.getUsedCapacity(RESOURCE_ENERGY) < LAB_ENERGY_TARGET);
    if (energyHungryLab) {
      if (this.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        creep.addTask(new CreepTask(Activity.CollectEnergy, this.storage.pos));
        return;
      }
      if (terminal.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        creep.addTask(new CreepTask(Activity.CollectEnergy, terminal.pos));
      }
    }
  }

  private assignDeliveryTask(creep: CreepBase, plan: LabReactionPlan | null): void {
    const terminal = this.terminal;
    if (!terminal) {
      return;
    }

    const carriedResource = Object.keys(creep.store).find(
      resource => (creep.store[resource as ResourceConstant] ?? 0) > 0
    ) as ResourceConstant | undefined;

    if (!carriedResource) {
      return;
    }

    if (carriedResource === RESOURCE_ENERGY) {
      const needyLab = this.labs.find(lab => lab.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
      if (needyLab) {
        creep.addTask(new CreepTask(Activity.Deposit, needyLab.pos));
      } else {
        creep.addTask(new CreepTask(Activity.Deposit, this.storage.pos));
      }
      return;
    }

    if (plan) {
      const inputLabA = Game.getObjectById(plan.inputLabAId);
      if (
        inputLabA !== null &&
        carriedResource === plan.reagentA &&
        (!inputLabA.mineralType || inputLabA.mineralType === plan.reagentA) &&
        (inputLabA.store.getFreeCapacity(plan.reagentA) ?? 0) > 0
      ) {
        creep.addTask(new CreepTask(Activity.DepositMineral, inputLabA.pos));
        return;
      }

      const inputLabB = Game.getObjectById(plan.inputLabBId);
      if (
        inputLabB !== null &&
        carriedResource === plan.reagentB &&
        (!inputLabB.mineralType || inputLabB.mineralType === plan.reagentB) &&
        (inputLabB.store.getFreeCapacity(plan.reagentB) ?? 0) > 0
      ) {
        creep.addTask(new CreepTask(Activity.DepositMineral, inputLabB.pos));
        return;
      }
    }

    const terminalAmount = terminal.store.getUsedCapacity(carriedResource);
    if (terminalAmount < MIN_TERMINAL_RESOURCE && terminal.store.getFreeCapacity(carriedResource) > 0) {
      creep.addTask(new CreepTask(Activity.DepositMineral, terminal.pos));
      return;
    }

    creep.addTask(new CreepTask(Activity.DepositMineral, this.storage.pos));
  }

  private handleBoosting(): boolean {
    let boostWorkHandled = false;

    const creepsInRoom = this.room.find(FIND_MY_CREEPS);
    for (const roomCreep of creepsInRoom) {
      const creep = new CreepBase(roomCreep);
      if (!this.shouldTryBoost(creep)) {
        continue;
      }

      const boostLab = this.getBestBoostLabForCreep(creep);
      if (!boostLab) {
        continue;
      }

      boostWorkHandled = true;
      if (creep.pos.isNearTo(boostLab.pos)) {
        boostLab.boostCreep(creep.creep);
        continue;
      }

      if (!this.isMoveTaskToBoostLab(creep, boostLab)) {
        creep.addTask(new CreepTask(Activity.Move, boostLab.pos, null, null, true));
      }
    }

    return boostWorkHandled;
  }

  private shouldTryBoost(creep: CreepBase): boolean {
    if (creep.spawning) {
      return false;
    }
    if ((creep.ticksToLive ?? 0) >= 1450) {
      return false;
    }
    if (creep.creep.body.some(part => !!part.boost)) {
      return false;
    }

    const boostRequirement = this.getBoostRequirementForCreep(creep);
    if (!boostRequirement) {
      return false;
    }

    return creep.getNumberOfBodyPart(boostRequirement.bodyPart) > 0;
  }

  private getBoostRequirementForCreep(creep: CreepBase): BoostRequirement | null {
    switch (creep.creepType) {
      case CreepType.Harvester:
      case CreepType.MineralHarvester:
        return { bodyPart: WORK, effect: "harvest" };
      case CreepType.Upgrader:
        return { bodyPart: WORK, effect: "upgradeController" };
      case CreepType.Constructor:
        return { bodyPart: WORK, effect: "build" };
      case CreepType.Repairer:
        return { bodyPart: WORK, effect: "repair" };
      case CreepType.Dismantler:
        return { bodyPart: WORK, effect: "dismantle" };
      case CreepType.Carrier:
      case CreepType.Collector:
      case CreepType.Utility:
      case CreepType.MineralCarrier:
      case CreepType.StationaryFiller:
      case CreepType.Clerk:
      case CreepType.Laboratorian:
      case CreepType.Looter:
        return { bodyPart: CARRY, effect: "capacity" };
      case CreepType.Melee:
      case CreepType.Defender:
        return { bodyPart: ATTACK, effect: "attack" };
      case CreepType.Ranged:
      case CreepType.DefenseRanger:
        return { bodyPart: RANGED_ATTACK, effect: "rangedAttack" };
      case CreepType.Healer:
      case CreepType.DefenseHealer:
        return { bodyPart: HEAL, effect: "heal" };
      case CreepType.Claimer:
        return { bodyPart: CLAIM, effect: "claim" };
      default:
        return null;
    }
  }

  private getBestBoostLabForCreep(creep: CreepBase): StructureLab | null {
    const boostRequirement = this.getBoostRequirementForCreep(creep);
    if (!boostRequirement) {
      return null;
    }

    const boostOptions = BOOSTS[boostRequirement.bodyPart] as Record<string, Record<string, number>> | undefined;
    if (!boostOptions) {
      return null;
    }

    const candidateLabs = this.labs
      .filter(lab => {
        const mineralType = lab.mineralType;
        if (!mineralType) {
          return false;
        }
        const boostMineralType = mineralType as ResourceConstant;
        const boostForMineral = boostOptions[boostMineralType];
        if (!boostForMineral || boostForMineral[boostRequirement.effect] === undefined) {
          return false;
        }
        const storedEnergy = lab.store[RESOURCE_ENERGY] ?? 0;
        const storedMineral = lab.store[boostMineralType] ?? 0;
        return storedEnergy >= LAB_BOOST_ENERGY && storedMineral >= LAB_BOOST_MINERAL;
      })
      .sort((a, b) => {
        const mineralA = a.mineralType as ResourceConstant;
        const mineralB = b.mineralType as ResourceConstant;
        const boostValueA = boostOptions[mineralA]?.[boostRequirement.effect] ?? 0;
        const boostValueB = boostOptions[mineralB]?.[boostRequirement.effect] ?? 0;
        if (boostValueB !== boostValueA) {
          return boostValueB - boostValueA;
        }
        return creep.pos.getRangeTo(a.pos) - creep.pos.getRangeTo(b.pos);
      });

    return candidateLabs[0] ?? null;
  }

  private isMoveTaskToBoostLab(creep: CreepBase, lab: StructureLab): boolean {
    return (
      creep.task?.activity === Activity.Move &&
      creep.task.targetPlace.roomName === lab.pos.roomName &&
      creep.task.targetPlace.x === lab.pos.x &&
      creep.task.targetPlace.y === lab.pos.y
    );
  }

  private runLabReactions(plan: LabReactionPlan): void {
    const inputLabA = Game.getObjectById(plan.inputLabAId);
    const inputLabB = Game.getObjectById(plan.inputLabBId);
    if (inputLabA === null || inputLabB === null) {
      return;
    }

    if ((inputLabA.store.getUsedCapacity(plan.reagentA) ?? 0) < LAB_REACTION_AMOUNT) {
      return;
    }
    if ((inputLabB.store.getUsedCapacity(plan.reagentB) ?? 0) < LAB_REACTION_AMOUNT) {
      return;
    }

    for (const outputLabId of plan.outputLabIds) {
      const outputLab = Game.getObjectById(outputLabId);
      if (!outputLab) {
        continue;
      }
      if (outputLab.cooldown > 0) {
        continue;
      }
      if (outputLab.mineralType && outputLab.mineralType !== plan.product) {
        continue;
      }
      if (outputLab.store.getUsedCapacity(RESOURCE_ENERGY) < LAB_REACTION_AMOUNT) {
        continue;
      }
      outputLab.runReaction(inputLabA, inputLabB);
    }
  }

  private getReactionPlan(): LabReactionPlan | null {
    if (!this.terminal || this.labs.length < 3) {
      return null;
    }

    const layout = this.getLabLayout();
    if (!layout) {
      return null;
    }

    const cachedPlan = this.getCachedReactionPlan();
    if (cachedPlan) {
      if ((this.terminal.store.getUsedCapacity(cachedPlan.product) ?? 0) < MIN_TERMINAL_RESOURCE) {
        return cachedPlan;
      }

      this.clearCachedReactionPlan(Game.time + REACTION_PLAN_SEARCH_COOLDOWN);
      return null;
    }

    const nextSearchTick = this.getRoomObjectsMemory().labArea?.nextReactionPlanSearchTick ?? 0;
    if (Game.time < nextSearchTick) {
      return null;
    }

    const totals = this.getTotalMinerals();
    const terminalMinerals = this.getTerminalMinerals();
    const producible = this.getAllProducibleResources();

    const candidates = producible
      .map(resource => ({ resource, terminalAmount: terminalMinerals[resource] ?? 0 }))
      .filter(entry => entry.terminalAmount < MIN_TERMINAL_RESOURCE)
      .sort((a, b) => a.terminalAmount - b.terminalAmount);

    for (const candidate of candidates) {
      const immediate = this.findImmediateReaction(candidate.resource, totals, new Set<ResourceConstant>());
      if (!immediate) {
        continue;
      }

      const plan = {
        ...immediate,
        inputLabAId: layout.inputLabA.id,
        inputLabBId: layout.inputLabB.id,
        outputLabIds: layout.outputLabs.map(lab => lab.id)
      };

      this.setCachedReactionPlan(plan);
      return plan;
    }

    this.clearCachedReactionPlan(Game.time + REACTION_PLAN_SEARCH_COOLDOWN);
    return null;
  }

  private getCachedReactionPlan(): LabReactionPlan | null {
    const memoryPlan = this.getRoomObjectsMemory().labArea?.reactionPlan as LabReactionPlanMemory | undefined;
    if (!memoryPlan) {
      return null;
    }

    const inputLabA = Game.getObjectById(memoryPlan.inputLabAId);
    const inputLabB = Game.getObjectById(memoryPlan.inputLabBId);
    if (!inputLabA || !inputLabB) {
      this.clearCachedReactionPlan();
      return null;
    }

    if (!memoryPlan.outputLabIds.length) {
      this.clearCachedReactionPlan();
      return null;
    }

    const outputLabCount = memoryPlan.outputLabIds.filter(labId => Game.getObjectById(labId) !== null).length;
    if (outputLabCount === 0) {
      this.clearCachedReactionPlan();
      return null;
    }

    return {
      product: memoryPlan.product,
      reagentA: memoryPlan.reagentA,
      reagentB: memoryPlan.reagentB,
      inputLabAId: memoryPlan.inputLabAId,
      inputLabBId: memoryPlan.inputLabBId,
      outputLabIds: memoryPlan.outputLabIds
    };
  }

  private setCachedReactionPlan(plan: LabReactionPlan): void {
    const roomObjectsMemory = this.getRoomObjectsMemory();
    if (!roomObjectsMemory.labArea) {
      roomObjectsMemory.labArea = {};
    }

    roomObjectsMemory.labArea.reactionPlan = {
      product: plan.product,
      reagentA: plan.reagentA,
      reagentB: plan.reagentB,
      inputLabAId: plan.inputLabAId,
      inputLabBId: plan.inputLabBId,
      outputLabIds: plan.outputLabIds
    };
    roomObjectsMemory.labArea.nextReactionPlanSearchTick = undefined;
  }

  private clearCachedReactionPlan(nextSearchTick?: number): void {
    const roomObjectsMemory = this.getRoomObjectsMemory();
    if (!roomObjectsMemory.labArea) {
      roomObjectsMemory.labArea = {};
    }

    roomObjectsMemory.labArea.reactionPlan = undefined;
    if (nextSearchTick === undefined) {
      roomObjectsMemory.labArea.nextReactionPlanSearchTick = undefined;
      return;
    }

    roomObjectsMemory.labArea.nextReactionPlanSearchTick = nextSearchTick;
  }

  private getRoomObjectsMemory(): RoomObjectsMemory {
    if (!Memory.Rooms) {
      Memory.Rooms = {};
    }

    if (!Memory.Rooms[this.room.name]) {
      Memory.Rooms[this.room.name] = {
        lastTimeTopologyWasChecked: 0,
        lastUpdatedTick: 0,
        roomName: this.room.name,
        controller: null,
        sources: [],
        minerals: [],
        exits: []
      };
    }

    return Memory.Rooms[this.room.name];
  }

  private findImmediateReaction(
    target: ResourceConstant,
    totals: Record<ResourceConstant, number>,
    visited: Set<ResourceConstant>
  ): ImmediateReaction | null {
    const terminal = this.terminal;
    if (!terminal) {
      return null;
    }

    if (visited.has(target)) {
      return null;
    }
    visited.add(target);

    const reagents = this.getReactionInputs(target);
    if (!reagents) {
      return null;
    }

    const [reagentA, reagentB] = reagents;
    const hasReagentA = (totals[reagentA] ?? 0) >= LAB_REACTION_AMOUNT;
    const hasReagentB = (totals[reagentB] ?? 0) >= LAB_REACTION_AMOUNT;
    if (hasReagentA && hasReagentB) {
      return {
        product: target,
        reagentA,
        reagentB
      };
    }

    const terminalAmountA = terminal.store.getUsedCapacity(reagentA);
    const terminalAmountB = terminal.store.getUsedCapacity(reagentB);

    if (terminalAmountA < MIN_TERMINAL_RESOURCE || !hasReagentA) {
      const nextA = this.findImmediateReaction(reagentA, totals, visited);
      if (nextA) {
        return nextA;
      }
    }

    if (terminalAmountB < MIN_TERMINAL_RESOURCE || !hasReagentB) {
      const nextB = this.findImmediateReaction(reagentB, totals, visited);
      if (nextB) {
        return nextB;
      }
    }

    return null;
  }

  private getReactionInputs(product: ResourceConstant): [ResourceConstant, ResourceConstant] | null {
    const reactions = (REACTIONS as unknown) as Record<
      ResourceConstant,
      Partial<Record<ResourceConstant, ResourceConstant>>
    >;
    for (const reagentA of Object.keys(reactions) as ResourceConstant[]) {
      const productsByB = reactions[reagentA] ?? {};
      for (const reagentB of Object.keys(productsByB) as ResourceConstant[]) {
        if (productsByB[reagentB] === product) {
          return [reagentA, reagentB];
        }
      }
    }
    return null;
  }

  private getAllProducibleResources(): ResourceConstant[] {
    const resources = new Set<ResourceConstant>();
    const reactions = (REACTIONS as unknown) as Record<
      ResourceConstant,
      Partial<Record<ResourceConstant, ResourceConstant>>
    >;
    for (const reagentA of Object.keys(reactions) as ResourceConstant[]) {
      const productsByB = reactions[reagentA] ?? {};
      for (const reagentB of Object.keys(productsByB) as ResourceConstant[]) {
        const product = productsByB[reagentB];
        if (product) {
          resources.add(product);
        }
      }
    }
    return Array.from(resources.values());
  }

  private getTotalMinerals(): Record<ResourceConstant, number> {
    const total: Partial<Record<ResourceConstant, number>> = {};
    const storageKeys = Object.keys(this.storage.store) as ResourceConstant[];
    for (const resource of storageKeys) {
      total[resource] = (total[resource] ?? 0) + this.storage.store.getUsedCapacity(resource);
    }

    if (this.terminal) {
      const terminalKeys = Object.keys(this.terminal.store) as ResourceConstant[];
      for (const resource of terminalKeys) {
        total[resource] = (total[resource] ?? 0) + this.terminal.store.getUsedCapacity(resource);
      }
    }

    return total as Record<ResourceConstant, number>;
  }

  private getTerminalMinerals(): Record<ResourceConstant, number> {
    const map: Partial<Record<ResourceConstant, number>> = {};
    if (!this.terminal) {
      return map as Record<ResourceConstant, number>;
    }

    const resources = Object.keys(this.terminal.store) as ResourceConstant[];
    for (const resource of resources) {
      map[resource] = this.terminal.store.getUsedCapacity(resource);
    }
    return map as Record<ResourceConstant, number>;
  }

  private findLabCleanupTarget(plan: LabReactionPlan | null): StructureLab | null {
    for (const lab of this.labs) {
      const mineralType = lab.mineralType as ResourceConstant | null;
      if (!mineralType || lab.store.getUsedCapacity(mineralType) === 0) {
        continue;
      }

      if (!plan) {
        return lab;
      }

      if (lab.id === plan.inputLabAId && mineralType !== plan.reagentA) {
        return lab;
      }
      if (lab.id === plan.inputLabBId && mineralType !== plan.reagentB) {
        return lab;
      }
      if (plan.outputLabIds.includes(lab.id) && mineralType !== plan.product) {
        return lab;
      }
    }

    return null;
  }

  // private getTerminalDeficitResource(): ResourceConstant | null {
  //   if (!this.terminal) {
  //     return null;
  //   }

  //   const knownResources = new Set<ResourceConstant>();
  //   for (const resource of Object.keys(this.storage.store) as ResourceConstant[]) {
  //     if (resource !== RESOURCE_ENERGY) {
  //       knownResources.add(resource);
  //     }
  //   }
  //   for (const resource of Object.keys(this.terminal.store) as ResourceConstant[]) {
  //     if (resource !== RESOURCE_ENERGY) {
  //       knownResources.add(resource);
  //     }
  //   }

  //   let selected: ResourceConstant | null = null;
  //   let largestDeficit = 0;
  //   for (const resource of knownResources) {
  //     const terminalAmount = this.terminal.store.getUsedCapacity(resource);
  //     const deficit = Math.max(0, MIN_TERMINAL_RESOURCE - terminalAmount);
  //     if (deficit > largestDeficit && this.storage.store.getUsedCapacity(resource) > 0) {
  //       largestDeficit = deficit;
  //       selected = resource;
  //     }
  //   }

  //   return selected;
  // }

  // private getTerminalExcessResource(): { resource: ResourceConstant; amount: number } | null {
  //   if (!this.terminal) {
  //     return null;
  //   }

  //   let selected: ResourceConstant | null = null;
  //   let largestExcess = 0;
  //   for (const resource of Object.keys(this.terminal.store) as ResourceConstant[]) {
  //     if (resource === RESOURCE_ENERGY) {
  //       continue;
  //     }

  //     const amount = this.terminal.store.getUsedCapacity(resource);
  //     const excess = Math.max(0, amount - MIN_TERMINAL_RESOURCE);
  //     if (excess > largestExcess) {
  //       largestExcess = excess;
  //       selected = resource;
  //     }
  //   }

  //   if (!selected) {
  //     return null;
  //   }
  //   return { resource: selected, amount: largestExcess };
  // }

  private hasLaboratoryWork(plan: LabReactionPlan | null): boolean {
    const terminal = this.terminal;
    if (!terminal) {
      return false;
    }

    if (this.findLabCleanupTarget(plan)) {
      return true;
    }

    // if (this.getTerminalExcessResource()) {
    //   return true;
    // }

    // const terminalDeficit = this.getTerminalDeficitResource();
    // if (terminalDeficit && this.storage.store.getUsedCapacity(terminalDeficit) > 0) {
    //   return true;
    // }

    if (plan) {
      const inputLabA = Game.getObjectById(plan.inputLabAId);
      if (inputLabA !== null && (inputLabA.store.getUsedCapacity(plan.reagentA) ?? 0) < LAB_REAGENT_TARGET) {
        if (
          this.storage.store.getUsedCapacity(plan.reagentA) > 0 ||
          terminal.store.getUsedCapacity(plan.reagentA) > 0
        ) {
          return true;
        }
      }

      const inputLabB = Game.getObjectById(plan.inputLabBId);
      if (inputLabB !== null && (inputLabB.store.getUsedCapacity(plan.reagentB) ?? 0) < LAB_REAGENT_TARGET) {
        if (
          this.storage.store.getUsedCapacity(plan.reagentB) > 0 ||
          terminal.store.getUsedCapacity(plan.reagentB) > 0
        ) {
          return true;
        }
      }
    }

    const energyHungryLab = this.labs.find(lab => lab.store.getUsedCapacity(RESOURCE_ENERGY) < LAB_ENERGY_TARGET);
    if (!energyHungryLab) {
      return false;
    }

    return (
      this.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0 || terminal.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    );
  }

  private getLabLayout(): { inputLabA: StructureLab; inputLabB: StructureLab; outputLabs: StructureLab[] } | null {
    if (this.labs.length < 3) {
      return null;
    }

    let inputLabA: StructureLab | null = null;
    let inputLabB: StructureLab | null = null;
    let bestRange = Infinity;

    for (let i = 0; i < this.labs.length; i++) {
      for (let j = i + 1; j < this.labs.length; j++) {
        const range = this.labs[i].pos.getRangeTo(this.labs[j].pos);
        if (range < bestRange) {
          bestRange = range;
          inputLabA = this.labs[i];
          inputLabB = this.labs[j];
        }
      }
    }

    if (!inputLabA || !inputLabB) {
      return null;
    }

    const outputLabs = this.labs.filter(lab => lab.id !== inputLabA!.id && lab.id !== inputLabB!.id);
    if (outputLabs.length === 0) {
      return null;
    }

    return {
      inputLabA,
      inputLabB,
      outputLabs
    };
  }

  private createCreepForThisArea(): SpawnTask | null {
    const body: BodyPartConstant[] = [CARRY, MOVE];
    return new SpawnTask(CreepType.Laboratorian, this.areaId, body, this);
  }
}
