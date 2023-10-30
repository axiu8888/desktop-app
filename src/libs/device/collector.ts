
// ================================================================================================================
// 采集器解析

import { ByteBuf, binary } from "../binary-helper";
import { utils } from "../core";


// 采集器包头
const HEAD = [0x55, 0xAA];

/**
 * 采集器设备
 */
export class CollectorDevice implements CollectorDataListener {

  readonly jointer = new PacketJointer();
  /**
 * 数据缓冲区
 */
  readonly buf = new ByteBuf();
  /**
   * 采集器ID
   */
  deviceId: string = '';
  /**
   * 设备的MAC地址
   */
  macAddress: string = '';

  constructor(listener?: CollectorDataListener) {
    if (listener?.onNotify) this.onNotify = listener.onNotify;
    if (listener?.onPacketLost) this.onPacketLost = listener.onPacketLost;
  }

  /**
   * 解析数据
   */
  resolve(data: number[] | Uint8Array): void {
    let buf = this.buf;
    buf.write(data);
    let jointer = this.jointer;
    // 读取缓存，解析数据
    while (buf.size() >= 9) { // 至少需要9个字节的数据
      let start = buf.find(HEAD);
      if (start >= 0) {
        if (start != 0) {
          buf.read(0, start); // 丢弃前面错误的数据，然后重新读取
          continue;
        }
        // 解析数据
        let segment = buf.read(start, 9, false);
        let len = parser.getLength(segment) + HEAD.length; // 数据的长度
        let hexDeviceId = parser.getDeviceId(segment);
        if (buf.size() >= len) {
          // 满足需要读取的长度
          segment = buf.read(start, len, false);
          // console.log(`${hexDeviceId}, len: ${len}, verify: ${parser.verify(segment)}, checkSum: ${parser.checkSum(segment)}, segment: ${binary.bytesToHex(segment)}`)
          // 验证校验和
          if (parser.verify(segment)) {
            buf.read(start, len); // 读取无用的数据
            // 数据类型
            let type = parser.getPacketType(segment);
            // 符合数据规则，解析
            if (type.data) { // 如果是小包数据，就缓存，否则直接转发出去
              if (segment.length <= 400) {
                // 检查是否需要拼接数据，解析数据
                let jp = jointer.add(segment);
                if (jp) {
                  let data = jointer.joint(jp);
                  let hp = parser.parse(data, hexDeviceId);
                  // 直接转发出去
                  this.onNotify(hexDeviceId, data, type, hp);
                } else {
                  // 数据超时了
                  jointer.checkTimeout((jp: JointPacket) => this.onPacketLost(jp));
                }
              } else {
                let hp = parser.parse(segment, hexDeviceId);
                // 直接转发出去
                this.onNotify(hexDeviceId, segment, type, hp);
              }
            } else {
              // 直接转发出去
              if (type == packet_blood_pressure_data || type == packet_blood_pressure_measure) {
                let packet: BpPacket | undefined;
                if (type == packet_blood_pressure_data) {
                  // 血压数据
                  let bpRcvTime = (this as any).bpRcvTime;
                  if (bpRcvTime && (Date.now() - bpRcvTime <= 10_000)) {
                    // 10秒内不重复接收数据
                    return;
                  }
                  packet = parser.parseBp(hexDeviceId, segment);
                }
                this.onNotify(hexDeviceId, segment, type, packet);
              } else {
                this.onNotify(hexDeviceId, segment, type, undefined);
              }
            }
          } else {
            // 符合，丢弃
            buf.read(0, HEAD.length);
            continue; // 继续下一次解析
          }
        }
      } else {
        // 丢弃错误的数据
        buf.clear();
        return;
      }
    }
  }

  onNotify(hexDeviceId: string, data: number[] | Uint8Array, type: PacketType, packet?: HardwarePacket | BpPacket | undefined): void {
    throw new Error("Method not implemented.");
  }

  onPacketLost(lost: JointPacket): void {
    throw new Error("Method not implemented.");
  }

}

export interface CollectorDataListener {
  /**
   * 接收到数据
   *
   * @param hexDeviceId 16进制的设备ID
   * @param data 字节数据
   * @param type 数据类型
   * @param packet 实时或重传的数据包 | 血压数据包
   */
  onNotify(hexDeviceId: string, data: number[] | Uint8Array, type: PacketType, packet?: HardwarePacket | BpPacket | undefined): void;

  /**
   * 丢弃不完整的拼包
   */
  onPacketLost(lost: JointPacket): void;
}

/**
 * 电池电量的类型
 */
export enum BatteryType {
  /**
   * 0：采集器内部电池
   */
  collector_inner = 0,
  /**
   * 1：采集器外部电池
   */
  collector_outer = 1,
  /**
   * 2：体温计电池
   */
  thermometer = 2,
  /**
   * 3：血氧计电池
   */
  oximeter = 3,
  /**
   * 4：血压计电池
   */
  sphygmomanometer = 4,
  /**
   * 5： 流速仪
   */
  flowmeter = 5,
}

function ofBatteryType(type: number): BatteryType {
  switch (type) {
    case 0x00:
      return BatteryType.collector_inner;
    case 0x01:
      return BatteryType.collector_outer;
    case 0x02:
      return BatteryType.thermometer;
    case 0x03:
      return BatteryType.oximeter;
    case 0x04:
      return BatteryType.sphygmomanometer;
    case 0x05:
      return BatteryType.flowmeter;
    default:
      return 0;
  }
};


