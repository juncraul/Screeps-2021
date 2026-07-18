import { GetRoomObjects } from "Helpers/GetRoomObjects";
import { CreepBase } from "CreepBase";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

const MIN_TERMINAL_RESOURCE = 5000;
const LAB_REAGENT_TARGET = 1000;
const LAB_ENERGY_TARGET = 2000;

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

    const terminalExcess = this.getTerminalExcessResource();
    if (terminalExcess) {
      creep.addTask(
        new CreepTask(
          Activity.CollectMineral,
          terminal.pos,
          null,
          terminalExcess.resource,
          false,
          terminalExcess.amount
        )
      );
      return;
    }

    const terminalDeficit = this.getTerminalDeficitResource();
    if (terminalDeficit && this.storage.store.getUsedCapacity(terminalDeficit) > 0) {
      creep.addTask(new CreepTask(Activity.CollectMineral, this.storage.pos, null, terminalDeficit));
      return;
    }

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
        creep.addTask(new CreepTask(Activity.Collect, this.storage.pos));
        return;
      }
      if (terminal.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        creep.addTask(new CreepTask(Activity.Collect, terminal.pos));
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
        (inputLabA.mineralType === null || inputLabA.mineralType === plan.reagentA) &&
        (inputLabA.store.getFreeCapacity(plan.reagentA) ?? 0) > 0
      ) {
        creep.addTask(new CreepTask(Activity.DepositMineral, inputLabA.pos));
        return;
      }

      const inputLabB = Game.getObjectById(plan.inputLabBId);
      if (
        inputLabB !== null &&
        carriedResource === plan.reagentB &&
        (inputLabB.mineralType === null || inputLabB.mineralType === plan.reagentB) &&
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

      return {
        ...immediate,
        inputLabAId: layout.inputLabA.id,
        inputLabBId: layout.inputLabB.id,
        outputLabIds: layout.outputLabs.map(lab => lab.id)
      };
    }

    return null;
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

  private getTerminalDeficitResource(): ResourceConstant | null {
    if (!this.terminal) {
      return null;
    }

    const knownResources = new Set<ResourceConstant>();
    for (const resource of Object.keys(this.storage.store) as ResourceConstant[]) {
      if (resource !== RESOURCE_ENERGY) {
        knownResources.add(resource);
      }
    }
    for (const resource of Object.keys(this.terminal.store) as ResourceConstant[]) {
      if (resource !== RESOURCE_ENERGY) {
        knownResources.add(resource);
      }
    }

    let selected: ResourceConstant | null = null;
    let largestDeficit = 0;
    for (const resource of knownResources) {
      const terminalAmount = this.terminal.store.getUsedCapacity(resource);
      const deficit = Math.max(0, MIN_TERMINAL_RESOURCE - terminalAmount);
      if (deficit > largestDeficit && this.storage.store.getUsedCapacity(resource) > 0) {
        largestDeficit = deficit;
        selected = resource;
      }
    }

    return selected;
  }

  private getTerminalExcessResource(): { resource: ResourceConstant; amount: number } | null {
    if (!this.terminal) {
      return null;
    }

    let selected: ResourceConstant | null = null;
    let largestExcess = 0;
    for (const resource of Object.keys(this.terminal.store) as ResourceConstant[]) {
      if (resource === RESOURCE_ENERGY) {
        continue;
      }

      const amount = this.terminal.store.getUsedCapacity(resource);
      const excess = Math.max(0, amount - MIN_TERMINAL_RESOURCE);
      if (excess > largestExcess) {
        largestExcess = excess;
        selected = resource;
      }
    }

    if (!selected) {
      return null;
    }
    return { resource: selected, amount: largestExcess };
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
