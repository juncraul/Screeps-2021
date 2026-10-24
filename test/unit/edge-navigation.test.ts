import { assert } from "chai";
import { SinonStub } from "sinon";
import { CreepBase } from "../../src/CreepBase";
import EdgeNavigation from "../../src/Areas/Military/Navigation/EdgeNavigation";

const sinon: typeof import("sinon") = require("sinon");

describe("edge navigation room transitions", () => {
  const keys = [
    "Game",
    "Memory",
    "RoomPosition",
    "PathFinder",
    "HEAL",
    "HEAL_POWER",
    "RANGED_HEAL_POWER",
    "LOOK_STRUCTURES",
    "STRUCTURE_RAMPART",
    "STRUCTURE_WALL",
    "LEFT",
    "RIGHT",
    "TOP",
    "BOTTOM"
  ];
  let originals: (PropertyDescriptor | undefined)[];
  const targetRoom = "E0S0";
  const directions = [
    {
      name: "east",
      previousRoom: "W0S0",
      arrival: [0, 25],
      previous: [49, 25],
      edge: { axis: "x", value: 1 },
      wall: [2, 25]
    },
    {
      name: "west",
      previousRoom: "E1S0",
      arrival: [49, 25],
      previous: [0, 25],
      edge: { axis: "x", value: 48 },
      wall: [47, 25]
    },
    {
      name: "south",
      previousRoom: "E0N0",
      arrival: [25, 0],
      previous: [25, 49],
      edge: { axis: "y", value: 1 },
      wall: [25, 2]
    },
    {
      name: "north",
      previousRoom: "E0S1",
      arrival: [25, 49],
      previous: [25, 0],
      edge: { axis: "y", value: 48 },
      wall: [25, 47]
    }
  ] as const;
  let wall: readonly number[];

  function position(coords: readonly number[], roomName = targetRoom): RoomPosition {
    return new RoomPosition(coords[0], coords[1], roomName);
  }

  function member(name: string, pos: RoomPosition, hits = 100): CreepBase {
    const creep: CreepBase = Object.create(CreepBase.prototype);
    Object.assign(creep, {
      name,
      pos,
      hits,
      hitsMax: 100,
      moveTo: sinon.stub(),
      move: sinon.stub(),
      say: sinon.stub(),
      creep: {
        name,
        pos,
        fatigue: 0,
        move: sinon.stub(),
        moveTo: sinon.stub(),
        moveByPath: sinon.stub(),
        getActiveBodyparts: () => 0
      }
    });
    return creep;
  }

  beforeEach(() => {
    originals = keys.map(key => Object.getOwnPropertyDescriptor(global, key));
    wall = [];
    Object.assign(global, {
      Game: { time: 100, rooms: { [targetRoom]: { visual: { text: sinon.stub() } } } },
      Memory: {},
      HEAL: "heal",
      HEAL_POWER: 12,
      RANGED_HEAL_POWER: 4,
      LOOK_STRUCTURES: "structure",
      STRUCTURE_RAMPART: "rampart",
      STRUCTURE_WALL: "constructedWall",
      LEFT: 7,
      RIGHT: 3,
      TOP: 1,
      BOTTOM: 5,
      RoomPosition: class {
        constructor(public x: number, public y: number, public roomName: string) {}
        inRangeTo(pos: RoomPosition, range: number): boolean {
          return (
            this.roomName === pos.roomName && Math.max(Math.abs(this.x - pos.x), Math.abs(this.y - pos.y)) <= range
          );
        }
        getRangeTo(pos: RoomPosition): number {
          return this.roomName === pos.roomName
            ? Math.max(Math.abs(this.x - pos.x), Math.abs(this.y - pos.y))
            : Infinity;
        }
        lookFor(): Structure[] {
          return this.x === wall[0] && this.y === wall[1] ? [{ structureType: "constructedWall" } as Structure] : [];
        }
      },
      PathFinder: { search: sinon.stub().returns({ path: [], incomplete: false }) }
    });
    sinon.stub(console, "log");
  });

  afterEach(() => {
    sinon.restore();
    keys.forEach((key, index) => {
      const descriptor = originals[index];
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else Reflect.deleteProperty(global, key);
    });
  });

  for (const direction of directions) {
    it(`uses the flag edge for ${direction.name} navigation`, () => {
      const leader = member("leader", position(direction.arrival));
      const flagPosition =
        direction.edge.axis === "x" ? position([direction.edge.value, 25]) : position([25, direction.edge.value]);
      assert.deepEqual(EdgeNavigation["getEdgeFromDestination"](flagPosition), direction.edge);
      wall = direction.wall;
      assert.isTrue(EdgeNavigation.shouldApplyEdgeNavigation(leader, position([25, 25])));
    });

    it(`brings a split squad ${direction.name} without redirecting it back to an outside leader`, () => {
      const outside = member("outside", position(direction.previous, direction.previousRoom));
      const inside = member("inside", position(direction.arrival));
      const squad = [outside, inside];
      const flagPosition =
        direction.edge.axis === "x" ? position([direction.edge.value, 25]) : position([25, direction.edge.value]);
      assert.isTrue(EdgeNavigation.tryToAttackFromEdge(squad, flagPosition, "Attack-X-2"));
      assert.strictEqual(squad[0], outside);
      const move = outside.creep.move as SinonStub;
      sinon.assert.calledOnce(move);
      assert.strictEqual(
        move.firstCall.args[0],
        direction.edge.axis === "x"
          ? direction.edge.value === 1
            ? RIGHT
            : LEFT
          : direction.edge.value === 1
          ? BOTTOM
          : TOP
      );
      sinon.assert.notCalled(outside.creep.moveTo as SinonStub);
      sinon.assert.notCalled(inside.creep.move as SinonStub);
      sinon.assert.calledOnce(inside.creep.moveByPath as SinonStub);
    });

    it(`steps inward and holds while healing after retreating from a ${direction.name} crossing`, () => {
      const border = member("recovering", position(direction.previous, direction.previousRoom), 90);
      const flagPosition =
        direction.edge.axis === "x" ? position([direction.edge.value, 25]) : position([25, direction.edge.value]);
      EdgeNavigation["moveFurtherIntoSafeRoom"]([border], flagPosition);
      sinon.assert.calledOnce(border.creep.move as SinonStub);
      assert.strictEqual(
        (border.creep.move as SinonStub).firstCall.args[0],
        direction.edge.axis === "x"
          ? direction.edge.value === 1 ? LEFT : RIGHT
          : direction.edge.value === 1 ? TOP : BOTTOM
      );
      sinon.assert.notCalled(border.creep.moveTo as SinonStub);

      border.pos = position(
        direction.edge.axis === "x"
          ? [direction.edge.value === 1 ? 48 : 1, 25]
          : [25, direction.edge.value === 1 ? 1 : 48],
        direction.previousRoom
      );
      EdgeNavigation["moveFurtherIntoSafeRoom"](
        [border],
        flagPosition
      );
      sinon.assert.calledOnce(border.creep.move as SinonStub);
    });

    it(`retreats through the ${direction.name} entry border instead of another axis`, () => {
      const coords = direction.edge.axis === "x" ? [direction.edge.value, 25] : [25, direction.edge.value];
      const creep = member("retreating", position(coords));
      EdgeNavigation["retreatToAdjacentRoom"]([creep], position(
        direction.edge.axis === "x" ? [direction.edge.value, 25] : [25, direction.edge.value]
      ));
      const move = creep.creep.move as SinonStub;
      sinon.assert.calledOnce(move);
      assert.strictEqual(move.firstCall.args[0], direction.edge.axis === "x"
        ? direction.edge.value === 1 ? LEFT : RIGHT
        : direction.edge.value === 1 ? TOP : BOTTOM);
    });

    it(`retreats the whole squad through the ${direction.name} entry border`, () => {
      const squad = [24, 25, 26, 27].map((value, index) =>
        member(String(index), position(direction.edge.axis === "x" ? [direction.edge.value, value] : [value, direction.edge.value]))
      );
      EdgeNavigation["retreatToAdjacentRoom"](
        squad,
        position(direction.edge.axis === "x" ? [direction.edge.value, 25] : [25, direction.edge.value])
      );
      for (const creep of squad) {
        const move = creep.creep.move as SinonStub;
        sinon.assert.calledOnce(move);
        assert.strictEqual(move.firstCall.args[0], direction.edge.axis === "x"
          ? direction.edge.value === 1 ? LEFT : RIGHT
          : direction.edge.value === 1 ? TOP : BOTTOM);
      }
    });

    it(`keeps distinct ${direction.name} slots near corners and orders along the correct axis`, () => {
      const slots = EdgeNavigation["getEdgeSlots"](direction.edge, 4, position([48, 48]));
      assert.strictEqual(new Set(slots.map(slot => `${slot.x}:${slot.y}`)).size, 4);
      const squad = slots.map((slot, index) => member(String(index), slot)).reverse();
      EdgeNavigation["assignCreepsToSlots"](squad, slots, targetRoom);
      for (const creep of squad) {
        sinon.assert.notCalled(creep.creep.moveByPath as SinonStub);
        sinon.assert.notCalled(creep.creep.moveTo as SinonStub);
      }
    });
  }

  it("does not inspect destination walls using coordinates from the previous room", () => {
    wall = [47, 25];
    const outside = member("outside", position([49, 25], "W0S0"));
    assert.isFalse(EdgeNavigation.shouldApplyEdgeNavigation(outside, position([25, 25])));
  });

  it("uses line navigation for destinations on a room edge", () => {
    const leader = member("leader", position([25, 25]));
    for (const coords of [[1, 25], [48, 25], [25, 1], [25, 48]]) {
      assert.isFalse(EdgeNavigation.shouldApplyEdgeNavigation(leader, position(coords)));
    }
  });

  it("moves the whole formation to the exit before crossing into an edge destination", () => {
    const creeps = [23, 24, 25, 26].map((y, index) => member(String(index), position([48, y], "E0S0")));
    const destination = position([1, 25], "E1S0");

    assert.isTrue(EdgeNavigation.tryToAttackFromEdge(creeps, destination, "Attack-X-2"));
    for (const creep of creeps) {
      sinon.assert.calledOnce(creep.creep.move as SinonStub);
      assert.strictEqual((creep.creep.move as SinonStub).firstCall.args[0], RIGHT);
      sinon.assert.notCalled(creep.creep.moveTo as SinonStub);
    }
  });

  it("hands off to normal navigation once a retreated squad is fully healed", () => {
    Object.assign(Memory, { Areas: { Soldiers: { test: { navigation: { edgeMode: true } } } } });
    const creep = member("healed", position([48, 25], "W0S0"));
    assert.isFalse(EdgeNavigation.tryToAttackFromEdge([creep], position([25, 25]), "test"));
    assert.isFalse(Memory.Areas!.Soldiers!.test.navigation!.edgeMode);
  });
});
