import { CreepBase } from "../../../CreepBase";
import { Helper } from "Helpers/Helper";

export default class QuadNavigation {
  public static tryMoveAsFormation(creeps: CreepBase[], destinationFlag: RoomPosition): boolean {
    if (creeps.length < 4) {
      return false;
    }

    const ordered = this.getOrderedFormationCreeps(creeps);
    const quad = ordered.slice(0, 4);
    if (!this.creepsAreInRangeOfEachOther(quad, 4)) {
      return false; // If the creeps are not in range of each other, then we should not try to move as a formation.
    }

    const leader = quad[0];
    const destination = destinationFlag;
    // leader.pos.roomName === destinationFlag.roomName ? destinationFlag : new RoomPosition(25, 25, destinationFlag.roomName);

    if (!this.isQuadAssembled(quad)) {
      const regroupSlots = this.findBestRegroupSlots(leader, quad);
      if (!regroupSlots) {
        return false;
      }

      this.regroupQuad(quad, leader.pos, regroupSlots);
      return true;
    } else {
      Helper.setCashedMemory(`QuadNavigation-${leader.name}`, []);
    }

    const direction = this.getLeaderDirectionForQuadPath(leader, destination, quad);
    if (!direction) {
      return false;
    }

    const step = this.getStepOffset(direction);
    if (!step) {
      return false;
    }

    const nextLeader = new RoomPosition(leader.pos.x + step.dx, leader.pos.y + step.dy, leader.pos.roomName);
    const nextSquare = this.getSquareSlots(nextLeader);
    const room = Game.rooms[nextLeader.roomName];
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
          opacity: 0.8,
          font: 0.5,
          color: "#00ff88",
          backgroundColor: "#000000"
        });
      }
    } else {
      const lineSlots = this.getLineSlots(nextLeader, quad.length, step);
      for (const creep of quad) {
        creep.creep.move(direction);
      }
      for (let i = 0; i < quad.length; i++) {
        room.visual.text(`${i}`, lineSlots[i].x, lineSlots[i].y, {
          align: "center",
          opacity: 0.8,
          font: 0.5,
          color: "#ffcc00",
          backgroundColor: "#000000"
        });
      }
    }

    for (const trailing of ordered.slice(4)) {
      trailing.creep.moveTo(leader.pos, { reusePath: 0, range: 1 });
    }

    return true;
  }

  private static getOrderedFormationCreeps(creeps: CreepBase[]): CreepBase[] {
    // const unassigned = creeps.filter(
    //   creep => creep.memory.formationOrder === null || creep.memory.formationOrder === undefined
    // );
    // if (unassigned.length > 0) {
    const orderedByTimeToLive = creeps.slice().sort((a, b) => a.ticksToLive! - b.ticksToLive!);
    for (let i = 0; i < orderedByTimeToLive.length; i++) {
      orderedByTimeToLive[i].memory.formationOrder = i;
    }
    // }

    return creeps.slice().sort((a, b) => (a.memory.formationOrder ?? 0) - (b.memory.formationOrder ?? 0));
  }

  private static isQuadAssembled(quad: CreepBase[]): boolean {
    const leader = quad[0];
    const expectedSlots = this.getSquareSlots(leader.pos);
    const occupied = new Set(quad.map(creep => `${creep.pos.x}:${creep.pos.y}:${creep.pos.roomName}`));
    return expectedSlots.every(slot => occupied.has(`${slot.x}:${slot.y}:${slot.roomName}`));
  }

  private static regroupQuad(quad: CreepBase[], leaderPos: RoomPosition, slots: RoomPosition[]): RoomPosition[] | null {
    const room = Game.rooms[leaderPos.roomName];
    if (!room) {
      return null;
    }

    for (let i = 0; i < quad.length; i++) {
      quad[i].creep.moveTo(slots[i], { reusePath: 0, range: 0 });
      room.visual.text(`${i}`, slots[i].x, slots[i].y, {
        align: "center",
        opacity: 0.8,
        font: 0.5,
        color: "#66ccff",
        backgroundColor: "#000000"
      });
    }

    return slots;
  }

  private static findBestRegroupSlots(leader: CreepBase, squadCreeps: CreepBase[]): RoomPosition[] | null {
    const room = Game.rooms[leader.pos.roomName];
    if (!room) {
      return null;
    }

    const memorySlots = Helper.getCashedMemory<string[]>(`QuadNavigation-${leader.name}`, []);
    const slots = memorySlots.map(slot => {
      const [x, y, roomName] = slot.split(":");
      return new RoomPosition(parseInt(x, 10), parseInt(y, 10), roomName);
    });

    const positionsValid = slots.every(slot => this.isPositionEmpty(slot, squadCreeps));
    if (slots.length !== 0 && positionsValid) {
      return slots;
    }

    const empty4SquarePosForLeader = Helper.findClosestMatching(leader.pos, 10, pos => {
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
        opacity: 0.8,
        font: 0.5,
        color: "#ff0000",
        backgroundColor: "#000000"
      });
    }

    if (squadPositions.length === 4) {
      Helper.setCashedMemory(
        `QuadNavigation-${leader.name}`,
        squadPositions.map(slot => `${slot.x}:${slot.y}:${slot.roomName}`)
      );
      return squadPositions;
    }

    return null;
  }

  private static getLeaderDirectionForQuadPath(
    leader: CreepBase,
    destination: RoomPosition,
    quad: CreepBase[]
  ): DirectionConstant | null {
    const squadNames = new Set(quad.map(creep => creep.name));
    const result = PathFinder.search(
      leader.pos,
      { pos: destination, range: 0 },
      {
        plainCost: 2,
        swampCost: 10,
        maxOps: 5000,
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

    if (result.incomplete || result.path.length === 0) {
      return null;
    }

    return leader.pos.getDirectionTo(result.path[0]);
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
}
