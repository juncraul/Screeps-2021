import { assert } from "chai";
import { SinonStub } from "sinon";
import ScoutArea from "../../src/Areas/BaseRoom/ScoutArea";
import { CreepBase } from "../../src/CreepBase";
import { GetRoomObjects } from "../../src/Helpers/GetRoomObjects";
import { Helper } from "../../src/Helpers/Helper";
import { Activity } from "../../src/Tasks/CreepTask";

const sinon: typeof import("sinon") = require("sinon");

describe("scout room eligibility", () => {
  let area: ScoutArea;
  const base = "W1N1";
  const neighbor = "W1N2";
  const distant = "W1N3";
  const globals = [
    "Game",
    "Memory",
    "RoomPosition",
    "MOVE",
    "BOTTOM_RIGHT",
    "BOTTOM",
    "BOTTOM_LEFT",
    "FIND_MINERALS",
    "FIND_HOSTILE_CREEPS"
  ];
  let originalGlobals: (PropertyDescriptor | undefined)[];

  function intel(roomName = neighbor): ScoutRoomIntel {
    return {
      roomName,
      lastSeen: 100,
      controller: { x: 25, y: 25, roomName, level: 0, owner: null, reservation: null },
      sources: [],
      minerals: [],
      hostileCount: 0,
      claimable: false
    };
  }

  function pick(): string | null {
    return area["pickNextRoomToScout"](base, area["getScoutRoomNodes"]());
  }

  function visibleRoom(roomName: string, owner?: string, reservation?: string): Room {
    return {
      name: roomName,
      controller: {
        pos: { x: 25, y: 25, roomName },
        owner: owner ? { username: owner } : undefined,
        reservation: reservation ? { username: reservation } : undefined
      } as StructureController,
      find: sinon.stub().returns([]) as Room["find"]
    } as Room;
  }

  beforeEach(() => {
    originalGlobals = globals.map(key => Object.getOwnPropertyDescriptor(global, key));
    const exits: Record<string, ExitsInformation> = {
      [base]: { 5: neighbor },
      [neighbor]: { 1: base }
    };
    Object.assign(global, {
      Game: {
        time: 100,
        rooms: {},
        flags: {},
        map: {
          describeExits: (roomName: string) => exits[roomName],
          getRoomStatus: () => ({ status: "normal" })
        }
      },
      Memory: {},
      RoomPosition: class {
        constructor(public x: number, public y: number, public roomName: string) {}
      },
      MOVE: "move",
      BOTTOM_RIGHT: 4,
      BOTTOM: 5,
      BOTTOM_LEFT: 6,
      FIND_MINERALS: 116,
      FIND_HOSTILE_CREEPS: 103
    });
    sinon.stub(Helper, "getUserName").returns("me");
    area = Object.create(ScoutArea.prototype);
    Object.assign(area, {
      baseRoom: visibleRoom(base, "me"),
      areaId: base,
      creeps: [],
      roomIntel: {}
    });
  });

  afterEach(() => {
    sinon.restore();
    globals.forEach((key, index) => {
      const descriptor = originalGlobals[index];
      if (descriptor) {
        Object.defineProperty(global, key, descriptor);
      } else {
        Reflect.deleteProperty(global, key);
      }
    });
  });

  it("spawns for an unexplored reachable room", () => {
    assert.strictEqual(pick(), neighbor);
    assert.lengthOf(area.handleSpawnTasks(), 1);
  });

  it("does not spawn without reachable rooms", () => {
    sinon.stub(Game.map, "describeExits").returns({});
    assert.isNull(pick());
    assert.isEmpty(area.handleSpawnTasks());
  });

  for (const kind of ["hostile", "owner", "reservation"]) {
    for (const legacy of [false, true]) {
      it(`retries ${kind} intel at exactly 10000 ticks (${legacy ? "legacy" : "timestamped"})`, () => {
        const enemy = intel();
        if (kind === "hostile") enemy.hostileCount = 1;
        if (kind === "owner") enemy.controller!.owner = "enemy";
        if (kind === "reservation") enemy.controller!.reservation = "enemy";
        if (!legacy) enemy.lastEnemySeen = 0;
        else enemy.lastSeen = 0;
        area.roomIntel[neighbor] = enemy;
        Game.time = 9999;

        assert.isNull(pick());
        assert.isEmpty(area.handleSpawnTasks());

        Game.time = 10000;
        assert.strictEqual(pick(), neighbor);
        assert.lengthOf(area.handleSpawnTasks(), 1);
      });
    }
  }

  for (const ownership of ["owner", "reservation"] as const) {
    for (const visible of [false, true]) {
      it(`skips our ${ownership} room using ${visible ? "visible" : "stored"} intel`, () => {
        if (visible) {
          Game.rooms[neighbor] = visibleRoom(
            neighbor,
            ownership === "owner" ? "me" : undefined,
            ownership === "reservation" ? "me" : undefined
          );
        } else {
          const owned = intel();
          owned.controller![ownership] = "me";
          area.roomIntel[neighbor] = owned;
        }
        assert.isNull(pick());
        assert.isEmpty(area.handleSpawnTasks());
      });
    }
  }

  it("can scout through our reserved room to an unexplored room", () => {
    const reserved = intel();
    reserved.controller!.reservation = "me";
    area.roomIntel[neighbor] = reserved;
    sinon
      .stub(Game.map, "describeExits")
      .callsFake(roomName => (roomName === base ? { [BOTTOM]: neighbor } : { 1: base, [BOTTOM]: distant }));

    assert.strictEqual(pick(), distant);
    assert.lengthOf(area.handleSpawnTasks(), 1);
    const creep: CreepBase = Object.create(CreepBase.prototype);
    Object.assign(creep, { pos: new RoomPosition(25, 25, base), isFree: () => true });
    const addTask = sinon.stub(creep, "addTask");
    area.creeps = [creep];
    area.handleCreeps();
    assert.strictEqual(addTask.firstCall.args[0].targetPlace.roomName, neighbor);
    assert.strictEqual(addTask.firstCall.args[0].activity, Activity.MoveDifferentRoom);
  });

  it("does not search beyond a recent hostile room", () => {
    area.roomIntel[neighbor] = { ...intel(), hostileCount: 1, lastEnemySeen: Game.time };
    sinon
      .stub(Game.map, "describeExits")
      .callsFake(roomName => (roomName === base ? { [BOTTOM]: neighbor } : { [BOTTOM]: distant }));
    assert.isFalse(area["getScoutRoomNodes"]().has(distant));
    assert.isEmpty(area.handleSpawnTasks());
  });

  it("preserves the healthy-scout limit and allows dying-scout replacement", () => {
    const creep: CreepBase = Object.create(CreepBase.prototype);
    Object.assign(creep, { ticksToLive: 100 });
    area.creeps = [creep];
    assert.isEmpty(area.handleSpawnTasks());
    creep.ticksToLive = 99;
    assert.lengthOf(area.handleSpawnTasks(), 1);
  });

  for (const kind of ["hostile", "owner", "reservation"]) {
    it(`records and refreshes the tick when ${kind} enemies are visible`, () => {
      const room = visibleRoom(
        neighbor,
        kind === "owner" ? "enemy" : undefined,
        kind === "reservation" ? "enemy" : undefined
      );
      if (kind === "hostile") (room.find as SinonStub).withArgs(FIND_HOSTILE_CREEPS).returns([{}]);
      sinon.stub(GetRoomObjects, "getRoomSources").returns([]);
      Game.rooms[neighbor] = room;
      area["refreshIntelForVisibleRooms"]();
      assert.strictEqual(area.roomIntel[neighbor].lastEnemySeen, 100);

      Game.time = 10099;
      area["refreshIntelForVisibleRooms"]();
      assert.strictEqual(area.roomIntel[neighbor].lastEnemySeen, 10099);
      assert.isEmpty(area.handleSpawnTasks());
    });
  }

  it("retains the last sighting but allows a room confirmed safe again", () => {
    area.roomIntel[neighbor] = { ...intel(), hostileCount: 1, lastEnemySeen: 50 };
    Game.rooms[neighbor] = visibleRoom(neighbor);
    sinon.stub(GetRoomObjects, "getRoomSources").returns([]);
    area["refreshIntelForVisibleRooms"]();
    assert.strictEqual(area.roomIntel[neighbor].lastEnemySeen, 50);
    assert.strictEqual(pick(), neighbor);
  });
});
