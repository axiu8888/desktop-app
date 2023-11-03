<template>
  <div>
    <div
      id="container"
      class="wvParent"
      style="width: 100%; height: 720px; background-color: #333333"
    >
      <div
        id="wvBg"
        class="wvBg"
        style="width: 100%; height: 100%; background-color: #333333"
      ></div>

      <div id="wv" class="wv" style="width: 100%; height: 100%; overflow: hide">
        <div id="wv1" style="width: 50%; height: 100%; float: left"></div>
        <div id="wv2" style="width: 50%; height: 100%; float: right"></div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { utils } from '../libs/core'
import { mqtt } from '../libs/mqtt/mqtt'
import { parseZCenter } from '../libs/device/zcenter'

import {
  createCanvasGridBG,
  createCanvasWaveView,
  WaveView,
  DEFAULT_OPTS
} from '../libs/widgets/WaveView'

const row = 6
const column = 2
let wv1: WaveView
let wv2: WaveView

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

    // let packet = parseZCenter(msg.payloadBytes)
    // let array = new Array<number[]>(row * column)
    // for (let i = 0; i < row * column; i++) {
    //   array[i] = [...packet.ecgList]
    // }
    // wv.push(...array)
    // console.log(
    //   `${client.clientId}, ${topic}, sn: ${
    //     packet.packageSn
    //   }, time: ${utils.dateFmt(packet.time * 1000)}`
    // )

    // try {
    //   data.value.message = `time: ${utils.dateFmt(packet.time * 1000)}, sn: ${
    //     packet.packageSn
    //   }`
    // } catch (err) {
    //   console.error(err)
    // }

    //console.log(msg.payloadString);

    const packet = JSON.parse(msg.payloadString)
    console.log(packet)
    let array1 = new Array<number[]>(row * (column / 2))
    array1[0] = [...(packet.I ? packet.I : packet.i)]
    array1[1] = [...(packet.II ? packet.II : packet.iI)]
    array1[2] = [...(packet.III ? packet.III : packet.iII)]
    array1[3] = [...packet.aVR]
    array1[4] = [...packet.aVL]
    array1[5] = [...packet.aVF]
    wv1.push(...array1)
    let array2 = new Array<number[]>(row * (column / 2))
    array2[0] = [...(packet.V1 ? packet.V1 : packet.v1)]
    array2[1] = [...(packet.V2 ? packet.V2 : packet.v2)]
    array2[2] = [...(packet.V3 ? packet.V3 : packet.v3)]
    array2[3] = [...(packet.V4 ? packet.V4 : packet.v4)]
    array2[4] = [...(packet.V5 ? packet.V5 : packet.v5)]
    array2[5] = [...(packet.V6 ? packet.V6 : packet.v6)]
    wv2.push(...array2)
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
// mqttClient.subscribe(subscriber, 'hardware/11000139') // 订阅
mqttClient.subscribe(subscriber, '/hardware/boying12/00195D244F11') // 订阅

onMounted(() => {
  setTimeout(() => {
    let container = document.getElementById('container')
    container?.setAttribute('width', `${document.body.clientWidth * 0.8}`)
    container?.setAttribute('height', `${document.body.clientHeight * 0.8}`)

    createCanvasGridBG(document.getElementById('wvBg') as any)
    const opts = {
      ...DEFAULT_OPTS,
      scaleRatio: 0.6,
      step: 0.8,
      lineWidth: 1.0,
      strokeStyle: '#00CA83',
    }
    wv1 = createCanvasWaveView(
      document.getElementById('wv1') as any,
      row,
      column / 2,
      opts
    )
    wv2 = createCanvasWaveView(
      document.getElementById('wv2') as any,
      row,
      column / 2,
      opts
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
