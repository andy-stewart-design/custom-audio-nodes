class AudioEndedEvent extends Event {
  static readonly eventName = "ended";
  readonly time: number;

  constructor(time: number) {
    super(AudioEndedEvent.eventName, { bubbles: true, composed: true });
    this.time = time;
  }
}

export default AudioEndedEvent;
