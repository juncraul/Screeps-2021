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
      let result = this.tower.repair(structure);
      return result;
    }
  
    heal(creep: Creep) {
      let result = this.tower.heal(creep);
      return result;
    }
  
    attack(creep: Creep) {
      let result = this.tower.attack(creep);
      return result;
    }
  
  
    public cannonLogic(): void {
      //Take care of enemies
      let enemy = GetRoomObjects.getClosestEnemyByRange(this.pos, HEAL);//Kill healers first
      if (!enemy) {
        enemy = GetRoomObjects.getClosestEnemyByRange(this.pos);
      }
      if (enemy) {
        //TODO: do in such a way so we don't keep attacking creeps when attacking has no effect
        //if (this.battleStats && this.battleStats.enemy.id == enemy.id && this.battleStats.numberHits > 5 && this.battleStats.enemy.hits > this.battleStats.enemy.hitsMax * 0.8) {
        //  this.battleStats.cooldown = 5;
        //  return;
        //}
        //let result = 
        this.attack(enemy);
        //if (!this.battleStats || (this.battleStats && this.battleStats.enemy.id != enemy.id)) {
        //  this.battleStats = {
        //    enemy: enemy,
        //    firstEncounter: Game.time,
        //    numberHits: result == 0 ? 1 : 0
        //  }
        //} else {
        //  this.battleStats.numberHits++;
        //}
        return;
      }
  
      //Heal friendly creeps
      let damagedUnit = GetRoomObjects.getClosestByRangeDamagedUnit(this.pos);
      if (damagedUnit) {
        this.heal(damagedUnit);
        return;
      }
  
      //Check if cannon has enough energy and that we are not at limit of the cpu
      if (this.energy <= this.energyCapacity * 0.5 || Game.cpu.bucket < 1000)
        return;
  
      //Repair very damaged structures
      let structure = GetRoomObjects.getClosestStructureToRepairByRange(this.pos, 0.5);
      if (structure) {
        this.repair(structure);
      }
  
      //Repair damaged structures
      structure = GetRoomObjects.getClosestStructureToRepairByRange(this.pos, 0.8);
      if (structure) {
        this.repair(structure);
      }
  
      //Do wall repairs rarely
      if (Game.time % 10 < 5)
        return
      structure = GetRoomObjects.getClosestStructureToRepairByRange(this.pos, 0.8, true);
      if (structure) {
        this.repair(structure);
      }
    }
  }