import { GetRoomObjects } from "Helpers/GetRoomObjects";

export class Cannon {
  energy: number;
  energyCapacity: number;
  tower: StructureTower;
  pos: RoomPosition;

  constructor(tower: StructureTower) {
    this.energy = tower.energy;
    this.energyCapacity = tower.energyCapacity;
    this.pos = tower.pos;
    this.tower = tower;
  }

  repair(structure: Structure) {
    const result = this.tower.repair(structure);
    return result;
  }

  heal(creep: Creep) {
    if (creep.hits >= creep.hitsMax * 0.75) return ERR_FULL;
    const result = this.tower.heal(creep);
    return result;
  }

  attack(creep: Creep) {
    // if (creep.owner.username === "Invader") return; // Disabled Invaders for now
    const result = this.tower.attack(creep);
    return result;
  }

  public cannonLogic(): void {
    // Priority 1: Heal damaged DefenseArea creeps before anything else.
    const defenseCreep = this.getDefenseAreaDamagedCreep();
    if (defenseCreep) {
      this.heal(defenseCreep);
      return;
    }

    // Priority 2: Attack enemies — but skip if combined tower damage cannot overcome healing.
    let enemy = GetRoomObjects.getClosestEnemyByRange(this.pos, HEAL); // Prioritise healers
    if (!enemy) {
      enemy = GetRoomObjects.getClosestEnemyByRange(this.pos);
    }
    if (enemy) {
      if (this.isAttackEffective(enemy)) {
        this.attack(enemy);
        return;
      }
      // Enemy is present but attack is ineffective at current range.
      // Fall through to heal/repair while waiting for the enemy to advance.
    }

    // Priority 3: Heal any other damaged friendly creep.
    const damagedUnit = GetRoomObjects.getClosestByRangeDamagedUnit(this.pos);
    if (damagedUnit) {
      this.heal(damagedUnit);
      return;
    }

    // Priority 4: Repair structures (only when energy allows and CPU is healthy).
    if (this.energy <= this.energyCapacity * 0.5 || Game.cpu.bucket < 1000) return;

    let structure = GetRoomObjects.getClosestStructureToRepairByRange(this.pos, 0.5);
    if (structure) {
      this.repair(structure);
      return;
    }

    structure = GetRoomObjects.getClosestStructureToRepairByRange(this.pos, 0.8);
    if (structure) {
      this.repair(structure);
      return;
    }

    if (Game.time % 100 > 5) return;
    structure = GetRoomObjects.getClosestWallRampartToRepairByRange(this.pos);
    if (structure) {
      this.repair(structure);
    }
  }

  /**
   * Returns the most-damaged (lowest HP ratio) Defender, DefenseRanger or
   * DefenseHealer creep
   * in this tower's room, or null if none are damaged.
   */
  private getDefenseAreaDamagedCreep(): Creep | null {
    const damaged = this.tower.room.find(FIND_MY_CREEPS, {
      filter: creep =>
        (creep.memory.role === "Defender" ||
          creep.memory.role === "DefenseRanger" ||
          creep.memory.role === "DefenseHealer") &&
        creep.hits < creep.hitsMax
    });
    if (damaged.length === 0) return null;
    return damaged.reduce((worst, c) => (c.hits / c.hitsMax < worst.hits / worst.hitsMax ? c : worst));
  }

  /**
   * Returns true if the combined damage of all towers in the room at the
   * current range can outpace the enemy's active healing capacity.
   * Uses tower falloff constants: optimal 5, falloff at 20, 75% falloff.
   */
  private isAttackEffective(enemy: Creep): boolean {
    const healParts = enemy.getActiveBodyparts(HEAL);
    if (healParts === 0) return true;

    const range = this.pos.getRangeTo(enemy.pos);
    const towerDamage = this.getTowerDamageAtRange(range);

    if (range < 15) return true; // If the enemy is close, we can assume the attack is effective enough to warrant shooting at them.

    const hasBoostedHeal = enemy.body.some(p => p.type === HEAL && p.boost != null);
    const healMultiplier = hasBoostedHeal ? 4 : 1;
    const enemyHealPerTick = healParts * HEAL_POWER * healMultiplier;

    const towerCount = Math.max(
      1,
      this.tower.room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }).length
    );
    console.log("towerDamage", towerDamage);
    console.log("enemyHealPerTick", enemyHealPerTick);

    return towerDamage * towerCount > enemyHealPerTick * 0.5;
  }

  /** Tower attack damage at a given range, accounting for TOWER_FALLOFF. */
  private getTowerDamageAtRange(range: number): number {
    const optimalRange = TOWER_OPTIMAL_RANGE;
    const falloffRange = TOWER_FALLOFF_RANGE;
    const maxDamage = TOWER_POWER_ATTACK;
    const minDamage = Math.floor(maxDamage * (1 - TOWER_FALLOFF));
    if (range <= optimalRange) return maxDamage;
    if (range >= falloffRange) return minDamage;
    const falloffPct = (range - optimalRange) / (falloffRange - optimalRange);
    return Math.floor(maxDamage * (1 - TOWER_FALLOFF * falloffPct));
  }
}
