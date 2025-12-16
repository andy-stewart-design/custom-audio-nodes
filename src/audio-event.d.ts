import AudioEndedEvent from "./audio-nodes/audio-event";

declare global {
  interface GlobalEventHandlersEventMap {
    ended: AudioEndedEvent;
  }

  interface AudioWorkletNodeEventMap {
    ended: AudioEndedEvent;
  }
}
