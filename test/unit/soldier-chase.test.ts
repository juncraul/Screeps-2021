import { assert } from "chai";
import { CreepBase } from "../../src/CreepBase";
import { CreepType } from "../../src/Tasks/SpawnTask";
import SoldierArea from "../../src/Areas/Military/SoldierArea";
import QuadNavigation from "../../src/Areas/Military/Navigation/QuadNavigation";
import CreepTask, { Activity } from "../../src/Tasks/CreepTask";
import { getSoldierAreaMemory, selectSoldierChaseTarget } from "../../src/Areas/Military/SoldierAreaMemory";

const sinon: typeof import("sinon") = require("sinon");

describe("soldier chase progress", () => {
  const roomName = "W1N1";
  const flagName = "Attack-X-4";
  const keys = [
    "Game",
    "Memory",
    "ATTACK",
    "RANGED_ATTACK",
    "FIND_HOSTILE_CREEPS",
    "FIND_HOSTILE_STRUCTURES",
    "STRUCTURE_TOWER",
    "RESOURCE_ENERGY",
    "STRUCTURE_CONTROLLER"
  ];
  let originals: (PropertyDescriptor | undefined)[];
  let attacker: CreepBase;
  let first: Creep;
  let second: Creep;
  let candidates: Creep[];

  function position(x: number): RoomPosition {
    return {
      x,
      y: 25,
      roomName,
      getRangeTo: (other: RoomPosition) => Math.abs(x - other.x),
      inRangeTo: (other: RoomPosition, range: number) => Math.abs(x - other.x) <= range,
      findClosestByPath: (targets: Creep[]) => targets[0] ?? null
    } as RoomPosition;
  }

  function target(id: string, x: number): Creep {
    const creep: Creep = Object.create(null);
    Object.assign(creep, {
      id,
      pos: position(x),
      owner: { username: "enemy" },
      body: [{ type: ATTACK, hits: 100 }],
      getActiveBodyparts: () => 1
    });
    return creep;
  }

  function select(key = "solo", pursuers = [attacker]): Creep | null {
    return selectSoldierChaseTarget(flagName, key, pursuers, candidates, attacker.pos);
  }

  function waitUntil(tick: number): void {
    while (Game.time < tick) {
      Game.time++;
      select();
    }
  }

  beforeEach(() => {
    originals = keys.map(key => Object.getOwnPropertyDescriptor(global, key));
    Object.assign(global, {
      Game: { time: 100, flags: {}, rooms: {} },
      Memory: {},
      ATTACK: "attack",
      RANGED_ATTACK: "ranged_attack",
      FIND_HOSTILE_CREEPS: 103,
      FIND_HOSTILE_STRUCTURES: 109,
      STRUCTURE_TOWER: "tower",
      RESOURCE_ENERGY: "energy",
      STRUCTURE_CONTROLLER: "controller"
    });
    attacker = Object.create(CreepBase.prototype);
    Object.assign(attacker, {
      name: "soldier",
      pos: position(10),
      creepType: CreepType.Melee,
      creep: { getActiveBodyparts: () => 0 }
    });
    first = target("first", 20);
    second = target("second", 22);
    candidates = [first, second];
  });

  afterEach(() => {
    sinon.restore();
    keys.forEach((key, index) => {
      const descriptor = originals[index];
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else Reflect.deleteProperty(global, key);
    });
  });

  it("switches at five elapsed ticks, not four, and retries after exactly 25 ticks", () => {
    assert.strictEqual(select(), first);
    waitUntil(104);
    assert.strictEqual(select(), first);
    Game.time = 105;
    assert.strictEqual(select(), second);
    assert.strictEqual(getSoldierAreaMemory(flagName).ignoredChaseTargets!.first, 130);
    Game.time = 129;
    assert.strictEqual(select(), second);
    Game.time = 130;
    assert.strictEqual(select(), first);
  });

  it("resets the timer when the gap closes", () => {
    select();
    waitUntil(104);
    attacker.pos = position(11);
    assert.strictEqual(select(), first);
    waitUntil(108);
    assert.strictEqual(select(), first);
    Game.time = 109;
    assert.strictEqual(select(), second);
  });

  it("gives up when the target is moving further away", () => {
    select();
    first.pos = position(24);
    waitUntil(105);
    assert.strictEqual(select(), second);
  });

  it("does not count repeated selection in the same tick as chase time", () => {
    for (let i = 0; i < 20; i++) assert.strictEqual(select(), first);
    assert.isUndefined(getSoldierAreaMemory(flagName).ignoredChaseTargets!.first);
  });

  for (const type of [CreepType.Melee, CreepType.Ranged]) {
    it(`keeps role ${type} engaged when already within attack range`, () => {
      attacker.creepType = type;
      attacker.pos = position(type === CreepType.Ranged ? 17 : 19);
      select();
      waitUntil(120);
      assert.strictEqual(select(), first);
    });
  }

  it("starts a fresh timer after an interruption or target change", () => {
    select();
    Game.time = 110;
    assert.strictEqual(select(), first);
    candidates = [second];
    Game.time = 111;
    assert.strictEqual(select(), second);
    assert.strictEqual(getSoldierAreaMemory(flagName).chases!.solo.lastProgressTick, 111);
  });

  it("returns no target rather than immediately reacquiring the only fleeing enemy", () => {
    candidates = [first];
    select();
    waitUntil(105);
    assert.isNull(select());
    assert.isUndefined(getSoldierAreaMemory(flagName).chases!.solo);
  });

  it("never cancels a stalled chase when a pursuer has ranged attack parts", () => {
    attacker.creep.getActiveBodyparts = (part: BodyPartConstant) => (part === RANGED_ATTACK ? 1 : 0);
    select();
    waitUntil(105);
    assert.strictEqual(select(), first);
    assert.isUndefined(getSoldierAreaMemory(flagName).ignoredChaseTargets!.first);
  });

  it("shares ignored targets across squad members and persists across calls", () => {
    select();
    waitUntil(105);
    assert.strictEqual(select("another-soldier"), second);
    assert.strictEqual(selectSoldierChaseTarget("OtherFlag", "solo", [attacker], candidates, attacker.pos), first);
  });

  it("does not let a nearby healer count as closing the attacker's gap", () => {
    const healer: CreepBase = Object.create(CreepBase.prototype);
    Object.assign(healer, { pos: position(20), creepType: CreepType.Healer });
    for (let tick = 100; tick <= 105; tick++) {
      Game.time = tick;
      select("quad", [attacker, healer]);
    }
    assert.strictEqual(select("quad", [attacker, healer]), second);
  });

  it("reselects targets through both individual targeting modes", () => {
    Game.rooms[roomName] = {
      find: ((kind: FindConstant) => (kind === FIND_HOSTILE_CREEPS ? candidates : [])) as Room["find"],
      visual: { circle: sinon.stub() as RoomVisual["circle"] } as RoomVisual
    } as Room;
    const area: SoldierArea = Object.create(SoldierArea.prototype);
    Object.assign(area, { flag: { name: flagName } });
    for (let tick = 100; tick <= 105; tick++) {
      Game.time = tick;
      const result = area["attackCreeps"](attacker.pos, attacker);
      assert.strictEqual(result, tick < 105 ? first : second);
    }
    assert.strictEqual(area["attackEverything"](attacker.pos, attacker), second);
  });

  it("quad navigation selects another threat after a stalled chase", () => {
    Game.rooms[roomName] = {
      find: ((kind: FindConstant) => (kind === FIND_HOSTILE_CREEPS ? candidates : [])) as Room["find"]
    } as Room;
    for (let tick = 100; tick <= 105; tick++) {
      Game.time = tick;
      const threat = QuadNavigation["getPrimaryThreat"](roomName, attacker.pos, [attacker], flagName, true);
      assert.strictEqual(threat!.pos, tick < 105 ? first.pos : second.pos);
    }
    Game.time = 110;
    const defensiveThreat = QuadNavigation["getPrimaryThreat"](roomName, attacker.pos, [attacker], flagName, false);
    assert.strictEqual(defensiveThreat!.pos, first.pos);
    assert.strictEqual(getSoldierAreaMemory(flagName).chases!.quad.lastTick, 105);
  });

  for (const weapon of ["attack", "ranged_attack"] as BodyPartConstant[]) {
    for (const trackChase of [true, false]) {
      it(`quad navigation keeps targeting destroyed ${weapon} parts with chase tracking ${trackChase}`, () => {
        first.body = [
          { type: weapon, hits: 0 },
          { type: "heal", hits: 100 },
          { type: "move", hits: 100 }
        ];
        first.getActiveBodyparts = part => first.body.filter(body => body.type === part && body.hits > 0).length;
        candidates = [first];
        Game.rooms[roomName] = {
          find: ((kind: FindConstant) => (kind === FIND_HOSTILE_CREEPS ? candidates : [])) as Room["find"]
        } as Room;

        assert.strictEqual(first.getActiveBodyparts(weapon), 0);
        const threat = QuadNavigation["getPrimaryThreat"](roomName, attacker.pos, [attacker], flagName, trackChase);
        assert.isNotNull(threat);
        assert.strictEqual(threat!.pos, first.pos);
      });
    }
  }

  for (const color of [COLOR_GREY, COLOR_RED]) {
    for (const structureType of [null, "spawn", "tower"] as const) {
      it(`quad pursuit respects secondary color ${color} with hostile structure ${structureType}`, () => {
        const destination = position(30);
        const structure = {
          pos: position(25),
          structureType,
          store: { getUsedCapacity: () => 100 }
        };
        Game.rooms[roomName] = {
          find: ((kind: FindConstant) =>
            kind === FIND_HOSTILE_CREEPS ? [first] : structureType ? [structure] : []) as Room["find"]
        } as Room;
        Object.assign(attacker, {
          hits: 100,
          hitsMax: 100,
          creep: { fatigue: 0 },
          say: sinon.stub()
        });
        const quad = [attacker, attacker, attacker, attacker];
        sinon.stub(QuadNavigation, "creepsAreInRangeOfEachOther" as any).returns(true);
        sinon.stub(QuadNavigation, "getQuadAnchor" as any).returns(attacker.pos);
        sinon.stub(QuadNavigation, "getTotalPotentialHealPerTick" as any).returns(0);
        sinon.stub(QuadNavigation, "getPotentialHealOnTarget" as any).returns(0);
        const move = sinon.stub(QuadNavigation, "tryMoveAsFormation" as any).returns(true);

        assert.isTrue(QuadNavigation.tryToKiteTheEnemyAsFormation(quad, destination, flagName, color));

        const expected =
          structureType === "tower" || (color === COLOR_GREY && structureType)
            ? structure.pos
            : color === COLOR_GREY
            ? destination
            : first.pos;
        sinon.assert.calledOnce(move);
        sinon.assert.calledWithExactly(move, quad, expected, flagName, true);
        if (color === COLOR_GREY) {
          assert.isUndefined(getSoldierAreaMemory(flagName).chases?.quad);
          const defensiveThreat = QuadNavigation["getPrimaryThreat"](roomName, attacker.pos, quad, flagName, false);
          assert.strictEqual(defensiveThreat!.pos, structureType === "tower" ? structure.pos : first.pos);
        }
      });
    }
  }

  it("interrupts a busy attack task and retargets even when the area is recreated each tick", () => {
    const flag = {
      name: flagName,
      pos: attacker.pos,
      room: {} as Room,
      secondaryColor: COLOR_BLUE
    } as Flag;
    Game.flags[flagName] = flag;
    Game.rooms[roomName] = {
      find: ((kind: FindConstant) => (kind === FIND_HOSTILE_CREEPS ? candidates : [])) as Room["find"],
      visual: { circle: sinon.stub() as RoomVisual["circle"] } as RoomVisual
    } as Room;
    Object.assign(attacker, {
      memory: { role: "Melee" },
      task: new CreepTask(Activity.Attack, first.pos, null, first.id),
      isFree: () => false,
      addTask: (task: CreepTask) => {
        attacker.task = task;
      }
    });
    const originalFormation = SoldierArea["managedToApplyAFormationMovement"];
    SoldierArea["managedToApplyAFormationMovement"] = () => false;
    try {
      for (let tick = 100; tick <= 105; tick++) {
        Game.time = tick;
        const area: SoldierArea = Object.create(SoldierArea.prototype);
        Object.assign(area, {
          flag: {
            name: flagName,
            targetRoom: roomName,
            position: attacker.pos,
            secondaryColor: COLOR_BLUE,
            squadSize: 1
          },
          creeps: [attacker],
          runHealerPassiveEffect: () => undefined,
          runAttackerPassiveEffect: () => undefined
        });
        area.handleThisArea();
        assert.strictEqual(attacker.task!.targetId, tick < 105 ? first.id : second.id);
      }
    } finally {
      SoldierArea["managedToApplyAFormationMovement"] = originalFormation;
    }
  });
});