/**
 * 解析器
 */
export class CollectorParser {
  /**
   * 缓存电池电量
   */
  batteryCache = new Map<string, Map<BatteryType, number>>();
  /**
   * 波形高位需要相 & 的位
   */
  WAVE_BIT = [
    0b00000011, // 3
    0b00001100, // 12
    0b00110000, // 48
    0b11000000, // 192
  ];
  /**
   * 移位
   */
  MOVE = [0, 2, 4, 6];

  /**
   * 拼接数据包
   *
   * @param {number[]|Array} segment1 小包1
   * @param {number[]|Array} segment2 小包2
   * @param {number[]|Array} segment3 小包3
   * @returns
   */
  joint(
    segment1: number[] | number[],
    segment2: number[] | number[],
    segment3: number[] | number[]
  ) {
    // 拼接
    let data = new Array(545);
    // 包头(2) + 长度(2) + 设备ID(4) + 包类型(1) + 包序号(4) ==>: 13
    binary.arraycopy(segment1, 0, data, 0, 13); // total(0, 13]
    // 长度
    let lenBytes = binary.numberToBytes(data.length - 2, 16);
    binary.arraycopy(lenBytes, 0, data, 2, 2);
    data[8] = 0x03; // 包类型
    // 时间(4), (14, 19)    p(13, 18) segment1.length =>: 197
    binary.arraycopy(segment1, 14, data, 13, 6); // 14 + 6 = 20
    // 数据, segment1(19, 69)(呼吸波型)   p(19, 118) segment1.length =>: 197
    binary.arraycopy(segment1, 20, data, 19, 50); // 20 + 50 = 70
    // 数据, segment1(70, 195)    p(119, 245) segment1.length =>: 197
    binary.arraycopy(segment1, 70, data, 119, 126); // 119 + 126 = 245
    // 数据, segment2(14, 189) segment2.length =>: 191
    binary.arraycopy(segment2, 14, data, 245, 190 - 14); // 245 + 125 = 370
    // 空出一个字节
    // 370
    // 数据, segment3(14, 187) segment1.length =>: 188
    binary.arraycopy(segment3, 14, data, 371, 187 - 14); // 371 + 173 = 544
    // 校验和
    data[544] = this.checkSum(data);
    return data;
  }

  /**
   * 检查是否为 0x55, 0xAA
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns
   */
  isHead(data: number[] | number[], start = 0) {
    return data[start] == 0x55 && data[start + 1] == 0xaa;
  }

  /**
   * 获取数据类型
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns 返回类型
   */
  getType(data: number[] | number[], start = 8): number {
    return data[start];
  }

  /**
   * 获取数据类型
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns 返回类型
   */
  getPacketType(data: number[] | number[], start = 8): PacketType {
    return findPacketType(data[start]);
  }

  /**
   * 数据的长度，不包括包头的2个字节
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns 返回长度
   */
  getLength(data: number[] | number[], start = 2) {
    return binary.bytesToNumber([data[start], data[start + 1]]);
  }

  /**
   * 解析设备ID
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns 返回16进制的设备ID
   */
  getDeviceId(data: number[] | number[], start = 4) {
    return binary.bytesToHex([data[start], data[start + 1], data[start + 2], data[start + 3]]);
  }

  /**
   * 计算校验和
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns 返回校验和
   */
  checkSum(data: number[] | number[], start = 0) {
    let sum = 0;
    for (let i = start; i < data.length - 1; i++) {
      sum += (data[i] & 0xFF);
    }
    return sum & 0xFF;
  }

  /**
   * 验证
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns 返回验证结果：true/false
   */
  verify(data: number[] | number[], start = 0) {
    if (!this.isHead(data, start)) {
      // 不符合包头
      return false;
    }

    if (this.getLength(data, start + 2) !== data.length - 2) {
      // 长度不符合
      return false;
    }

    // 检查校验和
    return this.checkSum(data, start) == data[data.length - 1];
  }

  /**
   * 是否为数据包
   *
   * @param data 数据
   * @param start 开始的位置
   * @returns 返回判断结果
   */
  isData(data: number[] | number[], start = 0): boolean {
    let type = this.getPacketType(data, start);
    return type && (type as any).data;
  }

  /**
   * 是否为实时数据包
   *
   * @param data 数据
   * @param start 开始的位置
   * @returns 返回判断结果
   */
  isRealtimeData(data: number[] | number[], start = 0): boolean {
    return this.getPacketType(data, start).realtime;
  }


  /**
   * 转换为UDP数据
   *
   * @param {number[]|Array} bytes 数据
   * @param {*} deviceId 设备ID
   * @param {*} time 时间戳
   * @param {*} packetSn 包序号
   * @returns 返回转换后的UDP数据
   */
  convertToUdp(
    bytes: number[] | number[],
    deviceId: any,
    time?: number,
    packetSn?: number
  ) {
    let data = new Array(545);
    // 包头
    data[0] = 0x55;
    data[1] = 0xaa;
    // 长度
    data[2] = 0x02;
    data[3] = 0x1f;

    // 设备ID
    if (deviceId) {
      deviceId =
        deviceId.length == 4 ? deviceId : binary.hexToBytes(deviceId);
      // 4 ~ 7
      binary.arraycopy(deviceId, 0, data, 4, 4);
    }

    // 类型
    data[8] = 0x03;

    // 拷贝数据，start: 9,
    // len: 2(head) + 2(length) + 4(deviceId) + 1(type) + 1(checkSum)
    binary.arraycopy(bytes, 0, data, 9, data.length - 10);

    // 包序号
    if (packetSn && packetSn > 0) {
      // start:
      let buf = binary.numberToBytes(packetSn, 32, true);
      binary.arraycopy(buf, 0, data, 9, buf.length);
    }

    // 修改时间
    if (time && time > 0) {
      let prefix = binary.numberToBytes(time / 1000, 32, true);
      let suffix = binary.numberToBytes(time % 1000, 16, true);
      binary.arraycopy(prefix, 0, data, 13, prefix.length);
      binary.arraycopy(suffix, 0, data, 17, suffix.length);
    }
    // 校验和
    data[data.length - 1] = this.checkSum(data);
    return data;
  }

