import { assert } from "chai";
import { SinonStub } from "sinon";
import { BaseLayout, BasePlanner } from "../../src/BaseBuilder/BaseLayout";
import { BaseBuilder, BaseBuildData } from "../../src/BaseBuilder/BaseBuilder";
import { layout5E, layoutLabs } from "../../src/BaseBuilder/Layout";
import { GetRoomObjects } from "../../src/Helpers/GetRoomObjects";

const sinon: typeof import("sinon") = require("sinon");

describe("automatic additional extension plans", () => {
  const keys = [
    "Game",
    "RoomPosition",
    "FIND_MY_STRUCTURES",
    "FIND_MY_CONSTRUCTION_SITES",
    "STRUCTURE_EXTENSION",
    "CONTROLLER_STRUCTURES",
    "LOOK_STRUCTURES",
    "LOOK_CONSTRUCTION_SITES"
  ];
  let originals: (PropertyDescriptor | undefined)[];
  let room: Room;
  let data: BaseBuildData;
  let createFlag: SinonStub;
  let originalPlanner: BasePlanner | undefined;
  let originalAnchor: { x: number; y: number };
  let built: { pos: { x: number; y: number } }[];
  let sites: { pos: { x: number; y: number } }[];

  beforeEach(() => {
    originalPlanner = layout5E[0];
    originalAnchor = layout5E.data.anchor;
    const config = require("../../src/BaseBuilder/Layouts/Layout5E.json");
    layout5E.data.anchor = config.anchor;
    layout5E[0] = {
      controllerLevel: 0,
      buildings: {
        extension: { pos: config.levels["0"].buildings.extension },
        road: { pos: config.levels["0"].buildings.road }
      }
    };
    originals = keys.map(key => Object.getOwnPropertyDescriptor(global, key));
    Object.assign(global, {
      Game: { flags: {}, rooms: {} },
      RoomPosition: class {
        constructor(public x: number, public y: number, public roomName: string) {}
      },
      FIND_MY_STRUCTURES: 108,
      FIND_MY_CONSTRUCTION_SITES: 114,
      STRUCTURE_EXTENSION: "extension",
      CONTROLLER_STRUCTURES: { extension: { 2: 5, 3: 10, 4: 20 } },
      LOOK_STRUCTURES: "structure",
      LOOK_CONSTRUCTION_SITES: "constructionSite"
    });
    built = [];
    sites = [];
    createFlag = sinon.stub();
    room = Object.create(null);
    Object.assign(room, {
      name: "W1N1",
      controller: { level: 3 },
      createFlag,
      find: (kind: FindConstant) => (kind === FIND_MY_STRUCTURES ? built : sites),
      lookForAt: () => []
    });
    data = { plans: [{ flagName: "Base-Autoplaced", x: 10, y: 10, secondaryColor: COLOR_YELLOW }], ramparts: [] };
    sinon.stub(BaseBuilder, "getBaseBuildData").returns(data);
    sinon.stub(GetRoomObjects, "getRoomSpawns").returns([{ pos: { x: 25, y: 25 }, room } as StructureSpawn]);
    // Isolate the supplemental-layout capacity from the unrelated main base layout.
    const getLayout = sinon.stub(BaseBuilder, "getBaseLayout" as keyof typeof BaseBuilder);
    getLayout.callsFake((_color: ColorConstant, name: string) =>
      /^Base-5E-Autoplaced(?:-\d+)?$/.test(name) ? layout5E : null
    );
  });

  afterEach(() => {
    if (originalPlanner) layout5E[0] = originalPlanner;
    else delete layout5E[0];
    layout5E.data.anchor = originalAnchor;
    sinon.restore();
    keys.forEach((key, index) => {
      const descriptor = originals[index];
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else Reflect.deleteProperty(global, key);
    });
  });

  function savePlan(name = "Base-5E-Autoplaced", x = 20): void {
    data.plans.push({ flagName: name, x, y: 20, secondaryColor: COLOR_PURPLE });
  }

  it("rejects removed grey and brown layout selections", () => {
    sinon.restore();
    assert.isNull(BaseBuilder["getBaseLayout"](COLOR_GREY));
    assert.isNull(BaseBuilder["getBaseLayout"](COLOR_BROWN));
  });

  it("selects Labs with secondary white and loads its controller-level plans", () => {
    sinon.restore();
    assert.strictEqual(BaseBuilder["getBaseLayout"](COLOR_WHITE), layoutLabs);
    const config = require("../../src/BaseBuilder/Layouts/LayoutLabs.json");
    assert.deepEqual(layoutLabs.data.anchor, config.anchor);
    assert.deepEqual(layoutLabs.data.size, config.size);
    for (const [level, labCount] of [[6, 3], [7, 6], [8, 10]]) {
      assert.lengthOf(layoutLabs[level]!.buildings.lab.pos, labCount);
      assert.deepEqual(layoutLabs[level]!.buildings.lab.pos, config.levels[level].buildings.lab);
      assert.deepEqual(layoutLabs[level]!.buildings.road.pos, config.levels[level].buildings.road);
    }
  });

  for (const [name, color] of [
    ["Bunker", COLOR_GREEN],
    ["FourWays", COLOR_ORANGE],
    ["Utility", COLOR_CYAN],
    ["FixedExtensions", COLOR_YELLOW],
    ["Labs", COLOR_WHITE],
    ["5E-Autoplaced", COLOR_PURPLE]
  ] as [string, ColorConstant][]) {
    it(`renders ${name} every tick at its highest level without unthrottling construction`, () => {
      const layout: BaseLayout = name === "5E-Autoplaced" ? layout5E : {
        data: { anchor: { x: 0, y: 0 } },
        3: { controllerLevel: 3, buildings: {} },
        8: { controllerLevel: 8, buildings: {} }
      };
      (BaseBuilder["getBaseLayout"] as SinonStub).returns(layout);
      data.plans = [];
      const flag = {
        name: `Base-${name}`, color: COLOR_WHITE, secondaryColor: color, room,
        pos: new RoomPosition(20, 20, room.name)
      } as Flag;
      Game.flags[flag.name] = flag;
      Game.rooms[room.name] = room;
      sinon.stub(BaseBuilder, "writeLegend" as keyof typeof BaseBuilder);
      sinon.stub(BaseBuilder, "autoPlaceConstructionFlag").returns(true);
      sinon.stub(GetRoomObjects, "getRoomController").returns(room.controller!);
      const claimedRooms = sinon.stub(GetRoomObjects, "getAllClaimedRooms").returns([]);
      const save = sinon.stub(BaseBuilder, "setBaseBuildData" as keyof typeof BaseBuilder);
      const draw = sinon.stub(BaseBuilder, "buildBase" as keyof typeof BaseBuilder);
      const roads = sinon.stub(BaseBuilder, "createContainerRoadConnections" as keyof typeof BaseBuilder);
      const walls = sinon.stub(BaseBuilder, "createWall" as keyof typeof BaseBuilder);
      const expectedLevel = layout === layout5E ? 0 : 8;

      for (const tick of [101, 102]) {
        Game.time = tick;
        BaseBuilder.logicCreateConstructionSites();
        assert.strictEqual(draw.callCount, tick - 100);
        sinon.assert.calledWithExactly(draw, flag.pos, layout, expectedLevel, true);
        sinon.assert.calledWithExactly(roads, room, flag.pos, layout, expectedLevel, true);
        sinon.assert.calledWithExactly(walls, room, true);
      }
      sinon.assert.notCalled(save);
      sinon.assert.notCalled(claimedRooms);

      Game.time = 120;
      BaseBuilder.logicCreateConstructionSites();
      sinon.assert.calledThrice(draw);
      sinon.assert.calledThrice(roads);
      sinon.assert.calledThrice(walls);
      sinon.assert.calledOnce(claimedRooms);
    });
  }

  it("creates a numbered preview after the first saved plan when capacity remains", () => {
    savePlan();
    BaseBuilder.automaticFlagPlacement(room);
    sinon.assert.calledWith(createFlag, sinon.match.any, "Base-5E-Autoplaced-2", COLOR_WHITE, COLOR_PURPLE);
  });

  it("stops after enough saved plans even before construction sites exist", () => {
    savePlan();
    savePlan("Base-5E-Autoplaced-2", 30);
    BaseBuilder.automaticFlagPlacement(room);
    sinon.assert.notCalled(createFlag);
  });

  it("does not double-count built and planned extension tiles", () => {
    savePlan();
    built = [{ pos: { x: 20, y: 20 } }];
    sites = [{ pos: { x: 20, y: 19 } }];
    BaseBuilder.automaticFlagPlacement(room);
    sinon.assert.calledOnce(createFlag);
  });

  it("counts extensions outside saved plans and stops at the controller limit", () => {
    savePlan();
    built = Array.from({ length: 5 }, (_, x) => ({ pos: { x, y: 1 } }));
    BaseBuilder.automaticFlagPlacement(room);
    sinon.assert.notCalled(createFlag);
  });

  it("resumes after a controller upgrade", () => {
    savePlan();
    savePlan("Base-5E-Autoplaced-2", 30);
    room.controller!.level = 4;
    BaseBuilder.automaticFlagPlacement(room);
    sinon.assert.calledWith(createFlag, sinon.match.any, "Base-5E-Autoplaced-3", COLOR_WHITE, COLOR_PURPLE);
  });

  it("keeps an existing numbered preview instead of creating duplicates", () => {
    const flag: Flag = Object.create(null);
    Object.assign(flag, {
      name: "Base-5E-Autoplaced-2",
      pos: { roomName: room.name },
      color: COLOR_WHITE,
      secondaryColor: COLOR_PURPLE,
      setColor: sinon.stub()
    });
    Game.flags[flag.name] = flag;
    savePlan();
    BaseBuilder.automaticFlagPlacement(room);
    sinon.assert.notCalled(createFlag);
  });

  it("does not treat a numbered supplemental plan as the main base plan", () => {
    data.plans = [];
    savePlan("Base-5E-Autoplaced-2");
    BaseBuilder.automaticFlagPlacement(room);
    sinon.assert.calledWith(createFlag, sinon.match.any, "Base-Autoplaced", COLOR_WHITE, COLOR_YELLOW);
  });

  it("recognizes numbered names and rejects overlap with saved footprints", () => {
    assert.isTrue(BaseBuilder["isLayout5EFlag"]("Base-5E-Autoplaced-12"));
    savePlan();
    const reserved = BaseBuilder["getReservedBuildPositions"](room);
    assert.isAbove(reserved.size, 5);
    assert.isFalse(BaseBuilder["canPlaceLayoutAt"](room, { x: 20, y: 20 }, layout5E, layout5E[0]!, reserved));
    assert.isTrue(BaseBuilder["canPlaceLayoutAt"](room, { x: 35, y: 35 }, layout5E, layout5E[0]!, reserved));
  });

  it("resolves numbered plans to Layout5E and preserves previously saved anchors", () => {
    (BaseBuilder["getBaseLayout"] as SinonStub).restore();
    assert.strictEqual(BaseBuilder["getBaseLayout"](COLOR_PURPLE, "Base-5E-Autoplaced-2"), layout5E);
    const first = { flagName: "Base-5E-Autoplaced", x: 20, y: 20, secondaryColor: COLOR_PURPLE };
    const second = { flagName: "Base-5E-Autoplaced-2", x: 30, y: 30, secondaryColor: COLOR_PURPLE };
    const plans = BaseBuilder["upsertBuildPlan"]([first], second);
    assert.deepEqual(plans, [first, second]);
  });
});
