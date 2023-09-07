/**
 * 波形图绘制：心电/脉搏波/胸腹呼吸
 */
export class WaveView {
  /**
   *画布
   */
  canvas: HTMLCanvasElement;
  /**
   * 画布上下文
   */
  ctx: CanvasRenderingContext2D;
  /**
   *调度器
   */
  timer: any;
  /**
   * 调度间隔
   */
  interval: number;
  /**
   * 接收数据的时间
   */
  rcvTime: number = 0;
  /**
   * 心电数据包，每秒一个包
   */
  models: ViewModel[] = [];
  /**
   * 是否已清理视图
   */
  clear: boolean = false;
  /**
   * 回复状态，判断是否需要自动恢复
   */
  recover: boolean = true;
  /**
   * 是否为暂停状态
   */
  _drawable: boolean = false;

  constructor(c: HTMLCanvasElement, init?: { onInit(view: WaveView): void }, interval: number = 40) {
    this.canvas = c;
    this.ctx = getCanvasContext(c);
    this.interval = interval;
    // 初始化
    init!.onInit(this);
  }

  /**
   * 高度
   */
  height(): number {
    return this.canvas.height;
  }

  /**
   * 宽度
   */
  width(): number {
    return this.canvas.width;
  }

  /**
   * 是否可绘制的
   *
   * @param drawable 设置是否可绘制
   */
  set drawable(drawable: boolean) {
    this._drawable = drawable;
  }

  get drawable(): boolean {
    return this._drawable;
  }

  /**
   * 添加波形数组
   *
   * @param points 波形数值
   */
  push(...waves: number[][]) {
    if (this.drawable) {
      return;
    }
    if (waves && waves.length) {
      this.rcvTime = Date.now();
      let size = Math.min(this.models.length, waves.length);
      for (let i = 0; i < size; i++) {
        this.models[i].push(waves[i]);
      }
      // 重新调度
      if (!this.timer && this.recover) {
        this.startTimer(true);
      }
    }
  }

  /**
   * 开始绘制
   */
  start() {
    this.startTimer(true);
  }

  /**
   * 暂停
   */
  pause() {
    // 不绘制
    this.drawable = false;
    this.models.forEach((model) => model.clearWaveQ());
    this.stopTimer(true);
    // 清理视图
    this.clearView();
  }

  /**
   * 恢复
   */
  resume() {
    // 清理视图
    this.clearView();
    this.models.forEach((model) => model.clearWaveQ());
    this.startTimer(true);
    // 绘制
    this.drawable = true;
  }

  /**
   * 停止绘制
   */
  stop() {
    this.stopTimer(false);
  }

  /**
   * 开始调度
   *
   * @param recover 是否需要恢复
   */
  protected startTimer(recover: boolean) {
    if (!this.timer) {
      this.timer = setInterval(() => this.draw(), this.interval);
      this.recover = recover;
    }
  }

  /**
   * 停止调度
   *
   * @param recover 是否需要恢复
   */
  protected stopTimer(recover: boolean) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.recover = recover;
    }
  }

  /**
   * 绘制
   */
  draw() {
    let drawFlag = false;
    if (this.models.length == 1) {
      drawFlag = this.models[0].onDraw(this.ctx) || drawFlag;
    } else {
      for (const m of this.models) {
        drawFlag = m.onDraw(this.ctx, true) || drawFlag;
      }
    }
    if (!drawFlag) {
      // 未绘制
      // 超时自动清理
      if (Date.now() - this.rcvTime >= 2000) {
        // 清理
        this.clearView();
        this.pause();
      }
      return;
    }
  }

  /**
   * 清理视图
   */
  clearView() {
    //this.ctx.clearRect(0, 0, this.width(), this.height());
    try {
      this.onDrawBackground(this.ctx);
      if (this.models.length == 1) {
        this.models[0].clear(this.ctx);
      } else {
        for (const m of this.models) {
          try {
            m.clear(this.ctx);
          } catch (err) {
            console.error(err);
          }
        }
      }
    } finally {
      this.clear = true;
    }
  }

  onDrawBackground(ctx: CanvasRenderingContext2D) {
    // drawGrid(this.canvas, 20, false);
  }
}

/**
 * 数据与数据的模型
 */
