import { CreepBase } from "../../../CreepBase";
import { Helper } from "Helpers/Helper";

export default class QuadNavigation {
  public static tryToKiteTheEnemyAsFormation(
    quad: CreepBase[],
    destination: RoomPosition,
    memoryName: string,
    flagColor: ColorConstant
  ): boolean {
    if (quad.length < 4) {
      return false;
    }

    if (!this.creepsAreInRangeOfEachOther(quad, 4)) {
      return false;
    }

    const leader = quad[0];
    const anchor = this.getQuadAnchor(quad);
    const pathOrigin = anchor ?? leader.pos;
    const threat = this.getPrimaryThreat(pathOrigin.roomName, pathOrigin);
    const totalHits = _.sum(quad, creep => creep.hits);

    const kiteStateKey = `QuadNavigation-KiteState-${memoryName}`;
    const previousState = Helper.getCashedMemory<{ tick: number; totalHits: number; isRetreating: boolean } | null>(
      kiteStateKey,
      null
    );
    const damageTaken =
      previousState && previousState.tick === Game.time - 1 ? Math.max(0, previousState.totalHits - totalHits) : 0;

    const damagedCreeps = quad.filter(creep => creep.hits < creep.hitsMax);
    const mostDamaged = _.max(damagedCreeps, creep => creep.hitsMax - creep.hits);
    const mostDamagedPercentage = mostDamaged ? mostDamaged.hits / mostDamaged.hitsMax : 1;
    const totalMissingHits = _.sum(damagedCreeps, creep => creep.hitsMax - creep.hits);
    const totalHealPotential = this.getTotalPotentialHealPerTick(quad);
    const focusedHealPotential = mostDamaged ? this.getPotentialHealOnTarget(quad, mostDamaged) : 0;
    const focusedDamageMissing = mostDamaged ? mostDamaged.hitsMax - mostDamaged.hits : 0;

    if (flagColor !== COLOR_WHITE) {
      console.log(
        `[${kiteStateKey}] Kite State: Damage Taken: ${damageTaken}, Total Missing Hits: ${totalMissingHits}, Total Heal Potential: ${totalHealPotential}, Focused Heal Potential: ${focusedHealPotential}, Focused Damage Missing: ${focusedDamageMissing}`
      );
    }

    const healerCannotKeepUp = focusedDamageMissing > focusedHealPotential || totalMissingHits > totalHealPotential;
    const isRetreating = previousState && previousState.tick === Game.time - 1 && previousState.isRetreating;
    if (isRetreating)
      console.log(`[${kiteStateKey}] Retreating from threat at ${String(threat?.pos)} due to previous state.`);
    const shouldRetreat = isRetreating
      ? totalMissingHits !== 0
      : mostDamagedPercentage < 0.6 && damageTaken > 0 && healerCannotKeepUp && !!threat;

    Helper.setCashedMemory(kiteStateKey, { tick: Game.time, totalHits, isRetreating: shouldRetreat });

    if (quad.some(creep => creep.creep.fatigue > 0)) {
      return true;
    }

    if (threat) {
      if (shouldRetreat) {
        console.log(
          `[${kiteStateKey}] Retreating from threat at ${String(
            threat.pos
          )} due to damage taken and healer cannot keep up.`
        );
        leader.say("😱"); // Retreat to destination
        return this.tryMoveAsFormation(quad, destination, memoryName, false);
      } else {
        if (flagColor !== COLOR_WHITE) {
          if (leader.pos.inRangeTo(threat?.pos ?? leader.pos, 1)) {
            return true; // We arrived at the enemy. We are done with navigation.
          } else {
            leader.say("⚔️👣"); // Move towards threat
            return this.tryMoveAsFormation(quad, threat.pos, memoryName, true);
          }
        }
      }
    }

    leader.say("👣🚩"); // Move towards destination
    return this.tryMoveAsFormation(quad, destination, memoryName, true);
  }

