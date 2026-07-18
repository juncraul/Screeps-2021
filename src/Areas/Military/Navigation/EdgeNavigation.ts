import { CreepBase } from "../../../CreepBase";
import { Helper } from "Helpers/Helper";

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
  /**
   * Main entry point. Returns `true` when this class is handling all creep movement this
   * tick (including retreat / hold-and-heal). Returns `false` to hand control back to the
   * caller (e.g. for the initial LineNavigation trip to the target room, or when the squad
   * has fully healed and needs to be walked back in).
   */
  public static tryToAttackFromEdge(creeps: CreepBase[], destination: RoomPosition, memoryName: string): boolean {
    if (creeps.length === 0) return false;

    const kiteStateKey = `EdgeNavigation-KiteState-${memoryName}`;
    const isEdgeNavKey = `EdgeNavigation-Mode-${memoryName}`;

    const totalHits = _.sum(creeps, (c: CreepBase) => c.hits);
    const totalMaxHits = _.sum(creeps, (c: CreepBase) => c.hitsMax);
    const allFullyHealed = totalHits === totalMaxHits;

    const previousState = Helper.getCashedMemory<EdgeKiteState | null>(kiteStateKey, null);
    const damageTaken =
      previousState !== null && previousState.tick === Game.time - 1
        ? Math.max(0, previousState.totalHits - totalHits)
        : 0;

    const isEdgeNavigating = Helper.getCashedMemory<boolean>(isEdgeNavKey, false);

    // ── Kite logic ──────────────────────────────────────────────────────────

    const totalHealPotential = this.getTotalHealPerTick(creeps);
    const focusedHealPotential = this.getFocusedHealOnMostDamaged(creeps);
    const totalMissingHits = totalMaxHits - totalHits;
    const damagedCreeps = creeps.filter(c => c.hits < c.hitsMax);
    const mostDamaged = damagedCreeps.length > 0 ? _.max(damagedCreeps, (c: CreepBase) => c.hitsMax - c.hits) : null;
    const mostDamagedPercentage = mostDamaged ? mostDamaged.hits / mostDamaged.hitsMax : 1;
    const focusedDamageMissing = mostDamaged ? mostDamaged.hitsMax - mostDamaged.hits : 0;
    const healerCannotKeepUp = focusedDamageMissing > focusedHealPotential || totalMissingHits > totalHealPotential;

    console.log(
      `[EdgeNavigation-${memoryName}] damageTaken=${damageTaken} missingHits=${totalMissingHits} ` +
        `healPotential=${totalHealPotential} focusedHeal=${focusedHealPotential} isEdgeNav=${String(isEdgeNavigating)}`
    );

    const wasRetreating = previousState !== null && previousState.tick === Game.time - 1 && previousState.isRetreating;

    // Stay retreating until fully healed; start retreating on heavy damage under heal pressure.
    const shouldRetreat = wasRetreating
      ? !allFullyHealed
      : mostDamagedPercentage < 0.6 && damageTaken > 0 && healerCannotKeepUp;

    Helper.setCashedMemory(kiteStateKey, { tick: Game.time, totalHits, isRetreating: shouldRetreat });

    if (shouldRetreat) {
      // Mark edge-nav mode so the caller suppresses forward movement during recovery.
      Helper.setCashedMemory(isEdgeNavKey, true);
      this.retreatToAdjacentRoom(creeps, destination.roomName);
      return true;
    }

    // Holding in retreat room — let passive healer actions restore HP.
    if (isEdgeNavigating && !allFullyHealed) {
      return true;
    }

    // Fully healed after an edge-nav retreat — clear flag and let standard movement
    // (LineNavigation) walk the squad back to the target room entrance.
    if (isEdgeNavigating && allFullyHealed) {
      Helper.setCashedMemory(isEdgeNavKey, false);
      return false;
    }

    // ── Edge attack ─────────────────────────────────────────────────────────

    const anyInTargetRoom = creeps.some(c => c.pos.roomName === destination.roomName);
    if (!anyInTargetRoom) return false;

    const edge = this.detectEntryEdge(creeps, destination.roomName);
    if (!edge) return false;

    if (creeps.some(c => c.creep.fatigue > 0)) return true;

    const slots = this.getEdgeSlots(edge, creeps.length, destination);
    this.assignCreepsToSlots(creeps, slots, destination.roomName);
    this.attackFromEdge(creeps, destination.roomName);

    return true;
  }

  // ── Retreat ───────────────────────────────────────────────────────────────

  /** Moves all creeps that are still in the target room toward the nearest exit tile. */
  private static retreatToAdjacentRoom(creeps: CreepBase[], targetRoomName: string): void {
    for (const creep of creeps) {
      creep.say("😱");
      if (creep.pos.roomName !== targetRoomName) continue; // already in previous room
      const exitPos = this.getNearestExitPos(creep.pos);
      if (exitPos) {
        creep.creep.moveTo(exitPos, { range: 0, reusePath: 0 });
      }
    }
  }

  /** Returns the room-exit tile (x/y = 0 or 49) closest to the given position. */
  private static getNearestExitPos(pos: RoomPosition): RoomPosition | null {
    const dLeft = pos.x;
    const dRight = 49 - pos.x;
    const dTop = pos.y;
    const dBottom = 49 - pos.y;
    const min = Math.min(dLeft, dRight, dTop, dBottom);

    if (min === dLeft) return new RoomPosition(0, pos.y, pos.roomName);
    if (min === dRight) return new RoomPosition(49, pos.y, pos.roomName);
    if (min === dTop) return new RoomPosition(pos.x, 0, pos.roomName);
    return new RoomPosition(pos.x, 49, pos.roomName);
  }

  // ── Edge detection ────────────────────────────────────────────────────────

  /**
   * Determines the entry edge from the positions of creeps currently inside the target
   * room. Whichever edge (x=1, x=48, y=1, y=48) has the most creeps nearby wins.
   */
  private static detectEntryEdge(creeps: CreepBase[], roomName: string): EntryEdge | null {
    const inRoom = creeps.filter(c => c.pos.roomName === roomName);
    if (inRoom.length === 0) return null;

    const atX1 = inRoom.filter(c => c.pos.x <= 2).length;
    const atX48 = inRoom.filter(c => c.pos.x >= 47).length;
    const atY1 = inRoom.filter(c => c.pos.y <= 2).length;
    const atY48 = inRoom.filter(c => c.pos.y >= 47).length;

    const max = Math.max(atX1, atX48, atY1, atY48);
    if (max === 0) return null;

    if (atX1 === max) return { axis: "x", value: 1 };
    if (atX48 === max) return { axis: "x", value: 48 };
    if (atY1 === max) return { axis: "y", value: 1 };
    return { axis: "y", value: 48 };
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
      const start = Math.max(1, center - Math.floor(count / 2));
      for (let i = 0; i < count; i++) {
        slots.push(new RoomPosition(edge.value, Math.min(48, start + i), destination.roomName));
      }
    } else {
      const center = Math.min(Math.max(destination.x, 1), 48);
      const start = Math.max(1, center - Math.floor(count / 2));
      for (let i = 0; i < count; i++) {
        slots.push(new RoomPosition(Math.min(48, start + i), edge.value, destination.roomName));
      }
    }

    return slots;
  }

  /** Assigns each creep to its nearest unoccupied slot and moves it there. */
  private static assignCreepsToSlots(creeps: CreepBase[], slots: RoomPosition[], roomName: string): void {
    const room = Game.rooms[roomName];
    const assigned = new Set<number>();

    for (const creep of creeps) {
      let bestIdx = -1;
      let bestRange = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (assigned.has(i)) continue;
        const range = creep.pos.getRangeTo(slots[i]);
        if (range < bestRange) {
          bestRange = range;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) continue;
      assigned.add(bestIdx);

      const slot = slots[bestIdx];
      if (room) {
        room.visual.text(String(bestIdx), slot.x, slot.y, {
          align: "center",
          opacity: 0.5,
          font: 0.5,
          color: "#ff9900",
          backgroundColor: "#000000"
        });
      }

      if (!Helper.isSamePosition(creep.pos, slot)) {
        creep.creep.moveTo(slot, {
          range: 0,
          reusePath: 0,
          visualizePathStyle: { stroke: "#ff9900", opacity: 0.5 }
        });
      }
    }
  }

  // ── Combat ────────────────────────────────────────────────────────────────

  /**
   * Each creep attacks the highest-priority target within range:
   *  - ATTACK / WORK parts target adjacent hostile structures, walls, and creeps (range 1).
   *  - RANGED_ATTACK targets hostile creeps first, then hostile structures and walls (range 3).
   */
  private static attackFromEdge(creeps: CreepBase[], roomName: string): void {
    const room = Game.rooms[roomName];
    if (!room) return;

    for (const creep of creeps) {
      // Neutral walls have no owner → FIND_STRUCTURES; enemy-owned structures → FIND_HOSTILE_STRUCTURES.
      const hostileStructures = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3, {
        filter: s => s.structureType !== STRUCTURE_CONTROLLER
      });
      const walls = creep.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: s => s.structureType === STRUCTURE_WALL
      });
      const hostileCreeps = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);

      // Melee / dismantle: range 1 targets
      if (creep.getNumberOfBodyPart(ATTACK) > 0) {
        const adjacent =
          hostileCreeps.find(c => creep.pos.getRangeTo(c.pos) <= 1) ??
          (hostileStructures.find(s => creep.pos.getRangeTo(s.pos) <= 1) as Structure | undefined) ??
          (walls.find(w => creep.pos.getRangeTo(w.pos) <= 1) as Structure | undefined);
        if (adjacent) {
          creep.creep.attack(adjacent);
        }
      }

      if (creep.getNumberOfBodyPart(WORK) > 0) {
        const adjacentStructure =
          (hostileStructures.find(s => creep.pos.getRangeTo(s.pos) <= 1) as Structure | undefined) ??
          (walls.find(w => creep.pos.getRangeTo(w.pos) <= 1) as Structure | undefined);
        if (adjacentStructure) {
          creep.creep.dismantle(adjacentStructure);
        }
      }

      // Ranged attack: prefer creeps, then structures, then walls
      if (creep.getNumberOfBodyPart(RANGED_ATTACK) > 0) {
        const rangedTarget =
          (hostileCreeps[0] as Creep | undefined) ??
          (hostileStructures[0] as Structure | undefined) ??
          (walls[0] as Structure | undefined);
        if (rangedTarget) {
          creep.creep.rangedAttack(rangedTarget);
        }
      }
    }
  }

  // ── Heal potential ────────────────────────────────────────────────────────

  private static getTotalHealPerTick(creeps: CreepBase[]): number {
    return _.sum(creeps, (c: CreepBase) => c.creep.getActiveBodyparts(HEAL) * HEAL_POWER);
  }

  private static getFocusedHealOnMostDamaged(creeps: CreepBase[]): number {
    const damagedCreeps = creeps.filter(c => c.hits < c.hitsMax);
    if (damagedCreeps.length === 0) return 0;
    const target = _.max(damagedCreeps, (c: CreepBase) => c.hitsMax - c.hits);
    return _.sum(creeps, (c: CreepBase) => {
      const parts = c.creep.getActiveBodyparts(HEAL);
      if (parts <= 0) return 0;
      const range = c.pos.getRangeTo(target.pos);
      if (range <= 1) return parts * HEAL_POWER;
      if (range <= 3) return parts * RANGED_HEAL_POWER;
      return 0;
    });
  }
}
