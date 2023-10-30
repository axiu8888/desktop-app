import { utils } from '../core';
import { Paho } from './paho-mqtt';

/**
 * MQTT
 */
export namespace mqtt {
  /**
   * 生成客户端ID
   */
  export const nextClientId = (prefix = 'mqttjs_') => prefix + utils.nextUUID().substring(0, 12);

  /**
   * MQTT客户端
   */
  export class Client {
    /**
     * MQTT客户端
     */
    raw: Paho.Client;
    /**
     * 自动重连的客户端
     */
    private autoReconnectTimerId: any;
    /**
     * 分发消息
     */
    protected readonly dispatcher = <MqttMessageDispatcher>{
      /**
       * 订阅
       */
      subscriptions: new Map<MqttSubscriber, MqttSubscription>(),

      match(topic, subscription): boolean {
        if (subscription.topics.size > 0) {
          let msgTopic = getTopic(topic);
          if (utils.findItr(subscription.topics.values(), (v: any) => v.topic.match(msgTopic))) {
            return true;
          }
        }
        return false;
      },

      dispatch(client, topic, msg) {
        this.subscriptions.forEach((subscription) => {
          if (this.match(topic, subscription)) {
            // 匹配符合订阅规则的主题
            try {
              // 分发给订阅者
              subscription.subscriber?.onMessage(client, topic, msg);
            } catch (err) {
              console.log(`订阅者处理数据时的错误, 请自行处理: ${topic}, ${subscription.subscriber}`, err);
            }
          }
        });
      },

      getSubscription(subscriber) {
        return this.subscriptions.get(subscriber);
      },

      addSubscription(subscription) {
        this.subscriptions.set(subscription.subscriber, subscription);
      },

      removeSubscription(subscriber) {
        this.subscriptions.delete(subscriber);
      },

      getTopics(filter: utils.Predicate<MqttSubscription> = (_ms) => true) {
        if (this.subscriptions.size <= 0) {
          return <string[]>[];
        }
        let topics = new Set<string>();
        this.subscriptions.forEach((ms) => filter(ms) && ms.getTopics((_mt) => true).forEach((mt) => topics.add(mt.topic.topicName)));
        return [...topics];
      },

      getUniqueTopics(subscription) {
        let allTopics = this.getTopics((ms) => ms != subscription);
        return subscription
          .getTopics((_mt) => true)
          .filter((mt) => !allTopics.includes(mt.topic.topicName))
          .map((mt) => mt.topic.topicName);
      },
    };

    constructor(public opts: MqttOptions) {
      this.opts = utils.copyAttrs(opts, <MqttOptions>{
        clientId: nextClientId(),
        port: 8083,
        path: '/mqtt',
        userName: '',
        password: '',
      });
      try {
        this.raw = new Paho.Client(opts.host, opts.port, opts.path, opts.clientId);
        this.raw.onConnectionLost = (args: any) => this.onConnectionLost(args);
        this.raw.onMessageArrived = (args: any) => this.onMessageArrived(args);
        this.raw.onMessageDelivered = (args: any) => this.onMessageDelivered(args);
      } catch (err) {
        console.error(err);
        throw err;
      }
    }

    protected rawSubscribe(ms: MqttSubscription, topic: string, qos: number = 0): boolean {
      if (this.isConnected()) {
        this.raw.subscribe(topic, <any>{ qos: qos });
        return true;
      }
      return false;
    }

    protected rawUnsubscribe(ms: MqttSubscription, topic: string) {
      if (this.isConnected()) {
        this.raw.unsubscribe(topic, <any>{});
      }
    }

    get clientId() {
      return this.opts.clientId;
    }

    /**
     * 是否已连接
     */
    isConnected(): boolean {
      return this.raw?.connected && true;
    }

    /**
     * 连接
     */
    connect() {
      if (this.isConnected()) return;
      // uris: [`ws://${this.opts.host}:${this.opts.host}${this.opts.path}`],
      // connect the client
      //userName: 'admin', password: 'public'
      try {
        let { userName, password } = this.opts;
        this.raw.connect(
          utils.copyAttrs({ userName, password }, <any>{
            onSuccess: (res: any) => this.onConnect(false, this.raw.connectOptions.uri),
            onFailure: (lost: ConnectLost) => this.onConnectionLost(lost),
          }),
        );
      } catch (err: any) {
        console.log(err);
        throw new Error('连接失败: ' + err);
      }

    }
    /**
     * 断开连接
     */
    disconnect() {
      try {
        this.raw.disconnect();
      } finally {
        this.stopAutoReconnect(); // 停止自动重连
      }
    }

