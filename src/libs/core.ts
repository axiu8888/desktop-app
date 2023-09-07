/**
 * 获取全局的对象
 */
export const getGlobal = function (...objs: any) {
  for (const obj of objs) {
    if(typeof obj !== 'undefined') { return obj };
  }
  // if (typeof window !== 'undefined') { return window; }
  // if (typeof global !== 'undefined') { return global; }
  // if (typeof self !== 'undefined') { return self; }
  // if (typeof uni !== 'undefined') { return uni; }
  throw new Error('unable to locate global object');
};

/**
 * 从 window、global、uni、self 中获取可用的全局对象
 */
export const getDefaultGlobal = () => getGlobal(
  //@ts-ignore : 忽略可能不存在的实例
  typeof uni !== 'undefined' ? uni : undefined,
  //@ts-ignore : 忽略可能不存在的实例
  typeof window !== 'undefined' ? window : undefined,
  //@ts-ignore : 忽略可能不存在的实例
  typeof global !== 'undefined' ? global : undefined,
  //@ts-ignore : 忽略可能不存在的实例
  typeof self !== 'undefined' ? self : undefined,
  //@ts-ignore : 忽略可能不存在的实例
  typeof context !== 'undefined' ? context : undefined,
  //@ts-ignore : 忽略可能不存在的实例
  typeof this !== 'undefined' ? this : undefined,
);

/**
 * 过滤
 */
export interface Predicate<T> {
  /**
   * 过滤
   *
   * @param v 过滤对象
   * @param args 其他参数
   */
  (v: T, ...args: any): boolean;
}

/**
 * 过滤数组
 */
export interface ArrayPredicate<T> {
  /**
   * 数组过滤
   */
  (value: T, index: number, obj: T[]): boolean;
}

export interface ApplyTo<T, U> {
  (t: T): U;
}

/**
 * 拷贝对象的属性
 *
 * @param from 源对象
 * @param to  目标对象
 */
export function copyAttrs(from: any, to: any): any {
  // 拷贝数据
  for (var attr in from) {
    to[attr] = from[attr];
  }
  return to;
}

/**
 * 获取被检查的值，如果不为null/undefined，就返回此值，否则返回默认值
 *
 * @param v 检查的值
 * @param dv  默认值
 */
export const getOrDefault = <T>(v: any, dv: T) => v !== null && v !== undefined ? v : dv;

/**
 * 获取对象属性
 *
 * @param obj 对象
 * @returns 返回属性的数组
 */
export function obtainKeys(obj: any): string[] {
  let keys = <string[]>[];
  for (const attr in obj) {
    keys.push(attr);
  }
  return keys;
}

/**
 * 获取值
 *
 * @param obj 对象
 * @returns 返回值的数组
 */
export function obtainValues(obj: any): any[] {
  let keys = <any>[];
  for (const attr in obj) {
    keys.push(obj[attr]);
  }
  return keys;
}

/**
 * try catch
 *
 * @param callback 回调
 * @param errorHandler 错误的回调
 */
export function tryCatch(callback: Function, errorHandler: Function = (err: any) => console.error(err)): any {
  try {
    return callback();
  } catch (err) {
    if (errorHandler) return errorHandler(err);
  }
}

/**
 * try finally
 *
 * @param callback 回调
 * @param doFinally 最终的回调
 */
export function tryFinally(callback: Function, doFinally: Function = () => { }): any {
  try {
    return callback();
  } finally {
    if (doFinally) return doFinally();
  }
}

/**
 * Return a new function which runs the user function bound
 * to a fixed scope.
 * @param {function} User function
 * @param {object} Function scope
 * @return {function} User function bound to another scope
 * @private
 */
export const scope = function (f: Function, scope: any) {
  return function () {
    return f.apply(scope, arguments);
  };
};

/**
 * 调用函数
 *
 * @param target 目标对象
 * @param fn 函数
 * @param args 参数
 * @returns 返回调用结果
 */
export const applyFn = (fn?: Function, ...args: any): any => {
  return fn && fn(...args);
};

/**
 * 调用函数
 *
 * @param target 目标对象
 * @param fn 函数
 * @param args 参数
 * @returns 返回调用结果
 */
export const applyFnWithTry = (fn?: Function, ...args: any): any => {
  try {
    return applyFn(fn, ...args);
  } catch (err) {
    return err;
  }
};

/**
 * 处理函数
 */
export interface BiFunction<K, V, D> {
  (key: K, value: V): D;
}

/**
 * 迭代Map
 */
export function itrForEach<V>(itr: Iterator<V>, filter: Predicate<V>, callback: Function, interceptor?: Predicate<V>) {
  //map.entries
  let next = itr.next();
  while (!next.done) {
    if (filter(next.value)) {// 过滤
      callback(next.value); // 处理
    }
    // 中止
    if (interceptor && interceptor(next.value)) {
      return;
    }
    next = itr.next();
  }
}

/**
 * 查找匹配的第一个值
 */
export function findItr<V>(itr: Iterator<V>, filter: Predicate<V>) {
  let vs = <V[]>[];
  itrForEach(itr, filter, (v: V) => vs[0] = v, v => vs[0] !== undefined);
  return vs[0];
}

/**
 * 将 Map Key 转换为 Array
 */
export function mapKeysToArray<K, V>(map: Map<K, V>) {
  return mapToArray(map, (k, v) => k);
}

/**
 * 将 Map Value 转换为 Array
 */
export function mapValuesToArray<K, V>(map: Map<K, V>) {
  return mapToArray(map, (k, v) => v);
}

/**
 * 将 Map 转换为 Array
 */
export function mapToArray<K, V, D>(map: Map<K, V>, mapped: BiFunction<K, V, D>) {
  let array = <D[]>[];
  map.forEach((v, k) => array.push(mapped(k, v)));
  return array;
}

/**
 * 迭代对象属性
 *
 * @param target 迭代对象
 * @param callback 回调
 * @param ownProperty 是否为原型链的属性
 */
export const forEachProperty = (target: any, callback: BiFunction<any, any, void>, ownProperty: boolean = false) => {
  if (target) {
    for (const key in target) {
      if (ownProperty) {
        if (target.prototype.hasOwnProperty(key)) {
          callback(key, target[key]);
        }
      } else {
        callback(key, target[key]);
      }
    }
  }
}

/**
 * 打印属性
 */
export const printProperties = (target: any) => forEachProperty(target, (k, v) => console.log(k, v));

// ========================================================
// UUID
import { v4 as uuidv4 } from "uuid";
export const rawUUID = (): string => uuidv4();
export const nextUUID = (): string => rawUUID().replace(new RegExp("-", "gm"), "");


