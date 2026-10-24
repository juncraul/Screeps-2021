import { CreepBase } from "../../../CreepBase";
import { Helper } from "Helpers/Helper";
import {
  getSoldierEdgeKiteState,
  getSoldierEdgeMode,
  setSoldierEdgeKiteState,
  setSoldierEdgeMode
} from "../SoldierAreaMemory";

interface EdgeKiteState {
  tick: number;
  totalHits: number;
  isRetreating: boolean;
}

interface EntryEdge {
  axis: "x" | "y";
  value: 1 | 48;
}

/**
 * Handles attacking a room whose wall/rampart line sits at x=2, x=47, y=2, or y=47,
 * preventing a 2×2 quad from stepping inside. Creeps are positioned at x=1/x=48/y=1/y=48
 * and attack the wall/rampart line from that edge column.
 *
 * Kite behaviour: if the squad takes unsustainable damage it retreats to the previous room
 * and waits for full HP before re-engaging (tracked via the `EdgeNavigation-Mode-<name>`
 * memory key so callers know to suppress normal forward movement during recovery).
 */
export default class EdgeNavigation {
  private static EnableDebugLogging = false;
  /**
   * Main entry point. Returns `true` when this class is handling all creep movement this
   * tick (including retreat / hold-and-heal). Returns `false` to hand control back to the
   * caller (e.g. for the initial LineNavigation trip to the target room, or when the squad
   * has fully healed and needs to be walked back in).
   */
  public static tryToAttackFromEdge(creeps: CreepBase[], destination: RoomPosition, memoryName: string): boolean {
    if (creeps.length === 0) return false;

    const kiteStateKey = `EdgeNavigation-KiteState-${memoryName}`;

    const totalHits = _.sum(creeps, (c: CreepBase) => c.hits);
    const totalMaxHits = _.sum(creeps, (c: CreepBase) => c.hitsMax);
    const allFullyHealed = totalHits === totalMaxHits;

    const previousState = getSoldierEdgeKiteState(memoryName) ?? null;
    const damageTaken =
      previousState !== null && previousState.tick === Game.time - 1
        ? Math.max(0, previousState.totalHits - totalHits)
        : 0;

    const isEdgeNavigating = getSoldierEdgeMode(memoryName);

    // ── Kite logic ──────────────────────────────────────────────────────────

    const totalMissingHits = totalMaxHits - totalHits;
    const damagedCreeps = creeps.filter(c => c.hits < c.hitsMax);
    const mostDamaged = damagedCreeps.length > 0 ? _.max(damagedCreeps, (c: CreepBase) => c.hitsMax - c.hits) : null;
    const mostDamagedPercentage = mostDamaged ? mostDamaged.hits / mostDamaged.hitsMax : 1;

    if (EdgeNavigation.EnableDebugLogging) {
      console.log(
        `[${kiteStateKey}] damageTaken=${damageTaken} missingHits=${totalMissingHits} ` +
          `mostDamagedPercentage=${mostDamagedPercentage} isEdgeNav=${String(isEdgeNavigating)}`
      );
    }

    const wasRetreating = previousState !== null && previousState.tick === Game.time - 1 && previousState.isRetreating;

    // Stay retreating until fully healed; start retreating on heavy damage under heal pressure.
    const shouldRetreat = wasRetreating ? !allFullyHealed : mostDamagedPercentage < 0.75 && damageTaken > 0;

    setSoldierEdgeKiteState(memoryName, { tick: Game.time, totalHits, isRetreating: shouldRetreat });

    if (EdgeNavigation.EnableDebugLogging) {
      console.log("shouldRetreat", shouldRetreat);
    }
    const allCreepsInDestinationRoom = creeps.every(c => c.pos.roomName === destination.roomName);
    if (shouldRetreat && allCreepsInDestinationRoom) {
      // Mark edge-nav mode so the caller suppresses forward movement during recovery.
      setSoldierEdgeMode(memoryName, true);
      this.retreatToAdjacentRoom(creeps, destination);
      return true;
    }

    if (shouldRetreat) {
      this.moveFurtherIntoSafeRoom(creeps, destination);
    }

    if (EdgeNavigation.EnableDebugLogging) {
      console.log("isEdgeNavigating", isEdgeNavigating);
      console.log("allFullyHealed", allFullyHealed);
    }
    // Holding in retreat room — let passive healer actions restore HP.
    if (!allFullyHealed) {
      return true;
    }

    if (isEdgeNavigating && allFullyHealed && !this.isDestinationOnEdge(destination)) {
      setSoldierEdgeMode(memoryName, false);
      return false;
    }

    const edge = this.getEdgeFromDestination(destination);
    if (EdgeNavigation.EnableDebugLogging) {
      console.log("edge", edge);
    }
    if (!edge) return false;

    const creepsInTargetRoom = creeps.filter(c => c.pos.roomName === destination.roomName);
    if (creepsInTargetRoom.length < creeps.length) {
      this.moveOneStepAlongEdge(creeps, destination, edge);
    }
    if (creepsInTargetRoom.length === 0) {
      return true;
    }

    if (creeps.some(c => c.creep.fatigue > 0)) return true;

    const slots = this.getEdgeSlots(edge, creepsInTargetRoom.length, destination);
    if (EdgeNavigation.EnableDebugLogging) {
      console.log(
        `Assigning ${creepsInTargetRoom.length} creeps to ${slots.length} slots in room ${
          destination.roomName
        }, mapping: ${slots.map(s => `(${s.x},${s.y})`).join(", ")}`
      );
    }
    this.assignCreepsToSlots(creepsInTargetRoom, slots, destination.roomName);
    return true;
  }

