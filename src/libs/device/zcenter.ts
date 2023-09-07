/**
 * 解析中央台数据
 */
import { binary } from "../binary-helper";
import { HardwarePacket } from "./collector";


/**
 * 解析中央台数据
 *
 * @param data 中央台的字节数据包
 * @returns 返回解析后的中央台数据
 */
export function parseZCenter(data: number[] | Uint8Array | ArrayBuffer): ZCenterPacket {
  data = binary.asNumberArray(data);
  let zp = <ZCenterPacket>{};
  zp.head = binary.bytesToHex(data.slice(0, 2)); // 包头
  zp.packageType = data[2] & 0xFF; // 类型
  zp.length = binary.bytesToNumber(data.slice(3, 5)); // 长度
  zp.orderNum = data[5] & 0xFF; // 床号
  zp.deviceId = binary.bytesToHex(data.slice(6, 6 + 4)); // 设备ID
  zp.packageSn = binary.bytesToNumber(data.slice(10, 10 + 4)); // 包序号
  zp.respList = binary.bytesToNumberArray(data.slice(14, 14 + 50), 16);
  zp.abdominalList = binary.bytesToNumberArray(data.slice(64, 64 + 50), 16);
  zp.ecgList = binary.bytesToNumberArray(data.slice(114, 114 + 400), 16);
  zp.spo2List = binary.bytesToNumberArray(data.slice(514, 514 + 50), 8);
  zp.hr = binary.bytesToNumber(data.slice(564, 564 + 2));
  zp.rr = data[566] & 0xFF;
  zp.pulseRate = binary.bytesToNumber(data.slice(567, 567 + 2));;
  zp.temperature = binary.bytesToNumber(data.slice(568, 568 + 2));;
  zp.spo2 = data[571] & 0xFF;
  zp.outBattery = data[572] & 0xFF;
  zp.connAbnormal = data[573] & 0xFF;
  zp.signalAbnormal = data[574] & 0xFF;
  zp.otherAbnormal = data[575] & 0xFF;
  zp.gesture = data[576] & 0xFF;
  zp.wifiSignal = data[577] & 0xFF;
  zp.calibration = data[578] & 0xFF;
  zp.eiRatio = data[579] & 0xFF;
  zp.caRatio = data[580] & 0xFF;
  zp.tidalVolumeList = binary.bytesToNumberArray(data.slice(581, 581 + 50), 16);
  zp.hrAlarm = data[631] & 0xFF;
  zp.acceleration = binary.bytesToNumber(data.slice(632, 632 + 2));
  zp.step = data[634] & 0xFF;
  zp.sportTrends = data[635] & 0xFF;
  zp.time = binary.bytesToNumber(data.slice(636, 636 + 4));
  zp.bpTime = binary.bytesToNumber(data.slice(640, 640 + 4));
  zp.systolic = binary.bytesToNumber(data.slice(644, 644 + 2));
  zp.diastolic = binary.bytesToNumber(data.slice(646, 646 + 2));
  zp.volume = binary.bytesToNumber(data.slice(648, 648 + 2));
  zp.circle = data[650] & 0xFF;
  zp.spo2Battery = data[651] & 0xFF;
  return zp;
}

/**
 * 将数据转换为中央台数据包
 *
 * @param hp 数据包
 * @param mmhg 血压数据
 * @returns 返回转换后的中央台数据
 */
