
// ========================================================

export interface ProxyMethod {
    /**
     * 被调用的方法:
     *   get、set、has、construct、apply、defineProperty、deleteProperty、
     *   getPrototypeOf、setPrototypeOf、getOwnPropertyDescriptor、isExtensible、
     *   ownKeys、preventExtensions
     */
    readonly name: string;
    /**
     * 有序的参数名
     */
    readonly parameters: string[];
    /**
     * Reflect 的方法
     */
    readonly fn: Function;
}

// ~~
export const proxy_apply = <ProxyMethod>{ name: 'apply', parameters: ['target', 'thisArg', 'argArray'], fn: Reflect.apply };
export const proxy_construct = <ProxyMethod>{ name: 'construct', parameters: ['target', 'argArray', 'newTarget'], fn: Reflect.construct };
export const proxy_defineProperty = <ProxyMethod>{ name: 'defineProperty', parameters: ['target', 'property', 'attributes'], fn: Reflect.defineProperty };
export const proxy_deleteProperty = <ProxyMethod>{ name: 'deleteProperty', parameters: ['target', 'p'], fn: Reflect.deleteProperty };
export const proxy_get = <ProxyMethod>{ name: 'get', parameters: ['target', 'p', 'receiver'], fn: Reflect.get };
export const proxy_getOwnPropertyDescriptor = <ProxyMethod>{ name: 'getOwnPropertyDescriptor', parameters: ['target', 'p'], fn: Reflect.getOwnPropertyDescriptor };
export const proxy_getPrototypeOf = <ProxyMethod>{ name: 'getPrototypeOf', parameters: ['target'], fn: Reflect.getPrototypeOf };
export const proxy_has = <ProxyMethod>{ name: 'has', parameters: ['target', 'p'], fn: Reflect.has };
export const proxy_isExtensible = <ProxyMethod>{ name: 'isExtensible', parameters: ['target'], fn: Reflect.isExtensible };
export const proxy_ownKeys = <ProxyMethod>{ name: 'ownKeys', parameters: ['target'], fn: Reflect.ownKeys };
export const proxy_preventExtensions = <ProxyMethod>{ name: 'preventExtensions', parameters: ['target'], fn: Reflect.preventExtensions };
export const proxy_set = <ProxyMethod>{ name: 'set', parameters: ['target', 'p', 'newValue', 'receiver'], fn: Reflect.set };
export const proxy_setPrototypeOf = <ProxyMethod>{ name: 'setPrototypeOf', parameters: ['target', 'v'], fn: Reflect.setPrototypeOf };
/**
 * 代理方法
 */
export const proxy_methods = <ProxyMethod[]>[
    proxy_apply,
    proxy_construct,
    proxy_defineProperty,
    proxy_deleteProperty,
    proxy_get,
    proxy_getOwnPropertyDescriptor,
    proxy_getPrototypeOf,
    proxy_has,
    proxy_isExtensible,
    proxy_ownKeys,
    proxy_preventExtensions,
    proxy_set,
    proxy_setPrototypeOf,
];

/**
 * 是否有忽略的代理方法
 * 
 * @param pm 代理方法
 * @returns 返回判断结果
 */
export const hasProxyIgnore = (pm: ProxyMethod) => {
    switch (pm.name) {
        case proxy_apply.name:
        case proxy_construct.name:
        case proxy_defineProperty.name:
        case proxy_deleteProperty.name:
        case proxy_getOwnPropertyDescriptor.name:
        case proxy_getPrototypeOf.name:
        case proxy_isExtensible.name:
        case proxy_ownKeys.name:
        case proxy_preventExtensions.name:
        case proxy_setPrototypeOf.name:
            return true;
        default:
            return false;
    }
};

/**
 * 调用反射方法
 *
 * @param proxy 代理
 * @param pm 代理的方法
 * @param args 参数 {arg1: value, arg2: value ...}
 * @returns 返回调用结果
 */
export function invokeReflect(pm: ProxyMethod, args: any): any {
    return pm.fn(...pm.parameters.map((name) => args[name]));
}

/**
 * 代理器拦截器
 */
