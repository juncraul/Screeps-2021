import { GetRoomObjects } from "Helpers/GetRoomObjects";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

const MARKET_FLAG_PREFIX = "Market";
const GREEN_FLAG_TTL = 10000;
const MIN_TERMINAL_ENERGY = 10000;
const MIN_TERMINAL_RESOURCE = 5000;
const INTER_ROOM_SEND_AMOUNT = 3000;
const MIN_SELL_PRICE = 0.001;
const UNDERCUT_STEP = 0.001;

type PriceMode = "MarketValue" | "Undercut" | "Fixed";

interface MarketFlagConfig {
  flag: Flag;
  operation: "Sell";
  resourceType: ResourceConstant;
  amount: number;
  priceMode: PriceMode;
  fixedPrice?: number;
}

interface MarketFlagState {
  orderId?: string;
  greenSinceTick?: number;
}

interface MarketContext {
  flagsNeedingTransfer: MarketFlagConfig[];
  needsTerminalBuffer: boolean;
  resourceToTransferToTerminal: ResourceConstant | null;
}

export default class MarketArea extends BaseArea {
  maxWorkerCount: number;
  storage: StructureStorage;
  terminal: StructureTerminal | null;
  private cachedContext: { tick: number; context: MarketContext } | null;

  constructor(storage: StructureStorage) {
    super("MarketArea", storage.room.name, storage.pos, storage.room);
    this.maxWorkerCount = 1;
    this.storage = storage;
    this.terminal = GetRoomObjects.getRoomTerminal(storage.room);
    this.cachedContext = null;
  }

  public handleThisArea() {
    this.trySendResourcesToOwnRooms();
    const context = this.getMarketContext();

    const needsWork =
      context.flagsNeedingTransfer.length > 0 ||
      context.needsTerminalBuffer ||
      context.resourceToTransferToTerminal !== null;
    if (!needsWork) {
      return;
    }

    this.handleCreeps(context);
  }

  public handleSpawnTasks(): SpawnTask[] {
    const context = this.getMarketContext();
    const tasksForThisArea: SpawnTask[] = [];
    const needsWork =
      context.flagsNeedingTransfer.length > 0 ||
      context.needsTerminalBuffer ||
      context.resourceToTransferToTerminal !== null;
    if (needsWork && this.creeps.length < this.maxWorkerCount) {
      const task: SpawnTask | null = this.createCreepForThisArea();
      if (task) {
        tasksForThisArea.push(task);
      }
    }
    return tasksForThisArea;
  }

  private handleCreeps(context: MarketContext) {
    if (!this.terminal) return;
    const resourceToTransfer = context.resourceToTransferToTerminal;

    for (const creep of this.creeps) {
      if (!creep.isFree()) continue;

      if (creep.isEmpty()) {
        if (resourceToTransfer && this.storage.store.getUsedCapacity(resourceToTransfer) > 0) {
          creep.withdraw(this.storage, resourceToTransfer);
        }
      } else {
        const carriedResource = this.getCarriedResourceType(creep);
        if (carriedResource) {
          creep.transfer(this.terminal, carriedResource);
        }
      }
    }
  }

  private getMarketContext(): MarketContext {
    if (this.cachedContext && this.cachedContext.tick === Game.time) {
      return this.cachedContext.context;
    }

    const context = this.processMarketFlags();
    this.cachedContext = {
      tick: Game.time,
      context
    };
    return context;
  }