  // ── Retreat ───────────────────────────────────────────────────────────────

  /** Moves all creeps that are still in the target room toward the nearest exit tile. */
  private static retreatToAdjacentRoom(creeps: CreepBase[], destination: RoomPosition): void {
    const entryEdge = this.getEdgeFromDestination(destination);
    if (!entryEdge) return;
    const direction = this.getRetreatDirection(entryEdge);
    for (const creep of creeps) {
      creep.say("😱");
      if (creep.pos.roomName !== destination.roomName) continue;
      creep.creep.move(direction);
    }
  }

  private static getRetreatDirection(edge: EntryEdge): DirectionConstant {
    if (edge.axis === "x") return edge.value === 1 ? LEFT : RIGHT;
    return edge.value === 1 ? TOP : BOTTOM;
  }

  private static moveFurtherIntoSafeRoom(creeps: CreepBase[], destination: RoomPosition): void {
    const entryEdge = this.getEdgeFromDestination(destination);
    if (!entryEdge) return;
    const direction = this.getRetreatDirection(entryEdge);
    for (const creep of creeps) {
      if (
        creep.pos.roomName === destination.roomName ||
        creep.creep.fatigue > 0 ||
        !this.isAtSafeRoomBorder(creep.pos, direction)
      ) {
        continue;
      }
      creep.creep.move(direction);
    }
  }

  private static isAtSafeRoomBorder(position: RoomPosition, direction: DirectionConstant): boolean {
    if (direction === LEFT) return position.x === 49;
    if (direction === RIGHT) return position.x === 0;
    if (direction === TOP) return position.y === 49;
    return position.y === 0;
  }

  private static moveOneStepAlongEdge(creeps: CreepBase[], destination: RoomPosition, edge: EntryEdge): void {
    for (const creep of creeps) {
      if (creep.creep.fatigue > 0) continue;
      const inTargetRoom = creep.pos.roomName === destination.roomName;
      if (inTargetRoom) continue;
      let direction: DirectionConstant | undefined;
      if (edge.axis === "x") {
        direction = edge.value === 1 ? RIGHT : LEFT;
      } else {
        direction = edge.value === 1 ? BOTTOM : TOP;
      }
      if (direction !== undefined) creep.creep.move(direction);
    }
  }

  private static getEdgeFromDestination(destination: RoomPosition): EntryEdge | null {
    if (destination.x === 1) return { axis: "x", value: 1 };
    if (destination.x === 48) return { axis: "x", value: 48 };
    if (destination.y === 1) return { axis: "y", value: 1 };
    if (destination.y === 48) return { axis: "y", value: 48 };
    return null;
  }

  // ── Formation ─────────────────────────────────────────────────────────────

  /**
   * Returns `count` positions along the entry edge column, centred on the destination's
   * perpendicular coordinate. All positions are clamped to [1, 48].
   */
  private static getEdgeSlots(edge: EntryEdge, count: number, destination: RoomPosition): RoomPosition[] {
    const slots: RoomPosition[] = [];

    if (edge.axis === "x") {
      const center = Math.min(Math.max(destination.y, 1), 48);
      const start = Math.max(1, Math.min(49 - count, center - Math.floor(count / 2)));
      for (let i = 0; i < count; i++) {
        slots.push(new RoomPosition(edge.value, Math.min(48, start + i), destination.roomName));
      }
    } else {
      const center = Math.min(Math.max(destination.x, 1), 48);
      const start = Math.max(1, Math.min(49 - count, center - Math.floor(count / 2)));
      for (let i = 0; i < count; i++) {
        slots.push(new RoomPosition(Math.min(48, start + i), edge.value, destination.roomName));
      }
    }

    return slots;
  }