export interface ProxyHandlerInterceptor {
    /**
     * 拦截或处理具体的操作
     *
     * @param pm 拦截的方法信息
     * @param target 被代理的目标对象
     * @param args 参数 {arg1: value, arg2: value ...}
     */
    (pm: ProxyMethod, target: any, args: any): any;
}

/**
 * 代理处理器统一处理类
 *
 * 注意：避免递归调用
 */
export class ProxyHandlerImpl<T extends object> implements ProxyHandler<T> {
    /**
     * 代理器处理器
     *
     * @param original 原始对象
     * @param interceptor 拦截器
     */
    constructor(public readonly original: T, public readonly interceptor: ProxyHandlerInterceptor) { }

    protected invoke(pm: ProxyMethod, target: T, args: any): any {
        return this.interceptor(pm, target, args);
    }

    apply(target: T, thisArg: any, argArray: any[]): any {
        return this.invoke(proxy_apply, target, { target: target, thisArg: thisArg, argArray: argArray });
    }

    construct(target: T, argArray: any[], newTarget: Function): any {
        return this.invoke(proxy_construct, target, { target: target, argArray: argArray, newTarget: newTarget });
    }

    defineProperty(target: T, property: string | symbol, attributes: PropertyDescriptor): any {
        return this.invoke(proxy_defineProperty, target, { target: target, property: property, attributes: attributes });
    }

    deleteProperty(target: T, p: string | symbol): any {
        return this.invoke(proxy_deleteProperty, target, { target: target, p: p });
    }

    get(target: T, p: string | symbol, receiver: any) {
        return this.invoke(proxy_get, target, { target: target, p: p, receiver: receiver });
    }

    getOwnPropertyDescriptor(target: T, p: string | symbol): any {
        return this.invoke(proxy_getOwnPropertyDescriptor, target, { target: target, p: p });
    }

    getPrototypeOf(target: T): any {
        return this.invoke(proxy_getPrototypeOf, target, { target: target });
    }

    has(target: T, p: string | symbol): any {
        return this.invoke(proxy_has, target, { target: target, p: p });
    }

    isExtensible(target: T): any {
        return this.invoke(proxy_isExtensible, target, { target: target });
    }

    ownKeys(target: T): any {
        return this.invoke(proxy_ownKeys, target, { target: target });
    }

    preventExtensions(target: T): any {
        return this.invoke(proxy_preventExtensions, target, { target: target });
    }

    set(target: T, p: string | symbol, newValue: any, receiver: any): any {
        return this.invoke(proxy_set, target, { target: target, p: p, newValue: newValue, receiver: receiver });
    }

    setPrototypeOf(target: T, v: object | null): any {
        return this.invoke(proxy_setPrototypeOf, target, { target: target, v: v });
    }
}

/**
 * 创建代理对象
 *
 * @param target 被代理的目标对象
 * @param interceptor 拦截器
 * @returns 返回代理
 */
export const newProxy = <T>(target: any, interceptor: ProxyHandlerInterceptor): T => {
    return new Proxy(target, new ProxyHandlerImpl(target, interceptor)) as T;
};

/**
 * 代理 set / get
 *
 * @param target 被代理的目标对象
 * @param interceptor 拦截器
 * @param callTarget 其他方法是否调用 target 的原生函数
 * @returns 返回代理
 */
export const newSetGetProxy = <T>(target: any, interceptor: ProxyHandlerInterceptor, callTarget: boolean = true): T => {
    return newProxy<T>(target, (pm: ProxyMethod, original: any, args: any) => {
        switch (pm.name) {
            case proxy_get.name:
            case proxy_set.name:
                return interceptor(pm, original, args);
            default:
                // 调用target的方法或返回undefined
                return callTarget ? invokeReflect(pm, args) : undefined;
        }
    });
};

/**
 * 创建代理对象
 *
 * @param target 被代理的目标对象
 * @returns 返回代理
 */
export const newTargetProxy = <T>(target: any) => {
    return newProxy(target, (pm: ProxyMethod, _target: any, args: any) => invokeReflect(pm, args));
}

// ~