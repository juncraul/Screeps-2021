import { Helper } from "Helpers/Helper";

const EVENT_MEMORY_KEY = "EventHandlerEvents";
const MAX_EVENTS = 100;
const RECENT_EVENTS_TO_SHOW = 5;

export interface ImportantEvent {
  tick: number;
  roomName: string;
  eventType: string;
  message: string;
}

export default class EventHandler {
  public static pushEvent(roomName: string, eventType: string, message: string): void {
    const events = EventHandler.getEvents();
    events.push({
      tick: Game.time,
      roomName,
      eventType,
      message
    });
    EventHandler.saveEvents(events.slice(-MAX_EVENTS));
  }

  public static drawRoomVisual(room: Room): void {
    if (room.find(FIND_MY_SPAWNS).length === 0) {
      return;
    }

    const recentEvents = EventHandler.getEvents()
      .filter(event => event.roomName === room.name)
      .slice(-RECENT_EVENTS_TO_SHOW)
      .reverse();
    if (recentEvents.length === 0) {
      return;
    }

    const x = 1;
    let y = 42;
    const titleStyle: TextStyle = { align: "left", opacity: 0.9, color: "#ffd166", font: "0.8 Trebuchet MS" };
    const lineStyle: TextStyle = { align: "left", opacity: 0.8, color: "#fff3bf", font: "0.65 Trebuchet MS" };

    room.visual.text("Recent Events", x, y, titleStyle);
    y += 0.75;

    for (const event of recentEvents) {
      room.visual.text(`[${event.tick}] ${event.eventType}: ${event.message}`, x, y, lineStyle);
      y += 0.65;
    }
  }

  private static getEvents(): ImportantEvent[] {
    return Helper.getCashedMemory<ImportantEvent[]>(EVENT_MEMORY_KEY, []);
  }

  private static saveEvents(events: ImportantEvent[]): void {
    Helper.setCashedMemory(EVENT_MEMORY_KEY, events);
  }
}
