import { Helper } from "Helpers/Helper";
import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseRoom/BaseArea";
import { CreepBase } from "CreepBase";

/**
 * RemoteRebuildArea — controlled by flags named "RemoteRebuild-<SpawnRoom|-X>" (with optional
 * cosmetic suffix, e.g. "RemoteRebuild-W32E25-First" or "RemoteRebuild-X-First").
 *
 * The flag is placed INSIDE the remote room that needs help.
 * The spawn room (<SpawnRoom> in the flag name) spawns maximum-size Constructor, Carrier,
 * Harvester and Upgrader creeps and sends them to the remote room. If SpawnRoom is X,
 * any base room may spawn them.
 *
 * Once a creep arrives in the remote room its memory is updated so that the normal
 * ConstructionArea / CarryArea / SourceArea / UpgradeArea that run for that remote room
 * (via Overseer.handleRemoteRebuildRoomAreas) can pick it up and direct it like any other
 * locally-assigned creep.
 */
export default class RemoteRebuildArea extends BaseArea {
  remoteRoomName: string;
  baseRoomName?: string;
  flag: Flag;

  constructor(remoteRoomName: string, baseRoomName: string | undefined, flag: Flag) {
    super("RemoteRebuildArea", remoteRoomName, new RoomPosition(25, 25, remoteRoomName), Game.rooms[remoteRoomName]);
    this.remoteRoomName = remoteRoomName;
    this.baseRoomName = baseRoomName;
    this.flag = flag;
  }

  public handleSpawnTasks(): SpawnTask[] {
    const tasks: SpawnTask[] = [];
    if (!this.baseRoomName) {
      return tasks;
    }

    const baseRoom = Game.rooms[this.baseRoomName];
    if (!baseRoom) return tasks;

    const cap = baseRoom.energyCapacityAvailable - 300;
    const remoteRoom = Game.rooms[this.remoteRoomName];

    // For each role check: in-transit count + already-registered count in the remote room.
    // Only request a new spawn when both are 0.
    const harvesterInTransit = this.creeps.filter(c => c.memory.role === "Harvester").length;
    const harvesterInRemote = remoteRoom ? this.getRemoteHarvesterCount(remoteRoom) : 0;
    if (harvesterInTransit + harvesterInRemote < 3 && this.flag.color === COLOR_WHITE) {
      tasks.push(this.createHarvester());
    }

    const constructorInTransit = this.creeps.filter(c => c.memory.role === "Constructor").length;
    const constructorInRemote = this.getRemoteAreaCount("ConstructionArea", this.remoteRoomName);
    if (constructorInTransit + constructorInRemote < 3 && this.flag.color === COLOR_WHITE) {
      tasks.push(this.createConstructor(cap));
    }

    const carrierInTransit = this.creeps.filter(c => c.memory.role === "Carrier").length;
    const carrierInRemote = this.getRemoteAreaCount("CarryArea", this.remoteRoomName);
    const containersInRemote = remoteRoom ? GetRoomObjects.getRoomContainers(remoteRoom).length : 0;
    if (
      ((carrierInTransit + carrierInRemote < 3 && containersInRemote > 2) || carrierInTransit + carrierInRemote < 1) && // We want at least 1 carrier even if there are no containers, but if there are containers we want 3 carriers.
      (this.flag.color === COLOR_WHITE || this.flag.color === COLOR_GREY)
    ) {
      tasks.push(this.createCarrier(cap));
    }

    const upgraderInTransit = this.creeps.filter(c => c.memory.role === "Upgrader").length;
    const remoteController = remoteRoom?.controller;
    const upgraderInRemote = remoteController ? this.getRemoteAreaCount("UpgradeArea", remoteController.id) : 0;
    if (upgraderInTransit + upgraderInRemote < 1 && this.flag.color === COLOR_WHITE) {
      tasks.push(this.createUpgrader());
    }

    return tasks;
  }

