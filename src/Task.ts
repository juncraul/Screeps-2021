
export default class Task{
    activity: Activity;
    creepType: CreepType;
    source: Source;

    constructor(activity: Activity, creepType: CreepType, source: Source){
        this.activity = activity;
        this.creepType = creepType;
        this.source = source;
    }
}

export enum Activity {
    CreateCreep
}

export enum CreepType {
    HarvesterWithCarry
}