  private processMarketFlags(): MarketContext {
    const flagsNeedingTransfer: MarketFlagConfig[] = [];
    const states = this.getMarketStates();
    const marketFlags = this.getMarketFlagsInRoom();

    for (const config of marketFlags) {
      const flagName = config.flag.name;
      const state: MarketFlagState = states[flagName] ?? {};
      states[flagName] = state;

      if (config.flag.color === COLOR_GREEN) {
        if (!state.greenSinceTick) {
          state.greenSinceTick = Game.time;
        }
        if (Game.time - state.greenSinceTick >= GREEN_FLAG_TTL) {
          config.flag.remove();
          delete states[flagName];
        }
        continue;
      }

      if (state.greenSinceTick) {
        delete state.greenSinceTick;
      }

      if (!this.terminal) {
        continue;
      }

      const activeOrder = this.findActiveOrderForFlag(config, state);
      if (activeOrder) {
        state.orderId = activeOrder.id;
        if (config.flag.color !== COLOR_YELLOW) {
          config.flag.setColor(COLOR_YELLOW, config.flag.secondaryColor);
        }
        continue;
      }

      if (state.orderId) {
        // A previously tracked order no longer exists or is complete.
        delete state.orderId;
        state.greenSinceTick = Game.time;
        config.flag.setColor(COLOR_GREEN, config.flag.secondaryColor);
        continue;
      }

      const terminalAmount = this.terminal.store.getUsedCapacity(config.resourceType);
      if (terminalAmount >= config.amount) {
        const price = this.getSellPrice(config);
        const createOrderResult = Game.market.createOrder({
          type: ORDER_SELL,
          resourceType: config.resourceType,
          price,
          totalAmount: config.amount,
          roomName: this.room.name
        });
        if (createOrderResult === OK) {
          const createdOrder = this.findActiveOrderForFlag(config, state);
          if (createdOrder) {
            state.orderId = createdOrder.id;
          }
          config.flag.setColor(COLOR_YELLOW, config.flag.secondaryColor);
        } else {
          console.log(
            `MarketArea: createOrder failed for flag ${config.flag.name} in ${this.room.name}, code ${createOrderResult}`
          );
        }
      } else {
        flagsNeedingTransfer.push(config);
      }
    }

    this.setMarketStates(states);
    return {
      flagsNeedingTransfer,
      needsTerminalBuffer: this.needsTerminalBuffer(),
      resourceToTransferToTerminal: this.getResourceToTransferToTerminal(flagsNeedingTransfer)
    };
  }

  private getResourceToTransferToTerminal(flagsNeedingTransfer: MarketFlagConfig[]): ResourceConstant | null {
    if (!this.terminal) {
      return null;
    }

    if (this.needsTerminalBuffer() && this.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      return RESOURCE_ENERGY;
    }

    for (const config of flagsNeedingTransfer) {
      if (
        this.terminal.store.getUsedCapacity(config.resourceType) < config.amount &&
        this.storage.store.getUsedCapacity(config.resourceType) > 0
      ) {
        return config.resourceType;
      }
    }

    const resourceTypes = this.getSendableResourceTypes();
    for (const resourceType of resourceTypes) {
      const totalInRoom = this.getResourceTotalInRoom(this.room, resourceType);
      if (totalInRoom <= MIN_TERMINAL_RESOURCE) {
        continue;
      }
      if (this.terminal.store.getUsedCapacity(resourceType) >= MIN_TERMINAL_RESOURCE) {
        continue;
      }
      const recipientRoom = this.getRecipientRoomForResource(resourceType);
      if (recipientRoom && this.storage.store.getUsedCapacity(resourceType) > 0) {
        return resourceType;
      }
    }

    return null;
  }

  private trySendResourcesToOwnRooms(): void {
    if (!this.terminal) {
      return;
    }
    if (this.terminal.cooldown > 0) {
      return;
    }
    if (this.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < MIN_TERMINAL_ENERGY) {
      return;
    }

    const resourceTypes = this.getSendableResourceTypes();
    for (const resourceType of resourceTypes) {
      const totalInRoom = this.getResourceTotalInRoom(this.room, resourceType);
      if (totalInRoom <= MIN_TERMINAL_RESOURCE) {
        continue;
      }

      const terminalAmount = this.terminal.store.getUsedCapacity(resourceType);
      if (terminalAmount < MIN_TERMINAL_RESOURCE || terminalAmount < INTER_ROOM_SEND_AMOUNT) {
        continue;
      }

      const recipientRoom = this.getRecipientRoomForResource(resourceType);
      if (!recipientRoom) {
        continue;
      }

      const recipientCurrentAmount = this.getResourceTotalInRoom(recipientRoom, resourceType);
      const recipientDeficit = Math.max(0, MIN_TERMINAL_RESOURCE - recipientCurrentAmount);
      if (recipientDeficit === 0) {
        continue;
      }

      const amountToSend = Math.min(INTER_ROOM_SEND_AMOUNT, recipientDeficit, terminalAmount);
      if (amountToSend <= 0) {
        continue;
      }

      const result = this.terminal.send(resourceType, amountToSend, recipientRoom.name, `Balance-${resourceType}`);
      if (result === OK) {
        console.log(
          `MarketArea: Sent ${amountToSend} ${resourceType} from ${this.room.name} to ${recipientRoom.name} for balancing.`
        );
      } else {
        console.log(
          `MarketArea: terminal.send failed in ${this.room.name} for ${resourceType} to ${recipientRoom.name}, code ${result}.`
        );
      }
      return;
    }
  }

