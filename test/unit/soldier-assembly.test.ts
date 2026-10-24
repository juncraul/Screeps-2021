import { assert } from "chai";
import { SinonStub } from "sinon";
import { CreepBase } from "../../src/CreepBase";
import SoldierArea from "../../src/Areas/Military/SoldierArea";
import { getSoldierAreaMemory } from "../../src/Areas/Military/SoldierAreaMemory";
import { GetRoomObjects } from "../../src/Helpers/GetRoomObjects";
import { Helper } from "../../src/Helpers/Helper";
import CreepTask, { Activity } from "../../src/Tasks/CreepTask";

const sinon: typeof import("sinon") = require("sinon");

describe("soldier squad assembly", () => {
  const roomName = "W1N1";
  const flagName = "Attack-X-4";
  const keys = [
    "Game",
    "Memory",
    "RoomPosition",
    "FIND_STRUCTURES",
    "FIND_CONSTRUCTION_SITES",
    "FIND_SOURCES",
    "FIND_MINERALS",
    "FIND_CREEPS",
    "STRUCTURE_ROAD",
    "STRUCTURE_RAMPART",
    "STRUCTURE_WALL",
    "TERRAIN_MASK_WALL",
    "LOOK_CREEPS",
    "LOOK_STRUCTURES",
    "LOOK_CONSTRUCTION_SITES"
  ];
  let originals: (PropertyDescriptor | undefined)[];
  let area: SoldierArea;
  let room: Room;
  let spawn: StructureSpawn;
  let structures: Structure[];
  let sites: ConstructionSite[];
  let terrain: SinonStub;
  let path: SinonStub;
  let formation: SinonStub;
  let log: SinonStub;

  function member(name: string, x = 25, y = 25, birthRoom = roomName): CreepBase {
    const creep: CreepBase = Object.create(CreepBase.prototype);
    const memory = { room: birthRoom, role: "Melee" } as CreepMemory;
    Object.assign(creep, {
      name,
      memory,
      spawning: false,
      ticksToLive: 1000,
      pos: new RoomPosition(x, y, birthRoom),
      creep: { memory, moveTo: sinon.stub() },
      task: new CreepTask(Activity.MoveDifferentRoom, new RoomPosition(25, 25, "W2N1"))
    });
    return creep;
  }

  function structure(type: StructureConstant, x: number, y: number): Structure {
    return { structureType: type, pos: new RoomPosition(x, y, roomName) } as Structure;
  }

  function recreateArea(): void {
    const next: SoldierArea = Object.create(SoldierArea.prototype);
    Object.assign(next, {
      flag: area.flag,
      creeps: area.creeps,
      runHealerPassiveEffect: sinon.stub(),
      runAttackerPassiveEffect: sinon.stub()
    });
    area = next;
  }

  function assemble(): SoldierAssemblyMemory {
    area.handleThisArea();
    return getSoldierAreaMemory(flagName).assembly!;
  }

  function gather(): void {
    const assembly = getSoldierAreaMemory(flagName).assembly!;
    area.creeps.forEach((creep, index) => {
      const slot = assembly.slots[index];
      creep.pos = new RoomPosition(slot.x, slot.y, assembly.roomName);
    });
  }

  beforeEach(() => {
    originals = keys.map(key => Object.getOwnPropertyDescriptor(global, key));
    Object.assign(global, {
      Game: { time: 100, rooms: {}, creeps: {} },
      Memory: {},
      FIND_STRUCTURES: 107,
      FIND_CONSTRUCTION_SITES: 111,
      FIND_SOURCES: 105,
      FIND_MINERALS: 116,
      FIND_CREEPS: 101,
      STRUCTURE_ROAD: "road",
      STRUCTURE_RAMPART: "rampart",
      STRUCTURE_WALL: "constructedWall",
      TERRAIN_MASK_WALL: 1,
      LOOK_CREEPS: "creep",
      LOOK_STRUCTURES: "structure",
      LOOK_CONSTRUCTION_SITES: "constructionSite",
      RoomPosition: class {
        constructor(public x: number, public y: number, public roomName: string) {}
        getRangeTo(pos: RoomPosition): number {
          return Math.max(Math.abs(this.x - pos.x), Math.abs(this.y - pos.y));
        }
        isEqualTo(pos: RoomPosition): boolean {
          return this.x === pos.x && this.y === pos.y && this.roomName === pos.roomName;
        }
      }
    });
    spawn = { pos: new RoomPosition(25, 25, roomName) } as StructureSpawn;
    structures = [structure("spawn", 25, 25)];
    sites = [];
    terrain = sinon.stub().returns(0);
    path = sinon.stub().callsFake((_from: RoomPosition, to: RoomPosition) => [{ x: to.x, y: to.y }]);
    room = Object.create(null);
    Object.assign(room, {
      name: roomName,
      find: (kind: FindConstant) =>
        kind === FIND_STRUCTURES ? structures : kind === FIND_CONSTRUCTION_SITES ? sites : [],
      getTerrain: () => ({ get: terrain }),
      findPath: path
    });
    Game.rooms[roomName] = room;
    sinon.stub(GetRoomObjects, "getRoomSpawns").returns([spawn]);
    sinon.stub(Helper, "positionIsWalkable").returns(true);
    formation = sinon.stub(SoldierArea, "managedToApplyAFormationMovement" as keyof typeof SoldierArea).returns(true);
    log = sinon.stub(console, "log");
    area = Object.create(SoldierArea.prototype);
    Object.assign(area, {
      flag: { name: flagName, squadSize: 4, targetRoom: "W2N1", position: new RoomPosition(25, 25, "W2N1") },
      creeps: [member("one")],
      runHealerPassiveEffect: sinon.stub(),
      runAttackerPassiveEffect: sinon.stub()
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

  it("holds an incomplete squad and moves its spawned members away from the spawn", () => {
    const previousTask = area.creeps[0].task!;
    const assembly = assemble();
    assert.isFalse(assembly.deployed);
    assert.isTrue(previousTask.taskDone);
    assert.strictEqual(assembly.roomName, roomName);
    assert.lengthOf(assembly.slots, 1);
    sinon.assert.calledWith(
      area.creeps[0].creep.moveTo as SinonStub,
      new RoomPosition(assembly.slots[0].x, assembly.slots[0].y, roomName),
      { range: 0, maxRooms: 1 }
    );
    sinon.assert.notCalled(formation);
  });

  it("waits for every member to finish spawning and gather on separate tiles", () => {
    area.creeps = ["one", "two", "three", "four"].map(name => member(name));
    area.creeps[3].spawning = true;
    let assembly = assemble();
    assert.isFalse(assembly.deployed);
    assert.strictEqual(new Set(assembly.slots.map(slot => `${slot.x}:${slot.y}`)).size, 4);
    sinon.assert.notCalled(area.creeps[3].creep.moveTo as SinonStub);
    area.creeps[3].spawning = false;
    assembly = assemble();
    assert.isFalse(assembly.deployed);
    gather();
    assert.isTrue(assemble().deployed);
    sinon.assert.calledOnce(formation);
  });

  it("does not recall a complete deployed squad that has left the assembly tiles", () => {
    area.creeps = ["one", "two", "three", "four"].map(name => member(name));
    assemble();
    gather();
    assemble();
    for (const creep of area.creeps) creep.pos = new RoomPosition(10, 10, "W2N1");
    recreateArea();
    assert.isTrue(assemble().deployed);
    sinon.assert.calledTwice(formation);
  });

  it("recalls survivors after casualties, overriding busy attack tasks and clearing navigation", () => {
    area.creeps = ["one", "two", "three", "four"].map(name => member(name));
    assemble();
    gather();
    assemble();
    area.creeps.pop();
    for (const creep of area.creeps) {
      creep.pos = new RoomPosition(10, 10, "W2N1");
      creep.task = new CreepTask(Activity.Attack, creep.pos, null, "enemy");
    }
    getSoldierAreaMemory(flagName).navigation = { lastStyle: "quad" };
    recreateArea();
    assert.isFalse(assemble().deployed);
    assert.isUndefined(getSoldierAreaMemory(flagName).navigation);
    for (const creep of area.creeps) {
      assert.strictEqual(creep.task!.activity, Activity.MoveDifferentRoom);
      assert.strictEqual(creep.task!.targetPlace.roomName, roomName);
    }
  });

  it("gathers Attack-X members from multiple spawn rooms at the first member's birth room", () => {
    area.creeps.push(member("two", 25, 25, "W3N1"));
    const assembly = assemble();
    assert.strictEqual(assembly.roomName, roomName);
    assert.strictEqual(area.creeps[1].task!.targetPlace.roomName, roomName);
    recreateArea();
    area.creeps.shift();
    assert.strictEqual(assemble().roomName, roomName);
  });

  it("prefers the explicitly selected spawn room", () => {
    area.flag.baseRoomName = roomName;
    area.creeps = [member("one", 25, 25, "W3N1")];
    assert.strictEqual(assemble().roomName, roomName);
    assert.strictEqual(area.creeps[0].task!.targetPlace.roomName, roomName);
  });

  it("records the birth room when a new soldier is registered", () => {
    const creep = member("new");
    delete creep.memory.room;
    Object.assign(creep.creep, { room });
    Game.creeps.new = creep.creep;
    Object.assign(area, { memoryType: "SoldierArea" });
    area.handleNewCreepMemory("new");
    assert.strictEqual(creep.memory.room, roomName);
  });

  it("reselects a cached assembly patch if construction makes a slot unwalkable", () => {
    assemble();
    (Helper.positionIsWalkable as SinonStub).returns(false);
    const findSlots = sinon.spy(area, "findAssemblySlots" as keyof SoldierArea);
    assemble();
    sinon.assert.calledOnce(findSlots);
  });

  it("reselects assembly slots when another squad occupies a cached slot", () => {
    const initial = assemble();
    const initialSlots = initial.slots.map(slot => ({ ...slot }));
    const occupied = {
      name: "other-squad-member",
      pos: new RoomPosition(initial.slots[0].x, initial.slots[0].y, roomName)
    } as Creep;
    const originalFind = room.find as any;
    room.find = ((kind: FindConstant) => {
      if (kind === FIND_CREEPS) return [occupied];
      return originalFind(kind);
    }) as Room["find"];
    const findSlots = sinon.spy(area, "findAssemblySlots" as keyof SoldierArea);

    assemble();

    sinon.assert.calledOnce(findSlots);
    assert.notDeepEqual(getSoldierAreaMemory(flagName).assembly!.slots, initialSlots);
  });

  it("can validate occupied assembly tiles without treating the squad itself as an obstacle", () => {
    (Helper.positionIsWalkable as SinonStub).restore();
    const pos = new RoomPosition(20, 20, roomName);
    Object.assign(pos, {
      lookFor: (kind: LookConstant) => (kind === LOOK_CREEPS ? [{}] : [])
    });
    assert.isFalse(Helper.positionIsWalkable(pos));
    assert.isTrue(Helper.positionIsWalkable(pos, true));
    terrain.returns(TERRAIN_MASK_WALL);
    assert.isFalse(Helper.positionIsWalkable(pos, true));
  });

  it("waits explicitly when the assembly room has no spawn", () => {
    (GetRoomObjects.getRoomSpawns as SinonStub).returns([]);
    assert.isEmpty(assemble().slots);
    sinon.assert.calledWithMatch(log, "No spawn available for assembly");
    sinon.assert.notCalled(formation);
  });

  it("recalls remote members even while the assembly room is not visible", () => {
    delete Game.rooms[roomName];
    area.creeps[0].pos = new RoomPosition(10, 10, "W2N1");
    assert.isFalse(assemble().deployed);
    assert.strictEqual(area.creeps[0].task!.activity, Activity.MoveDifferentRoom);
    assert.strictEqual(area.creeps[0].task!.targetPlace.roomName, roomName);
    sinon.assert.calledWithMatch(log, "is not visible");
    sinon.assert.notCalled(formation);
  });

  it("leaves single-creep squads unchanged", () => {
    area.flag.squadSize = 1;
    area.handleThisArea();
    assert.isUndefined(getSoldierAreaMemory(flagName).assembly);
    sinon.assert.calledOnce(formation);
  });

  it("maintains five-tile clearance from every non-exempt structure and construction site", () => {
    structures.push(structure("extension", 20, 20), structure("container", 22, 27));
    sites.push({ structureType: "tower", pos: new RoomPosition(18, 27, roomName) } as ConstructionSite);
    const slots = area["findAssemblySlots"](room, 9);
    assert.lengthOf(slots, 9);
    for (const slot of slots) {
      for (const obstacle of [...structures, ...sites]) {
        assert.isAtLeast(new RoomPosition(slot.x, slot.y, roomName).getRangeTo(obstacle.pos), 5);
      }
    }
    sinon.assert.notCalled(log);
  });

  it("ignores roads, ramparts, and walls for clearance without standing on walls", () => {
    const baseline = area["findAssemblySlots"](room, 4);
    const first = baseline[0];
    const second = baseline[1];
    structures.push(structure(STRUCTURE_ROAD, first.x, first.y), structure(STRUCTURE_WALL, first.x - 1, first.y), {
      ...structure(STRUCTURE_RAMPART, second.x, second.y),
      my: true
    } as StructureRampart);
    const slots = area["findAssemblySlots"](room, 4);
    assert.lengthOf(slots, 4);
    assert.isTrue(slots.some(slot => new RoomPosition(slot.x, slot.y, roomName).getRangeTo(structures[1].pos) < 5));
    assert.isFalse(slots.some(slot => slot.x === first.x - 1 && slot.y === first.y));
    sinon.assert.notCalled(log);
  });

  it("rejects impassable terrain and unreachable partial paths", () => {
    terrain.callsFake((x: number, y: number) => (x < 25 || y < 25 ? TERRAIN_MASK_WALL : 0));
    path.callsFake((_from: RoomPosition, to: RoomPosition) =>
      to.x < 30 ? [{ x: 26, y: 26 }] : [{ x: to.x, y: to.y }]
    );
    const slots = area["findAssemblySlots"](room, 4);
    assert.lengthOf(slots, 4);
    assert.isTrue(slots.every(slot => slot.x >= 30 && slot.y >= 25));
  });

  it("falls back explicitly when five-tile clearance is unavailable", () => {
    terrain.callsFake((x: number, y: number) => (x >= 26 && x <= 27 && y >= 25 && y <= 26 ? 0 : TERRAIN_MASK_WALL));
    const slots = area["findAssemblySlots"](room, 4);
    assert.lengthOf(slots, 4);
    assert.isTrue(log.calledWithMatch("uses 1-tile clearance"));
  });

  it("waits and retries instead of deploying when no reachable patch exists", () => {
    terrain.returns(TERRAIN_MASK_WALL);
    assert.isFalse(assemble().deployed);
    assert.isEmpty(getSoldierAreaMemory(flagName).assembly!.slots);
    const calls = terrain.callCount;
    Game.time = 124;
    assemble();
    assert.strictEqual(terrain.callCount, calls);
    Game.time = 125;
    assemble();
    assert.isAbove(terrain.callCount, calls);
    sinon.assert.notCalled(formation);
    sinon.assert.calledTwice(log);
  });
});