    /**
     * 订阅主题
     *
     * @param topic 过滤规则：/device/#
     * @param opts 订阅参数
     */
    subscribe(subscriber: MqttSubscriber, topic: string, qos: number = 0) {
      if (!topic) throw new Error('topic不能为空');
      if (!subscriber) throw new Error('订阅者不能为null');

      let subscription = this.dispatcher.getSubscription(subscriber);
      let exist = subscription ? true : false;
      if (!subscription) {
        subscription = <MqttSubscription>{
          topics: new Map<String, MqttSubscriptionTopic>(),
          subscriber: subscriber,
          getTopics(filter) {
            return utils.mapValuesToArray(this.topics).filter(filter);
          },
          hasTopic(topic) {
            return this.topics.has(getTopic(topic).topicName);
          },
          addTopics(...topics) {
            topics.forEach((topic) => this.topics.set(topic.topic.topicName, topic));
          },
          removeTopics(...topics): MqttSubscriptionTopic[] {
            let removed = <MqttSubscriptionTopic[]>[];
            this.topics.forEach((mt) => {
              if (topics.includes(mt.topic.topicName)) {
                removed.push(mt);
              }
            });
            removed.forEach((mt) => this.topics.delete(mt.topic.topicName));
            return removed;
          },
        };
      }
      let sent = false;
      if (!subscription.hasTopic(topic)) {
        // 添加订阅
        subscription.addTopics({ topic: getTopic(topic), qos: qos });
        if (!exist) {
          this.dispatcher.addSubscription(subscription);
        }
        // 调用订阅的方法(多次订阅相同主题没有问题，取消订阅时则需要判断是否有其他订阅者)
        sent = this.rawSubscribe(subscription, topic, qos);
      }
      //console.log(`subscribe, subscription: ${subscription.topics}, sent: ${sent}, ${this.isConnected()}`);
    }

    /**
     * 取消订阅主题
     *
     * @param 订阅者
     * @param topic 过滤规则：/device/#
     */
    unsubscribe(subscriber: MqttSubscriber, topic: string = 'all') {
      let subscription = this.dispatcher.getSubscription(subscriber);
      if (subscription) {
        try {
          // 移除相关的主题
          let uniqueTopics = this.dispatcher.getUniqueTopics(subscription);
          if (uniqueTopics.length <= 0) {
            return;
          }
          utils.tryCatch(() => {
            // 取消订阅
            if (topic === 'all') {
              subscription.topics.clear();
              if (this.isConnected() && uniqueTopics.length > 0) {
                uniqueTopics.forEach((name) => this.rawUnsubscribe(subscription, name));
              }
            } else {
              subscription.removeTopics(topic);
              if (uniqueTopics.includes(topic)) {
                // 取消订阅
                this.rawUnsubscribe(subscription, topic);
              }
            }
          });
        } finally {
          // 如果没有订阅的主题了，就移除监听者
          if (subscription.topics.size <= 0) {
            this.dispatcher.removeSubscription(subscriber);
          }
        }
      }
    }

    /**
     * 发布消息
     *
     * @param topic 主题
     * @param payload 数据载荷
     * @param qos 服务质量: 0/1/2
     * @param retained 如果为true，则消息将由服务器保留并传递给当前和未来的订阅。如果为false，
     *                 则服务器只将消息传递给当前订阅者，这是新消息的默认值。如果消息是在保留布尔值设置为true的情况下发布的，
     *                 并且订阅是在消息发布之后进行的，则接收到的消息将保留布尔值设置为true。
     * @returns 是否发送成功(只检查是否连接，如果连接了，默认发送成功)
     */
    publish(topic: string, payload: string | ArrayBuffer, qos: number = 0, retained: boolean = false) {
      // let msg = new Paho.Message(payload);
      // msg.destinationName = topic;
      this.raw.publish(topic, payload, qos, retained);
      //this.raw.send(topic, payload, qos, retained);
    }

