import { assert } from "chai";
import { SinonStub } from "sinon";
import { GetRoomObjects } from "../../src/Helpers/GetRoomObjects";
import { Helper } from "../../src/Helpers/Helper";
import SourceArea from "../../src/Areas/BaseRoom/SourceArea";
import HarvestArea from "../../src/Areas/BaseRoom/HarvestArea";

const sinon: typeof import("sinon") = require("sinon");

describe("source construction positions", () => {
  function position(x: number, y: number): RoomPosition {
    return ({
      x,
      y,
      roomName: "W1N1",
      isEqualTo: (other: RoomPosition) => other.x === x && other.y === y,
      lookFor: () => []
    } as unknown) as RoomPosition;
  }

  const containerPosition = position(10, 10);
  const south = position(10, 11);
  const northwest = position(9, 9);
  const north = position(10, 9);
  const source = { id: "source", pos: position(11, 11) } as Source;
  const room = { name: "W1N1", controller: { level: 3 } } as Room;
  let saveLinkPosition: SinonStub;

  before(() => {
    Object.assign(global, {
      STRUCTURE_LINK: "link",
      STRUCTURE_ROAD: "road",
      STRUCTURE_RAMPART: "rampart",
      LOOK_CONSTRUCTION_SITES: "constructionSite"
    });
  });

  beforeEach(() => {
    sinon.stub(GetRoomObjects, "getWithinRangeLink").returns(null);
    sinon.stub(GetRoomObjects, "getWithinRangeConstructionSite").returns(null);
    sinon.stub(GetRoomObjects, "getSourceLinkPosition").returns(null);
    saveLinkPosition = sinon.stub(GetRoomObjects, "setSourceLinkPosition");
    sinon.stub(GetRoomObjects, "getRoomSpawns").returns([{ pos: position(10, 30) } as StructureSpawn]);
    sinon.stub(GetRoomObjects, "getXStepTowardsSpawn").returns(northwest);
    sinon.stub(Helper, "getWalkableAdjacentPositions").returns([northwest, north, south, source.pos]);
    sinon.stub(Helper, "getFreeAdjacentPositions").returns([northwest, north, south, source.pos]);
  });

  afterEach(() => sinon.restore());

  it("reserves south-facing access and a separate persistent link at RCL 3", () => {
    const result = GetRoomObjects.planSourceConstructionPositions(room, source, containerPosition);

    assert.strictEqual(result.accessPosition, south);
    assert.strictEqual(result.linkPosition, northwest);
    sinon.assert.calledWith(saveLinkPosition, room, source.id, northwest);
  });

  it("keeps the saved link tile as free positions change", () => {
    (GetRoomObjects.getSourceLinkPosition as SinonStub).returns(north);
    (Helper.getFreeAdjacentPositions as SinonStub).returns([northwest, south]);

    const result = GetRoomObjects.planSourceConstructionPositions(room, source, containerPosition);

    assert.strictEqual(result.linkPosition, north);
    assert.strictEqual(result.accessPosition, south);
  });

  it("preserves a link construction site instead of choosing another tile", () => {
    (GetRoomObjects.getWithinRangeConstructionSite as SinonStub).returns({ pos: north });

    const result = GetRoomObjects.planSourceConstructionPositions(room, source, containerPosition);

    assert.strictEqual(result.linkPosition, north);
    assert.strictEqual(result.accessPosition, south);
    sinon.assert.calledWith(saveLinkPosition, room, source.id, north);
  });

  it("uses the path exit when the directly spawn-facing tile is blocked", () => {
    (Helper.getWalkableAdjacentPositions as SinonStub).returns([northwest, north]);

    const result = GetRoomObjects.planSourceConstructionPositions(room, source, containerPosition);

    assert.strictEqual(result.accessPosition, northwest);
    assert.strictEqual(result.linkPosition, north);
  });

  it("does not reserve the source itself for a link when no space remains", () => {
    (Helper.getFreeAdjacentPositions as SinonStub).returns([south, source.pos]);

    const result = GetRoomObjects.planSourceConstructionPositions(room, source, containerPosition);

    assert.strictEqual(result.accessPosition, south);
    assert.isNull(result.linkPosition);
    sinon.assert.notCalled(saveLinkPosition);
  });

  for (const containerState of ["built", "constructionSite", "planned"]) {
    it(`saves linkPos before RCL 5 with a ${containerState} container`, () => {
      sinon.stub(HarvestArea.prototype as any, "handleSetup");
      const area = Object.create(SourceArea.prototype);
      Object.assign(area, {
        room,
        source,
        controllerLevel: 3,
        containerNextToHarvestArea: containerState === "built" ? { pos: containerPosition } : null,
        containerConstructionSiteNextToHarvestArea:
          containerState === "constructionSite" ? { pos: containerPosition } : null
      });
      sinon.stub(GetRoomObjects, "getSourceContainerPosition").returns(containerPosition);
      const createSite = sinon.stub();
      area.room = { ...room, createConstructionSite: createSite };

      area.handleSetup();

      sinon.assert.calledWith(saveLinkPosition, area.room, source.id, northwest);
      sinon.assert.notCalled(createSite);
    });
  }
});

describe("source harvester capacity", () => {
  let area: any;
  let createHarvester: SinonStub;
  let walkablePositions: SinonStub;

  beforeEach(() => {
    Object.assign(global, { WORK: "work" });
    area = Object.create(SourceArea.prototype);
    Object.assign(area, {
      source: { pos: { x: 10, y: 10, roomName: "W1N1" } },
      room: { energyCapacityAvailable: 1000 },
      maxWorkerCount: 3,
      creeps: []
    });
    walkablePositions = sinon.stub(Helper, "getWalkableAdjacentPositions").returns([{} as RoomPosition]);
    createHarvester = sinon.stub(area, "createCreepForThisArea").returns({});
  });

  afterEach(() => sinon.restore());

  function harvester(ticksToLive = 1000, workParts = 1) {
    return { ticksToLive, body: ["work", "move"], creep: { getActiveBodyparts: () => workParts } };
  }

  it("does not add a healthy weak-creep replacement when all cells are occupied", () => {
    area.creeps = [harvester()];

    assert.isEmpty(area.handleSpawnTasks());
    sinon.assert.notCalled(createHarvester);
  });

  it("allows one replacement for a dying harvester above the cell limit", () => {
    area.creeps = [harvester(50)];

    assert.lengthOf(area.handleSpawnTasks(), 1);
    sinon.assert.calledOnce(createHarvester);
  });

  it("does not spawn another replacement after the dying harvester has one", () => {
    area.creeps = [harvester(50), harvester()];

    assert.isEmpty(area.handleSpawnTasks());
    sinon.assert.notCalled(createHarvester);
  });

  it("allows normal spawning below the cell limit", () => {
    walkablePositions.returns([{} as RoomPosition, {} as RoomPosition]);
    area.creeps = [harvester()];

    assert.lengthOf(area.handleSpawnTasks(), 1);
  });

  it("does not spawn when there are no walkable cells", () => {
    walkablePositions.returns([]);

    assert.isEmpty(area.handleSpawnTasks());
    sinon.assert.notCalled(createHarvester);
  });

  it("caps the worker target even when existing harvesters provide full harvest power", () => {
    area.creeps = [harvester(1000, 3), harvester(1000, 3)];

    assert.strictEqual(area.calculateMaxWorkerCount(), 1);
  });
});
