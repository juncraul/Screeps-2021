import { assert } from "chai";
import { CreepBase } from "../../src/CreepBase";
import RemoteArea from "../../src/Areas/RemoteArea/RemoteArea";
import { RemoteRoomMode } from "../../src/Helpers/GetRoomObjects";
import CreepTask, { Activity } from "../../src/Tasks/CreepTask";
import { CreepType } from "../../src/Tasks/SpawnTask";

const sinon: typeof import("sinon") = require("sinon");

describe("remote claimer task interruption", () => {
  let area: RemoteArea;
  let creep: CreepBase;
  const controllerPosition = { x: 20, y: 20, roomName: "W1N1" } as RoomPosition;

  beforeEach(() => {
    creep = Object.create(CreepBase.prototype);
    Object.assign(creep, {
      creepType: CreepType.Claimer,
      pos: controllerPosition,
      creep: { memory: {} },
      task: new CreepTask(Activity.Reserve, controllerPosition),
      isFree: () => false
    });
    area = Object.create(RemoteArea.prototype);
    Object.assign(area, {
      remoteMode: RemoteRoomMode.Claim,
      roomName: "W1N1",
      controller: { pos: controllerPosition, my: false },
      creeps: [creep],
      updateContainers: sinon.stub(),
      setup: sinon.stub(),
      handleInvaderDefenseFlag: sinon.stub(),
      drawLegend: sinon.stub(),
      drawMapLegend: sinon.stub(),
      suicideCreepDueToBrokenParts: sinon.stub()
    });
  });

  for (const activity of [Activity.Reserve, Activity.AttackController]) {
    it(`replaces busy controller task ${activity} with Claim when the mode changes`, () => {
      creep.task = new CreepTask(activity, controllerPosition);
      area.remoteMode = RemoteRoomMode.Reserve;
      area.handleThisArea();
      assert.strictEqual(creep.task.activity, activity);

      area.remoteMode = RemoteRoomMode.Claim;
      area.handleThisArea();

      assert.strictEqual(creep.task.activity, Activity.Claim);
      assert.strictEqual(creep.task.targetPlace, controllerPosition);
      assert.strictEqual(creep.creep.memory.task, creep.task);
    });
  }

  for (const activity of [Activity.MoveDifferentRoom, Activity.Claim]) {
    it(`preserves existing task ${activity}`, () => {
      const task = new CreepTask(activity, controllerPosition);
      creep.task = task;

      area.handleThisArea();

      assert.strictEqual(creep.task, task);
    });
  }

  it("does not interrupt other creep roles", () => {
    creep.creepType = CreepType.Harvester;
    const task = creep.task;

    area.handleThisArea();

    assert.strictEqual(creep.task, task);
  });

  it("does not interrupt a claimer outside the remote room", () => {
    creep.pos = { roomName: "W2N1" } as RoomPosition;
    const task = creep.task;

    area.handleThisArea();

    assert.strictEqual(creep.task, task);
  });

  it("does not interrupt without controller visibility", () => {
    area.controller = null;
    const task = creep.task;

    area.handleThisArea();

    assert.strictEqual(creep.task, task);
  });

  it("does not interrupt once the controller is owned", () => {
    area.controller!.my = true;
    const task = creep.task;

    area.handleThisArea();

    assert.strictEqual(creep.task, task);
  });
});