  private static tryMoveAsFormation(
    quad: CreepBase[],
    destination: RoomPosition,
    memoryName: string,
    rotateTowardsTarget: boolean
  ): boolean {
    if (quad.length < 4) {
      return false;
    }

    if (!this.creepsAreInRangeOfEachOther(quad, 4)) {
      return false; // If the creeps are not in range of each other, then we should not try to move as a formation.
    }

    const leader = quad[0];

    if (!this.isQuadAssembled(quad)) {
      const regroupSlots = this.findBestRegroupSlots(leader, quad, memoryName);
      if (!regroupSlots) {
        return false;
      }

      this.regroupQuad(quad, leader.pos, regroupSlots);
      return true;
    } else {
      Helper.setCashedMemory(`QuadNavigation-${memoryName}`, []);
    }

    const anchor = this.getQuadAnchor(quad);
    if (!anchor) {
      return false;
    }

    // Check if creeps have fatique
    if (quad.some(creep => creep.creep.fatigue > 0)) {
      return true;
    }

    if (rotateTowardsTarget && this.rotateQuadTowardTarget(quad, anchor, destination)) {
      return true;
    }

    const direction = this.getLeaderDirectionForQuadPath(anchor, destination, quad);
    if (!direction) {
      return true;
    }

    const step = this.getStepOffset(direction);
    if (!step) {
      return false;
    }

    const nextAnchor = new RoomPosition(anchor.x + step.dx, anchor.y + step.dy, anchor.roomName);
    const nextSquare = this.getSquareSlots(nextAnchor);
    const room = Game.rooms[nextAnchor.roomName];
    if (!room) {
      return false;
    }

    if (this.isSquareValid(nextSquare, new Set(quad.map(creep => creep.name)))) {
      for (const creep of quad) {
        creep.creep.move(direction);
      }
      for (let i = 0; i < quad.length; i++) {
        room.visual.text(`${i}`, nextSquare[i].x, nextSquare[i].y, {
          align: "center",
          opacity: 0.4,
          font: 0.5,
          color: "#00ff88",
          backgroundColor: "#000000"
        });
      }
    } else {
      const lineSlots = this.getLineSlots(nextAnchor, quad.length, step);
      for (const creep of quad) {
        creep.creep.move(direction);
      }
      for (let i = 0; i < quad.length; i++) {
        room.visual.text(`${i}`, lineSlots[i].x, lineSlots[i].y, {
          align: "center",
          opacity: 0.4,
          font: 0.5,
          color: "#ffcc00",
          backgroundColor: "#000000"
        });
      }
    }

    for (const trailing of quad.slice(4)) {
      trailing.creep.moveTo(anchor, { reusePath: 0, range: 1 });
    }

    return true;
  }

  private static isQuadAssembled(quad: CreepBase[]): boolean {
    const anchor = this.getQuadAnchor(quad);
    if (!anchor) {
      return false;
    }

    const expectedSlots = this.getSquareSlots(anchor);
    const occupied = new Set(quad.map(creep => `${creep.pos.x}:${creep.pos.y}:${creep.pos.roomName}`));
    return expectedSlots.every(slot => occupied.has(`${slot.x}:${slot.y}:${slot.roomName}`));
  }

  private static regroupQuad(quad: CreepBase[], leaderPos: RoomPosition, slots: RoomPosition[]): RoomPosition[] | null {
    const room = Game.rooms[leaderPos.roomName];
    if (!room) {
      return null;
    }

    for (let i = 0; i < quad.length; i++) {
      if (!Helper.isSamePosition(quad[i].pos, slots[i])) {
        quad[i].creep.moveTo(slots[i], { reusePath: 0, range: 0, visualizePathStyle: { stroke: "#ff0000" } });
      }
      room.visual.text(`${i}`, slots[i].x, slots[i].y, {
        align: "center",
        opacity: 0.4,
        font: 0.5,
        color: "#66ccff",
        backgroundColor: "#000000"
      });
    }

    return slots;
  }