  private getSendableResourceTypes(): ResourceConstant[] {
    if (!this.terminal) {
      return [];
    }

    const keys = [...Object.keys(this.storage.store), ...Object.keys(this.terminal.store)] as ResourceConstant[];
    const uniqueKeys: ResourceConstant[] = [];
    for (const key of keys) {
      if (!uniqueKeys.includes(key)) {
        uniqueKeys.push(key);
      }
    }
    return uniqueKeys.sort();
  }

  private getRecipientRoomForResource(resourceType: ResourceConstant): Room | null {
    const candidateRooms = GetRoomObjects.getAllClaimedRooms()
      .filter(room => room.name !== this.room.name)
      .filter(room => GetRoomObjects.getRoomTerminal(room));

    let bestRoom: Room | null = null;
    let lowestAmount = Infinity;

    for (const room of candidateRooms) {
      const amountInRoom = this.getResourceTotalInRoom(room, resourceType);
      if (amountInRoom >= MIN_TERMINAL_RESOURCE) {
        continue;
      }
      if (amountInRoom < lowestAmount) {
        lowestAmount = amountInRoom;
        bestRoom = room;
      }
    }

    return bestRoom;
  }

  private getResourceTotalInRoom(room: Room, resourceType: ResourceConstant): number {
    const storage = GetRoomObjects.getRoomStorage(room);
    const terminal = GetRoomObjects.getRoomTerminal(room);
    const storageAmount = storage ? storage.store.getUsedCapacity(resourceType) : 0;
    const terminalAmount = terminal ? terminal.store.getUsedCapacity(resourceType) : 0;
    return storageAmount + terminalAmount;
  }

  private getCarriedResourceType(creep: { store: StoreDefinition }): ResourceConstant | null {
    for (const resourceType in creep.store) {
      const typedResource = resourceType as ResourceConstant;
      if ((creep.store[typedResource] ?? 0) > 0) {
        return typedResource;
      }
    }
    return null;
  }

  private needsTerminalBuffer(): boolean {
    if (!this.terminal) {
      return false;
    }
    return this.terminal.store.getUsedCapacity(RESOURCE_ENERGY) < MIN_TERMINAL_ENERGY;
  }

  private findActiveOrderForFlag(config: MarketFlagConfig, state: MarketFlagState): Order | null {
    if (state.orderId) {
      const trackedOrder = Game.market.orders[state.orderId];
      if (trackedOrder && this.isOrderMatchingFlag(trackedOrder, config)) {
        if (trackedOrder.remainingAmount > 0) {
          return trackedOrder;
        }
        return null;
      }
    }

    const matchingOrders = Object.values(Game.market.orders)
      .filter(order => this.isOrderMatchingFlag(order, config))
      .filter(order => order.remainingAmount > 0);
    if (matchingOrders.length === 0) {
      return null;
    }

    matchingOrders.sort((a, b) => a.remainingAmount - b.remainingAmount);
    return matchingOrders[0];
  }

  private isOrderMatchingFlag(order: Order, config: MarketFlagConfig): boolean {
    if (order.type !== ORDER_SELL) return false;
    if (order.roomName !== this.room.name) return false;
    if (order.resourceType !== config.resourceType) return false;
    if (order.totalAmount !== config.amount) return false;
    if (config.priceMode === "Fixed") {
      const expected = config.fixedPrice ?? MIN_SELL_PRICE;
      return Math.abs(order.price - expected) < 0.0001;
    }
    return true;
  }

