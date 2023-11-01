<template>
  <div>
    <div
      id="container"
      class="wvParent"
      style="width: 100%; height: 800px; background-color: white"
    >
      <div
        id="wvBg"
        class="wvBg"
        style="width: 100%; height: 100%; background-color: white"
      ></div>
      <div
        id="wv"
        class="wv"
        style="width: 100%; height: 100%; alpha: true"
      ></div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { parseZCenter } from '../libs/device/zcenter'
import { mqtt } from '../libs/mqtt/mqtt'
import { utils } from '../libs/core'

import {
  createCanvasGridBG,
  createCanvasWaveView,
  WaveView,
  DEFAULT_OPTS
} from '../libs/widgets/WaveView'

const row = 6
const column = 2
let wv: WaveView

const mqttClient = new mqtt.Client(<mqtt.MqttOptions>{
  autoReconnectInterval: 5000,
  // host: '192.168.1.198',
  host: 'pr.sensecho.com',
  port: 80,
  path: '/support/mqtt',
  clientId: mqtt.nextClientId('mqtt2233_')
})
// console.log('mqttClient', mqttClient);

// 订阅数据
let subscriber = <mqtt.MqttSubscriber>{
  onMessage(client, topic, msg) {
    // console.log(`${client.clientId}, 接收到mqtt消息`, topic, msg)
    let packet = parseZCenter(msg.payloadBytes)

    let array = new Array<number[]>(row * column)
    for (let i = 0; i < row * column; i++) {
      array[i] = [...packet.ecgList]
    }
    wv.push(...array)

    //console.log(`${client.clientId}, subscriber1 接收到mqtt消息`, topic, msg);
    console.log(
      `${client.clientId}, ${topic}, sn: ${
        packet.packageSn
      }, time: ${utils.dateFmt(packet.time * 1000)}`
    )

    // try {
    //   data.value.message = `time: ${utils.dateFmt(packet.time * 1000)}, sn: ${
    //     packet.packageSn
    //   }`
    // } catch (err) {
    //   console.error(err)
    // }
  },
  onConnected(client) {
    console.log(`${client.clientId}, 客户端连接成功`)
  },
  onDisconnected(client) {
    console.log(`${client.clientId}, 客户端关闭连接`)
  },
  onConnectLost(client, lost) {
    console.log(`${client.clientId}, 客户端连接断开`, lost)
  },
  onMessageDelivered(client, msg) {
    console.log(`${client.clientId}, 消息送达`, msg)
  }
}
mqttClient.subscribe(subscriber, 'hardware/11000138') // 订阅

onMounted(() => {
  setTimeout(() => {
    let container = document.getElementById('container')
    container?.setAttribute('width', document.body.clientWidth.toString())
    container?.setAttribute('height', document.body.clientHeight.toString())

    createCanvasGridBG(document.getElementById('wvBg') as any)
    wv = createCanvasWaveView(
      document.getElementById('wv') as any,
      row,
      column,
      {
        ...DEFAULT_OPTS,
        scaleRatio: 0.5,
        step: 1.0,
        lineWidth: 1.0
      }
    )

    mqttClient.connect()
  }, 1000)
})
</script>
<style scoped>
.wvParent {
  position: relative;
}

.wvBg {
  position: absolute;
  z-index: 1;
}

.wv {
  position: absolute;
  top: 10px;
  z-index: 2;
}
</style>