  /**
   * 获取包序号
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns 返回包序号
   */
  getPacketSn(data: number[] | number[], start = 9) {
    return binary.bytesToNumber([
      data[start],
      data[start + 1],
      data[start + 2],
      data[start + 3],
    ]);
  }

  /**
   * 获取时间(秒)
   *
   * @param {number[]|Array} data 数据
   * @param {number} start 开始的位置
   * @returns 返回时间(秒)
   */
  getTime(data: number[] | number[], start = 13) {
    return binary.bytesToNumber([
      data[start],
      data[start + 1],
      data[start + 2],
      data[start + 3],
    ]);
  }

  /**
   * 解析
   *
   * @param data      待解析的数据
   * @param deviceId  设备ID
   * @return 返回解析的采集器数据
   */
  parse(data: number[] | number[], deviceId: string) {
    let hp = <HardwarePacket>{};
    // 数据包长度: (2 ~ 3)
    hp.packetLength = this.getLength(data);
    // 设备ID: (4 ~ 7)
    hp.deviceId = !deviceId
      ? binary.bytesToHex([data[4], data[5], data[6], data[7]])
      : deviceId;
    // 数据类型: (8) ...
    hp.type = this.getType(data);
    hp.realtime = hp.type == 0x03 || hp.type == 0x83;

    // 包序号: (9 ~ 12)
    hp.packetSn = this.getPacketSn(data);
    // 获取设备时间: (13 ~ 18)
    hp.time = this.getTime(data);

    // 胸呼吸波形: (19 ~ 68) => 50
    hp.rawRespList = this.parseArray(data, 19, 69, 2);
    // 腹呼吸波形: (69 ~ 118) => 50
    hp.rawAbdominalRespList = this.parseArray(data, 69, 119, 2);
    // 心电波形: (119 ~ 370) => [4 * (50 + 13) = 252]
    hp.ecgList = this.parseWave(data, 119, 4, 50);
    // 加速度波形数据 (371, 466) => 96
    // X轴 (371, 402) => [25 + 7 = 32]
    hp.xList = this.parseWave(data, 371, 1, 25);
    // Y轴 (403, 434) => [25 + 7 = 32]
    hp.yList = this.parseWave(data, 403, 1, 25);
    // Z轴 (435, 466) => [25 + 7 = 32]
    hp.zList = this.parseWave(data, 435, 1, 25);
    // 血氧波形: (467, 516) => 50
    hp.spo2List = this.parseSpo2Array(data, 467, 517);

    // 包含流速仪数据: (544, 668)
    if (hp.type == 0x83) {
      hp.flowmeter = true;
      // 流速仪第0组数据 (544, 549]
      // 25组，
      // 第一组:
      // 吹气或呼吸(0/1)，1个字节(544)
      // 实时流速值 ml/s，2个字节(545, 547]
      // 实时容积 ml，2个字节(547, 549]
      let breath = new Array<number>(25);
      let realtimeFlowVelocity = new Array<number>(25);
      let realTimeVolume = new Array<number>(25);
      for (let i = 0, j = 9 + 544; i < 25; i++, j += 5) {
        breath[i] = data[i + j];
        realtimeFlowVelocity[i] = binary.bytesToNumber([
          data[i + j + 1],
          data[i + j + 2],
        ]);
        realTimeVolume[i] = binary.bytesToNumber([
          data[i + j + 3],
          data[i + j + 4],
        ]);
      }
      hp.breath = breath;
      hp.realtimeFlowVelocity = realtimeFlowVelocity;
      hp.realtimeVolume = realTimeVolume;
    }

    // 体温时间: (517, 520)
    hp.temperatureTime = this.getTime(data, 517);

    // 参数高位：(521)
    let paramHigh = data[521];
    // 设备功耗过高标志       (5)
    hp.deviceOverload = paramHigh & (0b00100000 >> 5);
    // 胸呼吸连接标志( 0 连接 (6)
    hp.respConnState = paramHigh & (0b01000000 >> 6);
    // 腹呼吸连接标志( 0 连接 (7)
    hp.abdominalConnState = paramHigh & (0b10000000 >> 7);
    // 血氧信号强度(522)
    hp.spo2Signal = data[513];
    // 胸呼吸系数(514)
    hp.respRatio = data[523];
    // 腹呼吸系数(515)
    hp.abdominalRatio = data[524];
    // 体温(525)
    hp.temperature =
      ((paramHigh & (0b00000100 >> 2)) << 8) | (data[525]);
    // 血氧饱和度(526)
    hp.spo2 = data[526];

    // 设备状态: (518)   ... 0 为正常; / 1 为告警;
    // 开机标志在开机第一包数据该位置 1,
    // 其他数据包该位置 0;
    // 时间设置标志开机置 1,在接收到时间设备指令后置 0

    let deviceState = data[527];
    // 心电导联脱落状态
    hp.ecgConnState = deviceState & 0b00000001;
    // 血氧探头脱落标志
    hp.spo2ProbeConnState = deviceState & (0b00000010 >> 1);
    // 体温连接断开标志
    hp.temperatureConnState = deviceState & (0b00000100 >> 2);
    // 血氧连接断开标志
    hp.spo2ConnState = deviceState & (0b00001000 >> 3);
    // 血压连接断开标志
    hp.elecMmhgConnState = deviceState & (0b00010000 >> 4);
    // 流速仪连接断开标志
    hp.flowmeterConnState = deviceState & (0b00100000 >> 5);
    // 时间设置标志
    hp.calibrationTime = deviceState & (0b01000000 >> 6);
    // 开机标志
    hp.powerOn = deviceState & (0b10000000 >> 7);

    // 电量提示：(528)   0 为正常; 1 为告警
    let batteryHint = data[528];
    // 外部电池电量低
    hp.deviceOuterBatteryAlarm = batteryHint & 0b00000001;
    // 蓝牙体温计电量低
    hp.temperatureBatteryAlarm = batteryHint & (0b00000010 >> 1);
    // 蓝牙血氧电量低
    hp.spo2BatteryAlarm = batteryHint & (0b00000100 >> 2);
    // 蓝牙血压计电量低
    hp.elecMmhgBatteryAlarm = batteryHint & (0b00001000 >> 3);
    // 流速仪电量低
    hp.flowmeterBatteryAlarm = batteryHint & (0b00010000 >> 4);

    // 状态开关: (529)，0为关; 1为开
    let switchState = data[529];
    // 蓝牙连接断开蓝闪
    hp.bluetoothConnSwitch = switchState & (0b00000001 >> 0);
    // 锂电池电量低绿闪
    hp.batteryLowLightSwitch = switchState & (0b00000010 >> 1);
    // 锂电池电量低震动
    hp.batteryLowShockSwitch = switchState & (0b00000100 >> 2);
    // 蓝牙设备电量低绿闪
    hp.bluetoothLightSwitch = switchState & (0b00001000 >> 3);
    // 蓝牙体温计开关位
    hp.temperatureSwitch = switchState & (0b00010000 >> 4);
    // 蓝牙血氧计开关位
    hp.spo2Switch = switchState & (0b00100000 >> 5);
    // 蓝牙血压计开关位
    hp.elecMmhgSwitch = switchState & (0b01000000 >> 6);
    // 蓝牙流速仪开关位
    hp.flowmeterSwitch = switchState & (0b10000000 >> 7);

    // 电量: (531)
    if (hp.realtime) {
      let batteryType = ofBatteryType(data[531]);
      if (
        batteryType != BatteryType.collector_inner &&
        batteryType != BatteryType.collector_outer
      ) {
        this.putBatteryLevel(deviceId, batteryType, data[531]);
      } else {
        let power = Math.floor(((((data[531]) - 15) * 5 + 3200 - 3300) / (4050 - 3300)) * 100);
        this.putBatteryLevel(
          deviceId,
          batteryType,
          Math.max(Math.min(power, 100), 0)
        );
      }
    }
    // 0：内部电池
    hp.deviceBattery = this.getBatteryLevel(
      deviceId,
      BatteryType.collector_inner
    );
    // 1：外部电池
    hp.deviceOuterBattery = this.getBatteryLevel(
      deviceId,
      BatteryType.collector_outer
    );
    // 2：体温计电池
    hp.temperatureBattery = this.getBatteryLevel(
      deviceId,
      BatteryType.thermometer
    );
    // 3：血氧计电池
    hp.spo2Battery = this.getBatteryLevel(deviceId, BatteryType.oximeter);
    // 4：血压计电池
    hp.elecMmhgBattery = this.getBatteryLevel(
      deviceId,
      BatteryType.sphygmomanometer
    );
    // 5：流速仪
    hp.flowmeterBattery = this.getBatteryLevel(deviceId, BatteryType.flowmeter);

    // WiFi信号强度(532)
    hp.wifiSignal = -(data[532]);
    // 脉率 (533)
    hp.pulseRate = (((paramHigh & 0xb00000010) >> 1) << 8) | (data[533]);

    // AP MAC (534, 548) ... 被用下面值的取代了
    let apMac = binary.arraycopy(data, 534, [], 0, 4);
    hp.apMac = binary.bytesToHex(apMac);

    // 电池电量格数
    hp.batteryLevel = data[541];

    // 版本号 (539)
    let version = data[539];
    if (version != 0) {
      // 高位
      let high = (version & 0b11100000) >>> 5;
      // 中位
      let middle = (version & 0b00011100) >>> 2;
      // 低位
      let low = version & 0b00000011;
      // 固件版本
      hp.versionCode = (high << 5) | (middle << 2) | low;
      hp.versionName = high + '.' + middle + '.' + low;
    }

    return hp;
  }

