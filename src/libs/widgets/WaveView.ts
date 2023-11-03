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
  public readonly models: ViewModel[] = [];
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
  isPause: boolean = false;

  constructor(c: HTMLCanvasElement, init?: { onInit(view: WaveView): void }, interval: number = 40) {
    this.canvas = c;
    this.ctx = getContext(c);
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
   * 添加波形数组
   *
   * @param points 波形数值
   */
  push(...waves: number[][]) {
    if (this.isPause) {
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
    this.isPause = false;
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
    this.isPause = true;
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
  public waveQ: Array<number[]> = [];
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
  wipeWidth: number = 16;
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

  constructor(public opts: ViewModelOptions) {
    this.width = getOrDefault(opts.width, 0);
    this.height = getOrDefault(opts.height, 0);
    // 是否清理View
    this.clearDirty = opts.clearDirty !== undefined ? opts.clearDirty : true;
    // 绘制数量
    this.drawCount = opts.drawCount ? opts.drawCount : 1;
    // 中值
    this.median = getOrDefault(opts.median, 512);
    // 基线
    this.baseLine = Math.floor(getOrDefault(opts.baseLine, this.height / 2));
    // 步长
    this.step = getOrDefault(opts.step, 1.0);
    // 缓存数量
    this.maxCacheSize = Math.floor(getOrDefault(opts.maxCacheSize, 0));
    // X的起点
    this.startX = getOrDefault(opts.startX, 0);
    // Y的起点
    this.startY = getOrDefault(opts.startY, 0);
    // 空白间隔
    this.wipeWidth = getOrDefault(opts.wipeWidth, 16);
    // let scale = window.devicePixelRatio;
    // 缩放比
    this.scaleRatio = getOrDefault(opts.scaleRatio, 1.0);
    // x轴
    this.x = -1;
    // y轴
    this.y = this.baseLine;

    this.lineWidth = getOrDefault(opts.lineWidth, 1);
    this.strokeStyle = getOrDefault(opts.strokeStyle, 'red');
    this.lineCap = getOrDefault(opts.lineCap, 'round');
    this.lineJoin = getOrDefault(opts.lineJoin, 'round');
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
    for (; ;) {
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
    ctx.moveTo(this.startX + this.x, this.startY + this.y);
    // 绘制线条
    let size = Math.min(points.length, this.drawCount);
    for (let i = 0; i < size; i++) {
      this.x = this.calculateX();
      this.y = this.calculateY(points.shift() as number);
      ctx.lineTo(this.startX + this.x, this.startY + this.y);
    }
    // if(this.options.column === 1) {
    //   console.log(`${this.options.row}, ${this.options.column}, x: ${this.startX + this.x}, y: ${this.y}`);
    // }
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
      ctx.clearRect(this.startX + this.x, this.startY, this.wipeWidth, this.height);
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
  row?: number,
  column?: number,

  /**
   * 宽度，默认是canvas的宽度
   */
  width?: number;
  /**
   * 高度，默认是canvas的高度
   */
  height?: number;
  /**
   * 是否清理，默认清理
   */
  clearDirty?: boolean;
  /**
   * 中值: (最大值 - 最小值) / 2
   */
  median?: number;
  /**
   * 绘制数量: 1
   */
  drawCount?: number;
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
   * 擦除间隔
   */
  wipeWidth?: number;
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
export const setPaint = function (ctx: CanvasRenderingContext2D,
  i: number,
  sgColor: string | CanvasGradient | CanvasPattern = '#555555',
  bgColor: string | CanvasGradient | CanvasPattern = '#6D6D6D',) {
  if (i === 0 || (i + 1) % 5 === 0) {
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = 1.0;
  } else {
    ctx.strokeStyle = sgColor;
    ctx.lineWidth = 0.4;
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
    getContext(canvas).scale(ratio, ratio);
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
export const getContext = function (canvas: HTMLCanvasElement, alpha: boolean = true): CanvasRenderingContext2D {
  return canvas.getContext("2d", { alpha: alpha }) as CanvasRenderingContext2D;
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
export function createEcgResp(c: HTMLCanvasElement): WaveView {
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
          wipeWidth: 16, // 空白填充
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
          wipeWidth: 16, // 空白填充
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
          wipeWidth: 16, // 空白填充
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

// 40毫秒执行一次
// 心电每秒200个值      每次绘制8个值
export function createEcg1(c: HTMLCanvasElement): WaveView {
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
          height: canvas.height, // 高度
          drawCount: 8, // 绘制点数
          median: 512, // 中值 = (最大值 - 最小值) / 2
          step: step, // 步长
          baseLine: (canvas.height / 2), // 基线
          maxCacheSize: 2, // 缓存数量
          scaleRatio: 0.5, // 缩放比
          wipeWidth: 16, // 空白填充
          startX: 0,
          startY: 0,
          strokeStyle: '#FF0000'
        })
      );
    }
  }, 40);
}


/**
 * 创建WaveView
 *
 * 40毫秒执行一次
 * 心电每秒200个值      每次绘制8个值
 *
 * @param canvas 画布
 * @param row 行
 * @param column 列
 * @param scaleRatio 缩放比
 * @param opt 参数
 * @returns 返回创建的WaveView
 */
export function createWaveView(canvas: HTMLCanvasElement, row: number = 1, column: number = 1, opt: ViewModelOptions = DEFAULT_OPTS): WaveView {
  return new WaveView(canvas, {
    // 初始化
    onInit(view: WaveView) {
      let canvas = view.canvas;
      let width = canvas.width / column;
      let height = canvas.height / row;
      let baseLine = height / 2;
      for (let i = 0; i < row; i++) {
        for (let j = 0; j < column; j++) {
          let vmOpt = <ViewModelOptions>{
            ...opt,
            row: i,
            column: j,
            width: width, // 宽度
            height: height, // 高度
            baseLine: baseLine, // 基线: 第1条线的2分之1
            startX: width * j,
            startY: height * i,
            clearDirty: true, // 擦除
          };
          // 添加ViewModel
          view.models.push(new ViewModel(vmOpt));
        }
      }
    }
  }, 40);
}

/**
 * 创建WaveView
 *
 * @param container 容器(div或其他)
 * @param row 行
 * @param column 列
 * @param opt 可选项参数
 * @returns 返回创建的WaveView
 */
export const createCanvasWaveView = (container: HTMLElement, row: number = 1, column: number = 1, opt: ViewModelOptions = DEFAULT_OPTS): WaveView => {
  let canvas = document.createElement('canvas')
  canvas.setAttribute('width', container.clientWidth.toString()) //给canvas设置宽度
  canvas.setAttribute('height', container.clientHeight.toString()) //给canvas设置高度
  container.appendChild(canvas);
  setCanvasPixelRatio(canvas, window.devicePixelRatio, canvas?.clientWidth, canvas?.clientHeight);
  return createWaveView(canvas, row, column, opt);
}

/**
 * 创建背景网格
 *
 * @param container 容器(div或其他)
 * @returns 返回创建的Canvas
 */
export const createCanvasGridBG = (container: HTMLElement) => {
  let canvas = document.createElement('canvas')
  canvas.setAttribute('width', container.clientWidth.toString()) //给canvas设置宽度
  canvas.setAttribute('height', container.clientHeight.toString()) //给canvas设置高度
  container.appendChild(canvas)
  setCanvasPixelRatio(canvas, window.devicePixelRatio, canvas?.clientWidth, canvas?.clientHeight);
  drawGrid(canvas, 15, true);
  return canvas;
}


export const DEFAULT_OPTS = <ViewModelOptions>{
  drawCount: 8, // 绘制点数
  median: 512, // 中值 = (最大值 - 最小值) / 2
  step: 1.5, // 步长
  maxCacheSize: 2, // 缓存数量
  scaleRatio: 1, // 缩放比
  wipeWidth: 16, // 空白填充
  strokeStyle: '#FF0000',
  // strokeStyle: '#00FF00',
  lineWidth: 1.5, // 线的宽度
  clearDirty: true, // 擦除
};