    /**
     * 连接成功
     */
    protected onConnect(reconnect: boolean, uri: string) {
      try {
        //console.log('连接成功: ', reconnect, uri);
        this.stopAutoReconnect();
        // 订阅
        this.dispatcher.subscriptions.forEach((ms) => {
          utils.tryCatch(() => ms.topics.forEach((mt) => this.rawSubscribe(ms, mt.topic.topicName, mt.qos)));
          utils.tryCatch(() => utils.applyFnWithTry(ms.subscriber.onConnected, this));
        });
      } catch (err) {
        console.error('mqtt onConnect', err);
      }
    }

    /**
     * 连接断开
     *
     * @param res 连接断开的原因
     */
    protected onConnectionLost(res: ConnectLost) {
      try {
        if (res.errorCode !== 0) {
          this.startAutoReconnect();
          if (res.errorCode == 7 && (!res.errorMessage || res.errorMessage.includes(':undefined'))) {
            res.errorMessage = 'network error';
          }
          // 客户端可能自动断开了，这时需要重连
          this.dispatcher.subscriptions.forEach((ms, _topic) => utils.applyFnWithTry(ms.subscriber.onConnectLost, this, res));
        } else {
          this.stopAutoReconnect(); // 停止自动重连
          // 断开连接
          this.dispatcher.subscriptions.forEach((ms, _topic) => utils.applyFnWithTry(ms.subscriber.onDisconnected, this));
        }
      } catch (err) {
        console.error('mqtt onConnectionLost', err);
      }
    }

    /**
     * 接收到消息
     *
     * @param message 消息
     */
    protected onMessageArrived(message: MqttMessage) {
      try {
        this.dispatcher.dispatch(this, message.topic, message);
      } catch (err) {
        console.error(`分发消息时出现错误: ${message.topic}`, err);
      }
    }

    /**
     * 消息发送成功
     *
     * @param message 消息
     */
    protected onMessageDelivered(message: MqttMessage) {
      this.dispatcher.subscriptions.forEach((ms, _topic) => utils.applyFnWithTry(ms.subscriber.onMessageDelivered, this, message));
    }

    /**
     * 开始自动连接
     */
    protected startAutoReconnect() {
      if (!this.autoReconnectTimerId && this.opts.autoReconnectInterval > 0) {
        this.opts.autoReconnectInterval = Math.max(this.opts.autoReconnectInterval, 3000);
        this.autoReconnectTimerId = setInterval(() => {
          if (this.isConnected()) {
            return;
          }
          try {
            this.connect();
          } catch (err) { }
        }, this.opts.autoReconnectInterval);
      }
    }

    /**
     * 停止自动连接
     */
    protected stopAutoReconnect() {
      if (this.autoReconnectTimerId) {
        clearInterval(this.autoReconnectTimerId);
        this.autoReconnectTimerId = undefined;
      }
    }
  }

  /**
   * MQTT消息分发器
   */
  export interface MqttMessageDispatcher {
    /**
     * 订阅的主题和订阅对象
     */
    subscriptions: Map<MqttSubscriber, MqttSubscription>;

    /**
     * 分发消息
     *
     * @param client 客户端
     * @param topic 主题
     * @param msg 消息
     */
    dispatch(client: Client, topic: string, msg: MqttMessage): void;

    /**
     * 判断是否符合匹配订阅规则
     *
     * @param topic 主题
     * @param subscription 订阅者
     * @returns 是否匹配
     */
    match(topic: string, subscription: MqttSubscription): boolean;

    /**
     * 获取MqttSubscription
     *
     * @param subscriber 订阅者
     * @returns 返回订阅者
     */
    getSubscription(subscriber: MqttSubscriber): MqttSubscription;

    /**
     * 添加MqttSubscription
     *
     * @param 订阅者
     */
    addSubscription(subscription: MqttSubscription): void;

    /**
     * 移除MqttSubscription
     *
     * @param subscriber 订阅者
     * @returns 返回被移除的订阅者
     */
    removeSubscription(subscriber: MqttSubscriber): MqttSubscription;

    /**
     * 全部的topic
     *
     * @param filter 过滤
     * @returns 获取匹配的主题
     */
    getTopics(filter: utils.Predicate<MqttSubscription>): string[];

