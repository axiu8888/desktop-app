<template>
  <div >
    <div>{{ message }}</div>
    <WaveView></WaveView>
  </div>
</template>

<script lang="ts">
import WaveView from './components/WaveView.vue';

export default {
  // `setup` 是一个特殊的钩子，专门用于组合式 API。
  components: {
    WaveView
  },
  setup() {
    // 将 ref 暴露给模板
    return {
      message: '数据...'
    }
  }
}
</script>

<style>
body,
html {
  height: 100%;
  padding: 0;
  margin: 0;
}

#app {
  /* font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale; */
  width: 100%;
  height: 100%;
  color: #969696;
}

</style>
