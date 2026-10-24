import { assert } from "chai";
import SoldierArea from "../../src/Areas/Military/SoldierArea";
import { CreepBase } from "../../src/CreepBase";
import { CreepType } from "../../src/Tasks/SpawnTask";
import { GetRoomObjects } from "../../src/Helpers/GetRoomObjects";

const sinon: typeof import("sinon") = require("sinon");

describe("collection-only combat targeting", () => {
  let area: SoldierArea;
  let targets: Creep[];
  const roomName = "W1N1";
  const keys = [
    "Game",
    "WORK",
    "CLAIM",
    "HEAL",
    "ATTACK",
    "RANGED_ATTACK",
    "FIND_HOSTILE_CREEPS",
    "FIND_HOSTILE_STRUCTURES",
    "STRUCTURE_CONTROLLER"
  ];
  let originals: (PropertyDescriptor | undefined)[];
  let pos: RoomPosition;

  function enemy(parts: BodyPartConstant[], username = "enemy"): Creep {
    return {
      pos,
      owner: { username },
      getActiveBodyparts: (part: BodyPartConstant) => parts.filter(p => p === part).length
    } as Creep;
  }

  beforeEach(() => {
    originals = keys.map(key => Object.getOwnPropertyDescriptor(global, key));
    Object.assign(global, {
      WORK: "work",
      CLAIM: "claim",
      HEAL: "heal",
      ATTACK: "attack",
      RANGED_ATTACK: "ranged_attack",
      FIND_HOSTILE_CREEPS: 103,
      FIND_HOSTILE_STRUCTURES: 109,
      STRUCTURE_CONTROLLER: "controller"
    });
    pos = {
      x: 25,
      y: 25,
      roomName,
      findClosestByPath: (creeps: Creep[]) => creeps[0] ?? null
    } as RoomPosition;
    targets = [];
    Object.assign(global, {
      Game: {
        flags: { reserve: { name: "Reserve-X", color: COLOR_GREY, pos } },
        rooms: {
          [roomName]: {
            controller: { my: true },
            find: (type: FindConstant) => (type === FIND_HOSTILE_CREEPS ? targets : []),
            visual: { circle: () => undefined }
          }
        }
      }
    });
    area = Object.create(SoldierArea.prototype);
    Object.assign(area, { flag: { targetRoom: roomName, secondaryColor: COLOR_BLUE }, creeps: [] });
  });

  afterEach(() => {
    sinon.restore();
    keys.forEach((key, index) => {
      const descriptor = originals[index];
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else Reflect.deleteProperty(global, key);
    });
  });

  for (const method of ["attackCreeps", "attackEverything"] as const) {
    it(`${method} skips workers and claimers but selects carriers`, () => {
      const carrier = enemy(["carry", "move"]);
      targets = [enemy([WORK, "carry"]), enemy([CLAIM]), carrier];
      assert.strictEqual(area[method](pos), carrier);
    });

    it(`${method} still attacks workers in ordinary rooms`, () => {
      Game.flags = {};
      targets = [enemy([WORK])];
      assert.strictEqual(area[method](pos), targets[0]);
    });

    for (const combatPart of ["attack", "ranged_attack", "heal"] as BodyPartConstant[]) {
      it(`${method} allows combat workers with ${combatPart}`, () => {
        targets = [enemy([WORK, CLAIM, combatPart])];
        assert.strictEqual(area[method](pos), targets[0]);
      });
    }

    it(`${method} preserves exempt-player protection`, () => {
      targets = [enemy(["carry"], "nekey975")];
      assert.isNull(area[method](pos));
    });
  }

  for (const type of [CreepType.Melee, CreepType.Ranged]) {
    it(`passive attacks for role ${type} spare workers and target carriers`, () => {
      const carrier = enemy(["carry"]);
      sinon.stub(GetRoomObjects, "getWithinRangeHostileCreeps").returns([enemy([WORK]), enemy([CLAIM]), carrier]);
      const attack = sinon.stub();
      const rangedAttack = sinon.stub();
      const soldier: CreepBase = Object.create(CreepBase.prototype);
      Object.assign(soldier, { creepType: type, pos, creep: { pos, attack, rangedAttack } });
      area.creeps = [soldier];

      area["runAttackerPassiveEffect"]();

      sinon.assert.calledOnce(type === CreepType.Melee ? attack : rangedAttack);
      sinon.assert.calledWithExactly(type === CreepType.Melee ? attack : rangedAttack, carrier);
      sinon.assert.notCalled(type === CreepType.Melee ? rangedAttack : attack);
    });
  }
});
