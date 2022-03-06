export class Change {
  constructor(value: any, target: any) {
    this.value = value;
    this.versionBeforeChange = target.version;
    this.target = target;
    this._error = null;
    this.status = 'live';
  }

  public target: any;
  public value: any;
  private _error: any;
  public status: string;
  public versionBeforeChange: number;
  get error(): any {
    return this._error;
  }

  set error(value: any) {
    if (this.status !== 'live') return;
    this.status = 'error';
    this._error = value;
  }

  stop() {
    if (this.status === 'live') {
      this.status = 'stopped';
    }
  }

  complete() {
    if (this.status === 'live') {
      this.target.e.emit('change-complete', this);
      this.stop();
    }
  }

  get isStopped() {
    return !!(this._error || this.status !== 'live');
  }
}
