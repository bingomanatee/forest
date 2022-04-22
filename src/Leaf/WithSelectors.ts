import { ABSENT, FORM_MAP, FORM_OBJECT } from '../constants';
import { detectForm, isObj, isThere, mapReduce, toMap } from '../utils';
import { strNum } from '../types';
import { Selector } from '../Selector';
import { map, SubjectLike } from 'rxjs';

export default function WithSelectors(Cons) {
  /**
   * manages computed fields
   * @TODO: freeze updating while computing selectors
   */
  return class LeafWithSelectors extends Cons {
    config(opts) {
      super.config(opts);
      if (isObj(opts)) {
        const { selectors = ABSENT, localSelectors = ABSENT } = opts;

        if (isThere(selectors)) {
          this.addSelectors(selectors);
        }

        if (isThere(localSelectors)) {
          this._localSelectors = localSelectors;
        }
      }
    }

    _$?: any | null;
    _localSelectors = false;
    _$snapshot?: Map<any, any>;
    _$snapVersion?: number | null = -1;

    get $() {
      this.emit('debug', 'override get $');
      if (!this._$) {
        this._$ = new Map();
      }
      return this._$;
    }
    /**
     * the selector, exported as a name-value map
     */
    get $$(): Map<any, any> {
      if (
        !this._$snapshot ||
        this._$snapVersion !== this.version ||
        this.version === null
      ) {
        this._$snapshot = mapReduce(
          this.$,
          (out, selector) => {
            out.set('$' + selector.name, selector.baseValue);
            return out;
          },
          new Map()
        );

        if (this.version !== null) {
          this._$snapVersion = this.version;
        }
      }
      // @ts-ignore
      return this._$snapshot;
    }

    valueWithSelectors(value: any = ABSENT) {
      if (value === ABSENT) {
        if (this._localSelectors) {
          return this.baseValue;
        }
        value = this.baseValue;
      }

      if (!this.hasSelectors) {
        return this.baseValue;
      }

      let out = value;
      switch (detectForm(value)) {
        case FORM_OBJECT:
          // @ts-ignore
          out = mapReduce(
            this.$$,
            (out, value, key) => {
              try {
                out[key] = value;
              } catch (err) {
                //
              }
              return out;
            },
            {
              // @ts-ignore
              ...value,
            }
          );
          break;

        case FORM_MAP:
          // @ts-ignore
          out = mapReduce(
            this.$$,
            (out, value, name) => {
              out.set(name, value);
              return out;
            },
            new Map(
              // @ts-ignore
              value
            )
          );
          break;

        default:
        //
      }
      return out;
    }

    addSelectors(selectors) {
      toMap(selectors).forEach((selector, name) => {
        this.addSelector(name, selector);
      });
    }

    selector(name) {
      if (this._$) {
        if (this.$.has(name)) {
          return this.$.get(name).baseValue;
        }
      }
      return undefined;
    }

    addSelector(name: strNum, selector) {
      // @ts-ignore
      this.$.set(name, new Selector(name, selector, this));
    }

    get hasSelectors(): boolean {
      return this._$ && this.$.size > 0;
    }

    _decoratedSubject?: SubjectLike<any>;

    get subject() {
      if (!this._decoratedSubject) {
        const target = this;
        this._decoratedSubject = this._subject.pipe(
          map(value => {
            return target.valueWithSelectors(value);
          })
        );
      }

      return this._decoratedSubject;
    }
  };
}