    /**
     * 获取订阅者唯一的topic(其他订阅没有此主题)
     *
     * @param subscription 订阅者
     * @returns 获取匹配的主题
     */
    getUniqueTopics(subscription: MqttSubscription): string[];
  }

  export interface MqttSubscription {
    /**
     * 订阅的主题
     */
    readonly topics: Map<String, MqttSubscriptionTopic>;

    /**
     * 订阅者
     */
    readonly subscriber: MqttSubscriber;

    /**
     * 过滤主题
     *
     * @param filter 过滤器
     */
    getTopics(filter: utils.Predicate<MqttSubscriptionTopic>): MqttSubscriptionTopic[];

    /**
     * 判断主题是否已存在
     *
     * @param topic 主题
     * @returns 返回判断结果
     */
    hasTopic(topic: string | MqttTopic): boolean;

    /**
     * 添加主题
     *
     * @param topics 主题
     */
    addTopics(...topics: MqttSubscriptionTopic[]): void;

    /**
     * 移除主题
     *
     * @param topics 主题
     * @returns 返回被移除的主题
     */
    removeTopics(...topics: string[]): MqttSubscriptionTopic[];
  }

  export interface MqttSubscriptionTopic {
    /**
     * 主题
     */
    topic: MqttTopic;
    /**
     * 服务质量
     */
    qos: number;
  }

  /**
   * MQTT消息订阅
   */
  export interface MqttSubscriber {
    /**
     * 接收到消息
     *
     * @param client 客户端
     * @param topic 主题
     * @param msg 消息
     */
    onMessage(client: Client, topic: string, msg: MqttMessage): void;

    /**
     * 客户端连接成功
     *
     * @param client 客户端
     */
    onConnected?(client: Client): void;

    /**
     * 客户端断开连接
     *
     * @param client 客户端
     */
    onDisconnected?(client: Client): void;

    /**
     * 客户端连接断开，非主动断开
     *
     * @param client 客户端
     */
    onConnectLost?(client: Client, lost: ConnectLost): void;

    /**
     * 消息发送成功
     *
     * @param client 客户端
     */
    onMessageDelivered?(client: Client, msg: MqttMessage): void;
  }

  /**
   * MQTT消息
   */
  export interface MqttMessage {
    /**
     * 主题
     */
    topic: string;
    /**
     * 如果负载由有效的UTF-8字符组成，则负载为字符串。
     */
    readonly payloadString: string;
    /**
     * 负载类型为ArrayBuffer。
     */
    readonly payloadBytes: ArrayBuffer;
    /**
     * mandatory消息要发送到的目的地的名称(对于即将发送的消息)或从其接收消息的目的地的名称。(对于onMessage函数接收到的消息)。
     */
    destinationName: string;
    /**
     * 用于传递消息的服务质量。
     *  0 Best effort(默认值)。
     *  1 至少一次。
     *  2 正好有一次。
     */
    qos: number;
    /**
     * 如果为true，则消息将由服务器保留并传递给当前和未来的订阅。
     * 如果为false，则服务器只将消息传递给当前订阅者，这是新消息的默认值。
     * 如果消息是在保留布尔值设置为true的情况下发布的，并且订阅是在消息发布之后进行的，则接收到的消息将保留布尔值设置为true。
     */
    retained: boolean;
    /**
     * 如果为true，则此消息可能是已收到消息的副本。这只在从服务器接收的消息上设置。
     */
    readonly duplicate: boolean;
  }

  /**
   * 断开连接
   */
  export interface ConnectLost {
    /**
     * 错误码
     */
    errorCode: number;
    /**
     * 错误信息
     */
    errorMessage: string;
  }

  /**
   * MQTT参数
   */
  export interface MqttOptions {
    /**
     * 客户端ID: mqttjs_12233334343333
     */
    clientId: string;
    /**
     * 断开后自动连接的间隔，至少3秒，如果小于等于0，表示不自动重连
     */
    autoReconnectInterval: number;
    /**
     * 主机地址
     */
    host: string;
    /**
     * 端口：18083
     */
    port: number;
    /**
     * 路径: /mqtt
     */
    path: string;
    /**
     * 用户名
     */
    userName: string;
    /**
     * 密码
     */
    password: string;
  }