  /** Assigns each creep to its nearest unoccupied slot and moves it there. */
  private static assignCreepsToSlots(creeps: CreepBase[], slots: RoomPosition[], roomName: string): void {
    const room = Game.rooms[roomName];

    if (creeps.length !== slots.length) {
      console.log(
        `[EdgeNavigation] Warning: number of creeps (${creeps.length}) does not match number of slots (${slots.length})`
      );
      return;
    }
    if (slots.length === 0) {
      console.log(`[EdgeNavigation] Warning: no slots available`);
      return;
    }
    const horizontalSlots = slots.length > 1 ? slots[0].x === slots[1].x : slots[0].x === 1 || slots[0].x === 48;

    const edgePriority = (v: number) => (v === 0 || v === 49 ? -1 : 0);
    // if y or x is the same then prioritize the one that the other axis is 0 or 49
    creeps = creeps.slice().sort((a, b) => {
      if (horizontalSlots) {
        // Primary: y
        if (a.pos.y !== b.pos.y) {
          return a.pos.y - b.pos.y;
        }

        // Same y -> prioritize x on an edge
        const edgeCmp = edgePriority(a.pos.x) - edgePriority(b.pos.x);
        if (edgeCmp !== 0) return edgeCmp;

        // Then normal x ordering
        return a.pos.x - b.pos.x;
      } else {
        // Primary: x
        if (a.pos.x !== b.pos.x) {
          return a.pos.x - b.pos.x;
        }

        // Same x -> prioritize y on an edge
        const edgeCmp = edgePriority(a.pos.y) - edgePriority(b.pos.y);
        if (edgeCmp !== 0) return edgeCmp;

        // Then normal y ordering
        return a.pos.y - b.pos.y;
      }
    });

    // let creepCantReach: CreepBase | null = null;
    for (let i = 0; i < slots.length; i++) {
      const creep = creeps[i];
      const slot = slots[i];
      if (creep.pos.roomName !== roomName) {
        creep.creep.moveTo(slot, {
          range: 0,
          reusePath: 0,
          visualizePathStyle: { stroke: "#ff9900", opacity: 0.5 }
        });
        continue;
      }
      if (room) {
        room.visual.text(String(i), slot.x, slot.y, {
          align: "center",
          opacity: 0.5,
          font: 0.5,
          color: "#ff9900",
          backgroundColor: "#000000"
        });
      }

      if (
        !creep.pos.inRangeTo(slot, 1) &&
        (creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49)
      ) {
        console.log(
          `[EdgeNavigation] can't reach ${creep.creep.name} at pos (${creep.pos.x},${creep.pos.y}) moving to slot ${i} at (${slot.x},${slot.y})`
        );
        // creepCantReach = creep;
      }

      if (!Helper.isSamePosition(creep.pos, slot)) {
        const creepOnFirstEdge = creep.pos.x === 0 || creep.pos.x === 49 || creep.pos.y === 0 || creep.pos.y === 49;
        const creepOnSecondEdge = creep.pos.x === 1 || creep.pos.x === 48 || creep.pos.y === 1 || creep.pos.y === 48;
        if (creepOnFirstEdge || creepOnSecondEdge) {
          const path = PathFinder.search(
            creep.creep.pos,
            { pos: slot, range: 0 },
            {
              roomCallback: roomName => {
                const room = Game.rooms[roomName];
                if (!room) return false;

                const costs = new PathFinder.CostMatrix();

                for (let i = 0; i < 50; i++) {
                  costs.set(0, i, 5);
                  costs.set(49, i, 5);
                  costs.set(i, 0, 5);
                  costs.set(i, 49, 5);
                  costs.set(2, i, 5);
                  costs.set(47, i, 5);
                  costs.set(i, 2, 5);
                  costs.set(i, 47, 5);
                }
                return costs;
              }
            }
          );
          // for (const pos of path.path) {
          //   room.visual.text("·", pos.x, pos.y, { font: 0.5, color: "#ff9900" });
          // }
          creep.creep.moveByPath(path.path);
        } else {
          creep.creep.moveTo(slot, {
            range: 0,
            reusePath: 0,
            visualizePathStyle: { stroke: "#ff9900", opacity: 0.5 }
          });
        }
      }
    }
  }