  private static findBestRegroupSlots(
    leader: CreepBase,
    squadCreeps: CreepBase[],
    memoryName: string
  ): RoomPosition[] | null {
    const room = Game.rooms[leader.pos.roomName];
    if (!room) {
      return null;
    }

    const memorySlots = Helper.getCashedMemory<string[]>(`QuadNavigation-${memoryName}`, []);
    const slots = memorySlots.map(slot => {
      const [x, y, roomName] = slot.split(":");
      return new RoomPosition(parseInt(x, 10), parseInt(y, 10), roomName);
    });

    const positionsValid = slots.every(slot => this.isPositionEmpty(slot, squadCreeps));
    if (slots.length !== 0 && positionsValid && leader.pos.roomName === slots[0].roomName) {
      return slots;
    }

    const empty4SquarePosForLeader = Helper.findClosestMatching(leader.pos, 10, true, pos => {
      const slots = this.getSquareSlots(pos);
      if (
        !this.isPositionEmpty(slots[0], squadCreeps) ||
        !this.isPositionEmpty(slots[1], squadCreeps) ||
        !this.isPositionEmpty(slots[2], squadCreeps) ||
        !this.isPositionEmpty(slots[3], squadCreeps)
      ) {
        return false;
      }
      return true;
    });
    if (!empty4SquarePosForLeader) {
      return null;
    }

    const squadPositions = this.getSquareSlots(empty4SquarePosForLeader);
    for (const pos of squadPositions) {
      room.visual.text("R", pos.x, pos.y, {
        align: "center",
        opacity: 0.4,
        font: 0.5,
        color: "#ff0000",
        backgroundColor: "#000000"
      });
    }

    if (squadPositions.length === 4) {
      Helper.setCashedMemory(
        `QuadNavigation-${memoryName}`,
        squadPositions.map(slot => `${slot.x}:${slot.y}:${slot.roomName}`)
      );
      return squadPositions;
    }

    return null;
  }

