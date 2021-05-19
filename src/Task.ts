
export default class Task implements ITask{
    activity: number;
    creepType: number;
    targetPlace: RoomPosition;
    taskDone: boolean;

    constructor(activity: number, creepType: number, targetPlace: RoomPosition){
        this.activity = activity;
        this.creepType = creepType;
        this.targetPlace = targetPlace;
        this.taskDone = false;
    }

    public static getSourceFromTarget(target: RoomPosition): Source | null{
        return (new RoomPosition(target.x, target.y, target.roomName)).findClosestByRange(FIND_SOURCES);
    }

    public static getConstructionSiteFromTarget(target: RoomPosition): ConstructionSite | null{
        return (new RoomPosition(target.x, target.y, target.roomName)).findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
    }
}

export enum Activity {
    Harvest,
    Construct
}

export enum CreepType {
    HarvesterWithCarry
}
