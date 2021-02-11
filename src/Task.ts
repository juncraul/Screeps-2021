
export default class Task implements ITask{
    activity: number;
    creepType: number;
    source: Source;

    constructor(activity: number, creepType: number, source: Source){
        this.activity = activity;
        this.creepType = creepType;
        this.source = source;
    }
}

export enum Activity {
    Harvest
}

export enum CreepType {
    HarvesterWithCarry
}