  /**
   * 解析成整形类型的字节数组
   *
   * @param data    数据
   * @param start   开始位置
   * @param end     结束位置(不包含)
   * @param bitSize 每个数据占几个字节
   * @return 返回计算后的数组
   */
  parseArray(
    data: number[] | number[],
    start: number,
    end: number,
    bitSize: number
  ) {
    if (bitSize > 0) {
      let array = new Array((end - start) / bitSize);
      let buf = bitSize > 1 ? new Array<number>(bitSize) : null;
      for (let i = 0, j = start; i < array.length; i++, j += bitSize) {
        if (bitSize == 1) {
          array[i] = data[j + 1];
        } else {
          binary.arraycopy(data, j, buf!, 0, bitSize);
          array[i] = binary.bytesToNumber(buf!);
        }
      }
      return array;
    }
    throw new Error('bitSize >= 1');
  }

  /**
   * 解析波形数据
   *
   * @param data 数据
   * @param start 开始的位置，如心电在第119个字节
   * @param group 组数，如心电为4组
   * @param perGroupSize 每组大小，如心电每组50个值，附：心电有50个低位值
   */
  parseWave(
    data: number[] | number[],
    start: number,
    group: number,
    perGroupSize: number
  ) {
    let highLen = Math.floor(perGroupSize / 4) + (perGroupSize % 4 == 0 ? 0 : 1);
    let high, low;
    let wave = new Array(group * perGroupSize);
    for (let g = 0; g < group; g++) {
      for (let i = 0, hi = -1; i < perGroupSize; i++) {
        hi = (i % 4 == 0 ? hi + 1 : hi);
        high = (data[start + g * (perGroupSize + highLen) + hi] >> ((i % 4) * 2)) & 0b00000011;
        low = data[start + g * (perGroupSize + highLen) + highLen + i];
        wave[g * perGroupSize + i] = binary.bytesToNumber([high, low]);
      }
    }
    return wave;
  }