export function convertZCenterBytes(hp: HardwarePacket, mmhg?: MmhgPacket) {
  let pkgSize = 652;
  let result = new Array(pkgSize);
  result[0] = 0x12;
  result[1] = 0x26;
  result[2] = 0x01;//包类型 ，实时数据包
  result[3] = ((pkgSize >>> 8) & 0xff);
  result[4] = ((pkgSize) & 0xff);
  result[5] = ((hp.orderNum) & 0xff);//排序号

  let deviceId = binary.hexToNumber(hp.deviceId);
  result[6] = ((deviceId >>> 24) & 0xff);
  result[7] = ((deviceId >>> 16) & 0xff);
  result[8] = ((deviceId >>> 8) & 0xff);
  result[9] = ((deviceId) & 0xff);
  let pkgSn = hp.packetSn;
  result[10] = ((pkgSn >>> 24) & 0xff);
  result[11] = ((pkgSn >>> 16) & 0xff);
  result[12] = ((pkgSn >>> 8) & 0xff);
  result[13] = ((pkgSn) & 0xff);
  let resp = hp.respList;
  for (let i = 0, v; i < resp.length; i++) {
    v = resp[i];
    result[14 + i * 2] = ((v >>> 8) & 0xff);
    result[14 + i * 2 + 1] = ((v) & 0xff);
  }
  let abdominal = hp.abdominalList;
  if (abdominal != null) {
    for (let i = 0, v; i < abdominal.length; i++) {
      v = abdominal[i];
      result[64 + i * 2] = ((v >>> 8) & 0xff);
      result[64 + i * 2 + 1] = ((v) & 0xff);
    }
  }

  let ecg = hp.ecgList;
  for (let i = 0, v; i < ecg.length; i++) {
    v = ecg[i];
    result[114 + i * 2] = ((v >>> 8) & 0xff);
    result[114 + i * 2 + 1] = ((v) & 0xff);
  }
  let spo2 = hp.spo2List;
  for (let i = 0; i < spo2.length; i++) {
    result[514 + i] = ((spo2[i]) & 0xff);
  }
  let hr = hp.hr < 0 ? 0 : hp.hr;
  result[564] = ((hr >>> 8) & 0xff);
  result[565] = ((hr) & 0xff);
  result[566] = ((hp.rr) & 0xff);
  result[567] = ((hp.pulseRate >>> 8) & 0xff);
  result[568] = ((hp.pulseRate) & 0xff);
  result[569] = ((hp.temperature >>> 8) & 0xff);
  result[570] = ((hp.temperature) & 0xff);
  result[571] = hp.spo2;
  result[572] = ((hp.deviceOuterBattery) & 0xff);
  result[573] = (hp.ecgConnState
    //| hp.spo2ConnState << 1
    | 0 << 1//如果1位是1，会报体温脱落报警，应该是血氧报警才对，可能中央台写错了，改成0都不报警了
    //| hp.temperatureConnState << 2
    //| hp.spo2ProbeConnState << 3
    | 0 << 3
    | hp.elecMmhgConnState << 4);

  result[574] = (hp.hrAlarm
    | hp.hrAlarm << 2
    | hp.plusRateAlarm << 4);
  //| hp.getTemperatureAlarm() << 6);
  result[575] = (hp.spo2Alarm
    | hp.deviceOuterBatteryAlarm << 2
    //| hp.temperatureAlarm << 4
    | hp.spo2BatteryAlarm << 6);
  result[576] = (hp.gesture & 0xff);
  /*//体位占字节后4位，心率失常预警占前4位
  result[576] = (hp.gesture
      | hp.gesture << 1
      | hp.gesture << 2
      | hp.gesture << 3
      | hp.arrhythmiaType << 4
      | hp.arrhythmiaType << 5
      | hp.arrhythmiaType << 6
      | hp.arrhythmiaType << 7
  );*/

  result[577] = (Math.abs(hp.wifiSignal) & 0xff);
  result[578] = (getInt(hp.calibration, 0) & 0xff);
  result[579] = (getInt(hp.eiRatio, 0) & 0xff);
  result[580] = (getInt(hp.caRatio, 0) & 0xff);
  let tidalVolume = hp.tidalVolume;
  if (tidalVolume != null) {
    for (let i = 0; i < tidalVolume.length; i++) {
      let v = tidalVolume[i];
      result[581 + i * 2] = ((v >>> 8) & 0xff);
      result[581 + i * 2 + 1] = ((v) & 0xff);
    }
  }
  result[631] = (getInt(hp.arrhythmiaType, 0) & 0xff);
  //体位占俩字节
  result[632] = (getInt(hp.acceleration, 0) >>> 8 & 0xff);
  result[633] = (getInt(hp.acceleration, 0) & 0xff);
  result[634] = (getInt(hp.step, 0) & 0xff);
  result[635] = (getInt(hp.sportsTrend, 0) & 0xff);

  // 数据包时间
  result[636] = ((hp.time >>> 24) & 0xff);
  result[637] = ((hp.time >>> 16) & 0xff);
  result[638] = ((hp.time >>> 8) & 0xff);
  result[639] = (hp.time & 0xff);

  if (mmhg != null) {
    result[640] = ((mmhg.time >>> 24) & 0xff);
    result[641] = ((mmhg.time >>> 16) & 0xff);
    result[642] = ((mmhg.time >>> 8) & 0xff);
    result[643] = (mmhg.time & 0xff);

    result[644] = ((mmhg.systolic >>> 8) & 0xff);
    result[645] = (mmhg.systolic & 0xff);
    result[646] = ((mmhg.diastolic >>> 8) & 0xff);
    result[647] = (mmhg.diastolic & 0xff);
  }

  let vol = binary.numberToBytes(getInt(hp.volume, 0), 32);
  binary.arraycopy(vol, 0, result, 648, 2);

  result[650] = (hp.circle != null ? hp.circle : 0);
  result[651] = (hp.spo2ConnState == 0 ? hp.spo2Battery : 0);

  return result;
}

