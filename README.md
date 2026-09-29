# 排队核算服务（M/M/1/N）

面向呼叫接入网关容量评估的常驻后端：对**有限容量单服务台排队**（M/M/1/N）同时给出
**稳态解析**与**离散事件仿真**两组结果并互相对照。两条路径共用同一套状态定义——
状态 `n = 0..capacity` 表示系统中的顾客数，`capacity` **包含正在被服务的那一个**；
状态 `n == capacity` 即系统满，新到达的请求直接丢弃并计数（blocked calls cleared）。

## 模型与公式

- 到达率 λ、服务率 μ，交通强度 r = λ/μ。
- 稳态分布为几何级数：`p_n = p_0 · r^n`，n = 0..N；当 r = 1 时退化为均匀分布
  `p_n = 1/(N+1)`。
- 阻塞概率 = 满员状态概率 `p_N`（PASTA：到达看到的时间平均）。
- 有效到达率 `λ_eff = λ · (1 - p_N)`；利用率 `ρ = λ_eff / μ`。
- 平均队长 `L = Σ n·p_n`；平均逗留时间 `W = L / λ_eff`（Little 定律）。
  当 `λ_eff = 0`（无顾客进入系统）时单独定义 `W = 0`，不做除法。

仿真侧：到达与服务间隔均按指数分布抽样（逆变换法 `-ln(1-U)/rate`），随机数发生器为
**mulberry32** 固定算法，调用方给种子，同一种子两次运行结果逐位一致；事件表用二叉堆
按时间推进，满员到达丢弃并计数，支持按顾客数和/或仿真时长停止（先到者为准），输出
经验阻塞比例、平均队长与利用率。

## 接口

服务默认监听 3000 端口（`PORT` 环境变量可覆盖）。

### `POST /api/analytical`

只算解析。请求体：

```json
{ "arrivalRate": 0.8, "serviceRate": 1, "capacity": 12 }
```

返回 `probabilities`（p_0..p_N）、`blockingProbability`、`effectiveArrivalRate`、
`utilization`、`meanNumberInSystem`、`meanResidenceTime`、`trafficIntensity`。

### `POST /api/simulate`

只跑仿真。比解析多三个字段：`seed`（整数，必填）、`maxCustomers`（正整数，可选）、
`maxTime`（正数，可选），后两者至少给一个。

```json
{ "arrivalRate": 0.8, "serviceRate": 1, "capacity": 12, "seed": 12345, "maxTime": 200000 }
```

返回 `arrivals`、`blocked`、`served`、`simulatedTime`、`blockingRatio`、
`meanNumberInSystem`、`utilization`。

### `POST /api/compare`

一次性输出对照表：`analytical` 与 `simulation` 两组结果并排，并在 `comparison` 中给出
阻塞概率、平均队长、利用率三项各自的绝对差。参数同 `/api/simulate`。

### `GET /health`

就绪检查，返回 `{ "status": "ok", "model": "M/M/1/N" }`。

### 非法输入（HTTP 400）

- `arrivalRate` / `serviceRate` 非正、非数或非有限数；
- `capacity` 不是正整数；
- `seed` 不是整数；
- `maxCustomers` / `maxTime` 非正；
- 仿真请求未给任何停止条件。

## 本地运行

```bash
npm install
npm run build
npm start            # 监听 3000 端口
```

开发模式：`npm run dev`（tsx 直接运行 TypeScript）。

测试：`npm test`（node:test，经 tsx 运行）。覆盖：

- ρ<1、大容量时平均队长趋近闭式解 `L = ρ/(1-ρ)`（回归算例）；
- 长仿真、固定种子，经验阻塞比例/队长/利用率与解析值落在容差内；
- 容量增大时阻塞概率单调不增；
- 保持 r 不变、λ 与 μ 同比例放大，稳态分布形状不变；
- 同一种子仿真结果逐位一致；
- r=1 退化为均匀分布、概率和为 1、利用率恒等式；
- 零有效到达率不产生 Infinity/NaN；
- 校验拒绝与 HTTP 404。

## Docker

```bash
docker build -t queue-accounting .
docker run --rm -p 3000:3000 queue-accounting
```

镜像以 `node:20-slim` 为底，多阶段构建：构建阶段编译 TypeScript，运行阶段仅保留
编译产物与生产依赖，容器启动后即对外应答。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `src/rng.ts` | 种子随机数发生器（mulberry32）与指数抽样 |
| `src/analytical.ts` | M/M/1/N 稳态解析：分布、阻塞、利用率、队长、逗留时间 |
| `src/simulation.ts` | 二叉堆事件表驱动的离散事件仿真 |
| `src/validation.ts` | 参数校验与 `HttpError` |
| `src/routes.ts` | 路由层：`/api/analytical`、`/api/simulate`、`/api/compare`、`/health` |
| `src/app.ts` | Express 应用与错误处理中间件 |
| `src/index.ts` | 服务入口 |
