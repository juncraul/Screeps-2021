import { GetRoomObjects } from "Helpers/GetRoomObjects";
import EventHandler from "Helpers/EventHandler";
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
const STORAGE_AUTO_SELL_FILL_RATIO = 0.9;
const STORAGE_AUTO_SELL_DEAL_FILL_RATIO = 0.95;
const STORAGE_AUTO_SELL_MIN_AMOUNT = 150000;
const STORAGE_AUTO_SELL_ORDER_AMOUNT = 50000;
const LARGE_CLERK_TRANSFER_THRESHOLD = 40000;

type PriceMode = "MarketValue" | "MarketValueDeal" | "Undercut" | "Fixed";
type MarketOperation = "Sell" | "Buy";

interface MarketFlagConfig {
  flag: Flag;
  operation: MarketOperation;
  resourceType: ResourceConstant;
  amount: number;
  priceMode: PriceMode;
  fixedPrice?: number;
}

interface PendingDeal {
  orderId: string;
  amount: number;
  tick: number;
}

interface MarketFlagState {
  orderId?: string;
  greenSinceTick?: number;
  dealtAmount?: number;
  pendingDeal?: PendingDeal;
}

interface DealCandidate {
  order: Order;
  energyCostPerUnit: number;
  effectivePrice: number;
}

interface MarketContext {
  flagsNeedingTransfer: MarketFlagConfig[];
  needsTerminalBuffer: boolean;
  resourceToTransferToTerminal: ResourceConstant | null;
  amountToTransfer: number;
}

export default class MarketArea extends BaseArea {
  maxWorkerCount: number;
  storage: StructureStorage;
  terminal: StructureTerminal | null;
  private cachedContext: { tick: number; context: MarketContext } | null;
  private terminalActionTick = -1;

  constructor(storage: StructureStorage) {
    super("MarketArea", storage.room.name, storage.pos, storage.room);
    this.maxWorkerCount = 1;
    this.storage = storage;
    this.terminal = GetRoomObjects.getRoomTerminal(storage.room);
    this.cachedContext = null;
  }

  public handleThisArea() {
    if (!this.terminal) return;

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
    if (!this.terminal) return [];

    const context = this.getMarketContext();
    const tasksForThisArea: SpawnTask[] = [];
    const needsWork =
      context.flagsNeedingTransfer.length > 0 ||
      context.needsTerminalBuffer ||
      context.resourceToTransferToTerminal !== null;
    if (needsWork && this.creeps.length < this.maxWorkerCount) {
      const task: SpawnTask | null = this.createCreepForThisArea(context.amountToTransfer);
      if (task) {
        tasksForThisArea.push(task);
      }
    }
    return tasksForThisArea;
  }

  private handleCreeps(context: MarketContext) {
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
          creep.transfer(this.terminal!, carriedResource);
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
    let marketFlags = this.getMarketFlagsInRoom();
    if (this.tryCreateStorageOverflowSellFlag(marketFlags)) {
      marketFlags = this.getMarketFlagsInRoom();
    }

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

      if (config.priceMode === "MarketValueDeal") {
        this.processDealFlag(config, state, flagsNeedingTransfer);
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
        this.logMarketEvent(`Order for ${config.flag.name} completed`);
        continue;
      }

      if (config.operation === "Sell") {
        const terminalAmount = this.terminal!.store.getUsedCapacity(config.resourceType);
        const requiredAmount = this.getTerminalSellTarget(config.resourceType, config.amount);
        if (terminalAmount >= requiredAmount) {
          this.tryCreateOrder(config, state, ORDER_SELL);
        } else {
          flagsNeedingTransfer.push({ ...config, amount: requiredAmount });
        }
      } else {
        const totalOwned = this.getResourceTotalInRoom(this.room, config.resourceType);
        if (totalOwned < config.amount) {
          this.tryCreateOrder(config, state, ORDER_BUY);
        }
      }
    }