  /**
   * 解析成整形类型的字节数组
   *
   * @param data    数据
   * @param start   开始位置
   * @param end     结束位置(不包含)
   * @return 返回计算后的数组
   */
  parseSpo2Array(data: number[] | number[], start: number, end: number) {
    let wave = this.parseArray(data, start, end, 1);
    for (let i = 0; i < wave.length; i++) {
      wave[i] = wave[i] & 0b01111111;
    }
    return wave;
  }

  /**
   * 获取设备对应的电池电量缓存
   *
   * @param deviceId 设备ID
   * @return 返回缓存的Map
   */
  getBatteryLevelCache(deviceId: string) {
    if (deviceId == null) {
      return null;
    }
    let map = this.batteryCache.get(deviceId);
    if (map == null) {
      map = new Map();
      this.batteryCache.set(deviceId, map);
    }
    return map;
  }

  /**
   * 保存电池电量数据
   *
   * @param deviceId     设备ID
   * @param type         类型
   * @param batteryLevel 电池电量
   */
  putBatteryLevel(deviceId: string, type: any, batteryLevel: any) {
    let map = this.getBatteryLevelCache(deviceId);
    if (map != null) {
      map.set(type, batteryLevel);
    }
  }

  /**
   * 获取电池电量
   *
   * @param deviceId 设备ID
   * @param type     类型
   * @return 返回电池电量
   */
  getBatteryLevel(deviceId: string, type: BatteryType): number {
    let map = this.getBatteryLevelCache(deviceId);
    let v = 0;
    if (map != null) {
      v = map.get(type) as any;
    }
    return v;
  }

  parseBp(deviceId: string, data: number[] | Uint8Array): BpPacket {
    //ERR 0:测量成功
    //ERR 1:传感器信号异常
    //ERR 2:测量不出结果
    //ERR 3:测量结果异常
    //ERR 4:腕带过松或漏气
    //ERR 5:腕带过紧或气路堵塞
    //ERR 6:测量中压力干扰严重
    //ERR 7:压力超 300
    //ERR 8:连接血压计失败
    let err = (data[13] & 0b11110000) >> 4;

    let time = binary.bytesToNumber([data[9], data[10], data[11], data[12]]) * 1000;
    // 修复：没有传时间，默认取当前时间
    time = time > 0 ? time : Date.now();
    let bp = <BpPacket>{
      deviceId: deviceId, // 设备ID
      err: err, // 错误
      time: time, // // 时间
      date: utils.dateFmt(time), // 血压的测量时间
      systolic: binary.bytesToNumber([(data[13] & 0b00000001), data[14]]), // 收缩压
      diastolic: binary.bytesToNumber([((data[13] & 0b00000010) >> 1), data[15]]), // 舒张压
      avg: binary.bytesToNumber([((data[13] & 0b00000100) >> 2), data[16]]), // 平均压
      bloodHr: binary.bytesToNumber([((data[13] & 0b00001000) >> 3), data[17]]), // 心率
    };
    // 错误信息
    switch (err) {
      case 1:
        bp.errMsg = "传感器信号异常";
        break;
      case 2:
        bp.errMsg = "测量不出结果";
        break;
      case 3:
        bp.errMsg = "测量结果异常";
        break;
      case 4:
        bp.errMsg = "腕带过松或漏气";
        break;
      case 5:
        bp.errMsg = "腕带过紧或气路堵塞";
        break;
      case 6:
        bp.errMsg = "测量中压力干扰严重";
        break;
      case 7:
        bp.errMsg = "压力超 300";
        break;
      case 8:
        bp.errMsg = "连接血压计失败";
        break;
      default:
    }
    return bp;
  }
}


// 采集器解析
export const parser = new CollectorParser();

/**
 * 数据类型
 */
export class PacketType {
  constructor(
    public readonly name: string,
    public readonly type: number,
    public readonly up: boolean,
    public readonly down: boolean,
    public readonly data: boolean,
    public readonly realtime: boolean,
    public readonly description: string) { }
}