export class ViewModel {
  /**
   * 数据队列
   */
  protected waveQ: Array<number[]> = [];
  /**
   * 当前数据包
   */
  protected curPoints: number[] | null = null;
  /**
 * 宽度
 */
  width: number;
  /**
   * 高度
   */
  height: number;
  /**
   * 是否清理视图
   */
  clearDirty: boolean;
  /**
   * 绘制数量
   */
  drawCount: number;
  /**
   * 中值: (最大值 - 最小值) / 2
   */
  median: number;
  /**
   * 基线
   */
  baseLine: number;
  /**
   * 步长
   */
  step: number;
  /**
   * 压缩比
   */
  scaleRatio: number;
  /**
   * 缓存的最多数量
   */
  maxCacheSize: number;
  /**
   * X的起点
   */
  startX: number;
  /**
   * Y的起点
   */
  startY: number;
  /**
   * X轴
   */
  x: number;
  /**
   * Y轴，默认是基线
   */
  y: number;
  /**
   * 空白间隔
   */
  padding: number = 16;
  /**
 * 线的宽度
 */
  lineWidth: number;
  /**
   * 线的填充样式
   */
  strokeStyle: string | CanvasGradient | CanvasPattern;
  /**
   * 线的端口样式
   */
  lineCap: CanvasLineCap;
  /**
   * 线段的连接样式
   */
  lineJoin: CanvasLineJoin;

  constructor(options: ViewModelOptions) {
    this.width = options.width;
    this.height = options.height;
    // 是否清理View
    this.clearDirty = options.clearDirty !== undefined ? options.clearDirty : true;
    // 绘制数量
    this.drawCount = options.drawCount ? options.drawCount : 1;
    // 中值
    this.median = options.median;
    // 基线
    this.baseLine = Math.floor(getOrDefault(options.baseLine, this.height / 2));
    // 步长
    this.step = getOrDefault(options.step, 1.0);
    // 缓存数量
    this.maxCacheSize = Math.floor(getOrDefault(options.maxCacheSize, 0));
    // X的起点
    this.startX = getOrDefault(options.startX, 0);
    // Y的起点
    this.startY = getOrDefault(options.startY, 0);
    // 空白间隔
    this.padding = getOrDefault(options.padding, 16);
    // let scale = window.devicePixelRatio;
    // 缩放比
    this.scaleRatio = getOrDefault(options.scaleRatio, 1.0);
    // x轴
    this.x = -1;
    // y轴
    this.y = this.baseLine;

    this.lineWidth = getOrDefault(options.lineWidth, 1);
    this.strokeStyle = getOrDefault(options.strokeStyle, 'black');
    this.lineCap = getOrDefault(options.lineCap, 'round');
    this.lineJoin = getOrDefault(options.lineJoin, 'round');
  }

  /**
 * 添加波形数组
 *
 * @param points 波形数值
 */
  push(points: number[]) {
    if (points) {
      this.waveQ.push(points);
    }
  }

  clearWaveQ() {
    this.waveQ = [];
  }

  /**
   * 当绘制时被调用
   *
   * @param ctx 画布的上下文
   * @returns 是否绘制
   */
  onDraw(ctx: CanvasRenderingContext2D, render: boolean = true): boolean {
    for (;;) {
      if (this.curPoints && this.curPoints.length) {
        // 绘制
        this.drawView(ctx, this.curPoints, render);
        if (!this.maxCacheSize || this.waveQ.length < this.maxCacheSize) {
          return true;
        }
      }
      // 队列中有数据，取出数据，没有就返回
      if (!this.waveQ.length) {
        return false;
      }
      this.curPoints = this.waveQ.shift() as number[];
      // 循环：接着绘制...
    }
  }

  /**
   * 绘制波形数据
   */
  drawView(ctx: CanvasRenderingContext2D, points: number[], render: boolean = true) {
    // 清理部分区域
    this.onClearDirty(ctx);
    // 设置画笔
    this.onSetPaint(ctx);

    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    // 绘制线条
    let size = Math.min(points.length, this.drawCount);
    for (let i = 0; i < size; i++) {
      this.x = this.calculateX();
      this.y = this.calculateY(points.shift() as number);
      ctx.lineTo(this.x, this.y);
    }
    if (render) {
      ctx.stroke();
    }
    if (this.x >= this.width) {
      this.x = -1;
    }
  }

