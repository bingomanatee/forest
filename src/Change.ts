export class Change {
  constructor(value: any, target: any) {
    this.value = value;
    this.target = target;
    this.error = null;
    this.status = 'live';
  }
  public target: any;
  public value: any;
  public error: any;
  public status: string;

  stop() {
    if (this.status === 'live') this.status = 'stopped';
  }

  get isStopped() {
    return !!(this.error || this.status !== 'live');
  }
}
