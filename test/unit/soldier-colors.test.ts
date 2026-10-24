import { assert } from "chai";
import SoldierArea from "../../src/Areas/Military/SoldierArea";
import { CreepBase } from "../../src/CreepBase";
import { CreepType } from "../../src/Tasks/SpawnTask";
import { getSoldierCreepNames, setSoldierCreepNames } from "../../src/Areas/Military/SoldierAreaMemory";

const sinon: typeof import("sinon") = require("sinon");

describe("Attack flag primary colors", () => {
  let area: SoldierArea;

  beforeEach(() => {
    area = Object.create(SoldierArea.prototype);
    Object.assign(area, { creeps: [], flag: { primaryColor: COLOR_RED } });
  });

  describe("ranged body segments", () => {
    const keys = ["RANGED_ATTACK", "MOVE", "MAX_CREEP_SIZE"];
    let originals: (PropertyDescriptor | undefined)[];

    beforeEach(() => {
      originals = keys.map(key => Object.getOwnPropertyDescriptor(global, key));
      Object.assign(global, { RANGED_ATTACK: "ranged_attack", MOVE: "move", MAX_CREEP_SIZE: 50 });
    });

    afterEach(() => {
      keys.forEach((key, index) => {
        const descriptor = originals[index];
        if (descriptor) Object.defineProperty(global, key, descriptor);
        else Reflect.deleteProperty(global, key);
      });
    });

    for (const segments of [1, 2, 5, 12, 13, 18, 100]) {
      it(`builds two ranged/move pairs per segment at rank ${segments}, capped at 50 parts`, () => {
        const area: SoldierArea = Object.create(SoldierArea.prototype);
        const body = area["createRangedBody"](segments);
        const pairs = Math.min(segments * 2, 25);
        assert.lengthOf(body, pairs * 2);
        assert.strictEqual(body.filter(part => part === RANGED_ATTACK).length, pairs);
        assert.strictEqual(body.filter(part => part === MOVE).length, pairs);
        assert.isAtMost(body.length, 50);
        for (let index = 0; index < body.length; index += 2) {
          assert.deepEqual(body.slice(index, index + 2), [RANGED_ATTACK, MOVE]);
        }
      });
    }

    it("applies a blue leader's doubled power rank before building the body", () => {
      const area: SoldierArea = Object.create(SoldierArea.prototype);
      Object.assign(area, { flag: { primaryColor: COLOR_BLUE } });
      const body = area["createRangedBody"](area["getCreepPowerRank"](3, CreepType.Ranged));
      assert.lengthOf(body, 24);
      assert.strictEqual(body.filter(part => part === RANGED_ATTACK).length, 12);
    });
  });

  it("uses blue for one ranged leader followed by healers, including spawning and replacement leaders", () => {
    const originalRangedAttack = Object.getOwnPropertyDescriptor(global, "RANGED_ATTACK");
    Object.assign(global, { RANGED_ATTACK: "ranged_attack" });
    try {
      assert.strictEqual(area["getCreepTypeFromColor"](COLOR_BLUE, 0, 4), CreepType.Ranged);
      const leader: CreepBase = Object.create(CreepBase.prototype);
      Object.assign(leader, {
        getNumberOfBodyPart: (part: BodyPartConstant) => part === RANGED_ATTACK ? 1 : 0,
        creep: { ticksToLive: 1000 },
        spawning: false
      });
      area.creeps = [leader];
      for (let slot = 1; slot < 4; slot++) {
        assert.strictEqual(area["getCreepTypeFromColor"](COLOR_BLUE, slot, 4), CreepType.Healer);
      }
      leader.creep.ticksToLive = 250;
      assert.strictEqual(area["getCreepTypeFromColor"](COLOR_BLUE, 3, 4), CreepType.Ranged);
      leader.spawning = true;
      assert.strictEqual(area["getCreepTypeFromColor"](COLOR_BLUE, 3, 4), CreepType.Healer);
      leader.spawning = false;
      leader.getNumberOfBodyPart = () => 0;
      assert.strictEqual(area["getCreepTypeFromColor"](COLOR_BLUE, 3, 4), CreepType.Ranged);
    } finally {
      if (originalRangedAttack) Object.defineProperty(global, "RANGED_ATTACK", originalRangedAttack);
      else Reflect.deleteProperty(global, "RANGED_ATTACK");
    }
  });

  it("uses red for a melee leader followed by healers", () => {
    const leader: CreepBase = Object.create(CreepBase.prototype);
    Object.assign(leader, {
      getNumberOfBodyPart: () => 1,
      creep: { ticksToLive: 1000 }
    });
    const originalAttack = Object.getOwnPropertyDescriptor(global, "ATTACK");
    Object.assign(global, { ATTACK: "attack" });
    try {
      assert.strictEqual(area["getCreepTypeFromColor"](COLOR_RED, 0, 4), CreepType.Melee);
      area.creeps = [leader];
      assert.strictEqual(area["getCreepTypeFromColor"](COLOR_RED, 1, 4), CreepType.Healer);
      leader.creep.ticksToLive = 250;
      assert.strictEqual(area["getCreepTypeFromColor"](COLOR_RED, 3, 4), CreepType.Melee);
      leader.spawning = true;
      assert.strictEqual(area["getCreepTypeFromColor"](COLOR_RED, 3, 4), CreepType.Healer);
    } finally {
      if (originalAttack) Object.defineProperty(global, "ATTACK", originalAttack);
      else Reflect.deleteProperty(global, "ATTACK");
    }
  });

  it("keeps a zero-hit spawning melee assigned and requests a healer for Attack-E28N24-2-3", () => {
    const keys = ["Game", "Memory", "ATTACK", "HEAL", "MOVE", "TOUGH", "BOTTOM_RIGHT", "BOTTOM", "BOTTOM_LEFT"];
    const originals = keys.map(key => Object.getOwnPropertyDescriptor(global, key));
    const flagName = "Attack-E28N24-2-3";
    const room = { name: "E28N24" } as Room;
    Object.assign(global, {
      Memory: {}, ATTACK: "attack", HEAL: "heal", MOVE: "move", TOUGH: "tough",
      BOTTOM_RIGHT: 4, BOTTOM: 5, BOTTOM_LEFT: 6,
      Game: {
        creeps: {
          "Melee-100": {
            name: "Melee-100", spawning: true, hits: 0, hitsMax: 1400, room,
            memory: { role: "Melee", room: room.name },
            body: [{ type: "attack", hits: 0 }, { type: "move", hits: 0 }],
            store: { getUsedCapacity: () => 0 }
          }
        }
      }
    });
    try {
      setSoldierCreepNames(flagName, ["Melee-100"]);
      Object.assign(area, {
        memoryType: "SoldierArea", areaId: flagName,
        flag: {
          name: flagName, primaryColor: COLOR_RED, secondaryColor: COLOR_RED,
          squadSize: 2, powerRank: 3, baseRoomName: room.name
        }
      });
      area.creeps = area.getCreepsAssignedToThisArea();
      assert.lengthOf(area.creeps, 1);
      assert.deepEqual(getSoldierCreepNames(flagName), ["Melee-100"]);
      const tasks = area.handleSpawnTasks(room);
      assert.lengthOf(tasks, 1);
      assert.strictEqual(tasks[0].creepType, CreepType.Healer);
      assert.strictEqual(tasks[0].spawnRoomName, room.name);
      assert.include(tasks[0].bodyPartConstant, HEAL);
      assert.notInclude(tasks[0].bodyPartConstant, ATTACK);
      assert.strictEqual(area["getCreepPowerRank"](3, CreepType.Healer), 3);

      Game.creeps["Melee-100"].spawning = false;
      area.creeps = area.getCreepsAssignedToThisArea();
      assert.lengthOf(area.creeps, 0);
      assert.deepEqual(getSoldierCreepNames(flagName), []);
    } finally {
      keys.forEach((key, index) => {
        const descriptor = originals[index];
        if (descriptor) Object.defineProperty(global, key, descriptor);
        else Reflect.deleteProperty(global, key);
      });
    }
  });

  it("doubles red melee and blue ranged leader ranks but not healers", () => {
    assert.strictEqual(area["getCreepPowerRank"](5, CreepType.Melee), 10);
    assert.strictEqual(area["getCreepPowerRank"](5, CreepType.Healer), 5);
    area.flag.primaryColor = COLOR_BLUE;
    assert.strictEqual(area["getCreepPowerRank"](5, CreepType.Ranged), 10);
    assert.strictEqual(area["getCreepPowerRank"](5, CreepType.Healer), 5);
    assert.strictEqual(area["getCreepPowerRank"](5, CreepType.Melee), 5);
  });

  it("puts the ranged leader ahead of older healers in formation", () => {
    const leader: CreepBase = Object.create(CreepBase.prototype);
    Object.assign(leader, { name: "ranged", creepType: CreepType.Ranged, ticksToLive: 1000, memory: {} });
    const healer: CreepBase = Object.create(CreepBase.prototype);
    Object.assign(healer, { name: "healer", creepType: CreepType.Healer, ticksToLive: 500, memory: {} });
    const ordered = SoldierArea["getOrderedFormationCreeps"]([healer, leader]);
    assert.strictEqual(ordered[0], leader);
    assert.strictEqual(leader.memory.formationOrder, 0);
    assert.strictEqual(healer.memory.formationOrder, 1);
  });

  it("shows the new mapping in the room legend", () => {
    const text = sinon.stub();
    SoldierArea.drawLegend([], { visual: { text: text as RoomVisual["text"] } as RoomVisual } as Room);
    assert.isTrue(text.calledWith("  BLUE -> 1-Ranged rest Healer squad"));
    assert.isTrue(text.calledWith("  RED -> 1-Melee rest Healer squad"));
    assert.isFalse(text.calledWith("  GREEN -> 1-Melee rest Healer squad"));
    assert.isTrue(text.calledWith("  BLUE -> Attack creeps only"));
  });

  it("rejects green primary flags without spawning and logs a warning", () => {
    assert.isNull(area["getCreepTypeFromColor"](COLOR_GREEN, 0, 4));
    area.flag.primaryColor = COLOR_GREEN;
    const log = sinon.stub(console, "log");
    try {
      assert.isNull(area["createCreepForFlag"]());
      sinon.assert.calledWithMatch(log, "Unsupported primary color");
    } finally {
      log.restore();
    }
  });
});