  /**
   * 设置画笔样式
   *
   * @param ctx 画布上下文
   */
  onSetPaint(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = this.lineWidth;
    ctx.strokeStyle = this.strokeStyle;
    ctx.lineCap = this.lineCap;
    ctx.lineJoin = this.lineJoin;
  }

  /**
   * 清理脏区域
   *
   * @param ctx 画布上下文
   */
  onClearDirty(ctx: CanvasRenderingContext2D) {
    if (this.clearDirty) {
      ctx.clearRect(this.x, this.startY, this.padding, this.height);
    }
  }

  /**
   * 计算X的值
   */
  calculateX() {
    return this.x + this.step;
  }

  /**
   * 计算Y的值
   *
   * @param point 波形值
   */
  calculateY(point: number): number {
    return this.baseLine + (this.median - point) * this.scaleRatio;
  }

  /**
   * 清理视图
   */
  clear(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(this.startX, this.startY, this.width, this.height);
    this.x = -1;
    this.y = this.baseLine;
  }

}

/**
 * ViewModel的可选项
 */
export interface ViewModelOptions {
  /**
 * 宽度
 */
  width: number;
  /**
   * 高度
   */
  height: number;
  /**
   * 是否清理，默认清理
   */
  clearDirty?: boolean;
  /**
   * 中值: (最大值 - 最小值) / 2
   */
  median: number;
  /**
   * 绘制数量
   */
  drawCount: number;
  /**
   * 基线，默认高度的一半
   */
  baseLine?: number;
  /**
   * 步长，默认 1
   */
  step?: number;
  /**
   * 压缩比，默认1.0
   */
  scaleRatio?: number;
  /**
   * 缓存的最多数量，默认0，表示不做操作
   */
  maxCacheSize?: number;
  /**
   * X轴的起点，默认0
   */
  startX?: number;
  /**
   * Y轴的起点，默认0
   */
  startY?: number;
  /**
   * 空白间隔
   */
  padding?: number;
  /**
   * 线的宽度
   */
  lineWidth?: number;
  /**
   * 线的填充样式
   */
  strokeStyle?: string | CanvasGradient | CanvasPattern;
  /**
   * 线的端口样式
   */
  lineCap?: CanvasLineCap;
  /**
   * 线段的连接样式
   */
  lineJoin?: CanvasLineJoin;
}

/**
 * 绘制背景网格
 *
 * @param canvas 画布
 * @param gridSize 网格大小
 */