/**
 * 未知包类型
 */
export const packet_unknown = new PacketType('unknown', 0x00, false, false, false, false, '未知');
/**
 * 数据包类型
*/
export const packet_register = new PacketType('register', 0x01, true, false, false, false, '注册');
export const packet_realtime = new PacketType('realtime', 0x03, true, false, true, true, '实时数据');
export const packet_realtime2 = new PacketType('realtime2', 0xF3, true, false, true, true, '肺康复的数据包，包含流速仪数据');
export const packet_packet_retry = new PacketType('packet_retry', 0x08, false, true, true, false, '丢包重传：指令');
// export const packet_fast_upload = new PacketType('fast_upload', 0x10, false, true, true, false, '集中上传通用数据包');
export const packet_query_files = new PacketType('query_files', 0x10, true, true, false, false, '文件名查询包');
export const packet_centralize_packet_retry = new PacketType('centralize_packet_retry', 0x11, false, true, false, false, '集中重传：指令');
export const packet_feedback_fast_upload = new PacketType('feedback_fast_upload', 0x43, true, false, true, false, '集中上传通用数据包(响应)');
export const packet_feedback_packet_retry = new PacketType('feedback_packet_retry', 0x83, true, false, true, false, '丢包重传(响应)：请求集中重传数据包');
export const packet_che_1a = new PacketType('che_1a', 0xC3, true, false, true, false, '请求集中重传数据包');
export const packet_feedback_set_time = new PacketType('feedback_set_time', 0x09, true, false, false, false, '设置时间反馈');
export const packet_feedback_delete_log = new PacketType('feedback_delete_log', 0x0A, true, false, false, false, '删除日志文件反馈 10');
export const packet_feedback_switch_status = new PacketType('feedback_switch_status', 0x0B, true, false, false, false, '状态开关提示');
export const packet_unregister = new PacketType('unregister', 0x0C, true, false, false, false, '收到注销反馈包');
export const packet_feedback_bluetooth = new PacketType('feedback_bluetooth', 0x0D, true, false, false, false, '蓝牙配置反馈');
export const packet_feedback_realtime = new PacketType('feedback_realtime', 0x04, false, true, false, false, '实时数据反馈');
export const packet_blood_pressure_measure = new PacketType('blood_pressure_measure', 0x0E, true, false, false, false, '开始测量血压');
export const packet_blood_pressure_data = new PacketType('blood_pressure_data', 0x0F, true, false, false, false, '血压采集数据包');
export const packet_feedback_upgrade = new PacketType('feedback_upgrade', 0x20, true, false, false, false, '固件升级');
export const packet_get_ap = new PacketType('get_ap', 0x15, false, true, false, false, '获取AP信息');
export const packet_set_ap = new PacketType('set_ap', 0x14, false, true, false, false, '设置AP');
export const packet_get_device_info = new PacketType('get_device_info', 0x13, true, false, false, false, '获取设备的信息');
export const packet_simulate = new PacketType('simulate', 0xEE, false, false, false, false, '模拟程序');
export const packet_types = [
  packet_register,
  packet_realtime,
  packet_realtime2,
  packet_packet_retry,
  //packet_fast_upload,
  packet_query_files,
  packet_centralize_packet_retry,
  packet_feedback_fast_upload,
  packet_feedback_packet_retry,
  packet_che_1a,
  packet_feedback_set_time,
  packet_feedback_delete_log,
  packet_feedback_switch_status,
  packet_unregister,
  packet_feedback_bluetooth,
  packet_feedback_realtime,
  packet_blood_pressure_measure,
  packet_blood_pressure_data,
  packet_feedback_upgrade,
  packet_get_ap,
  packet_set_ap,
  packet_get_device_info,
  packet_simulate,
];

/**
 * 查找匹配类型
 */
export const findPacketType = (type: string | number | PacketType) => {
  let find = packet_types.find(pt => pt == type || pt.name === type || pt.type == type);
  return find ? find : packet_unknown;
}

/**
 * 数据包拼接器
 */
export class PacketJointer {

  /**
   * 缓存队列
   */
  private queue = new Map<number, JointPacket>();

  /**
   * 缓存数据的小包
   *
   * @param segment 小包
   * @returns 返回拼接后的数据
   */
  add(segment: number[] | number[]): JointPacket | undefined {
    let sn = parser.getPacketSn(segment);
    let jp = this.queue.get(sn);
    if (!jp) {
      this.queue.set(sn, jp = <JointPacket>{ sn: sn });
    }
    switch (segment[13] & 0xFF) {
      case 0:
        jp.pkg0 = segment;
        break;
      case 1:
        jp.pkg1 = segment;
        break;
      case 2:
        jp.pkg2 = segment;
        break;
      case 3:
        jp.pkg3 = segment;
        break;
    }
    jp.refreshTime = Date.now();
    if (this.verify(jp)) {
      this.queue.delete(jp.sn);
      return jp;
    }
    return undefined;
  }

  /**
   * 验证是否满足拼包
   *
   * @param jp 拼包
   * @returns 返回是否符合拼接
   */
  verify(jp: JointPacket): boolean {
    return jp.pkg0 && jp.pkg1 && jp.pkg2 && (jp.pkg0[8] != 0x83);
  }

