import { assert } from "chai";
import { CreepBase } from "../../src/CreepBase";

const sinon: typeof import("sinon") = require("sinon");

describe("creep tombstone collection", () => {
  let creep: CreepBase;
  let target: Tombstone;
  let withdraw: ReturnType<typeof sinon.stub>;
  let resources: { [resource: string]: number };

  beforeEach(() => {
    Object.assign(global, {
      RESOURCE_ENERGY: "energy",
      Tombstone: class {},
      Ruin: class {}
    });
    resources = { energy: 1000, H: 50, O: 25 };
    const store = Object.assign({}, resources, {
      getUsedCapacity: (resource: string) => resources[resource] || 0
    });
    target = Object.assign(Object.create(Tombstone.prototype), { store });
    withdraw = sinon.stub();
    creep = Object.create(CreepBase.prototype);
    Object.assign(creep, {
      task: { targetPlace: {} },
      store: { getFreeCapacity: () => 100 },
      getCollectTarget: () => target,
      withdraw
    });
  });

  function collectAll(): void {
    ((creep as unknown) as { activityCollectAll(): void }).activityCollectAll();
  }

  it("withdraws minerals before energy even when energy is the first store key", () => {
    collectAll();

    sinon.assert.calledWithExactly(withdraw, target, "H");
  });

  it("continues collecting remaining minerals before energy", () => {
    resources.H = 0;

    collectAll();

    sinon.assert.calledWithExactly(withdraw, target, "O");
  });

  it("withdraws energy after all minerals are exhausted", () => {
    resources.H = 0;
    resources.O = 0;

    collectAll();

    sinon.assert.calledWithExactly(withdraw, target, RESOURCE_ENERGY);
  });
});

describe("creep storage energy transfer reserve", () => {
  let creep: CreepBase;
  let target: StructureStorage;
  let transfer: ReturnType<typeof sinon.stub>;
  let freeCapacity: ReturnType<typeof sinon.stub>;
  let moveTo: ReturnType<typeof sinon.stub>;
  let markSpent: ReturnType<typeof sinon.stub>;

  beforeEach(() => {
    Object.assign(global, {
      RESOURCE_ENERGY: "energy",
      STRUCTURE_STORAGE: "storage",
      OK: 0,
      ERR_FULL: -8,
      ERR_NOT_IN_RANGE: -9
    });
    transfer = sinon.stub().returns(OK);
    freeCapacity = sinon.stub().returns(4999);
    moveTo = sinon.stub();
    markSpent = sinon.stub();
    creep = Object.create(CreepBase.prototype);
    Object.assign(creep, {
      creep: { transfer },
      store: { energy: 100 },
      moveTo,
      markEnergySpendIntent: markSpent,
      getTransferCategory: () => "transfer:storage"
    });
    target = ({
      structureType: STRUCTURE_STORAGE,
      store: { getFreeCapacity: freeCapacity }
    } as unknown) as StructureStorage;
  });

  it("blocks energy below 5000 total free capacity without issuing an intent", () => {
    assert.strictEqual(creep.transfer(target, RESOURCE_ENERGY), ERR_FULL);

    sinon.assert.calledWithExactly(freeCapacity);
    sinon.assert.notCalled(transfer);
    sinon.assert.notCalled(moveTo);
    sinon.assert.notCalled(markSpent);
  });

  it("also blocks energy transfers with an explicit amount", () => {
    assert.strictEqual(creep.transfer(target, RESOURCE_ENERGY, 50), ERR_FULL);

    sinon.assert.notCalled(transfer);
  });

  for (const capacity of [5000, 6000]) {
    it(`allows energy with ${capacity} free capacity`, () => {
      freeCapacity.returns(capacity);

      assert.strictEqual(creep.transfer(target, RESOURCE_ENERGY), OK);

      sinon.assert.calledWithExactly(transfer, target, RESOURCE_ENERGY);
      sinon.assert.calledOnce(markSpent);
    });
  }

  it("allows minerals into the reserved space", () => {
    assert.strictEqual(creep.transfer(target, "H", 50), OK);

    sinon.assert.calledWithExactly(transfer, target, "H", 50);
    sinon.assert.notCalled(freeCapacity);
    sinon.assert.notCalled(markSpent);
  });

  it("does not restrict energy transfers to other structures", () => {
    const container = ({ structureType: "container", store: target.store } as unknown) as StructureContainer;

    assert.strictEqual(creep.transfer(container, RESOURCE_ENERGY), OK);

    sinon.assert.calledWithExactly(transfer, container, RESOURCE_ENERGY);
    sinon.assert.notCalled(freeCapacity);
  });

  it("does not restrict energy transfers to creeps", () => {
    const recipient = {} as Creep;

    assert.strictEqual(creep.transfer(recipient, RESOURCE_ENERGY), OK);

    sinon.assert.calledWithExactly(transfer, recipient, RESOURCE_ENERGY);
  });
});