  private getSellPrice(config: MarketFlagConfig): number {
    if (config.priceMode === "Fixed") {
      return Math.max(MIN_SELL_PRICE, config.fixedPrice ?? MIN_SELL_PRICE);
    }

    if (config.priceMode === "Undercut") {
      const allSellOrders = Game.market.getAllOrders({
        type: ORDER_SELL,
        resourceType: config.resourceType
      });
      const competitorOrders = allSellOrders.filter(order => order.id !== this.getTrackedOrderId(config.flag.name));
      if (competitorOrders.length > 0) {
        const cheapestOrder = _.min(competitorOrders, o => o.price);
        if (cheapestOrder) {
          return Math.max(MIN_SELL_PRICE, cheapestOrder.price - UNDERCUT_STEP);
        }
      }
    }

    const history = Game.market.getHistory(config.resourceType);
    if (history.length > 0) {
      const latest = history[history.length - 1];
      return Math.max(MIN_SELL_PRICE, latest.avgPrice);
    }
    return 0.1;
  }

  private getTrackedOrderId(flagName: string): string | undefined {
    const states = this.getMarketStates();
    return states[flagName]?.orderId;
  }

  private getMarketFlagsInRoom(): MarketFlagConfig[] {
    const parsedFlags: MarketFlagConfig[] = [];
    const allFlags = Object.values(Game.flags);
    for (const flag of allFlags) {
      if (flag.pos.roomName !== this.room.name || !flag.name.startsWith(`${MARKET_FLAG_PREFIX}-`)) {
        continue;
      }

      const parsed = this.parseMarketFlag(flag);
      if (parsed) {
        parsedFlags.push(parsed);
      }
    }

    parsedFlags.sort((a, b) => a.flag.name.localeCompare(b.flag.name));
    return parsedFlags;
  }

  private parseMarketFlag(flag: Flag): MarketFlagConfig | null {
    const parts = flag.name.split("-");
    if (parts.length < 5) {
      return null;
    }

    const operation = parts[1];
    const resourceText = parts[2];
    const amountText = parts[3];
    const priceText = parts[4];

    if (operation !== "Sell") {
      return null;
    }

    const resourceType = this.parseResourceType(resourceText);
    if (!resourceType) {
      return null;
    }

    const amount = parseInt(amountText, 10);
    if (!_.isFinite(amount) || amount <= 0) {
      return null;
    }

    const loweredPriceText = priceText.toLowerCase();
    if (loweredPriceText === "marketvalue") {
      return {
        flag,
        operation: "Sell",
        resourceType,
        amount,
        priceMode: "MarketValue"
      };
    }

    if (loweredPriceText === "undercut") {
      return {
        flag,
        operation: "Sell",
        resourceType,
        amount,
        priceMode: "Undercut"
      };
    }

    const fixedPrice = parseFloat(priceText);
    if (!_.isFinite(fixedPrice) || fixedPrice <= 0) {
      return null;
    }

    return {
      flag,
      operation: "Sell",
      resourceType,
      amount,
      priceMode: "Fixed",
      fixedPrice
    };
  }

  private parseResourceType(resourceText: string): ResourceConstant | null {
    if (resourceText.toLowerCase() === "energy") {
      return RESOURCE_ENERGY;
    }
    return null;
  }

  private getMarketStates(): Record<string, MarketFlagState> {
    return Memory.Keys?.MarketAreaStates ?? {};
  }

  private setMarketStates(states: Record<string, MarketFlagState>): void {
    if (!Memory.Keys || typeof Memory.Keys !== "object") {
      Memory.Keys = {};
    }
    Memory.Keys.MarketAreaStates = states;
  }

  private createCreepForThisArea(): SpawnTask | null {
    const bodyPartConstants: BodyPartConstant[] = [];
    const haveUtilityCreeps = this.creeps.length > 0;
    const segments = haveUtilityCreeps ? Math.max(5, Math.floor(this.room.energyCapacityAvailable / 100)) : 1; // Carry-50; Move-50
    if (segments < 1) {
      console.log(
        `Error MarketArea: Room ${this.room.name} Trying to spawn a clerk with segments ${segments} less than 1`
      );
      return null;
    } else {
      const moveParts = segments / 2;
      for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
      for (let i = 0; i < moveParts; i++) bodyPartConstants.push(MOVE);
    }
    return new SpawnTask(CreepType.Clerk, this.areaId, bodyPartConstants, this);
  }
}
