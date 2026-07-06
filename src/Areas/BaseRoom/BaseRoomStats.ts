interface BaseRoomEnergyStats {
  energyCollected: number;
  energySpent: number;
  collectedByCategory: Record<string, number>;
  spentByCategory: Record<string, number>;
  snapshots: BaseRoomEnergySnapshot[];
  lastUpdatedTick: number;
}

interface BaseRoomEnergySnapshot {
  tick: number;
  energyCollected: number;
  energySpent: number;
}

const SNAPSHOT_INTERVAL = 5000;

export default class BaseRoomStats {
  public static addCollected(roomName: string, amount: number, category: string): void {
    if (amount <= 0) return;

    const roomStats = this.getOrCreateRoomStats(roomName);
    roomStats.energyCollected += amount;
    roomStats.collectedByCategory[category] = (roomStats.collectedByCategory[category] ?? 0) + amount;
    roomStats.lastUpdatedTick = Game.time;
  }

  public static addSpent(roomName: string, amount: number, category: string): void {
    if (amount <= 0) return;

    const roomStats = this.getOrCreateRoomStats(roomName);
    roomStats.energySpent += amount;
    roomStats.spentByCategory[category] = (roomStats.spentByCategory[category] ?? 0) + amount;
    roomStats.lastUpdatedTick = Game.time;
  }

  public static getRoomStats(roomName: string): BaseRoomEnergyStats {
    const roomStats = this.getOrCreateRoomStats(roomName);
    this.takeSnapshotIfNeeded(roomStats);
    return roomStats;
  }

  public static drawRoomVisual(room: Room): void {
    const roomStats = this.getRoomStats(room.name);

    const x = 35;
    let y = 2;
    const titleStyle: TextStyle = { align: "left", opacity: 0.9, color: "#fff4b3", font: "0.6 Trebuchet MS" };
    const lineStyle: TextStyle = { align: "left", opacity: 0.75, color: "#d8f6d1", font: "0.5 Trebuchet MS" };

    room.visual.text("BaseRoom Energy Stats", x, y, titleStyle);
    y += 0.8;
    room.visual.text(`Collected: ${roomStats.energyCollected}`, x, y, lineStyle);
    y += 0.65;
    room.visual.text(`Spent: ${roomStats.energySpent}`, x, y, lineStyle);
    y += 0.65;
    room.visual.text(`Net: ${roomStats.energyCollected - roomStats.energySpent}`, x, y, lineStyle);
    y += 0.8;

    const snapshotDelta = this.getSnapshotDelta(roomStats);
    if (snapshotDelta) {
      room.visual.text(
        `Last ${SNAPSHOT_INTERVAL} ticks: +${snapshotDelta.collectedDelta} / -${snapshotDelta.spentDelta} / net ${snapshotDelta.netDelta}`,
        x,
        y,
        lineStyle
      );
      y += 0.8;
    }

    const topCollected = this.getTopCategories(roomStats.collectedByCategory, 10);
    if (topCollected.length > 0) {
      room.visual.text("Top collected:", x, y, lineStyle);
      y += 0.65;
      topCollected.forEach(([category, amount]) => {
        room.visual.text(`+ ${category}: ${amount}`, x, y, lineStyle);
        y += 0.6;
      });
    }

    const topSpent = this.getTopCategories(roomStats.spentByCategory, 10);
    if (topSpent.length > 0) {
      room.visual.text("Top spent:", x, y, lineStyle);
      y += 0.65;
      topSpent.forEach(([category, amount]) => {
        room.visual.text(`- ${category}: ${amount}`, x, y, lineStyle);
        y += 0.6;
      });
    }
  }

  private static getOrCreateRoomStats(roomName: string): BaseRoomEnergyStats {
    if (!Memory.baseRoomStats) {
      Memory.baseRoomStats = {};
    }

    const existing = Memory.baseRoomStats[roomName];
    if (existing) {
      return existing;
    }

    const created: BaseRoomEnergyStats = {
      energyCollected: 0,
      energySpent: 0,
      collectedByCategory: {},
      spentByCategory: {},
      snapshots: [],
      lastUpdatedTick: Game.time
    };
    created.snapshots.push({ tick: Game.time, energyCollected: 0, energySpent: 0 });
    Memory.baseRoomStats[roomName] = created;
    return created;
  }

  private static takeSnapshotIfNeeded(roomStats: BaseRoomEnergyStats): void {
    if (!roomStats.snapshots || roomStats.snapshots.length === 0) {
      roomStats.snapshots = [{ tick: Game.time, energyCollected: roomStats.energyCollected, energySpent: roomStats.energySpent }];
      return;
    }

    const lastSnapshot = roomStats.snapshots[roomStats.snapshots.length - 1];
    if (Game.time - lastSnapshot.tick < SNAPSHOT_INTERVAL) {
      return;
    }

    roomStats.snapshots.push({
      tick: Game.time,
      energyCollected: roomStats.energyCollected,
      energySpent: roomStats.energySpent
    });

    if (roomStats.snapshots.length > 50) {
      roomStats.snapshots.shift();
    }
  }

  private static getSnapshotDelta(
    roomStats: BaseRoomEnergyStats
  ): { collectedDelta: number; spentDelta: number; netDelta: number } | null {
    if (!roomStats.snapshots || roomStats.snapshots.length < 2) {
      return null;
    }

    const latest = roomStats.snapshots[roomStats.snapshots.length - 1];
    const previous = roomStats.snapshots[roomStats.snapshots.length - 2];
    const collectedDelta = latest.energyCollected - previous.energyCollected;
    const spentDelta = latest.energySpent - previous.energySpent;

    return {
      collectedDelta,
      spentDelta,
      netDelta: collectedDelta - spentDelta
    };
  }

  private static getTopCategories(categories: Record<string, number>, count: number): [string, number][] {
    return Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count);
  }
}
