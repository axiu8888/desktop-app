import { v4 as uuidv4 } from 'uuid';

/**
 * 日期格式化
 */
export namespace DateUtils {
  /**
   * 日期格式化和解析
   * DateUtils提供format和parse进行日期转换。
   * format(date, pattern)把日期格式化成字符串。
   * 使用方法：
   * var date = new Date();
   * DateUtils.format(date, 'yyyy-MM-dd HH:mm:ss'); //2015-08-12 13:00:00
   *
   * parse(str, pattern)把字符串转成日期。
   * 使用方法：
   * var str = 2015-08-12 13:00:00;
   * DateUtils.format(str, 'yyyy-MM-dd HH:mm:ss');
   *
   * parse有两个参数，如果只传递str参数，会调用浏览器内置的Date.parse()方法进行转换。
   *
   *   格式       描述
   *   --------   ---------------------------------------------------------------
   *   yy         年份后两位，如2015取后两位是15。
   *   yyyy       年份四位。
   *   M          月份，取值1 ~ 12。
   *   MM         月份，取值01 ~ 12，如果月份为个位数，前面补0。
   *   MMM        月份缩写，如一月的英文缩写为Jan，中文缩写为一。
   *   MMMM       月份全称，如January、一月。
   *   d          日期在月中的第几天，取值1~31。
   *   dd         日期在月中的第几天，取值01~31，如果天数为个位数，前面补0。
   *   ddd        星期缩写，取值日、一、二、三、四、五、六。
   *   dddd       星期全称，取值星期日、星期一、星期二、星期三、星期四、星期五、星期六。
   *   H          24小时进制，取值0~23。
   *   HH         24小时进制，取值00~23，如果小时为个位数，前面补0。
   *   h          12小时进制，取值0~11。
   *   hh         12小时进制，取值00~11，如果小时为个位数，前面补0。
   *   m          分钟，取值0~59。
   *   mm         分钟，取值00~59，如果为个位数，前面补0。
   *   s          秒，取值0~59。
   *   ss         秒，取值00~59，如果为个位数，前面补0。
   *   S          毫秒，取值0~999。
   *   SS         毫秒，取值00~999，如果不足两位数，前面补0。
   *   SSS        毫秒，取值000~999，如果不足三位数，前面补0。
   *   t          上午、下午缩写。
   *   tt         上午、下午全称。
   *   --------   ---------------------------------------------------------------
   */
  export class DateUtils {
    constructor(private locale: Local = local_zn) {}

    /**
     * 解析
     *
     * @param value 时间字符串
     * @param pattern 格式
     * @returns 返回解析后的时间
     */
    parse(value: any, pattern: string): Date | null {
      if (!value) {
        return null;
      }

      if (Object.prototype.toString.call(value) === '[object Date]') {
        // 如果value是日期，则返回。
        return value;
      }

      if (Object.prototype.toString.call(value) !== '[object String]') {
        // 如果value不是字符串，则退出。
        return null;
      }

      let time;
      if (Object.prototype.toString.call(pattern) !== '[object String]' || pattern === '') {
        // 如果fmt不是字符串或者是空字符串。
        // 使用浏览器内置的日期解析
        time = Date.parse(value);
        if (isNaN(time)) {
          return null;
        }
        return new Date(time);
      }

      var i,
        token,
        tmpVal,
        tokens = pattern.match(/(\\)?(dd?|MM?|yy?y?y?|hh?|HH?|mm?|ss?|tt?|SS?S?|.)/g) as any,
        dateObj = <any>{
          year: 0,
          month: 1,
          date: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          millisecond: 0,
        };

      for (i = 0; i < tokens.length; i++) {
        token = tokens[i];
        tmpVal = parseToken(token, value, dateObj);
        if (tmpVal !== null) {
          if (value.length > tmpVal.length) {
            value = value.substring(tmpVal.length);
          } else {
            value = '';
          }
        } else {
          value = value.substring(token.length);
        }
      }

      if (dateObj.t) {
        if (this.locale.pm === dateObj.t || this.locale.shortPm === dateObj.t) {
          dateObj.hours = +dateObj.hours + 12;
        }
      }

      dateObj.month -= 1;
      return new Date(dateObj.year, dateObj.month, dateObj.date, dateObj.hours, dateObj.minutes, dateObj.seconds, dateObj.millisecond);
    }