  /**
   * 检查超时
   *
   * @param callback 回调
   * @param timeout 超时时长
   */
  checkTimeout(callback = (jp: JointPacket): void => { }, timeout = 2000) {
    this.queue.forEach(jp => {
      if (this.isTimeout(jp, timeout)) {
        try {
          callback(jp);
        } catch (err) {
          console.warn('拼接数据包超时数据', jp, err);
        } finally {
          this.queue.delete(jp.sn);
        }
      }
    });
  }

  /**
   * 判断是否超时
   *
   * @param jp 拼包
   * @param timeout 超时时长
   * @returns 返回是否超时
   */
  isTimeout(jp: JointPacket, timeout = 2000): boolean {
    return Date.now() - jp.refreshTime >= timeout; // 超过2两
  }

  /**
   * 拼接数据
   *
   * @param jp 拼包
   */
  joint(jp: JointPacket) {
    let segment1 = jp.pkg0
    let segment2 = jp.pkg1;
    let segment3 = jp.pkg2;
    let segment4 = jp.pkg3;

    let type = parser.getPacketType(segment1);

    let packet = new Array<number>(segment4 ? 670 : 545);
    // 包头(2) + 长度(2) + 设备ID(4) + 包类型(1) + 包序号(4) ==>: 13
    binary.arraycopy(segment1, 0, packet, 0, 13);// total(0, 13]
    // 长度
    let length = binary.numberToBytes(packet.length - 2, 16);
    binary.arraycopy(length, 0, packet, 2, length.length);
    // 设置类型
    if (type.realtime) {
      packet[8] = (segment4 != null ? 0xF3 : 0x03);
    }
    // 时间(4), (14, 19)    p(13, 18) segment1.length =>: 197
    binary.arraycopy(segment1, 14, packet, 13, 6); // 14 + 6 = 20
    // 数据, segment1(19, 69)(呼吸波型)   p(19, 118) segment1.length =>: 197
    binary.arraycopy(segment1, 20, packet, 19, 50); // 20 + 50 = 70
    // 数据, segment1(70, 195)    p(119, 245) segment1.length =>: 197
    binary.arraycopy(segment1, 70, packet, 119, 126); // 119 + 126 = 245
    // 数据, segment2(14, 189) segment2.length =>: 191
    binary.arraycopy(segment2, 14, packet, 245, 190 - 14); // 245 + 125 = 370
    // 空出一个字节
    // 370
    // 数据, segment3(14, 187) segment1.length =>: 188
    binary.arraycopy(segment3, 14, packet, 371, 187 - 14); // 371 + 173 = 544

    // 拷贝流速仪数据
    if (type.realtime && segment4 != null) {
      // 数据, segment4(14, 139) segment1.length =>: 140
      binary.arraycopy(segment4, 14, packet, 544, 139 - 14); // 544 + 125 = 669
    }
    // 设置校验和(545/670)
    packet[packet.length - 1] = parser.checkSum(packet);
    return packet;
  }

}

export interface JointPacket {
  sn: number;
  pkg0: any;
  pkg1: any;
  pkg2: any;
  pkg3: any;
  refreshTime: number;
}

/**
 * 采集器数据包
 */
export interface HardwarePacket {
  /**
   * 患者ID
   */
  personId: string;
  /**
   * 病区号
   */
  orgId: string;
  /**
   * 床号
   */
  orderNum: number;

  /**
   * 包长度
   */
  packetLength: number;
  /**
   * 包类型
   */
  packetType: PacketType;
  /**
   * 包类型
   */
  type: number;
  /**
   * 设备ID，16进制的设备ID，参考{@link #deviceCode}
   */
  deviceId: string;
  /**
   * 设备号，4个字节的设备编码，参考{@link #deviceId}
   */
  deviceCode: number;
  /**
   * 版本名
   */
  versionName: string;
  /**
   * 版本号：整形的数值
   */
  versionCode: number;
  /**
   * 是否实时数据包
   */
  realtime: boolean;
  /**
   * 包序号
   */
  packetSn: number;
  /**
   * 设备时间
   */
  deviceDate: string;
  /**
   * 设备时间戳（秒）
   */
  time: number;
  /**
   * 心电信号
   */
  ecgList: number[];
  /**
   * 三轴：X轴
   */
  xList: number[];

  /**
   * 三轴：Y轴
   */
  yList: number[];
  /**
   * 三轴：Z轴
   */
  zList: number[];
  /**
   * 呼吸list
   */
  rawRespList: number[];
  /**
   * 腹呼吸list
   */
  rawAbdominalRespList: number[];
  /**
   * 血氧list
   */
  spo2List: number[];

  /**
   * 体温计时间
   */
  temperatureTime: number;
  /**
   * 体温
   */
  temperature: number;
  /**
   * 脉率
   */
  pulseRate: number;
  /**
   * 设备功耗过高标识
   */
  deviceOverload: number;
  /**
   * 胸呼吸连接状态
   */
  respConnState: number;
  /**
   * 腹呼吸连接状态
   */
  abdominalConnState: number;
  /**
   * 血氧信号强度
   */
  spo2Signal: number;
  /**
   * 胸呼吸系数
   */
  respRatio: number;
  /**
   * 腹呼吸系数
   */
  abdominalRatio: number;
  /**
   * 血氧饱和度
   */
  spo2: number;
  /**
   * 开机数据包 1：开机数据包 0：非开机数据包
   */
  powerOn: number;
  /**
   * 时间校准参数，如果为1则需要发送时间校准指令
   */
  calibrationTime: number;
  /**
   * 电子血压计连接状态
   */
  elecMmhgConnState: number;
  /**
   * 血氧设备连接状态 0正常 1告警
   */
  spo2ConnState: number;
  /**
   * 体温设备连接状态
   */
  temperatureConnState: number;
  /**
   * 血氧设备探头连接状态
   */
  spo2ProbeConnState: number;
  /**
   * 心电导联脱落状态
   */
  ecgConnState: number;
  /**
   * 流速仪连接断开标识
   */
  flowmeterConnState: number;
  /**
   * 流速仪电量低告警
   */
  flowmeterBatteryAlarm: number;
  /**
   * 外部电池电量低告警
   */
  deviceOuterBatteryAlarm: number;
  /**
   * 蓝牙体温计电池电量低告警
   */
  temperatureBatteryAlarm: number;
  /**
   * 蓝牙血氧电池电量告警
   */
  spo2BatteryAlarm: number;
  /**
   * 蓝牙血压计电池电量低告警
   */
  elecMmhgBatteryAlarm: number;