export const drawGrid = function (canvas: HTMLCanvasElement, gridSize: number, clearRect: boolean = true) {
  let ctx = canvas.getContext("2d", { alpha: true }) as CanvasRenderingContext2D;
  if (clearRect) {
    // 清理
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // 垂直方向数量
  let verticalCount = Math.floor(canvas.width / gridSize);
  let verticalPadding = (canvas.width - Math.floor(verticalCount * gridSize)) / 2;
  // 水平方向数量
  let horizontalCount = Math.floor(canvas.height / gridSize);
  let horizontalPadding = (canvas.height - Math.floor(horizontalCount * gridSize)) / 2;

  // 垂直线
  for (let i = 0; i <= verticalCount; i++) {
    setPaint(ctx, i);
    ctx.beginPath();
    ctx.moveTo(verticalPadding + i * gridSize, horizontalPadding);
    ctx.lineTo(verticalPadding + i * gridSize, canvas.height - horizontalPadding);
    ctx.stroke();
  }

  // 水平线
  for (let i = 0; i <= horizontalCount; i++) {
    setPaint(ctx, i);
    ctx.beginPath();
    ctx.moveTo(verticalPadding, horizontalPadding + i * gridSize);
    ctx.lineTo(canvas.width - verticalPadding, horizontalPadding + i * gridSize);
    ctx.stroke();
  }
};

/**
 * 设置画笔参数
 *
 * @param ctx 画布上下文
 * @param i 索引
 */
export const setPaint = function (ctx: CanvasRenderingContext2D, i: number) {
  if (i === 0 || (i + 1) % 5 === 0) {
    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = 1.0;
  } else {
    ctx.strokeStyle = "#990000";
    ctx.lineWidth = 0.2;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/**
 * 设置画布的缩放比，用于抗锯齿
 *
 * @param canvas 画布
 * @param width 宽度
 * @param height 高度
 */
export const setCanvasPixelRatio = function (canvas: HTMLCanvasElement
  , ratio: number = window.devicePixelRatio
  , width: number = canvas.width
  , height: number = canvas.height): HTMLCanvasElement {
  // ratio = getOrDefault(ratio, window.devicePixelRatio);
  // width = getOrDefault(width, canvas.width);
  // height = getOrDefault(height, canvas.height);
  if (ratio) {
    getCanvasContext(canvas).scale(ratio, ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  return canvas;
}

/**
 * 获取画布的上下文对象
 *
 * @param canvas 画布
 */
export const getCanvasContext = function (canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext("2d", { alpha: false }) as CanvasRenderingContext2D;
}

/**
 * 获取被检查的值，如果不为null/undefined，就返回此值，否则返回默认值
 *
 * @param v 检查的值
 * @param dv  默认值
 */
const getOrDefault = <T>(v: any, dv: T) => v !== null && v !== undefined ? v : dv;

// let max: Function = (x: number, y: number): number => x > y ? x : y;
// // 设置canvas
// let width = max(window.innerWidth / 2 - 30, 700), height = max(window.innerHeight / 6 - 20, 220);
// let wvCanvas = setCanvasPixelRatio(document.getElementById("wvCanvas") as HTMLCanvasElement, window.devicePixelRatio, width, height);
// let wv = createWaveView(wvCanvas);

// 40毫秒执行一次
// 心电每秒200个值      每次绘制8个值
// 脉搏波每秒50个值     每次绘制2个值
// 胸腹呼吸每秒25个值   每次绘制1个值
export function createWaveView(c: HTMLCanvasElement): WaveView {
  return new WaveView(c, {
    // 初始化
    onInit(view: WaveView) {
      let canvas = view.canvas;
      let step = 0.6;
      // 添加ViewModel
      view.models.push(
        // 创建心电
        new ViewModel({
          width: canvas.width, // 宽度
          height: canvas.height / 2, // 高度
          drawCount: 8, // 绘制点数
          median: 512, // 中值 = (最大值 - 最小值) / 2
          step: step, // 步长
          baseLine: (canvas.height / 4), // 基线
          maxCacheSize: 2, // 缓存数量
          scaleRatio: 0.5, // 缩放比
          padding: 16, // 空白填充
          startX: 0,
          startY: 0,
          strokeStyle: '#FF0000'
        }),
        // 创建胸呼吸
        new ViewModel({
          width: canvas.width, // 宽度
          height: canvas.height / 2, // 高度
          clearDirty: true, // 清理视图
          drawCount: 1, // 绘制点数
          median: 512, // 中值 = (最大值 - 最小值) / 2
          step: step * 8, // 步长
          baseLine: canvas.height * (3 / 4.0), // 基线
          maxCacheSize: 2, // 缓存数量
          scaleRatio: 0.2, // 缩放比
          padding: 16, // 空白填充
          startX: 0,
          startY: canvas.height / 2 - 2,
          strokeStyle: '#00FF00'
        }),
        // 创建腹呼吸
        new ViewModel({
          width: canvas.width, // 宽度
          height: canvas.height / 2, // 高度
          clearDirty: false, // 不清理视图
          drawCount: 1, // 绘制点数
          median: 512, // 中值 = (最大值 - 最小值) / 2
          step: step * 8, // 步长
          baseLine: canvas.height * (3 / 4.0), // 基线
          maxCacheSize: 2, // 缓存数量
          scaleRatio: 0.2, // 缩放比
          padding: 16, // 空白填充
          startX: 0,
          startY: canvas.height / 2 + 2,
          strokeStyle: '#FFFF00'
        })
      );


      // let ctx = view.ctx;
      // // 清理视图
      // view.models.forEach(m => m.clear(ctx));
      // 打印参数
      // for (const model of view.models) {
      //     console.log(JSON.stringify(model));
      // }

      // view.onDrawBackground = function (ctx: CanvasRenderingContext2D) {
      //     ctx.lineWidth = 3;
      //     ctx.strokeStyle = "#FFFFFFFF";
      //     ctx.lineCap = "round";
      //     ctx.lineJoin = "round";

      //     ctx.beginPath();
      //     ctx.moveTo(0, this.height() / 2);
      //     ctx.lineTo(this.width(), this.height() / 2);
      //     ctx.stroke();
      //     console.log('绘制背景');
      // }

    }
  }, 40);
}