  public handleThisArea(): void {
    for (const creep of this.creeps) {
      if (creep.pos.roomName === this.remoteRoomName) {
        // Creep has arrived — re-register it to the appropriate remote-room area and
        // remove it from this transit area so it won't be counted as in-transit next tick.
        this.transferCreepToRemoteArea(creep);
      } else if (creep.isFree()) {
        creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.remoteRoomName)));
      }
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private transferCreepToRemoteArea(creep: CreepBase): void {
    const remoteRoom = Game.rooms[this.remoteRoomName];
    if (!remoteRoom) return;

    const role = creep.memory.role;

    if (role === "Constructor") {
      creep.transferCreepToArea(this.areaId, "ConstructionArea-" + this.remoteRoomName);
    } else if (role === "Carrier") {
      creep.transferCreepToArea(this.areaId, "CarryArea-" + this.remoteRoomName);
    } else if (role === "Harvester") {
      const sources = GetRoomObjects.getRoomSources(remoteRoom);
      const targetSource = this.findSourceWithFewestHarvesters(sources);
      if (targetSource) {
        creep.transferCreepToArea(this.areaId, "SourceArea-" + targetSource.id);
      }
    } else if (role === "Upgrader" && remoteRoom.controller) {
      creep.transferCreepToArea(this.areaId, "UpgradeArea-" + remoteRoom.controller.id);
    }
  }

  /** Count alive creeps registered under a given area key. */
  private getRemoteAreaCount(memoryType: string, areaId: string): number {
    const key = `${memoryType}-${areaId}`;
    const creepNames: string[] = Helper.getCashedMemory(key, []);
    return creepNames.filter(name => Game.creeps[name] && Game.creeps[name].hits > 0).length;
  }

  private getRemoteHarvesterCount(remoteRoom: Room): number {
    const sources = GetRoomObjects.getRoomSources(remoteRoom);
    return sources.reduce((total, source) => total + this.getRemoteAreaCount("SourceArea", source.id), 0);
  }

  private getRemoteAreaWorkBodyCount(memoryType: string, areaId: string): number {
    const key = `${memoryType}-${areaId}`;
    const creepNames: string[] = Helper.getCashedMemory(key, []);
    return creepNames.reduce((total, name) => {
      const creep = Game.creeps[name];
      if (creep) {
        return total + creep.getActiveBodyparts(WORK);
      }
      return total;
    }, 0);
  }

  private findSourceWithFewestHarvesters(sources: Source[]): Source | null {
    let minCount = Infinity;
    let targetSource: Source | null = null;
    for (const source of sources) {
      const count = this.getRemoteAreaWorkBodyCount("SourceArea", source.id);
      if (count < minCount) {
        minCount = count;
        targetSource = source;
      }
    }
    return targetSource;
  }

  // ─── Body builders (mirror the logic of each native area, using base-room capacity) ──

  /**
   * Constructor body: mirrors ConstructionArea.createCreepForThisArea.
   * Pattern: n×WORK + n×CARRY + n×MOVE, n capped at 5 (1200 energy max).
   */
  private createConstructor(energyCapacity: number): SpawnTask {
    const n = Math.max(1, Math.min(5, Math.floor(energyCapacity / 200)));
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < n; i++) body.push(WORK);
    for (let i = 0; i < n; i++) body.push(CARRY);
    for (let i = 0; i < n; i++) body.push(MOVE);
    return new SpawnTask(
      CreepType.Constructor,
      this.areaId,
      body,
      this,
      `RemoteRebuild-Constructor-${this.remoteRoomName}`
    );
  }

  /**
   * Carrier body: mirrors CarryArea.createCreepForThisArea.
   * Pattern: n×CARRY + n×MOVE, n capped at 30 (1500 energy spawn, 1500 store).
   */
  private createCarrier(energyCapacity: number): SpawnTask {
    const n = Math.max(1, Math.min(30, Math.floor(energyCapacity / 100)));
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < n; i++) body.push(CARRY);
    for (let i = 0; i < n; i++) body.push(MOVE);
    return new SpawnTask(CreepType.Carrier, this.areaId, body, this, `RemoteRebuild-Carrier-${this.remoteRoomName}`);
  }

  /**
   * Harvester body: mirrors SourceArea.createCreepForThisArea (no-link, no-container path).
   * Pattern: 5×WORK + 1×CARRY + 5×MOVE (800 energy max).
   */
  private createHarvester(): SpawnTask {
    const segments = 5;
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(WORK);
    for (let i = 0; i < 1; i++) body.push(CARRY);
    for (let i = 0; i < segments; i++) body.push(MOVE);
    return new SpawnTask(
      CreepType.Harvester,
      this.areaId,
      body,
      this,
      `RemoteRebuild-Harvester-${this.remoteRoomName}`
    );
  }

  /**
   * Upgrader body: mirrors UpgradeArea.createCreepForThisArea.
   * Pattern: 5×WORK + 1×CARRY + 5×MOVE (800 energy max).
   */
  private createUpgrader(): SpawnTask {
    const segments = 5;
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < segments; i++) body.push(WORK);
    for (let i = 0; i < 1; i++) body.push(CARRY);
    for (let i = 0; i < segments; i++) body.push(MOVE);
    return new SpawnTask(CreepType.Upgrader, this.areaId, body, this, `RemoteRebuild-Upgrader-${this.remoteRoomName}`);
  }
}
