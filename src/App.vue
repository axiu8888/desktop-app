<template>
  <div>
    <p>Using text interpolation: {{ rawHtml }}</p>
    <p>Using v-html directive: <span v-html="rawHtml"></span></p>
  </div>
</template>

<script setup lang="ts">

  let rawHtml = '<span style="color: red">hhhhh</span>'

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
