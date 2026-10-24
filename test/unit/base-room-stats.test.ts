import { assert } from "chai";
import BaseRoomStats from "../../src/Areas/BaseRoom/BaseRoomStats";

const sinon: typeof import("sinon") = require("sinon");

describe("base room controller progress", () => {
  let room: Room;
  let tick: number;
  let level: number;
  let owned: boolean;
  let spawns: StructureSpawn[];
  let text: ReturnType<typeof sinon.stub>;
  let previousGame: typeof Game;
  let previousMemory: Memory;

  beforeEach(() => {
    previousGame = global.Game;
    previousMemory = (global as typeof global & { Memory: Memory }).Memory;
    tick = 100;
    level = 1;
    owned = true;
    spawns = [];
    text = sinon.stub();
    Object.assign(global, {
      Game: {
        get time() {
          return tick;
        }
      },
      Memory: {},
      FIND_MY_SPAWNS: 112,
      FIND_DROPPED_RESOURCES: 106,
      FIND_TOMBSTONES: 118,
      FIND_RUINS: 123,
      FIND_STRUCTURES: 107
    });
    room = ({
      name: "W1N1",
      controller: {
        get level() {
          return level;
        },
        get my() {
          return owned;
        }
      },
      find: (type: FindConstant) => (type === FIND_MY_SPAWNS ? spawns : []),
      visual: { text }
    } as unknown) as Room;
  });

  afterEach(() => {
    global.Game = previousGame;
    Object.assign(global, { Memory: previousMemory });
  });

  it("records and displays RCL 1 before the first spawn exists", () => {
    BaseRoomStats.drawRoomVisual(room);

    const stats = BaseRoomStats.getRoomStats(room);
    assert.strictEqual(stats.controllerLevelTicks[1], 100);
    assert.isUndefined(stats.spawnPlacedTick);
    assert.isTrue(text.calledWith("Claimed at: 100"));
    assert.isTrue(text.calledWith("RCL 1: +0 ticks (100)"));
  });

  it("preserves the claim tick and measures later levels from it", () => {
    BaseRoomStats.getRoomStats(room);
    tick = 200;
    level = 2;
    BaseRoomStats.getRoomStats(room);
    tick = 300;
    spawns = [{} as StructureSpawn];

    BaseRoomStats.drawRoomVisual(room);

    const stats = BaseRoomStats.getRoomStats(room);
    assert.strictEqual(stats.controllerLevelTicks[1], 100);
    assert.strictEqual(stats.controllerLevelTicks[2], 200);
    assert.strictEqual(stats.spawnPlacedTick, 300);
    assert.isTrue(text.calledWith("RCL 2: +100 ticks (200)"));
  });

  it("does not record controller levels for an unowned room", () => {
    owned = false;

    assert.deepEqual(BaseRoomStats.getRoomStats(room).controllerLevelTicks, {});
  });

  it("preserves a level first recorded at tick zero", () => {
    tick = 0;
    BaseRoomStats.getRoomStats(room);
    tick = 100;

    assert.strictEqual(BaseRoomStats.getRoomStats(room).controllerLevelTicks[1], 0);
  });

  it("keeps the spawn baseline for legacy records without RCL 1", () => {
    level = 3;
    spawns = [{} as StructureSpawn];
    BaseRoomStats.getRoomStats(room);
    tick = 200;
    level = 4;

    BaseRoomStats.drawRoomVisual(room);

    assert.isUndefined(BaseRoomStats.getRoomStats(room).controllerLevelTicks[1]);
    assert.isTrue(text.calledWith("RCL 4: +100 ticks (200)"));
  });
});
