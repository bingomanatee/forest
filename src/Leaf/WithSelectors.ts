import { ABSENT, FORM_MAP, FORM_OBJECT } from '../constants';
import { detectForm, isObj, isThere, mapReduce, toMap } from '../utils';
import { strNum } from '../types';
import { Selector } from '../Selector';
import { map, SubjectLike } from 'rxjs';

export default function WithSelectors(Cons) {
  return class LeafWithSelectors extends Cons {
    _$?: any | null;
    get $() {
      this.emit('debug', 'override get $');
      if (!this._$) {
        this._$ = new Map();
      }
      return this._$;
    }

    config(opts) {
      super.config(opts);
      if (isObj(opts)) {
        const { selectors = ABSENT } = opts;

        if (isThere(selectors)) {
          this.addSelectors(selectors);
        }
      }
    }

    _$snapshot?: object;
    _$snapVersion?: number | null = -1;
    get $$() {
      if (
        !this._$snapshot ||
        this._$snapVersion !== this.version ||
        this.version === null
      ) {
        this._$snapshot = mapReduce(
          this.$,
          (out, selector) => {
            out.set('$' + selector.name, selector.value);
            return out;
          },
          new Map()
        );

        if (this.version !== null) {
          this._$snapVersion = this.version;
        }
      }
      return this._$snapshot;
    }

    addSelectors(selectors) {
      toMap(selectors).forEach((selector, name) => {
        this.addSelector(name, selector);
      });
    }

    selector(name) {
      if (this._$) {
        if (this.$.has(name)) {
          return this.$.get(name).value;
        }
      }
      return undefined;
    }

    addSelector(name: strNum, selector) {
      // @ts-ignore
      this.$.set(name, new Selector(name, selector, this));
    }

    get hasSubjects(): boolean {
      return this._$ && this.$.size > 0;
    }

    _decoratedSubject?: SubjectLike<any>;
    $subject() {
      if (!this._decoratedSubject) {
        const target = this;
        this._decoratedSubject = this.pipe(
          map(value => {
            let out = value;
            if (this.hasSubjects) {
              const subjectValues = target.$$;
              if (subjectValues) {
                switch (detectForm(value)) {
                  case FORM_OBJECT:
                    // @ts-ignore
                    out = { ...value, ...subjectValues };
                    break;

                  case FORM_MAP:
                    // @ts-ignore
                    out = new Map(value);
                    Object.keys(subjectValues).forEach(name => {
                      // @ts-ignore
                      out.set(name, subjectValues[name]);
                    });
                    break;

                  default:
                  //
                }
              }
            }

            return out;
          })
        );
      }

      return this._decoratedSubject;
    }
  };
}