  // ----------------开关  0-关 1-开
  /**
   * 流速计开关
   */
  flowmeterSwitch: number;
  /**
   * 血压计开关
   */
  elecMmhgSwitch: number;
  /**
   * 蓝牙血氧计开关
   */
  spo2Switch: number;
  /**
   * 蓝牙体温计开关
   */
  temperatureSwitch: number;
  /**
   * 锂电池电量低绿闪开关
   */
  batteryLowLightSwitch: number;
  /**
   * 锂电池电量低震动开关
   */
  batteryLowShockSwitch: number;
  /**
   * 蓝牙设备电量低绿闪
   */
  bluetoothLightSwitch: number;
  /**
   * 蓝牙设备连接断开蓝闪
   */
  bluetoothConnSwitch: number;

  // ----------------电量------------------
  /**
   * 设备电量
   */
  deviceBattery: number;
  /**
   * 体温计电量
   */
  temperatureBattery: number;
  /**
   * 血氧电量
   */
  spo2Battery: number;
  /**
   * 设备外部电池电量
   */
  deviceOuterBattery: number;
  /**
   * 电子血压计电量
   */
  elecMmhgBattery: number;
  /**
   * 流速计电量
   */
  flowmeterBattery: number;
  /**
   * wifi信号强度
   */
  wifiSignal: number;
  /**
   * 设备连接wifi热点的mac
   */
  apMac: string;

  /**
   * 是否启用肺康复的设备
   */
  flowmeter: boolean;
  /**
   * 是否是呼气
   */
  breath: number[];
  /**
   * 实时流速
   */
  realtimeFlowVelocity: number[];
  /**
   * 实时容积
   */
  realtimeVolume: number[];

  /**
   * 电池电量格数
   */
  batteryLevel: number;

  ///*************************************************/

  /**
   * 心率
   */
  hr: number;
  /**
   * 呼吸率
   */
  rr: number;
  /**
   * 体位
   */
  gesture: number;
  /**
   * 步数
   */
  step: number;
  /**
   * 能量，卡路里
   */
  energy: number;
  /**
   * 是否跌倒( 0 / 1 )
   */
  fall: number;
  /**
   * 运动趋势
   */
  sportsTrend: number;
  /**
   * 潮气量，已过时，目前是单独计算
   */
  volume: number;

  /**
   * 心率告警
   */
  hrAlarm: number;
  /**
   * 呼吸率告警
   */
  rrAlarm: number;
  /**
   * 脉率告警
   */
  plusRateAlarm: number;
  /**
   * 体温告警
   */
  temperatureAlarm: number;
  /**
   * 血氧告警
   */
  spo2Alarm: number;
  /**
   * 胸部呼吸，经过滤波过滤后的数据
   */
  respList: number[];
  /**
   * 腹部呼吸，经过滤波过滤后的数据
   */
  abdominalList: number[];

  /**
   * NORMAL_SINUS_RHYTHM = 1, // 窦性心律
   * SINUS_TACHYCARDIA = 2, // 窦性心动过速
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
  arrhythmiaType: number; //心律失常类型

  ///*************************************************/

  /**
   * 肺康复，是否校准,用于在pad端显示校准过的还是呼吸波形
   */
  calibration: number;
  /**
   * 实时呼吸比
   */
  eiRatio: number;
  /**
   * 实时胸腹呼吸共享比
   */
  caRatio: number;
  /**
   * 潮气量
   */
  tidalVolume: number[];

  /**
   * 加速度
   */
  acceleration: number;
  /**
   * 加速度拟合值（0-1024）
   */
  xyzOutList?: number[];
  /**
   * 呼吸暂停报警  0：无   1：有
   */
  apnea: number;
  /**
   * 加圈 0：无   1：有
   */
  circle: number;
}

/**
 * 血压数据包
 */
export interface BpPacket {

  /**
   * 时间戳，分钟
   */
  time: number;
  /**
   * 设备ID
   */
  deviceId: string;
  /**
   * 测量方式: 0 和 1  手动、自动
   */
  mode: number;
  /**
   * 测量日期
   */
  date: string;
  /**
   * 错误码
   */
  err: number;
  /**
   * 错误信息：
   *
   */
  errMsg: string;
  /**
   * 收缩压
   */
  systolic: number;
  /**
   * 舒张压
   */
  diastolic: number;
  /**
   * 平均压
   */
  avg: number;
  /**
   * 心率值
   */
  bloodHr: number;
  /**
   * 体位
   */
  position: number;
}
