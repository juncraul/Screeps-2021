import { assert } from "chai";
import { CreepBase } from "../../src/CreepBase";
import { Helper } from "../../src/Helpers/Helper";
import DuoNavigation from "../../src/Areas/Military/Navigation/DuoNavigation";
import QuadNavigation from "../../src/Areas/Military/Navigation/QuadNavigation";
import EdgeNavigation from "../../src/Areas/Military/Navigation/EdgeNavigation";
import LineNaviagation from "../../src/Areas/Military/Navigation/LineNaviagation";
import SoldierArea, { AttackFlagConfig } from "../../src/Areas/Military/SoldierArea";
import { CreepType } from "../../src/Tasks/SpawnTask";
import { getSoldierAreaMemory, updateSoldierComposition } from "../../src/Areas/Military/SoldierAreaMemory";

const sinon: typeof import("sinon") = require("sinon");

describe("duo navigation", () => {
  const keys = [
    "OK", "Game", "Memory", "RoomPosition", "PathFinder", "ATTACK", "RANGED_ATTACK", "HEAL", "HEAL_POWER", "RANGED_HEAL_POWER",
    "FIND_HOSTILE_CREEPS", "FIND_HOSTILE_STRUCTURES", "STRUCTURE_TOWER", "STRUCTURE_CONTROLLER", "RESOURCE_ENERGY",
    "FIND_STRUCTURES", "FIND_CREEPS", "STRUCTURE_ROAD", "STRUCTURE_CONTAINER", "STRUCTURE_RAMPART", "TERRAIN_MASK_WALL"
  ];
  let originals: (PropertyDescriptor | undefined)[];
  let head: CreepBase;
  let tail: CreepBase;
  let destination: RoomPosition;
  let search: import("sinon").SinonStub;
  let hostiles: Creep[];
  let structures: Structure[];

  function flag(secondaryColor: ColorConstant = COLOR_WHITE): AttackFlagConfig {
    return {
      name: "Attack-X-2", squadSize: 2, powerRank: 1, primaryColor: COLOR_RED,
      secondaryColor, position: destination, targetRoom: destination.roomName
    } as AttackFlagConfig;
  }

  function navigate(secondaryColor: ColorConstant = COLOR_WHITE): boolean {
    return DuoNavigation.tryToKiteTheEnemyAsFormation([head, tail], destination, flag().name, secondaryColor);
  }

  function position(x: number, y = 25, roomName = "E1S1"): RoomPosition {
    return {
      x,
      y,
      roomName,
      getRangeTo: (other: RoomPosition) =>
        roomName === other.roomName ? Math.max(Math.abs(x - other.x), Math.abs(y - other.y)) : Infinity,
      findClosestByPath: (targets: RoomObject[]) => targets[0] ?? null,
      inRangeTo: (other: RoomPosition, range: number) =>
        roomName === other.roomName && Math.max(Math.abs(x - other.x), Math.abs(y - other.y)) <= range
    } as RoomPosition;
  }

  function member(name: string, x: number): CreepBase {
    const creep: CreepBase = Object.create(CreepBase.prototype);
    Object.assign(creep, {
      name,
      pos: position(x),
      hits: 100,
      hitsMax: 100,
      ticksToLive: 1000,
      creepType: name === "head" ? CreepType.Melee : CreepType.Healer,
      memory: { role: name === "head" ? "Melee" : "Healer" },
      say: sinon.stub(),
      creep: {
        fatigue: 0, move: sinon.stub().returns(OK), moveTo: sinon.stub(),
        getActiveBodyparts: (part: BodyPartConstant) => name === "tail" && part === HEAL ? 1 : 0
      }
    });
    return creep;
  }

  beforeEach(() => {
    originals = keys.map(key => Object.getOwnPropertyDescriptor(global, key));
    hostiles = [];
    structures = [];
    Object.assign(global, {
      OK: 0, Memory: {},
      RoomPosition: class {
        constructor(public x: number, public y: number, public roomName: string) {}
      },
      ATTACK: "attack", RANGED_ATTACK: "ranged_attack", HEAL: "heal", HEAL_POWER: 12, RANGED_HEAL_POWER: 4,
      FIND_HOSTILE_CREEPS: 103, FIND_HOSTILE_STRUCTURES: 109,
      STRUCTURE_TOWER: "tower", STRUCTURE_CONTROLLER: "controller", RESOURCE_ENERGY: "energy",
      Game: {
        time: 100, flags: {}, rooms: {
          E1S1: { find: (kind: FindConstant) => kind === FIND_HOSTILE_CREEPS ? hostiles : structures }
        }
      }
    });
    head = member("head", 10);
    tail = member("tail", 9);
    destination = position(20);
    search = sinon.stub(Helper, "simplePathFinderWithObstacles").returns({
      path: [position(11)], incomplete: false, ops: 1, cost: 1
    });
  });

  afterEach(() => {
    sinon.restore();
    keys.forEach((key, index) => {
      const descriptor = originals[index];
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else Reflect.deleteProperty(global, key);
    });
  });

  it("moves the head forward and the tail into the head's previous tile", () => {
    assert.isTrue(DuoNavigation.tryMoveAsFormation([head, tail], destination));
    sinon.assert.calledWithExactly(head.creep.move as import("sinon").SinonStub, 3);
    sinon.assert.calledWithExactly(tail.creep.move as import("sinon").SinonStub, 3);
    sinon.assert.calledWithExactly(search, head.pos, destination, {
      range: 1, ignoreCreeps: [head.name, tail.name], allowUnseenRooms: true
    });
  });

  for (const tired of ["head", "tail"]) {
    it(`holds both creeps while the ${tired} has fatigue`, () => {
      (tired === "head" ? head : tail).creep.fatigue = 1;
      DuoNavigation.tryMoveAsFormation([head, tail], destination);
      sinon.assert.notCalled(head.creep.move as import("sinon").SinonStub);
      sinon.assert.notCalled(tail.creep.move as import("sinon").SinonStub);
      sinon.assert.notCalled(tail.creep.moveTo as import("sinon").SinonStub);
      sinon.assert.notCalled(search);
    });
  }

  it("holds the head while a separated tail catches up", () => {
    tail.pos = position(7);
    DuoNavigation.tryMoveAsFormation([head, tail], destination);
    sinon.assert.notCalled(head.creep.move as import("sinon").SinonStub);
    sinon.assert.calledWithExactly(tail.creep.moveTo as import("sinon").SinonStub, head.pos, { range: 1, reusePath: 0 });
  });

  it("accepts diagonal adjacency", () => {
    tail.pos = position(9, 24);
    DuoNavigation.tryMoveAsFormation([head, tail], destination);
    sinon.assert.calledWithExactly(tail.creep.move as import("sinon").SinonStub, 4);
  });

  it("holds when no path exists", () => {
    search.returns({ path: [], incomplete: true });
    assert.isTrue(DuoNavigation.tryMoveAsFormation([head, tail], destination));
    sinon.assert.notCalled(head.creep.move as import("sinon").SinonStub);
    sinon.assert.notCalled(tail.creep.move as import("sinon").SinonStub);
  });

  it("does not advance the tail when the head's move is rejected", () => {
    (head.creep.move as import("sinon").SinonStub).returns(-4);
    DuoNavigation.tryMoveAsFormation([head, tail], destination);
    sinon.assert.notCalled(tail.creep.move as import("sinon").SinonStub);
  });

  it("holds at the destination", () => {
    DuoNavigation.tryMoveAsFormation([head, tail], head.pos);
    sinon.assert.notCalled(search);
    sinon.assert.notCalled(tail.creep.move as import("sinon").SinonStub);
  });

  it("keeps following when the pair straddles a room border", () => {
    head.pos = position(0, 25, "E2S1");
    tail.pos = position(49, 25, "E1S1");
    destination = position(20, 25, "E2S1");
    search.returns({ path: [position(1, 25, "E2S1")], incomplete: false });
    DuoNavigation.tryMoveAsFormation([head, tail], destination);
    sinon.assert.calledWithExactly(head.creep.move as import("sinon").SinonStub, 3);
    sinon.assert.calledWithExactly(tail.creep.move as import("sinon").SinonStub, 3);
    sinon.assert.notCalled(tail.creep.moveTo as import("sinon").SinonStub);
  });

  it("can turn around by swapping head and tail tiles", () => {
    search.returns({ path: [tail.pos], incomplete: false });
    DuoNavigation.tryMoveAsFormation([head, tail], destination);
    sinon.assert.calledWithExactly(head.creep.move as import("sinon").SinonStub, 7);
    sinon.assert.calledWithExactly(tail.creep.move as import("sinon").SinonStub, 3);
  });

  for (const direction of [1, 3, 5, 7]) {
    it(`clears the exit for the following tail when crossing in direction ${direction}`, () => {
      if (direction === 3) {
        head.pos = position(0, 25, "E2S1");
        tail.pos = position(48, 25, "E1S1");
      } else if (direction === 7) {
        head.pos = position(49, 25, "E0S1");
        tail.pos = position(1, 25, "E1S1");
      } else if (direction === 5) {
        head.pos = position(25, 0, "E1S2");
        tail.pos = position(25, 48, "E1S1");
      } else {
        head.pos = position(25, 49, "E1S0");
        tail.pos = position(25, 1, "E1S1");
      }
      DuoNavigation.tryMoveAsFormation([head, tail], head.pos);
      sinon.assert.calledWithExactly(head.creep.move as import("sinon").SinonStub, direction);
      sinon.assert.calledWithExactly(tail.creep.move as import("sinon").SinonStub, direction);
      sinon.assert.notCalled(tail.creep.moveTo as import("sinon").SinonStub);
    });
  }

  it("keeps the head waiting when the tail is more than one crossing step away", () => {
    head.pos = position(0, 25, "E2S1");
    tail.pos = position(47, 25, "E1S1");
    DuoNavigation.tryMoveAsFormation([head, tail], destination);
    sinon.assert.notCalled(head.creep.move as import("sinon").SinonStub);
    sinon.assert.calledOnce(tail.creep.moveTo as import("sinon").SinonStub);
  });

  it("keeps existing pathfinder defaults while allowing duo tiles and unseen rooms on request", () => {
    search.restore();
    Object.assign(global, {
      FIND_STRUCTURES: 107, FIND_CREEPS: 101, STRUCTURE_ROAD: "road", STRUCTURE_CONTAINER: "container",
      STRUCTURE_RAMPART: "rampart", TERRAIN_MASK_WALL: 1
    });
    const matrices: Map<string, number>[] = [];
    const engine = sinon.stub().returns({ path: [], incomplete: false });
    Object.assign(global, {
      PathFinder: {
        search: engine,
        CostMatrix: class {
          cells = new Map<string, number>();
          constructor() { matrices.push(this.cells); }
          set(x: number, y: number, cost: number): void { this.cells.set(`${x}:${y}`, cost); }
        }
      }
    });
    Object.assign(Game.rooms.E1S1, {
      find: ((kind: FindConstant) => kind === FIND_CREEPS
        ? [{ name: tail.name, pos: tail.pos }, { name: "other", pos: position(15) }]
        : []) as Room["find"],
      getTerrain: () => ({ get: () => 0 })
    });

    Helper.simplePathFinderWithObstacles(head.pos, destination);
    const originalOptions = engine.firstCall.args[2] as PathFinderOpts;
    assert.strictEqual(engine.firstCall.args[1].range, 0);
    assert.isFalse(originalOptions.roomCallback!("E2S1"));
    originalOptions.roomCallback!("E1S1");
    assert.strictEqual(matrices[0].get("9:25"), 255);

    Helper.simplePathFinderWithObstacles(head.pos, destination, {
      range: 1, ignoreCreeps: [head.name, tail.name], allowUnseenRooms: true
    });
    const duoOptions = engine.secondCall.args[2] as PathFinderOpts;
    assert.strictEqual(engine.secondCall.args[1].range, 1);
    assert.isTrue(duoOptions.roomCallback!("E2S1"));
    duoOptions.roomCallback!("E1S1");
    assert.isUndefined(matrices[1].get("9:25"));
    assert.strictEqual(matrices[1].get("15:25"), 255);
  });

  it("dispatches two-creep squads to duo navigation with the attacker as head", () => {
    const duo = sinon.stub(DuoNavigation, "tryToKiteTheEnemyAsFormation").returns(true);
    const edge = sinon.stub(EdgeNavigation, "shouldApplyEdgeNavigation");
    const quad = sinon.stub(QuadNavigation, "tryToKiteTheEnemyAsFormation");
    assert.isTrue(SoldierArea["managedToApplyAFormationMovement"]([tail, head], flag()));
    sinon.assert.calledWithExactly(duo, [head, tail], destination, flag().name, COLOR_WHITE);
    sinon.assert.notCalled(edge);
    sinon.assert.notCalled(quad);
    assert.strictEqual(getSoldierAreaMemory(flag().name).navigation!.lastStyle, "duo");
    assert.strictEqual(head.memory.formationOrder, 0);
    assert.strictEqual(tail.memory.formationOrder, 1);
  });

  it("keeps four-creep squads on quad navigation", () => {
    const duo = sinon.stub(DuoNavigation, "tryToKiteTheEnemyAsFormation");
    sinon.stub(EdgeNavigation, "shouldApplyEdgeNavigation").returns(false);
    const quad = sinon.stub(QuadNavigation, "tryToKiteTheEnemyAsFormation").returns(true);
    const squad = [head, tail, member("third", 8), member("fourth", 7)];
    assert.isTrue(SoldierArea["managedToApplyAFormationMovement"](squad, { ...flag(), squadSize: 4 }));
    sinon.assert.calledOnce(quad);
    sinon.assert.notCalled(duo);
  });

  it("resumes quad navigation after line navigation when all creeps are in the destination room", () => {
    sinon.stub(EdgeNavigation, "shouldApplyEdgeNavigation").returns(false);
    const quad = sinon.stub(QuadNavigation, "tryToKiteTheEnemyAsFormation").returns(true);
    const line = sinon.stub(LineNaviagation, "tryMoveAsFormation");
    const squad = [head, tail, member("third", 8), member("fourth", 7)];
    getSoldierAreaMemory(flag().name).navigation = { lastStyle: "line" };

    assert.isTrue(SoldierArea["managedToApplyAFormationMovement"](squad, { ...flag(), squadSize: 4 }));
    sinon.assert.calledOnce(quad);
    sinon.assert.notCalled(line);
  });

  it("uses line navigation when the flag is on a room edge", () => {
    const quad = sinon.stub(QuadNavigation, "tryToKiteTheEnemyAsFormation").returns(true);
    const line = sinon.stub(LineNaviagation, "tryMoveAsFormation").returns(true);
    const squad = [head, tail, member("third", 8), member("fourth", 7)];
    const edgeFlag = { ...flag(), position: position(48), targetRoom: destination.roomName, squadSize: 4 };
    getSoldierAreaMemory(edgeFlag.name).navigation = { lastStyle: "quad" };
    assert.isTrue(SoldierArea["managedToApplyAFormationMovement"](squad, edgeFlag));
    sinon.assert.notCalled(quad);
    sinon.assert.calledOnce(line);
    assert.strictEqual(getSoldierAreaMemory(edgeFlag.name).navigation!.lastStyle, "line");
  });

  for (const color of [COLOR_RED, COLOR_BLUE, COLOR_GREY, COLOR_WHITE]) {
    it(`respects targeting mode ${color} through the duo combat entry point`, () => {
      const enemy = {
        id: "enemy", pos: position(15), body: [{ type: RANGED_ATTACK, hits: 0 }]
      } as Creep;
      hostiles = [enemy];
      structures = [{ structureType: "spawn", pos: position(17) } as Structure];
      assert.isTrue(navigate(color));
      const expected = color === COLOR_WHITE ? destination : color === COLOR_GREY ? structures[0].pos : enemy.pos;
      sinon.assert.calledWith(search, head.pos, expected);
    });
  }

  it("ignores towers as pursuit targets in creeps-only mode", () => {
    structures = [{
      structureType: STRUCTURE_TOWER, pos: position(17), store: { getUsedCapacity: () => 100 }
    } as StructureTower];
    navigate(COLOR_BLUE);
    sinon.assert.calledWith(search, head.pos, destination);
  });

  it("regroups even when the head is already in attack range", () => {
    tail.pos = position(5);
    hostiles = [{ id: "enemy", pos: position(11), body: [{ type: ATTACK, hits: 100 }] } as Creep];
    navigate(COLOR_RED);
    sinon.assert.notCalled(head.creep.move as import("sinon").SinonStub);
    sinon.assert.calledOnce(tail.creep.moveTo as import("sinon").SinonStub);
  });

  it("retreats under unsustainable damage and resumes pursuing only when fully healed", () => {
    const enemy = { id: "enemy", pos: position(15), body: [{ type: ATTACK, hits: 100 }] } as Creep;
    hostiles = [enemy];
    navigate(COLOR_RED);
    Game.time++;
    head.hits = 50;
    search.resetHistory();
    navigate(COLOR_RED);
    sinon.assert.calledWith(search, head.pos, destination);
    const navigation = getSoldierAreaMemory(flag().name).navigation!;
    assert.isTrue(navigation.duoKiteState!.isRetreating);
    assert.isUndefined(navigation.quadKiteState);
    Game.time++;
    head.hits = 80;
    navigate(COLOR_RED);
    assert.isTrue(navigation.duoKiteState!.isRetreating);
    Game.time++;
    head.hits = 100;
    search.resetHistory();
    navigate(COLOR_RED);
    assert.isFalse(navigation.duoKiteState!.isRetreating);
    sinon.assert.calledWith(search, head.pos, enemy.pos);
  });

  it("preserves duo chase progress across composition updates and abandons stalled targets", () => {
    hostiles = [{ id: "enemy", pos: position(15), body: [{ type: ATTACK, hits: 100 }] } as Creep];
    for (let tick = 100; tick <= 105; tick++) {
      Game.time = tick;
      updateSoldierComposition(flag(COLOR_RED), [head, tail]);
      navigate(COLOR_RED);
    }
    const memory = getSoldierAreaMemory(flag().name);
    assert.strictEqual(memory.ignoredChaseTargets!.enemy, 130);
    assert.isUndefined(memory.chases!.duo);
  });

  it("declines squads that do not contain exactly two creeps", () => {
    assert.isFalse(DuoNavigation.tryMoveAsFormation([head], destination));
    assert.isFalse(DuoNavigation.tryMoveAsFormation([head, tail, head], destination));
  });
});