    this.setMarketStates(states);
    const resourceToTransferToTerminal = this.getResourceToTransferToTerminal(flagsNeedingTransfer);
    return {
      flagsNeedingTransfer,
      needsTerminalBuffer: this.needsTerminalBuffer(),
      resourceToTransferToTerminal,
      amountToTransfer: resourceToTransferToTerminal
        ? this.getAmountToTransfer(resourceToTransferToTerminal, flagsNeedingTransfer)
        : 0
    };
  }

  private getAmountToTransfer(resourceType: ResourceConstant, flagsNeedingTransfer: MarketFlagConfig[]): number {
    const terminalAmount = this.terminal!.store.getUsedCapacity(resourceType);
    let target = resourceType === RESOURCE_ENERGY ? MIN_TERMINAL_ENERGY : MIN_TERMINAL_RESOURCE;
    for (const config of flagsNeedingTransfer) {
      if (config.resourceType === resourceType) {
        target = Math.max(target, config.amount);
      }
    }
    const deficit = Math.max(0, target - terminalAmount);
    return Math.min(deficit, this.storage.store.getUsedCapacity(resourceType));
  }

  private tryCreateStorageOverflowSellFlag(marketFlags: MarketFlagConfig[]): boolean {
    const storageCapacity = this.storage.store.getCapacity();
    const storageUsed = this.storage.store.getUsedCapacity();
    if (!storageCapacity || storageUsed <= storageCapacity * STORAGE_AUTO_SELL_FILL_RATIO) {
      return false;
    }
    const priceMode: PriceMode =
      storageUsed > storageCapacity * STORAGE_AUTO_SELL_DEAL_FILL_RATIO ? "MarketValueDeal" : "MarketValue";

    const resourcesWithSellFlags = marketFlags
      .filter(config => config.operation === "Sell")
      .map(config => config.resourceType);

    const resourceToSell = (Object.keys(this.storage.store) as ResourceConstant[])
      .filter(resourceType => this.storage.store.getUsedCapacity(resourceType) > STORAGE_AUTO_SELL_MIN_AMOUNT)
      .filter(resourceType => !resourcesWithSellFlags.includes(resourceType))
      .sort((a, b) => this.storage.store.getUsedCapacity(b) - this.storage.store.getUsedCapacity(a))[0];

    if (!resourceToSell) {
      return false;
    }

    const flagName = `${MARKET_FLAG_PREFIX}-Sell-${resourceToSell}-${STORAGE_AUTO_SELL_ORDER_AMOUNT}-${priceMode}`;
    if (Game.flags[flagName]) {
      return false;
    }

    const createFlagResult = this.room.createFlag(this.storage.pos, flagName, COLOR_WHITE, COLOR_WHITE);
    if (typeof createFlagResult === "string") {
      EventHandler.pushEvent(this.room.name, "Market", `Created overflow sell flag ${flagName}`);
      return true;
    }

    console.log(`MarketArea: createFlag failed for overflow sell flag ${flagName}, code ${createFlagResult}.`);
    return false;
  }

  private getResourceToTransferToTerminal(flagsNeedingTransfer: MarketFlagConfig[]): ResourceConstant | null {
    if (this.needsTerminalBuffer() && this.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      return RESOURCE_ENERGY;
    }

    for (const config of flagsNeedingTransfer) {
      if (
        this.terminal!.store.getUsedCapacity(config.resourceType) < config.amount &&
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
      if (this.terminal!.store.getUsedCapacity(resourceType) >= MIN_TERMINAL_RESOURCE) {
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
    if (this.terminal!.cooldown > 0 || this.terminalActionTick === Game.time) {
      return;
    }
    if (this.terminal!.store.getUsedCapacity(RESOURCE_ENERGY) < MIN_TERMINAL_ENERGY) {
      return;
    }

    const resourceTypes = this.getSendableResourceTypes();
    for (const resourceType of resourceTypes) {
      const totalInRoom = this.getResourceTotalInRoom(this.room, resourceType);
      if (totalInRoom <= MIN_TERMINAL_RESOURCE) {
        continue;
      }

      const terminalAmount = this.terminal!.store.getUsedCapacity(resourceType);
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

      const result = this.terminal!.send(resourceType, amountToSend, recipientRoom.name, `Balance-${resourceType}`);
      if (result === OK) {
        this.terminalActionTick = Game.time;
        this.logMarketEvent(`Sent ${amountToSend} ${resourceType} to ${recipientRoom.name} for balancing`);
      } else {
        this.logMarketEvent(`Send ${resourceType} to ${recipientRoom.name} failed, code ${result}`);
      }
      return;
    }
  }

  private getSendableResourceTypes(): ResourceConstant[] {
    const keys = [...Object.keys(this.storage.store), ...Object.keys(this.terminal!.store)] as ResourceConstant[];
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
    return this.terminal!.store.getUsedCapacity(RESOURCE_ENERGY) < MIN_TERMINAL_ENERGY;
  }

  // Selling energy must not eat the terminal buffer used for transfer fees.
  private getTerminalSellTarget(resourceType: ResourceConstant, amount: number): number {
    return resourceType === RESOURCE_ENERGY ? amount + MIN_TERMINAL_ENERGY : amount;
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
      this.logMarketEvent(`Created ${orderType} order ${config.amount} ${config.resourceType} @ ${price.toFixed(3)}`);
    } else {
      this.logMarketEvent(`createOrder failed for ${config.flag.name}, code ${createOrderResult}`);
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

  private processDealFlag(
    config: MarketFlagConfig,
    state: MarketFlagState,
    flagsNeedingTransfer: MarketFlagConfig[]
  ): void {
    this.resolvePendingDeal(config, state);

    const remaining = config.amount - (state.dealtAmount ?? 0);
    if (remaining <= 0) {
      state.greenSinceTick = Game.time;
      config.flag.setColor(COLOR_GREEN, config.flag.secondaryColor);
      this.logMarketEvent(`Completed ${config.operation} deal of ${state.dealtAmount ?? 0} ${config.resourceType}`);
      return;
    }

    // Wait for last tick's deal to be confirmed through the transaction log.
    if (state.pendingDeal) {
      return;
    }

    if (config.operation === "Sell") {
      const requiredAmount = this.getTerminalSellTarget(config.resourceType, remaining);
      if (this.terminal!.store.getUsedCapacity(config.resourceType) < requiredAmount) {
        flagsNeedingTransfer.push({ ...config, amount: requiredAmount });
      }
    }

    if (this.terminal!.cooldown > 0 || this.terminalActionTick === Game.time) {
      return;
    }

    this.tryDeal(config, state, remaining);
  }

  private resolvePendingDeal(config: MarketFlagConfig, state: MarketFlagState): void {
    const pending = state.pendingDeal;
    if (!pending || Game.time <= pending.tick) {
      return;
    }

    const transactions =
      config.operation === "Sell" ? Game.market.outgoingTransactions : Game.market.incomingTransactions;
    const transaction = transactions.find(
      t =>
        t.order?.id === pending.orderId &&
        t.time >= pending.tick &&
        (config.operation === "Sell" ? t.from === this.room.name : t.to === this.room.name)
    );

    if (transaction) {
      state.dealtAmount = (state.dealtAmount ?? 0) + transaction.amount;
      this.logMarketEvent(
        `${config.operation} ${transaction.amount} ${config.resourceType} @ ${transaction.order?.price ?? "?"} ${
          config.operation === "Sell" ? "to" : "from"
        } ${config.operation === "Sell" ? transaction.to : transaction.from} (${state.dealtAmount}/${config.amount})`
      );
    } else {
      this.logMarketEvent(`Deal on order ${pending.orderId} for ${config.flag.name} was not executed`);
    }
    delete state.pendingDeal;
  }

  private tryDeal(config: MarketFlagConfig, state: MarketFlagState, remaining: number): void {
    const terminal = this.terminal!;
    const isSell = config.operation === "Sell";
    const candidates = this.getDealCandidates(config);
    if (candidates.length === 0) {
      return;
    }

    const terminalEnergy = terminal.store.getUsedCapacity(RESOURCE_ENERGY);
    for (const candidate of candidates) {
      const order = candidate.order;
      let amount = Math.min(remaining, order.amount);
      if (isSell) {
        const reserved = config.resourceType === RESOURCE_ENERGY ? MIN_TERMINAL_ENERGY : 0;
        amount = Math.min(amount, terminal.store.getUsedCapacity(config.resourceType) - reserved);
      } else {
        amount = Math.min(amount, terminal.store.getFreeCapacity(), Math.floor(Game.market.credits / order.price));
      }

      // Selling energy spends the goods and the transfer fee from the same pool.
      const energyPerUnit =
        isSell && config.resourceType === RESOURCE_ENERGY
          ? 1 + candidate.energyCostPerUnit
          : candidate.energyCostPerUnit;
      if (energyPerUnit > 0) {
        amount = Math.min(amount, Math.floor(terminalEnergy / energyPerUnit));
      }
      if (amount <= 0) {
        continue;
      }

      const cost = Game.market.calcTransactionCost(amount, this.room.name, order.roomName!);
      const energyNeeded = isSell && config.resourceType === RESOURCE_ENERGY ? cost + amount : cost;
      if (energyNeeded > terminalEnergy) {
        continue;
      }

      const result = Game.market.deal(order.id, amount, this.room.name);
      if (result === OK) {
        this.terminalActionTick = Game.time;
        state.pendingDeal = { orderId: order.id, amount, tick: Game.time };
        if (config.flag.color !== COLOR_YELLOW) {
          config.flag.setColor(COLOR_YELLOW, config.flag.secondaryColor);
        }
        this.logMarketEvent(
          `Deal ${amount} ${config.resourceType} @ ${order.price} with ${order.roomName!} (energy ${cost})`
        );
      } else {
        this.logMarketEvent(`Deal for ${config.flag.name} on order ${order.id} failed, code ${result}`);
      }
      return;
    }
  }

  private getDealCandidates(config: MarketFlagConfig): DealCandidate[] {
    const isSell = config.operation === "Sell";
    const energyValue = this.getEnergyCreditValue();
    const averagePrice = this.getAverageHistoryPrice(config.resourceType);
    const orders = Game.market.getAllOrders({
      type: isSell ? ORDER_BUY : ORDER_SELL,
      resourceType: config.resourceType
    });

    const candidates: DealCandidate[] = [];
    for (const order of orders) {
      if (!order.roomName || order.amount <= 0 || Game.market.orders[order.id]) continue;
      if (Game.rooms[order.roomName]?.controller?.my) continue;

      // Terminal transfer fee: ceil(amount * (1 - e^(-distance / 30))).
      const distance = Game.map.getRoomLinearDistance(this.room.name, order.roomName, true);
      const energyCostPerUnit = 1 - Math.exp(-distance / 30);
      const energyCredits = energyCostPerUnit * energyValue;
      const effectivePrice = isSell ? order.price - energyCredits : order.price + energyCredits;

      if (isSell) {
        if (effectivePrice <= 0) continue;
        if (averagePrice !== null && effectivePrice < averagePrice * SELL_PRICE_FLOOR_RATIO) continue;
      } else if (averagePrice !== null && effectivePrice > averagePrice * BUY_PRICE_CEILING_RATIO) {
        continue;
      }

      candidates.push({ order, energyCostPerUnit, effectivePrice });
    }

    candidates.sort((a, b) => (isSell ? b.effectivePrice - a.effectivePrice : a.effectivePrice - b.effectivePrice));
    return candidates;
  }

  private getAverageHistoryPrice(resourceType: ResourceConstant): number | null {
    const recentHistory = Game.market.getHistory(resourceType).slice(-3);
    if (recentHistory.length === 0) {
      return null;
    }
    return recentHistory.reduce((sum, entry) => sum + entry.avgPrice, 0) / recentHistory.length;
  }

  private getEnergyCreditValue(): number {
    const averagePrice = this.getAverageHistoryPrice(RESOURCE_ENERGY);
    if (averagePrice !== null) {
      return averagePrice;
    }
    const cheapestEnergy = _.min(
      Game.market.getAllOrders({ type: ORDER_SELL, resourceType: RESOURCE_ENERGY }),
      o => o.price
    );
    return cheapestEnergy && _.isFinite(cheapestEnergy.price) ? cheapestEnergy.price : 0;
  }

  private logMarketEvent(message: string): void {
    console.log(`MarketArea ${this.room.name}: ${message}`);
    EventHandler.pushEvent(this.room.name, "Market", message);
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
    if (loweredPriceText === "marketvaluedeal") {
      return {
        flag,
        operation,
        resourceType,
        amount,
        priceMode: "MarketValueDeal"
      };
    }

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
    const normalizedResourceText = resourceText.toLowerCase();
    return RESOURCES_ALL.find(resourceType => resourceType.toLowerCase() === normalizedResourceText) ?? null;
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

  private createCreepForThisArea(amountToTransfer: number): SpawnTask | null {
    const segments = amountToTransfer >= LARGE_CLERK_TRANSFER_THRESHOLD ? 2 : 1;
    const bodyPartConstants: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) bodyPartConstants.push(CARRY);
    for (let i = 0; i < segments; i++) bodyPartConstants.push(MOVE);
    return new SpawnTask(CreepType.Clerk, this.areaId, bodyPartConstants, this);
  }
}