  /**
   * 连接参数
   */
  export interface ConnectOptions {
    /**
     * 如果在这个秒数内连接没有成功，则认为连接失败。缺省值是30秒。
     */
    timeout?: number;
    /**
     * 此连接的身份验证用户名。
     */
    username?: string;
    /**
     * 此连接的身份验证密码。
     */
    password?: string;
    /**
     * 客户端异常断开连接时服务器发送，Paho.Message
     */
    willMessage?: any;
    /**
     * 如果在这几秒内没有活动,服务器将断开连接此客户端。假设如果不设置,默认值为60秒。
     */
    keepAliveInterval?: number;
    /**
     * 如果为true(默认值)，则在连接成功时删除客户端和服务器的持久状态。
     */
    cleanSession?: boolean;
    /**
     * 如果存在且为true，则使用SSL Websocket连接。
     */
    useSSL?: boolean;
    /**
     * 传递给onSuccess回调或onFailure回调。
     */
    invocationContext?: any;
    /**
     * 如果存在，则包含一组主机名或完全限定的WebSocket uri (ws://mqtt.eclipseprojects.io:80/mqtt)，
     * 它们将按顺序代替构造器上的主机和端口参数。每次依次尝试一个主机，直到其中一个成功。
     */
    hosts: Array<string>;
    /**
     * 如果存在与主机匹配的端口集。如果主机包含uri，则不使用此属性。
     */
    ports: Array<number>;
    /**
     * 设置如果连接丢失，客户端是否会自动尝试重新连接到服务器。
     *    如果设置为false，在连接丢失的情况下，客户端将不会尝试自动重新连接到服务器。
     *    如果设置为true，在连接丢失的情况下，客户端将尝试重新连接到服务器。它将在尝试重新连接之前等待1秒，对于每一次失败的重新连接尝试，延迟将加倍，直到2分钟，此时延迟将保持在2分钟。
     */
    reconnect: boolean;
    /**
     * 用于连接到MQTT代理的MQTT版本。
     * 3 - MQTT v3.1
     * 4 - MQTT v3.1.1
     */
    mqttVersion: number;
    /**
     * 如果设置为true，将强制连接使用所选的MQTT版本，否则将连接失败。
     */
    mqttVersionExplicit: boolean;
    /**
     * 如果存在，应该包含一个完全限定的WebSocket uri列表(例如ws://mqtt.eclipseprojects.io:80/mqtt)，
     * 这些uri将按顺序代替构造函数的主机和端口参数进行尝试。依次尝试一个uri，直到其中一个成功。
     * 不要将此属性与hosts一起使用，因为hosts数组将被转换为uri并覆盖此属性。
     */
    uris: Array<string>;
  }

  /**
   * MQTT topic
   */
  export class MqttTopic {
    /**
     * 节点片段
     */
    protected readonly segments: Array<string> = [];
    /**
     * 当前主题对应的节点
     */
    node: Node;

    constructor(public readonly topicName: string) {
      this.node = this.parseToNode(topicName);
    }

    /**
     * 递归解析 Mqtt 主题
     *
     * @param name 主题名
     * @returns 返回解析的节点对象
     */
    protected parseToNode(name: string): Node | any {
      if (name && name.trim().length > 0) {
        let value = slice(name, TOPIC_SLICER);
        this.segments.push(...value);
        return this.recursiveNode(value, 0, undefined as any);
      }
      return EMPTY_NODE;
    }

    protected recursiveNode(parts: string[], index: number, prev: Node): Node {
      if (parts.length <= index) {
        return undefined as any;
      }
      let current = new Node(parts[index], prev, undefined as any, index);
      current.prev = prev;
      current.next = this.recursiveNode(parts, ++index, current);
      return current;
    }

    /**
     * 匹配 topic
     */
    match(topic: MqttTopic | string): boolean {
      if (typeof topic == 'string') {
        topic = getTopic(topic as string);
      }
      return this.node.match((topic as MqttTopic).node);
    }
  }

  export class Node {
    multi: boolean;
    single: boolean;

    constructor(public readonly part: string, public prev: Node, public next: Node, public level: number) {
      this.part = part.trim();
      this.prev = prev;
      this.next = next;
      this.level = level;

      this.multi = this.part == MULTI;
      this.single = this.part == SINGLE;
    }

    hasNext(): boolean {
      return this.next ? true : false;
    }

