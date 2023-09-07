<template>
  <div id="app">{{ data.message }}</div>
</template>

<script lang="ts" setup>

import { nextClientId, MqttOptions, MqttSubscriber, PahoMqttClient } from "../libs/mqtt"


let data = {
  message: '数据...'
}


var mqttClient = new PahoMqttClient(<MqttOptions>{
  autoReconnectInterval: 5000,
  host: '192.168.1.198',
  port: 80,
  path: '/mqtt',
  clientId: nextClientId('mqtt2233_')
});
// console.log('mqttClient', mqttClient);

// 订阅数据
let subscriber = <MqttSubscriber>{
  onMessage(client, topic, msg) {
    console.log(`${client.clientId}, 接收到mqtt消息`, topic, msg);
  },
  onConnected(client) {
    console.log(`${client.clientId}, 客户端连接成功`);
  },
  onDisconnected(client) {
    console.log(`${client.clientId}, 客户端关闭连接`);
  },
  onConnectLost(client, lost) {
    console.log(`${client.clientId}, 客户端连接断开`, lost);
  },
  onMessageDelivered(client, msg) {
    console.log(`${client.clientId}, 消息送达`, msg);
  },
};
mqttClient.subscribe(subscriber, 'hardware/+'); // 订阅

</script>