    /**
     * 格式化时间
     *
     * @param value 时间
     * @param pattern 格式
     * @returns 返回格式化后的时间字符串
     */
    format(value: any, pattern: string): string | null {
      if (typeof value == 'number') {
        value = new Date(value);
      }
      if (Object.prototype.toString.call(value) !== '[object Date]') {
        return '';
      }

      if (Object.prototype.toString.call(pattern) !== '[object String]' || pattern === '') {
        pattern = 'yyyy-MM-dd HH:mm:ss';
      }

      var fullYear = value.getFullYear(),
        month = value.getMonth(),
        day = value.getDay(),
        date = value.getDate(),
        hours = value.getHours(),
        minutes = value.getMinutes(),
        seconds = value.getSeconds(),
        milliseconds = value.getMilliseconds();
      var locale = this.locale;
      return pattern.replace(/(\\)?(dd?d?d?|MM?M?M?|yy?y?y?|hh?|HH?|mm?|ss?|tt?|SS?S?)/g, (m) => {
        if (m.charAt(0) === '\\') {
          return m.replace('\\', '');
        }
        switch (m) {
          case 'hh':
            return this.leftPad(hours < 13 ? (hours === 0 ? 12 : hours) : hours - 12, 2);
          case 'h':
            return hours < 13 ? (hours === 0 ? 12 : hours) : hours - 12;
          case 'HH':
            return this.leftPad(hours, 2);
          case 'H':
            return hours;
          case 'mm':
            return this.leftPad(minutes, 2);
          case 'm':
            return minutes;
          case 'ss':
            return this.leftPad(seconds, 2);
          case 's':
            return seconds;
          case 'yyyy':
            return fullYear;
          case 'yy':
            return (fullYear + '').substring(2);
          case 'dddd':
            return locale.dayNames[day];
          case 'ddd':
            return locale.shortDayNames[day];
          case 'dd':
            return this.leftPad(date, 2);
          case 'd':
            return date;
          case 'MMMM':
            return locale.monthNames[month];
          case 'MMM':
            return locale.shortMonthNames[month];
          case 'MM':
            return this.leftPad(month + 1, 2);
          case 'M':
            return month + 1;
          case 't':
            return hours < 12 ? locale.shortAm : locale.shortPm;
          case 'tt':
            return hours < 12 ? locale.am : locale.pm;
          case 'S':
            return milliseconds;
          case 'SS':
            return this.leftPad(milliseconds, 2);
          case 'SSS':
            return this.leftPad(milliseconds, 3);
          default:
            return m;
        }
      });
    }

    /**
     * 左边补0
     */
    private leftPad(str: string, size: number): string {
      let result = '' + str;
      while (result.length < size) {
        result = '0' + result;
      }
      return result;
    }
  }

  export const locale_es = <Local>{
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    shortDayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    shortMonthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    am: 'AM',
    pm: 'PM',
    shortAm: 'A',
    shortPm: 'P',
  };
  export const local_zn = <Local>{
    dayNames: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    shortDayNames: ['日', '一', '二', '三', '四', '五', '六'],
    monthNames: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
    shortMonthNames: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'],
    am: '上午',
    pm: '下午',
    shortAm: '上',
    shortPm: '下',
  };

  export interface Local {
    dayNames: Array<string>;
    shortDayNames: Array<string>;
    monthNames: Array<string>;
    shortMonthNames: Array<string>;
    am: string;
    pm: string;
    shortAm: string;
    shortPm: string;
  }

