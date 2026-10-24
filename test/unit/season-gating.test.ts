import { assert } from "chai";
import { SinonStub } from "sinon";
import Overseer from "../../src/Overseer";
import BaseArea from "../../src/Areas/BaseRoom/BaseArea";
import MineralArea from "../../src/Areas/BaseRoom/MineralArea";
import Season10ScoutCollectorArea from "../../src/Areas/Seasons/Season10/Season10ScoutCollectorArea";
import Season11ThoriumArea from "../../src/Areas/Seasons/Season11/Season11ThoriumArea";
import { GetRoomObjects } from "../../src/Helpers/GetRoomObjects";
import SpawnTask from "../../src/Tasks/SpawnTask";

const sinon: typeof import("sinon") = require("sinon");

describe("season-specific memory gates", () => {
  let overseer: Overseer;
  let room: Room;
  let season10Handle: SinonStub;
  let season10Spawn: SinonStub;
  let season11Handle: SinonStub;
  let season11Spawn: SinonStub;
  let find: SinonStub;
  let originalGame: Game;
  let originalMemory: Memory;
  let originalRoomPosition: typeof RoomPosition;
  const task = {} as SpawnTask;
  const thorium = {
    id: "thorium",
    mineralType: "Th",
    mineralAmount: 1000,
    pos: { x: 10, y: 10, roomName: "W1N1" }
  };

  beforeEach(() => {
    originalGame = global.Game;
    originalMemory = Object.getOwnPropertyDescriptor(global, "Memory")?.value;
    originalRoomPosition = Object.getOwnPropertyDescriptor(global, "RoomPosition")?.value;
    find = sinon.stub().returns([thorium]);
    room = {
      name: "W1N1",
      controller: { level: 6 } as StructureController,
      find: find as Room["find"]
    } as Room;
    Object.assign(global, {
      Game: { rooms: { W1N1: room }, flags: {}, creeps: {} },
      Memory: { Keys: {} },
      FIND_MINERALS: 116,
      RoomPosition: class {
        constructor(public x: number, public y: number, public roomName: string) {}
      }
    });
    overseer = new Overseer();
    sinon.stub(BaseArea.prototype, "getCreepsAssignedToThisArea").returns([]);
    sinon.stub(GetRoomObjects, "getRoomSpawns").returns([]);
    sinon.stub(GetRoomObjects, "getRoomSources").returns([]);
    sinon.stub(GetRoomObjects, "getWithinRangeContainer").returns(null);
    sinon.stub(GetRoomObjects, "getWithinRangeConstructionSite").returns(null);
    Object.assign(global, { STRUCTURE_CONTAINER: "container" });
    season10Handle = sinon.stub(Season10ScoutCollectorArea.prototype, "handleThisArea");
    season10Spawn = sinon.stub(Season10ScoutCollectorArea.prototype, "handleSpawnTasks").returns([task]);
    season11Handle = sinon.stub(Season11ThoriumArea.prototype, "handleThisArea");
    season11Spawn = sinon.stub(Season11ThoriumArea.prototype, "handleSpawnTasks").returns([task]);
  });

  afterEach(() => {
    sinon.restore();
    Object.assign(global, { Game: originalGame, Memory: originalMemory, RoomPosition: originalRoomPosition });
  });

  for (const value of [undefined, false, null, 0, 1, "true", {}, []]) {
    it(`disables Season 10 for ${JSON.stringify(value)}, even with other flags enabled`, () => {
      Memory.Keys = { IsSeason: true, IsSeason10: value, IsSeason11: true };

      assert.isEmpty(overseer["handleSeasonArea"](room, true));

      sinon.assert.notCalled(season10Handle);
      sinon.assert.notCalled(season10Spawn);
      sinon.assert.notCalled(find);
      assert.isUndefined(Memory.seasonExploredRooms);
    });

    it(`disables Season 11 for ${JSON.stringify(value)}, even with other flags enabled`, () => {
      Memory.Keys = { IsSeason: true, IsSeason10: true, IsSeason11: value };

      const result = overseer["handleHarvestArea"](room, true);

      assert.isEmpty(result.thoriumTasks);
      assert.strictEqual(result.thoriumExisting, 0);
      sinon.assert.notCalled(season11Handle);
      sinon.assert.notCalled(season11Spawn);
      sinon.assert.notCalled(GetRoomObjects.getWithinRangeContainer as SinonStub);
    });
  }

  it("disables both seasons when Memory.Keys is missing", () => {
    delete Memory.Keys;

    assert.isEmpty(overseer["handleSeasonArea"](room, true));
    assert.isEmpty(overseer["handleHarvestArea"](room, true).thoriumTasks);
    sinon.assert.notCalled(season10Handle);
    sinon.assert.notCalled(season11Handle);
  });

  for (const doSpawnTasks of [false, true]) {
    it(`runs Season 10 with its own flag enabled and spawning ${doSpawnTasks}`, () => {
      Memory.Keys = { IsSeason10: true, IsSeason11: false, IsSeason: false };
      find.returns([]);

      const result = overseer["handleSeasonArea"](room, doSpawnTasks);

      assert.deepEqual(result, doSpawnTasks ? [task] : []);
      sinon.assert.calledOnce(season10Handle);
      assert.strictEqual(season10Spawn.callCount, doSpawnTasks ? 1 : 0);
    });

    it(`runs Season 11 with its own flag enabled and spawning ${doSpawnTasks}`, () => {
      Memory.Keys = { IsSeason11: true, IsSeason10: false, IsSeason: false };

      const result = overseer["handleHarvestArea"](room, doSpawnTasks);

      assert.deepEqual(result.thoriumTasks, doSpawnTasks ? [task] : []);
      assert.deepEqual(result.tasks, result.thoriumTasks);
      sinon.assert.calledOnce(season11Handle);
      assert.strictEqual(season11Spawn.callCount, doSpawnTasks ? 1 : 0);
    });
  }

  it("continues ordinary mineral harvesting while both seasons are disabled", () => {
    find.returns([thorium, { ...thorium, id: "mineral", mineralType: "H" }]);
    const mineralHandle = sinon.stub(MineralArea.prototype, "handleThisArea");
    const mineralSpawn = sinon.stub(MineralArea.prototype, "handleSpawnTasks").returns([task]);

    const result = overseer["handleHarvestArea"](room, true);

    assert.deepEqual(result.mineralTasks, [task]);
    assert.deepEqual(result.tasks, [task]);
    assert.isEmpty(result.thoriumTasks);
    sinon.assert.calledOnce(mineralHandle);
    sinon.assert.calledOnce(mineralSpawn);
    sinon.assert.notCalled(season11Handle);
  });
});