function getInt(v: number, defaultValue: number = 0) {
  return (typeof v !== "undefined" || v != null) ? v : defaultValue;
}

/**
 * 中央台的数据包
 */
export interface ZCenterPacket {
  /**
   * 用户ID
   */
  userId: string;

  /**
   * head， [0, 1]
   */
  head: string;
  /**
   * [2]
   */
  packageType: number;

  /**
   * [3, 4]
   */
  length: number;

  /**
   * [5]
   */
  orderNum: number;

  /**
   * 设备ID, [6, 7, 8, 9]
   */
  deviceId: string;

  /**
   * 包序号, [10, 11, 12, 13]
   */
  packageSn: number;

  /**
   * 胸呼吸, [14, ..., 63]
   */
  respList: number[];

  /**
   * 腹呼吸, [64, ..., 113]
   */
  abdominalList: number[];

  /**
   * 心电波形, [114, ..., 513]
   */
  ecgList: number[];

  /**
   * 血氧波形, [514, ..., 563]
   */
  spo2List: number[];

  /**
   * 心率, [564, 565]
   */
  hr: number;
  /**
   * 呼吸率, [566]
   */
  rr: number;
  /**
   * 脉率, [567, 568]
   */
  pulseRate: number;
  /**
   * 体温, [569, 570]
   */
  temperature: number;
  /**
   * 血氧, [571]
   */
  spo2: number;
  /**
   * 外部电池, [572]
   */
  outBattery: number;
  /**
   * 连接异常, [573]
   */
  connAbnormal: number;
  /**
   * signal异常, [574]
   */
  signalAbnormal: number;
  /**
   * 其他异常, [575]
   */
  otherAbnormal: number;

  /**
   * 体位, [576]
   */
  gesture: number;
  /**
   * wifi信号, [577]
   */
  wifiSignal: number;
  /**
   * 肺康复，是否校准,用于在pad端显示校准过的还是呼吸波形, [578]
   */
  calibration: number;
  /**
   * 实时呼吸比, [579]
   */
  eiRatio: number;
  /**
   * 实时胸腹呼吸共享比, [580]
   */
  caRatio: number;
  /**
   * 潮气量, [581, ..., 630]
   */
  tidalVolumeList: number[];
  /**
   * 心率告警, [631]
   * <p>
   * NORMAL_SINUS_RHYTHM = prepare_1, // 窦性心律
   * SINUS_TACHYCARDIA = prepare_2, // 窦性心动过速
   * SINUS_BRADYCARDIA = 3, // 窦性心动过缓
   * SUPRAVENTRICULAR_PREMATURE_CONTRACTION = 4, // 室上性期前收缩
   * PAC_BIGEMINY = 5, // 室上性期前收缩二联律
   * PAC_TRIGEMINY = 6, // 室上性期前收缩三联律
   * PAIR_PAC = 7, // 成对室上性期前收缩
   * SHORT_TUN = 8, // 短阵室上性心动过速
   * ATRIAL_FIBRILLATION = 9, // 心房颤动
   * ATRIAL_FLUTTER = 10, // 心房扑动
   * PREMATURE_VENTRICULAR_CONTRACTION = 11, // 室性期前收缩
   * PVC_BIGEMINY = 12, // 室性期前收缩二联律
   * PVC_TRIGEMINY = 13, // 室性期前收缩三联律
   * PAIR_PVC = 14, // 成对室性期前收缩
   * VENTRICULAR_TACHYCARDIA = 15, // 室性心动过速
   * VENTRICULAR_FIBRILLATION = 16, // 室颤
   * LONG_RR_INTERVAL = 17, // 长RR间期
   * BEAT_STOP = 18, // 停搏
   */
  hrAlarm: number;
  /**
   * 加速度, [632, 633]
   */
  acceleration: number;
  /**
   * 步数, [634]
   */
  step: number;
  /**
   * 运动趋势, [635]
   */
  sportTrends: number;
  /**
   * 时间, [636, 637, 638, 639]
   */
  time: number;
  /**
   * 血压时间, [640, 641, 642, 643]
   */
  bpTime: number;
  /**
   * 收缩压, [644, 645]
   */
  systolic: number;
  /**
   * 舒张压, [646, 647]
   */
  diastolic: number;
  /**
   * volume, [648, 649]
   */
  volume: number;
  /**
   * 加圈, [650]
   */
  circle: number;
  /**
   * spo2电池电量, [651]
   */
  spo2Battery: number;

}