  const parseToken = (function () {
    let match2 = /\d{2}/, // 00 - 99
      // match3 = /\d{3}/,          // 000 - 999
      match4 = /\d{4}/, // 0000 - 9999
      match1to2 = /\d{1,2}/, // 0 - 99
      match1to3 = /\d{1,3}/, // 0 - 999
      // match1to4 = /\d{1,4}/,     // 0 - 9999
      match2w = /.{2}/, // 匹配两个字符
      match1wto2w = /.{1,2}/, // 匹配1~2个字符
      map = <any>{
        //年的后两位
        yy: {
          regex: match2,
          name: 'year',
        },
        //年
        yyyy: {
          regex: match4,
          name: 'year',
        },
        //两位数的月，不到两位数则补0
        MM: {
          regex: match2,
          name: 'month',
        },
        //月
        M: {
          regex: match1to2,
          name: 'month',
        },
        //两位数的日期，不到两位数则补0
        dd: {
          regex: match2,
          name: 'date',
        },
        //日期
        d: {
          regex: match1to2,
          name: 'date',
        },
        //两位数的小时，24小时进制
        HH: {
          regex: match2,
          name: 'hours',
        },
        //小时，24小时进制
        H: {
          regex: match1to2,
          name: 'hours',
        },
        //两位数的小时，12小时进制
        hh: {
          regex: match2,
          name: 'hours',
        },
        //小时，12小时进制
        h: {
          regex: match1to2,
          name: 'hours',
        },
        //两位数的分钟
        mm: {
          regex: match2,
          name: 'minutes',
        },
        //分钟
        m: {
          regex: match1to2,
          name: 'minutes',
        },
        s: {
          regex: match1to2,
          name: 'seconds',
        },
        ss: {
          regex: match2,
          name: 'seconds',
        },
        //上午、下午
        tt: {
          regex: match2w,
          name: 't',
        },
        //上午、下午
        t: {
          regex: match1wto2w,
          name: 't',
        },
        //毫秒
        S: {
          regex: match1to3,
          name: 'millisecond',
        },
        //毫秒
        SS: {
          regex: match1to3,
          name: 'millisecond',
        },
        //毫秒
        SSS: {
          regex: match1to3,
          name: 'millisecond',
        },
      };

    return function (token: string, str: string, dateObj: any) {
      var result,
        part = map[token];
      if (part) {
        result = str.match(part.regex);
        if (result) {
          dateObj[part.name] = result[0];
          return result[0];
        }
      }
      return null;
    };
  })();

  /**
   * 日期格式化工具
   */
  export const dateUtils = new DateUtils();

  /**
   * 日期格式化
   *
   * @param value  时间
   * @param pattern 模式: yyyy-MM-dd HH:mm:ss
   * @returns 返回格式化后的字符串或null
   */
  export const dateFmt = (value: any, pattern: string = 'yyyy-MM-dd HH:mm:ss'): string | null => dateUtils.format(value, pattern);

  /**
   * 时间解析
   *
   * @param value  时间
   * @param pattern 模式: yyyy-MM-dd HH:mm:ss
   * @returns 返回Date或null
   */
  export const dateParse = (value: any, pattern: string = 'yyyy-MM-dd HH:mm:ss'): Date | null => dateUtils.parse(value, pattern);
}

/**
 * 基础工具
 */
export namespace utils {
  /**
   * 日期格式化
   *
   * @param value  时间
   * @param pattern 模式: yyyy-MM-dd HH:mm:ss
   * @returns 返回格式化后的字符串或null
   */
  export const dateFmt = (value: any, pattern: string = 'yyyy-MM-dd HH:mm:ss'): string => DateUtils.dateFmt(value, pattern) as any;

  /**
   * 时间解析
   *
   * @param value  时间
   * @param pattern 模式: yyyy-MM-dd HH:mm:ss
   * @returns 返回Date或null
   */
  export const dateParse = (value: any, pattern: string = 'yyyy-MM-dd HH:mm:ss'): Date => DateUtils.dateParse(value, pattern) as any;

  /**
   * 获取全局的对象
   */
  export const getValue = function (...objs: any) {
    for (const obj of objs) {
      if (typeof obj !== 'undefined') {
        return obj;
      }
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
  export const getGlobal = () =>
    getValue(
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
    );

  /**
   * 判断是否仅为ASCII码字符
   *
   * @param str 字符串
   * @returns 返回判断结果
   */
  export const isAscii = (str: string) => /^ [x00-x7F]+$/.test(str);

  /**
   * 判断是否仅为数字或字母
   *
   * @param str 字符串
   * @returns 返回判断结果
   */
  export const isNumberOrLetter = (str: string) => /^[\d\w]+$/.test(str);

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
  export const getOrDefault = <T>(v: any, dv: T) => (v !== null && v !== undefined ? v : dv);

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
  export function tryFinally(callback: Function, doFinally: Function = () => {}): any {
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
      if (filter(next.value)) {
        // 过滤
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
    itrForEach(
      itr,
      filter,
      (v: V) => (vs[0] = v),
      (v) => vs[0] !== undefined,
    );
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
  };

  /**
   * 打印属性
   */
  export const printProperties = (target: any) => forEachProperty(target, (k, v) => console.log(k, v));

  // ========================================================
  export const rawUUID = (): string => uuidv4();
  export const nextUUID = (): string => rawUUID().replace(new RegExp('-', 'gm'), '');
}
