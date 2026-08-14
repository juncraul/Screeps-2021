import { GetRoomObjects } from "Helpers/GetRoomObjects";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";

const MARKET_FLAG_PREFIX = "Market";
const GREEN_FLAG_TTL = 10000;
const MIN_TERMINAL_ENERGY = 10000;
const MIN_TERMINAL_RESOURCE = 5000;
const INTER_ROOM_SEND_AMOUNT = 3000;
const MIN_ORDER_PRICE = 0.001;
const UNDERCUT_STEP = 0.001;
const SELL_PRICE_FLOOR_RATIO = 0.9;
const BUY_PRICE_CEILING_RATIO = 1.1;

type PriceMode = "MarketValue" | "Undercut" | "Fixed";
type MarketOperation = "Sell" | "Buy";

interface MarketFlagConfig {
  flag: Flag;
  operation: MarketOperation;
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

      if (config.operation === "Sell") {
        const terminalAmount = this.terminal.store.getUsedCapacity(config.resourceType);
        if (terminalAmount >= config.amount) {
          this.tryCreateOrder(config, state, ORDER_SELL);
        } else {
          flagsNeedingTransfer.push(config);
        }
      } else {
        const totalOwned = this.getResourceTotalInRoom(this.room, config.resourceType);
        if (totalOwned < config.amount) {
          this.tryCreateOrder(config, state, ORDER_BUY);
        }
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
      if (recipientDeficit <= 500) {
        continue;
      }

      const amountToSend = Math.min(INTER_ROOM_SEND_AMOUNT, recipientDeficit);
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
    const expectedType = config.operation === "Sell" ? ORDER_SELL : ORDER_BUY;
    if (order.type !== expectedType) return false;
    if (order.roomName !== this.room.name) return false;
    if (order.resourceType !== config.resourceType) return false;
    if (order.totalAmount !== config.amount) return false;
    if (config.priceMode === "Fixed") {
      const expected = config.fixedPrice ?? MIN_ORDER_PRICE;
      return Math.abs(order.price - expected) < 0.0001;
    }
    return true;
  }

  private tryCreateOrder(config: MarketFlagConfig, state: MarketFlagState, orderType: ORDER_SELL | ORDER_BUY): void {
    const price = this.getOrderPrice(config);
    const createOrderResult = Game.market.createOrder({
      type: orderType,
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
  }

  private getOrderPrice(config: MarketFlagConfig): number {
    if (config.priceMode === "Fixed") {
      return Math.max(MIN_ORDER_PRICE, config.fixedPrice ?? MIN_ORDER_PRICE);
    }

    const orderType = config.operation === "Sell" ? ORDER_SELL : ORDER_BUY;
    const allOrders = Game.market.getAllOrders({ type: orderType, resourceType: config.resourceType });
    const competitorOrders = allOrders.filter(order => order.id !== this.getTrackedOrderId(config.flag.name));

    if (config.priceMode === "Undercut" && competitorOrders.length > 0) {
      const bestCompetitor =
        config.operation === "Sell" ? _.min(competitorOrders, o => o.price) : _.max(competitorOrders, o => o.price);
      if (bestCompetitor) {
        const step = config.operation === "Sell" ? -UNDERCUT_STEP : UNDERCUT_STEP;
        return Math.max(MIN_ORDER_PRICE, bestCompetitor.price + step);
      }
    }

    // MarketValue: try to beat the best competitor order, staying within 10% of the last 3 days' average price.
    const recentHistory = Game.market.getHistory(config.resourceType).slice(-3);
    const averagePrice =
      recentHistory.length > 0
        ? recentHistory.reduce((sum, entry) => sum + entry.avgPrice, 0) / recentHistory.length
        : null;

    if (config.operation === "Sell") {
      const floorPrice =
        averagePrice !== null ? Math.max(MIN_ORDER_PRICE, averagePrice * SELL_PRICE_FLOOR_RATIO) : MIN_ORDER_PRICE;
      let candidatePrice = averagePrice ?? floorPrice;
      if (competitorOrders.length > 0) {
        const cheapestOrder = _.min(competitorOrders, o => o.price);
        if (cheapestOrder) {
          candidatePrice = cheapestOrder.price - UNDERCUT_STEP;
        }
      }
      return Math.max(floorPrice, candidatePrice);
    }

    // Buy: never bid more than 10% above the last 3 days' average price.
    const ceilingPrice =
      averagePrice !== null ? Math.max(MIN_ORDER_PRICE, averagePrice * BUY_PRICE_CEILING_RATIO) : Infinity;
    let candidatePrice = averagePrice ?? MIN_ORDER_PRICE;
    if (competitorOrders.length > 0) {
      const highestOrder = _.max(competitorOrders, o => o.price);
      if (highestOrder) {
        candidatePrice = highestOrder.price + UNDERCUT_STEP;
      }
    }
    return Math.max(MIN_ORDER_PRICE, Math.min(ceilingPrice, candidatePrice));
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

    const operationText = parts[1];
    const resourceText = parts[2];
    const amountText = parts[3];
    const priceText = parts[4];

    if (operationText !== "Sell" && operationText !== "Buy") {
      return null;
    }
    const operation: MarketOperation = operationText;

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
        operation,
        resourceType,
        amount,
        priceMode: "MarketValue"
      };
    }

    if (loweredPriceText === "undercut") {
      return {
        flag,
        operation,
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
      operation,
      resourceType,
      amount,
      priceMode: "Fixed",
      fixedPrice
    };
  }

  private parseResourceType(resourceText: string): ResourceConstant | null {
    const resourceTypeUpper = resourceText.toUpperCase() as ResourceConstant;
    if (resourceTypeUpper) return resourceTypeUpper;
    const resourceTypeLower = resourceText.toLowerCase() as ResourceConstant;
    if (resourceTypeLower) return resourceTypeLower;
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