  private static getLeaderDirectionForQuadPath(
    anchor: RoomPosition,
    destination: RoomPosition,
    quad: CreepBase[],
    fleeing = false
  ): DirectionConstant | null {
    const squadNames = new Set(quad.map(creep => creep.name));
    const result = PathFinder.search(
      anchor,
      { pos: destination, range: 0 },
      {
        plainCost: 2,
        swampCost: 10,
        maxOps: 5000,
        flee: fleeing,
        roomCallback: roomName => {
          const room = Game.rooms[roomName];
          if (!room) {
            return false;
          }

          const costs = new PathFinder.CostMatrix();
          const terrain = room.getTerrain();
          const blocked = new Set<string>();

          const structures = room.find(FIND_STRUCTURES);
          for (const structure of structures) {
            if (
              structure.structureType === STRUCTURE_ROAD ||
              structure.structureType === STRUCTURE_CONTAINER ||
              structure.structureType === STRUCTURE_RAMPART
            ) {
              continue;
            }
            blocked.add(`${structure.pos.x}:${structure.pos.y}`);
          }

          const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
          for (const hostile of hostileCreeps) {
            blocked.add(`${hostile.pos.x}:${hostile.pos.y}`);
          }

          const creeps = room.find(FIND_CREEPS);
          for (const creep of creeps) {
            if (squadNames.has(creep.name)) {
              continue;
            }
            blocked.add(`${creep.pos.x}:${creep.pos.y}`);
          }

          for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
              if (x < 1 || x > 48 || y < 1 || y > 48) {
                costs.set(x, y, 255);
                continue;
              }

              const squareBlocked =
                terrain.get(x, y) === TERRAIN_MASK_WALL ||
                terrain.get(x + 1, y) === TERRAIN_MASK_WALL ||
                terrain.get(x, y + 1) === TERRAIN_MASK_WALL ||
                terrain.get(x + 1, y + 1) === TERRAIN_MASK_WALL ||
                blocked.has(`${x}:${y}`) ||
                blocked.has(`${x + 1}:${y}`) ||
                blocked.has(`${x}:${y + 1}`) ||
                blocked.has(`${x + 1}:${y + 1}`);

              if (squareBlocked) {
                costs.set(x, y, 255);
              }
            }
          }

          return costs;
        }
      }
    );

    if (result.path.length === 0) {
      return null;
    }

    return anchor.getDirectionTo(result.path[0]);
  }

  private static rotateQuadTowardTarget(quad: CreepBase[], anchor: RoomPosition, destination: RoomPosition): boolean {
    const leader = quad[0];
    const slots = this.getSquareSlots(anchor);
    const currentLeaderSlotIndex = slots.findIndex(slot => Helper.isSamePosition(slot, leader.pos));
    if (currentLeaderSlotIndex === -1) {
      return false;
    }

    const desiredLeaderSlotIndex = this.getClosestSlotIndexToTarget(slots, destination);
    if (desiredLeaderSlotIndex === currentLeaderSlotIndex) {
      return false;
    }

    const clockwiseOrder = [0, 1, 3, 2];
    const anticlockwiseOrder = [0, 2, 3, 1];
    const slotToCreep = new Map<number, CreepBase>();
    for (let i = 0; i < slots.length; i++) {
      const occupant = quad.find(creep => Helper.isSamePosition(creep.pos, slots[i]));
      if (!occupant) {
        return false;
      }
      slotToCreep.set(i, occupant);
    }

    const isClockwise = this.isClockwiseRotation(currentLeaderSlotIndex, desiredLeaderSlotIndex);
    const order = isClockwise ? clockwiseOrder : anticlockwiseOrder;
    for (let orderIndex = 0; orderIndex < order.length; orderIndex++) {
      const fromSlotIndex = order[orderIndex];
      const toSlotIndex = order[(orderIndex + 1) % order.length];
      const creep = slotToCreep.get(fromSlotIndex);
      if (!creep) {
        return false;
      }

      const direction = creep.pos.getDirectionTo(slots[toSlotIndex]);
      creep.creep.move(direction);
    }

    const room = Game.rooms[anchor.roomName];
    if (room) {
      for (let i = 0; i < slots.length; i++) {
        room.visual.text(`R${i}`, slots[i].x, slots[i].y, {
          align: "center",
          opacity: 0.4,
          font: 0.5,
          color: i === desiredLeaderSlotIndex ? "#ffaa00" : "#66ccff",
          backgroundColor: "#000000"
        });
      }
      room.visual.circle(destination.x, destination.y, { fill: "transparent", radius: 0.5, stroke: "#00ff00" });
      room.visual.circle(leader.pos.x, leader.pos.y, { fill: "transparent", radius: 0.5, stroke: "#ff0000" });
    }

    return true;
  }

  private static isClockwiseRotation(currentIndex: number, desiredIndex: number): boolean {
    if (currentIndex === 0) {
      return desiredIndex === 1 || desiredIndex === 3;
    }
    if (currentIndex === 1) {
      return desiredIndex === 3 || desiredIndex === 2;
    }
    if (currentIndex === 3) {
      return desiredIndex === 2 || desiredIndex === 0;
    }
    if (currentIndex === 2) {
      return desiredIndex === 0 || desiredIndex === 1;
    }
    return false;
  }

  private static getClosestSlotIndexToTarget(slots: RoomPosition[], target: RoomPosition): number {
    let bestIndex = 0;
    let bestRange = Infinity;

    for (let i = 0; i < slots.length; i++) {
      const range = slots[i].getRangeTo(target);
      if (range < bestRange) {
        bestRange = range;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  private static getQuadAnchor(quad: CreepBase[]): RoomPosition | null {
    if (quad.length < 4) {
      return null;
    }

    const roomName = quad[0].pos.roomName;
    if (quad.some(creep => creep.pos.roomName !== roomName)) {
      return null;
    }

    const occupied = new Set(quad.map(creep => `${creep.pos.x}:${creep.pos.y}`));
    const minX = _.min(quad.map(creep => creep.pos.x));
    const maxX = _.max(quad.map(creep => creep.pos.x));
    const minY = _.min(quad.map(creep => creep.pos.y));
    const maxY = _.max(quad.map(creep => creep.pos.y));

    if (minX === undefined || maxX === undefined || minY === undefined || maxY === undefined) {
      return null;
    }

    if (maxX - minX !== 1 || maxY - minY !== 1) {
      return null;
    }

    const requiredSlots = [`${minX}:${minY}`, `${minX + 1}:${minY}`, `${minX}:${minY + 1}`, `${minX + 1}:${minY + 1}`];
    if (!requiredSlots.every(slot => occupied.has(slot))) {
      return null;
    }

    return new RoomPosition(minX, minY, roomName);
  }

  private static getPrimaryThreat(
    roomName: string,
    nearPos: RoomPosition
  ): { pos: RoomPosition; type: "creep" | "tower" | "structure" } | null {
    const room = Game.rooms[roomName];
    if (!room) {
      return null;
    }

    const hostileCreeps = room
      .find(FIND_HOSTILE_CREEPS)
      .filter(
        hostile =>
          hostile.getActiveBodyparts(ATTACK) > 0 ||
          hostile.getActiveBodyparts(RANGED_ATTACK) > 0 ||
          hostile.getActiveBodyparts(WORK) > 0
      );

    if (hostileCreeps.length > 0) {
      const closestHostile = nearPos.findClosestByRange(hostileCreeps);
      if (closestHostile) {
        return { pos: closestHostile.pos, type: "creep" };
      }
    }

    const hostileTowers = room
      .find(FIND_HOSTILE_STRUCTURES)
      .filter(
        structure => structure.structureType === STRUCTURE_TOWER && structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      ) as StructureTower[];

    if (hostileTowers.length > 0) {
      const closestTower = nearPos.findClosestByRange(hostileTowers);
      if (closestTower) {
        return { pos: closestTower.pos, type: "tower" };
      }
    }

    const anyHostileStructures = room
      .find(FIND_HOSTILE_STRUCTURES)
      .filter(structure => structure.structureType !== STRUCTURE_CONTROLLER);
    if (anyHostileStructures.length > 0) {
      const closestStructure = nearPos.findClosestByRange(anyHostileStructures);
      if (closestStructure) {
        return { pos: closestStructure.pos, type: "structure" };
      }
    }

    return null;
  }

  private static getTotalPotentialHealPerTick(quad: CreepBase[]): number {
    return _.sum(quad, creep => creep.creep.getActiveBodyparts(HEAL) * HEAL_POWER);
  }

  private static getPotentialHealOnTarget(quad: CreepBase[], target: CreepBase): number {
    return _.sum(quad, creep => {
      const healParts = creep.creep.getActiveBodyparts(HEAL);
      if (healParts <= 0) {
        return 0;
      }

      const range = creep.pos.getRangeTo(target.pos);
      if (range <= 1) {
        return healParts * HEAL_POWER;
      }
      if (range <= 3) {
        return healParts * RANGED_HEAL_POWER;
      }
      return 0;
    });
  }

  private static getStepOffset(direction: DirectionConstant): { dx: number; dy: number } | null {
    switch (direction) {
      case TOP:
        return { dx: 0, dy: -1 };
      case TOP_RIGHT:
        return { dx: 1, dy: -1 };
      case RIGHT:
        return { dx: 1, dy: 0 };
      case BOTTOM_RIGHT:
        return { dx: 1, dy: 1 };
      case BOTTOM:
        return { dx: 0, dy: 1 };
      case BOTTOM_LEFT:
        return { dx: -1, dy: 1 };
      case LEFT:
        return { dx: -1, dy: 0 };
      case TOP_LEFT:
        return { dx: -1, dy: -1 };
      default:
        return null;
    }
  }

  private static getSquareSlots(anchor: RoomPosition): RoomPosition[] {
    return [
      new RoomPosition(anchor.x, anchor.y, anchor.roomName),
      new RoomPosition(anchor.x + 1, anchor.y, anchor.roomName),
      new RoomPosition(anchor.x, anchor.y + 1, anchor.roomName),
      new RoomPosition(anchor.x + 1, anchor.y + 1, anchor.roomName)
    ];
  }

  private static getLineSlots(head: RoomPosition, count: number, step: { dx: number; dy: number }): RoomPosition[] {
    const slots: RoomPosition[] = [];
    for (let i = 0; i < count; i++) {
      const x = head.x - step.dx * i;
      const y = head.y - step.dy * i;
      const boundedX = Math.max(1, Math.min(48, x));
      const boundedY = Math.max(1, Math.min(48, y));
      slots.push(new RoomPosition(boundedX, boundedY, head.roomName));
    }
    return slots;
  }

  private static isSquareValid(slots: RoomPosition[], squadNames: Set<string>): boolean {
    if (slots.length !== 4) {
      return false;
    }

    const room = Game.rooms[slots[0].roomName];
    if (!room) {
      return false;
    }

    for (const slot of slots) {
      if (slot.x < 1 || slot.x > 48 || slot.y < 1 || slot.y > 48) {
        return false;
      }

      const terrain = room.getTerrain().get(slot.x, slot.y);
      if (terrain === TERRAIN_MASK_WALL) {
        return false;
      }

      const structures = slot.lookFor(LOOK_STRUCTURES);
      const blockedByStructure = structures.some(
        structure =>
          structure.structureType !== STRUCTURE_ROAD &&
          structure.structureType !== STRUCTURE_CONTAINER &&
          structure.structureType !== STRUCTURE_RAMPART
      );
      if (blockedByStructure) {
        return false;
      }

      const otherCreeps = slot.lookFor(LOOK_CREEPS);
      if (otherCreeps.some(creep => !squadNames.has(creep.name))) {
        return false;
      }
    }

    return true;
  }

  private static isPositionEmpty(pos: RoomPosition, squadCreeps: CreepBase[]): boolean {
    const room = Game.rooms[pos.roomName];
    if (!room) {
      return false;
    }
    const terrain = room.getTerrain().get(pos.x, pos.y);
    if (terrain === TERRAIN_MASK_WALL) {
      return false;
    }
    const structures = pos.lookFor(LOOK_STRUCTURES);
    if (
      structures.some(
        structure =>
          structure.structureType !== STRUCTURE_ROAD &&
          structure.structureType !== STRUCTURE_CONTAINER &&
          structure.structureType !== STRUCTURE_RAMPART
      )
    ) {
      return false;
    }
    const constructionSites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    if (
      constructionSites.some(
        site =>
          site.structureType !== STRUCTURE_ROAD &&
          site.structureType !== STRUCTURE_CONTAINER &&
          site.structureType !== STRUCTURE_RAMPART
      )
    ) {
      return false;
    }
    const creeps = pos.lookFor(LOOK_CREEPS);
    if (creeps.length > 0) {
      if (squadCreeps.some(creep => creep.pos.isEqualTo(pos))) {
        return true; // The position is occupied by a squad creep, which is acceptable.
      }
      return false;
    }
    return true;
  }

  private static creepsAreInRangeOfEachOther(creeps: CreepBase[], range: number): boolean {
    for (let i = 0; i < creeps.length; i++) {
      for (let j = i + 1; j < creeps.length; j++) {
        if (creeps[i].pos.roomName !== creeps[j].pos.roomName) {
          return false;
        }
        if (creeps[i].pos.getRangeTo(creeps[j].pos) > range) {
          return false;
        }
      }
    }
    return true;
  }

  public static isQuadAbleToReachDestinationInTime(creeps: CreepBase[], destination: RoomPosition): boolean {
    const allowedExtraCostForAQuad = 5;
    return true;
  }
}
