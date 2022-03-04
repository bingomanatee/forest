export const TYPE_MAP = Symbol('type:map');
export const TYPE_OBJECT = Symbol('type:object');
export const TYPE_VALUE = Symbol('type:value');
export const TYPE_ARRAY = Symbol('type:array');
export const TYPE_MIRROR = Symbol('type:mirror');
export const NAME_UNNAMED = Symbol('unnamed');

export const ABSENT = Symbol('ABSENT');

export const EVENT_TYPE_NEXT = Symbol('next');
export const EVENT_TYPE_SET = Symbol('set');
export const EVENT_TYPE_DEBUG = Symbol('debug');
export const EVENT_TYPE_CLEAN = Symbol('clean');

export const EVENT_TYPE_ACCEPT_FROM = Symbol('event:acceptFrom');
export const EVENT_TYPE_REMOVE_FROM = Symbol('event:removeFrom');

export const EVENT_TYPE_FLUSH_ACTIVE = Symbol('event:commit');
export const EVENT_TYPE_ACTION = Symbol('event:action');
export const EVENT_TYPE_MUTATE = Symbol('event:mutate');
export const EVENT_TYPE_VALIDATE = Symbol('event:validate');
export const SET_RE = /^set(.+)$/i;

export const MIRROR_EVENT_STATE_ACTIVE = Symbol('mirror-event-state:active');
export const MIRROR_EVENT_STATE_ERROR = Symbol('mirror-state:error');
export const MIRROR_EVENT_STATE_STOPPED = Symbol('mirror-state:stopped');
export const MIRROR_EVENT_STATE_COMPLETE = Symbol('mirror-state:complete');
