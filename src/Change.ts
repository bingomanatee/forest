export class Change {
  constructor(value: any, target: any) {
    this.value = value;
    this.target = target;
    this.error = null;
    this.status = 'live';
    this.versionTo = target.rootVersion + 1;
  }

  versionTo: number;
  target: any;
  value: any;
  error: any;
  status: string;
  private _stopped: any;

  stop(reason = true) {
    this._stopped = reason || true;
  }

  get isStopped() {
    return !!(this.error || this._stopped);
  }
}
