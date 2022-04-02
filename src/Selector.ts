import { LeafType, strNum } from './types';
import { isArr, isFn } from './utils';

export class Selector {
  constructor(name: strNum, props, target: LeafType) {
    this.name = name;
    if (isFn(props)) {
      this.selector = props;
    } else {
      const { selector, args = [] } = props;
      this.selector = selector;
      this._args = args;
    }
    this.target = target;
  }

  name: strNum;
  error?: any;
  private readonly selector: Function | string;
  private _args: any[] = [];
  version = -1;
  private readonly target: LeafType;

  get args(): any[] {
    if (!isArr(this._args)) return [];
    return this._args;
  }

  get basis() {
    return this._args.length
      ? this._args.reduce((out, field) => {
          try {
            out[field] = this.target.get(field);
          } catch (err) {
            this.error = err;
            console.warn('selector cannot get ' + field);
          }
          return out;
        }, {})
      : this.target.value;
  }

  private _value: any = undefined;
  get value() {
    if (this.version !== this.target.version) {
      this.error = undefined;
      try {
        if (typeof this.selector === 'string') {
          this._value = this.target.do[this.selector](this.basis);
        } else this._value = this.selector(this.basis, this.target);
      } catch (_err) {
        console.warn('selector error:', _err);
        this._value = undefined;
      }
      if (typeof this.target.version === 'number') {
        this.version = this.target.version;
      }
    }
    return this._value;
  }
}