    /**
     * 匹配规则
     *
     * @param node 节点
     * @return 返回是否匹配
     */
    match(node: Node): boolean {
      if (!node) {
        return false;
      }
      if (EMPTY_NODE.equals(node)) {
        return false;
      }
      if (this.multi) {
        return this.matchMulti(node); // 匹配多层
      }
      if (this.single) {
        return this.matchSingle(node); // 匹配单层
      }
      return this.matchSpecial(node);
    }

    /**
     * 匹配多层级的规则
     *
     * @param node 节点
     * @return 返回是否匹配
     */
    matchMulti(node: Node): boolean {
      // 匹配多层级时，如果有下一级，继续检查下一级
      if (node.hasNext()) {
        let next = nextNode(this, PURE_FILTER);
        if (next) {
          // 获取第一个匹配的节点
          while (!next.equalsPart(node)) {
            node = node.next;
            if (!node) {
              return false; // 找不到，不匹配
            }
          }
          return next.match(node);
        }
      }
      return true;
    }

    /**
     * 匹配单层级规则
     *
     * @param node 节点
     * @return 返回是否匹配
     */
    matchSingle(node: Node): boolean {
      return this.hasNext() ? this.next.match(node.next) : !node.hasNext();
    }

    /**
     * 匹配具体规则
     *
     * @param node 节点
     * @return 返回是否匹配
     */
    matchSpecial(node: Node): boolean {
      if (this.equalsPart(node)) {
        if (this.hasNext() || node.hasNext()) {
          return this.next && this.next.match(node.next);
        }
        return true;
      }
      return false;
    }

    equalsPart(node: Node): boolean {
      return node && this.part == node.part;
    }

    /**
     * 是否
     *
     * @param o
     * @returns
     */
    equals(o: any): boolean {
      if (this == o) return true;
      if (!o || !(o instanceof Node)) return false;
      let node = o as Node;
      return this.part == node.part && this.level == node.level;
    }
  }

  const MULTI = '#';
  const SINGLE = '+';
  const EMPTY_NODE = new Node('', undefined as any, undefined as any, 0);
  // const MULTI_NODE = new Node('#', undefined as any, undefined as any, 0)
  // const SINGLE_NODE = new Node('+', undefined as any, undefined as any, 0)
  const PURE_FILTER: utils.Predicate<Node> = (n) => !(n.part == MULTI || n.part == SINGLE);
  const EMPTY_TOPIC = new MqttTopic('');
  const TOPICS = new Map<String, MqttTopic>();

  /**
   * 获取主题
   *
   * @param name 主题名
   * @returns 返回主题
   */
  export function getTopic(name: string | MqttTopic): MqttTopic {
    if (!name) {
      return EMPTY_TOPIC;
    }
    if (typeof name !== 'string') {
      return name as MqttTopic;
    }
    let topic = TOPICS.get(name);
    if (!topic) {
      TOPICS.set(name, (topic = new MqttTopic(name)));
    }
    return topic!!;
  }

  function nextNode(node: Node, filter: utils.Predicate<Node>): Node {
    let next: Node = node.next;
    while (next != null) {
      if (filter(next)) {
        break;
      }
      next = next.next;
    }
    return next;
  }

  /**
   * 分割字符串的分割器
   */
  export interface Slicer {
    /**
     * 匹配是否符合
     *
     * @param chars  字符串拼接
     * @param position 字符位置
     * @param ch       当前字符
     * @return 返回是否匹配
     */
    (chars: string[], position: number, ch: string): boolean;
  }

  /**
   * 默认的 topic 分割器
   */
  export const TOPIC_SLICER = <Slicer>((_b, _position, ch) => ch == '/');

  /**
   * 分割字符串
   *
   * @param str     字符串
   * @param slicer 分割器
   * @return 返回分割后的字符串
   */
  export function slice(str: string, slicer: Slicer): string[] {
    let buf = [],
      lines = [];
    for (let i = 0; i < str.length; i++) {
      if (slicer(buf, i, str.charAt(i))) {
        if (buf.length > 0) {
          lines.push(buf.splice(0, buf.length).join(''));
        }
        continue;
      }
      buf.push(str.charAt(i));
    }
    if (buf.length > 0) {
      lines.push(buf.join(''));
    }
    return lines;
  }
}