  // ── Combat ────────────────────────────────────────────────────────────────

  /**
   * Each creep attacks the highest-priority target within range:
   *  - ATTACK / WORK parts target adjacent hostile structures, walls, and creeps (range 1).
   *  - RANGED_ATTACK targets hostile creeps first, then hostile structures and walls (range 3).
   */
  // private static attackFromEdge(creeps: CreepBase[], roomName: string): void {
  //   const room = Game.rooms[roomName];
  //   if (!room) return;

  //   for (const creep of creeps) {
  //     // Neutral walls have no owner → FIND_STRUCTURES; enemy-owned structures → FIND_HOSTILE_STRUCTURES.
  //     const hostileStructures = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3, {
  //       filter: s => s.structureType !== STRUCTURE_CONTROLLER
  //     });
  //     const walls = creep.pos.findInRange(FIND_STRUCTURES, 3, {
  //       filter: s => s.structureType === STRUCTURE_WALL
  //     });
  //     const hostileCreeps = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);

  //     // Melee / dismantle: range 1 targets
  //     if (creep.getNumberOfBodyPart(ATTACK) > 0) {
  //       const adjacent =
  //         hostileCreeps.find(c => creep.pos.getRangeTo(c.pos) <= 1) ??
  //         (hostileStructures.find(s => creep.pos.getRangeTo(s.pos) <= 1) as Structure | undefined) ??
  //         (walls.find(w => creep.pos.getRangeTo(w.pos) <= 1) as Structure | undefined);
  //       if (adjacent) {
  //         creep.creep.attack(adjacent);
  //       }
  //     }

  //     if (creep.getNumberOfBodyPart(WORK) > 0) {
  //       const adjacentStructure =
  //         (hostileStructures.find(s => creep.pos.getRangeTo(s.pos) <= 1) as Structure | undefined) ??
  //         (walls.find(w => creep.pos.getRangeTo(w.pos) <= 1) as Structure | undefined);
  //       if (adjacentStructure) {
  //         creep.creep.dismantle(adjacentStructure);
  //       }
  //     }

  //     // Ranged attack: prefer creeps, then structures, then walls
  //     if (creep.getNumberOfBodyPart(RANGED_ATTACK) > 0) {
  //       const rangedTarget =
  //         (hostileCreeps[0] as Creep | undefined) ??
  //         (hostileStructures[0] as Structure | undefined) ??
  //         (walls[0] as Structure | undefined);
  //       if (rangedTarget) {
  //         creep.creep.rangedAttack(rangedTarget);
  //       }
  //     }
  //   }
  // }

  // ── Heal potential ────────────────────────────────────────────────────────

  public static shouldApplyEdgeNavigation(creepLeader: CreepBase, destination: RoomPosition): boolean {
    if (EdgeNavigation.EnableDebugLogging) {
      console.log("shouldApplyEdgeNavigation", creepLeader.pos.roomName, destination.roomName);
      console.log("destination", destination.x, destination.y);
    }
    if (this.isDestinationOnEdge(destination)) {
      if (EdgeNavigation.EnableDebugLogging) {
        console.log("destination is on edge, applying edge navigation");
      }
      return (
        creepLeader.pos.roomName !== destination.roomName ||
        creepLeader.pos.x <= 1 ||
        creepLeader.pos.x >= 48 ||
        creepLeader.pos.y <= 1 ||
        creepLeader.pos.y >= 48
      );
    }
    if (creepLeader.pos.roomName !== destination.roomName) return false;
    if (!(creepLeader.pos.x <= 1 || creepLeader.pos.x >= 48 || creepLeader.pos.y <= 1 || creepLeader.pos.y >= 48)) {
      return false;
    }
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const x = Math.max(1, Math.min(48, creepLeader.pos.x)) + i;
        const y = Math.max(1, Math.min(48, creepLeader.pos.y)) + j;
        if (x < 2 || x > 47 || y < 2 || y > 47) continue;
        const pos = new RoomPosition(x, y, destination.roomName);
        const isRampartOrWallStructure =
          pos
            .lookFor(LOOK_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length > 0;
        if (isRampartOrWallStructure) return true;
      }
    }
    return false;
  }

  public static isDestinationOnEdge(destination: RoomPosition): boolean {
    return destination.x === 1 || destination.x === 48 || destination.y === 1 || destination.y === 48;
  }
}
