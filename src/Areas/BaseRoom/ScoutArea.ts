import { GetRoomObjects } from "Helpers/GetRoomObjects";
import CreepTask, { Activity } from "Tasks/CreepTask";
import SpawnTask, { CreepType } from "Tasks/SpawnTask";
import BaseArea from "./BaseArea";
import { Helper } from "Helpers/Helper";

interface ScoutSourceIntel {
  id: string;
  x: number;
  y: number;
}

interface ScoutMineralIntel {
  id: string;
  x: number;
  y: number;
  mineralType: ResourceConstant;
  amount: number;
}

interface ScoutControllerIntel {
  x: number;
  y: number;
  roomName: string;
  level: number | null;
  owner: string | null;
  reservation: string | null;
}

interface ScoutRoomIntel {
  roomName: string;
  lastSeen: number;
  lastEnemySeen?: number;
  controller: ScoutControllerIntel | null;
  sources: ScoutSourceIntel[];
  minerals: ScoutMineralIntel[];
  hostileCount: number;
  claimable: boolean;
}

type ScoutIntelMemory = Record<string, ScoutRoomIntel>;

interface ScoutRoomNode {
  depth: number;
  parent: string | null;
}

export default class ScoutArea extends BaseArea {
  private static readonly MANAGED_FLAG_PREFIX = "Reserve";
  private static readonly MAX_SCOUT_DEPTH = 2;
  private static readonly ENEMY_RECHECK_TICKS = 5000;

  baseRoom: Room;
  roomIntel: ScoutIntelMemory;

  constructor(baseRoom: Room) {
    super("ScoutArea", baseRoom.name, new RoomPosition(25, 25, baseRoom.name), baseRoom);
    this.baseRoom = baseRoom;
    this.roomIntel = this.loadIntelFromMemory();
  }

  public handleThisArea(): void {
    this.refreshIntelForVisibleRooms();
    this.handleCreeps();
    this.saveIntelToMemory();
  }

  public handleSpawnTasks(): SpawnTask[] {
    const baseController = this.baseRoom.controller;
    if (!baseController) {
      return [];
    }
    const activeScouts = this.creeps.filter(creep => !(creep.ticksToLive !== undefined && creep.ticksToLive < 100));
    if (activeScouts.length >= 1) {
      return [];
    }
    if (!this.pickNextRoomToScout(this.baseRoom.name, this.getScoutRoomNodes())) {
      return [];
    }

    return [this.createScout()];
  }