/**
 * 异常状态
 */
export class AlarmStatus {

  /**
   * 心电导联状态
   */
  isEcgFallOff(zp: ZCenterPacket): boolean {
    return (zp.connAbnormal & 0b00000001) > 0;
  }

  /**
   * 血氧连接脱落报警
   */
  isSpo2FallOff(zp: ZCenterPacket): boolean {
    return (zp.connAbnormal & 0b00000010) > 0;
  }

  /**
   * 心率报警  0：无  1：低 2：高
   */
  getHrAlarm(zp: ZCenterPacket): number {
    return (zp.signalAbnormal & 0b00000011);
  }

  /**
   * 呼吸率报警：0：无 1：低 2：高
   */
  getRrAlarm(zp: ZCenterPacket): number {
    return ((zp.signalAbnormal & 0b00001100) >>> 2);
  }

  /**
   * 呼吸率报警：0：无 1：低 2：高
   */
  getPlusRateAlarm(zp: ZCenterPacket): number {
    return ((zp.signalAbnormal & 0b00110000) >>> 2);
  }

  /**
   * 血氧异常报警
   */
  isSpo2Alarm(zp: ZCenterPacket): boolean {
    return (zp.otherAbnormal & 0b00000011) > 0;
  }

  /**
   * 外部电池异常报警
   */
  isDeviceOutBatteryAlarm(zp: ZCenterPacket): boolean {
    return (zp.otherAbnormal & 0b00001100) > 0;
  }

  /**
   * 血氧电池异常报警
   */
  isSpo2BatteryAlarm(zp: ZCenterPacket): boolean {
    return (zp.otherAbnormal & 0b11000000) > 0;
  }
}


export interface MmhgPacket {
  /**
   * 时间戳，精确到秒
   */
  time: number;
  /**
   * 设备ID(可能是采集启动的ID、或者是设备自己的序列号)
   */
  deviceId: string;
  /**
   * 设备MAC地址
   */
  mac: string;
  /**
   * 收缩压
   */
  systolic: number;
  /**
   * 舒张压
   */
  diastolic: number;
}

/**
 * 体动
 */
export interface Gesture {
  /**
   * 类型
   */
  readonly type: number,
  /**
   * 描述
   */
  readonly description: string,
}

export const gesture_zhanhuozuo = <Gesture>{ type: 1, description: '站或坐' };
export const gesture_yangwo = <Gesture>{ type: 2, description: '仰卧' };
export const gesture_fuwo = <Gesture>{ type: 3, description: '俯卧' };
export const gesture_youwo = <Gesture>{ type: 4, description: '右卧' };
export const gesture_zuowo = <Gesture>{ type: 5, description: '左卧' };
export const gesture_weidong = <Gesture>{ type: 6, description: '微动' };
export const gesture_huodong = <Gesture>{ type: 7, description: '活动' };
export const gesture_yundong = <Gesture>{ type: 8, description: '运动' };
export const gesture_wochuang = <Gesture>{ type: 2 & 3 & 4 & 5, description: '卧床' };
export const gesture_qita = <Gesture>{ type: Number.MAX_VALUE, description: '其它' };

export const gestures = [
  gesture_zhanhuozuo,
  gesture_yangwo,
  gesture_fuwo,
  gesture_youwo,
  gesture_zuowo,
  gesture_weidong,
  gesture_huodong,
  gesture_yundong,
  gesture_wochuang,
  gesture_qita,
];

/**
 * 查找姿势
 */
export const findGesture = (type: number | string) => gestures.find(g => (typeof type === 'number' && (g.type & type) != 0) || (type as string)?.includes(g.description));

/**
 * 姿势的数字索引转粗力度中文表述
 */
export function ofGesture(type: number): string {
  let g;
  switch (type) {
    case 1:
      g = gesture_zhanhuozuo;
      break;
    case 2:
    case 3:
    case 4:
    case 5:
      g = gesture_wochuang;
      break;
    case 6:
    case 7:
    case 8:
      g = gesture_huodong;
      break;
    case 9:
    default:
      g = gesture_qita;
      break
  }
  return g.description;
}

// 告警状态
export const alarmStatus = new AlarmStatus();