  public handleCreeps(): void {
    for (const creep of this.creeps) {
      if (!creep.isFree()) {
        continue;
      }

      const currentRoom = Game.rooms[creep.pos.roomName];
      if (currentRoom && this.hasHostiles(currentRoom)) {
        if (creep.pos.roomName !== this.baseRoom.name) {
          creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, this.baseRoom.name)));
        }
        continue;
      }

      const roomNodes = this.getScoutRoomNodes();
      const targetRoomName = this.pickNextRoomToScout(creep.pos.roomName, roomNodes);
      if (!targetRoomName || targetRoomName === creep.pos.roomName) {
        continue;
      }

      const nextHop = this.getNextHop(creep.pos.roomName, targetRoomName, roomNodes);
      if (nextHop === creep.pos.roomName) {
        continue;
      }
      creep.addTask(new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, nextHop)));
    }
  }

  private refreshIntelForVisibleRooms(): void {
    for (const roomName of this.getScoutRoomNodes().keys()) {
      const room = Game.rooms[roomName];
      if (!room) {
        continue;
      }

      const intel = this.collectRoomIntel(room);
      if (intel) {
        this.roomIntel[roomName] = intel;
        this.syncManagedFlag(room, intel);
      }
    }
  }

  private collectRoomIntel(room: Room): ScoutRoomIntel | null {
    const controller = room.controller
      ? {
          x: room.controller.pos.x,
          y: room.controller.pos.y,
          roomName: room.controller.pos.roomName,
          level: room.controller.level ?? null,
          owner: room.controller.owner?.username ?? null,
          reservation: room.controller.reservation?.username ?? null
        }
      : null;

    const sources = GetRoomObjects.getRoomSources(room).map(source => ({
      id: source.id,
      x: source.pos.x,
      y: source.pos.y
    }));

    const minerals = room.find(FIND_MINERALS).map(mineral => ({
      id: mineral.id,
      x: mineral.pos.x,
      y: mineral.pos.y,
      mineralType: mineral.mineralType,
      amount: mineral.mineralAmount
    }));

    const hostileCount = room.find(FIND_HOSTILE_CREEPS).length;
    const hasController = !!controller;
    const controllerNeutru = !controller?.owner && !controller?.reservation;
    const controllerReservedByUs = controller?.reservation === Helper.getUserName();
    const controllerReservedByInvader = controller?.reservation === "Invader";
    const controllerFree = hasController && (controllerNeutru || controllerReservedByUs || controllerReservedByInvader);
    const claimable = hostileCount === 0 && hasController && controllerFree && sources.length > 0;

    const intel: ScoutRoomIntel = {
      roomName: room.name,
      lastSeen: Game.time,
      controller,
      sources,
      minerals,
      hostileCount,
      claimable
    };
    intel.lastEnemySeen =
      hostileCount > 0 || this.isBlockedByOtherPlayer(intel) ? Game.time : this.roomIntel[room.name]?.lastEnemySeen;
    return intel;
  }

  private syncManagedFlag(room: Room, intel: ScoutRoomIntel): void {
    const flagName = this.getManagedFlagName(room.name);
    if (this.isBlockedByOtherPlayer(intel)) {
      Game.flags[flagName]?.remove();
      return;
    }

    const existingFlags = this.getAllRemoteFlags(room.name);

    if (
      existingFlags.length > 0 ||
      !intel.controller ||
      intel.hostileCount > 0 ||
      !intel.claimable ||
      this.isOwnedOrReservedByUs(room.name)
    ) {
      return;
    }

    const flagPos = new RoomPosition(intel.controller.x, intel.controller.y, intel.roomName);
    if (!this.canScoutReachTargets(room, intel, flagPos)) {
      return;
    }
    flagPos.createFlag(flagName, COLOR_PURPLE, COLOR_PURPLE);
  }

  // Leftover walls/ramparts from abandoned bases can seal off the controller or sources.
  private canScoutReachTargets(room: Room, intel: ScoutRoomIntel, controllerPos: RoomPosition): boolean {
    const scout = this.creeps.find(creep => creep.pos.roomName === room.name);
    if (!scout) {
      return false;
    }

    const costMatrix = new PathFinder.CostMatrix();
    for (const structure of room.find(FIND_STRUCTURES)) {
      const { x, y } = structure.pos;
      if (structure.structureType === STRUCTURE_ROAD) {
        costMatrix.set(x, y, 1);
      } else if (structure.structureType === STRUCTURE_RAMPART) {
        const rampart = structure;
        if (!rampart.my && !rampart.isPublic) {
          costMatrix.set(x, y, 255);
        }
      } else if ((OBSTACLE_OBJECT_TYPES as string[]).includes(structure.structureType)) {
        costMatrix.set(x, y, 255);
      }
    }

    const targets = [controllerPos, ...intel.sources.map(source => new RoomPosition(source.x, source.y, room.name))];
    return targets.every(target => {
      const result = PathFinder.search(
        scout.pos,
        { pos: target, range: 1 },
        { maxRooms: 1, plainCost: 2, swampCost: 10, roomCallback: () => costMatrix }
      );
      return !result.incomplete;
    });
  }

  private hasHostiles(room: Room): boolean {
    return (
      room
        .find(FIND_HOSTILE_CREEPS)
        .filter(creep => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0).length > 0
    );
  }

  private isBlockedByOtherPlayer(intel: ScoutRoomIntel | undefined): boolean {
    const controller = intel?.controller;
    if (!controller) {
      return false;
    }
    const myName = Helper.getUserName();
    const ownedByOther = !!controller.owner && controller.owner !== myName;
    const reservedByOther =
      !!controller.reservation && controller.reservation !== myName && controller.reservation !== "Invader";
    return ownedByOther || reservedByOther;
  }

  private hasRecentEnemyIntel(intel: ScoutRoomIntel | undefined): boolean {
    if (!intel || (!this.isBlockedByOtherPlayer(intel) && intel.hostileCount === 0)) {
      return false;
    }
    return Game.time - (intel.lastEnemySeen ?? intel.lastSeen) < ScoutArea.ENEMY_RECHECK_TICKS;
  }

  private isOwnedOrReservedByUs(roomName: string): boolean {
    const myName = Helper.getUserName();
    const room = Game.rooms[roomName];
    if (room) {
      return (
        room.controller?.my === true ||
        room.controller?.owner?.username === myName ||
        room.controller?.reservation?.username === myName
      );
    }
    const controller = this.roomIntel[roomName]?.controller;
    return controller?.owner === myName || controller?.reservation === myName;
  }

  // Enemy rooms are leaves until scouting confirms that they are safe to traverse.
  private getScoutRoomNodes(): Map<string, ScoutRoomNode> {
    const nodes = new Map<string, ScoutRoomNode>();
    const visited = new Set<string>([this.baseRoom.name]);
    const baseStatus = Game.map.getRoomStatus(this.baseRoom.name)?.status;
    let frontier = [this.baseRoom.name];

    for (let depth = 1; depth <= ScoutArea.MAX_SCOUT_DEPTH; depth++) {
      const nextFrontier: string[] = [];
      for (const fromRoom of frontier) {
        const exits = Game.map.describeExits(fromRoom);
        if (!exits) {
          continue;
        }
        for (const roomName of Object.values(exits)) {
          if (!roomName || visited.has(roomName) || !GetRoomObjects.ROOM_NAME_PATTERN.test(roomName)) {
            continue;
          }
          visited.add(roomName);
          if (!this.isRoomAccessible(roomName, baseStatus)) {
            continue;
          }
          nodes.set(roomName, { depth, parent: fromRoom === this.baseRoom.name ? null : fromRoom });
          if (!this.hasRecentEnemyIntel(this.roomIntel[roomName])) {
            nextFrontier.push(roomName);
          }
        }
      }
      frontier = nextFrontier;
    }

    return nodes;
  }

  // Only rooms in the same zone as the base are reachable (e.g. respawn base -> respawn rooms only).
  private isRoomAccessible(roomName: string, baseStatus: RoomStatus["status"] | undefined): boolean {
    const status = Game.map.getRoomStatus(roomName)?.status;
    return !!status && status !== "closed" && status === baseStatus;
  }

  private getNextHop(currentRoomName: string, targetRoomName: string, roomNodes: Map<string, ScoutRoomNode>): string {
    const path: string[] = [];
    let roomName: string | null = targetRoomName;
    while (roomName) {
      path.unshift(roomName);
      roomName = roomNodes.get(roomName)?.parent ?? null;
    }

    const exits = Game.map.describeExits(currentRoomName) ?? {};
    const adjacentRooms = new Set(Object.values(exits));
    for (let i = path.length - 1; i >= 0; i--) {
      if (adjacentRooms.has(path[i])) {
        return path[i];
      }
    }
    return currentRoomName === this.baseRoom.name ? path[0] : this.baseRoom.name;
  }

  private pickNextRoomToScout(currentRoomName: string, roomNodes: Map<string, ScoutRoomNode>): string | null {
    const candidates = Array.from(roomNodes.entries()).filter(
      ([roomName]) => !this.isOwnedOrReservedByUs(roomName) && !this.hasRecentEnemyIntel(this.roomIntel[roomName])
    );
    // Finish scouting all adjacent rooms before going further out.
    const nearbyUnscouted = candidates.some(([roomName, node]) => node.depth === 1 && !this.roomIntel[roomName]);
    const maxDepth = nearbyUnscouted ? 1 : ScoutArea.MAX_SCOUT_DEPTH;

    const currentTick = Game.time;
    let bestRoomName: string | null = null;
    let bestScore = -1;

    for (const [roomName, node] of candidates) {
      if (roomName === currentRoomName || node.depth > maxDepth) {
        continue;
      }

      const intel = this.roomIntel[roomName];
      const age = intel ? Math.max(1, currentTick - intel.lastSeen) : 5000;
      const hostilePenalty = intel && intel.hostileCount > 0 ? 0.25 : 1;
      const score = age * hostilePenalty;

      if (score > bestScore) {
        bestScore = score;
        bestRoomName = roomName;
      }
    }

    return bestRoomName;
  }

  private loadIntelFromMemory(): ScoutIntelMemory {
    const storedIntel = Memory.scoutIntel ?? {};
    Memory.scoutIntel = storedIntel;
    return storedIntel;
  }

  private saveIntelToMemory(): void {
    Memory.scoutIntel = this.roomIntel;
  }

  private getManagedFlagName(roomName: string): string {
    return `${ScoutArea.MANAGED_FLAG_PREFIX}-${this.baseRoom.name}-Scout-${roomName}`;
  }

  private getAllRemoteFlags(roomName: string): Flag[] {
    return Object.values(Game.flags).filter(
      flag => flag.room?.name === roomName && flag.name.startsWith(`${ScoutArea.MANAGED_FLAG_PREFIX}`)
    );
  }

  private createScout(): SpawnTask {
    return new SpawnTask(CreepType.Scout, this.areaId, [MOVE], this, `Scout-${this.baseRoom.name}`);
  }
}
