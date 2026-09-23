---
title: "中间件、守卫、拦截器、管道、过滤器：NestJS 里到底该写哪一个"
description: "一个请求穿过 NestJS 时要经过五种可以插手的组件。选错位置代码照样能跑，代价却在几个月后才浮现。这是官方请求管线的完整梳理，附一条判断该写在哪的准则。"
date: 2026-09-23
tags: ["后端", "Node"]
featured: false
draft: false
serif: true
author: 站长
---

我接手过一个项目，登录校验写在中间件里。它能跑，而且跑了很久。

直到有人要给两个接口开白名单。做法是在中间件里判断路径：

```ts
if (req.path.startsWith('/api/health')) return next()
if (req.originalUrl.includes('?debug=1')) return next()
```

写完那一瞬间我就知道这事不对了：**「哪些接口不需要登录」本来是一个可以声明在控制器上的事，现在变成了散在中间件里的一串字符串。**

后来加了个新接口忘了改清单，那个接口就悄悄变成了免登录。这个 bug 不报错、不打日志，直到一次安全审计才被翻出来。

问题不在中间件本身。问题是我当时没弄清一件事：**一个请求穿过 NestJS 时会经过哪几道工序，每一道能拿到什么。** 把有明确归属的事塞进不合适的那道工序，代码照样跑得起来，代价延后几个月才浮现。

## 顺序不只是「依次经过」

五种组件，进来的方向是：中间件 → 守卫 → 拦截器 → 管道 → 控制器。听起来像一条流水线，但它其实是**洋葱**：响应出去的时候要原路返回，而异常过滤器只在出错时才登场。

最容易记错的三件事：

- **守卫跑在所有中间件之后、任何拦截器和管道之前。** 中间件是唯一一层「不知道终点在哪」的，守卫是第一个「知道即将执行哪个方法」的。
- **拦截器有两段。** 请求进去时是「全局 → 控制器 → 方法」，响应回来时完全反过来：方法 → 控制器 → 全局。因为它返回的是 Observable，按先进后出解析。
- **异常过滤器是唯一不从全局开始找的组件。** 它从离错误最近的那层往上找：方法级 → 控制器级 → 全局。而且异常不会在过滤器之间传递 —— 方法级的过滤器一旦接住，控制器级和全局的就再也看不到了。

## 五种组件，各自只该干一件事

### 中间件：唯一看不见终点的一层

官方文档里有一句我觉得写得特别准：**「middleware, by its nature, is dumb」** —— 它不知道 `next()` 之后会执行哪个 handler。守卫则相反，它拿得到 `ExecutionContext`，清楚下一步要执行的是谁。

这一句话直接决定了两件事。

**第一，它不适合做鉴权。** 因为鉴权往往要看「这个 handler 上标了什么」：

```ts
@Public()
@Get('health')
check() {}
```

中间件拿不到 `@Public()` 这层元数据，所以它没法知道这个接口该不该放行。守卫可以，因为守卫拿到的 `ExecutionContext` 里就有 `context.getHandler()`。

**第二，它抛出的异常只有全局异常过滤器接得住。** 因为中间件执行时路由处理器还没被选中，方法级和控制器级的过滤器都还没进入射程。NestJS 文档把这点写得很明确，而且 `@UseFilters()` 根本不能绑在中间件上。

那中间件该写什么？**只有站在原始 req/res 这一层才有意义的那些事**：CORS、helmet、cookie 解析、session、原始 body 的体积限制、给每个请求打一个 trace id。

有个容易忽略的细节：**`app.use()` 注册的中间件拿不到 DI 容器**，所以只能写成函数式。想注入依赖，就写成带 `@Injectable()` 的类，再在模块的 `configure()` 里用 `consumer.apply(X).forRoutes('*')` 绑定 —— 这样它由 Nest 实例化，构造函数注入才生效。

顺带一个版本相关的坑：**NestJS 11 起 Express 5 成了默认适配器，而 Express 5 的通配符必须具名。** `forRoutes('*')` 框架目前仍会自动转换、暂时还能跑，但文档已经明确「不再建议这么写」，新写法是 `forRoutes('{*splat}')`。Fastify 适配器更严格 —— 原来的 `(.*)` 直接不再支持。同一波变更还会影响 `@Get('users/*')` 这类路由写法（要改成 `users/*splat`）。这种坑平时毫无征兆，会集中在升级那一刻一起冒出来。

### 守卫：鉴权的正确归属地

守卫是唯一一个「知道自己即将放行或拦下哪个方法」的组件。它拿到的 `ExecutionContext` 既能 `switchToHttp()` 取请求，也能 `getHandler()` / `getClass()` 取即将执行的方法和控制器。

配上 `Reflector`，就有一种很干净的写法 —— **把「谁能访问」声明在方法上，把「怎么判断」收敛进一个守卫**：

```ts
// roles.decorator.ts
import { Reflector } from '@nestjs/core'
export const Roles = Reflector.createDecorator<string[]>()

// cats.controller.ts
@Post()
@Roles(['admin'])
create(@Body() dto: CreateCatDto) { /* ... */ }

// roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.get(Roles, ctx.getHandler())
    if (!roles) return true // 没标就是不限制
    const { user } = ctx.switchToHttp().getRequest()
    return roles.some((r) => user?.roles?.includes(r))
  }
}
```

新增一个只给 admin 的接口，只要在方法上多写一行 `@Roles(['admin'])`。**没有清单要维护，也就没有地方会漏。**

守卫返回 `false` 时，Nest 会替你抛 `ForbiddenException`（403）。想返回别的状态码，就在守卫里自己 `throw` —— 守卫抛出的异常会走异常过滤器那一层。

### 拦截器：包住整个执行过程的信封

拦截器的价值和其他组件不太一样：它是**唯一能同时看到「进去之前」和「出来之后」**的一层，因为 `next.handle()` 返回的是一个 Observable，响应是从这个流里流出来的。

所以它适合：耗时统计、统一响应包装、缓存、重试、把 service 抛的业务异常翻译成 HTTP 异常。

```ts
@Injectable()
export class TimingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const start = Date.now()
    return next.handle().pipe(
      tap(() => console.log(`${ctx.getHandler().name} ${Date.now() - start}ms`)),
    )
  }
}
```

两个容易翻车的细节：

- **`next.handle()` 是冷 Observable**，必须把它 `return` 出去才会被订阅执行。只调用不返回，请求就挂在那里不动了。
- 只想「看一眼」不想改数据，用 `tap` 而不是 `map`。用 `map` 很容易顺手把返回值换掉，然后前端开始报某个字段找不到。

### 管道：只管单个参数

管道的职责窄得可爱：**把一个参数转成另一个参数，或者校验不过就抛异常。** 一个请求里有几个参数，它就跑几次。

所以它天生适合 DTO 校验，也天生不适合做任何和「整个请求」有关的事 —— 你没法在管道里统计请求耗时，因为它会按参数个数重复执行。

配 `class-validator` 有个经典前提：**DTO 必须是 class，不能是 interface。** 因为 interface 只在编译期存在，运行时元数据里什么都没有，校验器拿不到字段类型。这也是「运行时反射」这一整套机制的共同前提 —— 装饰器、`@Injectable()`、`reflect-metadata`，全都建立在「类型信息被保留到运行时」之上。想明白这点，很多「为什么 NestJS 要求我这么写」的问题就自动消失了。

### 异常过滤器：唯一的兜底

过滤器在整条链路的最外层，职责是「不管上面哪一层炸了，都得给出一个格式统一的 HTTP 响应」。

它只处理**没被捕获**的异常。你自己 `try/catch` 吞掉的，它不知道，也不会触发。

想要全站统一的返回格式，通常得**拦截器 + 过滤器成对写**：成功路径由拦截器包成 `{ code, data }`，失败路径由过滤器包成同样的形状。只写一半，前端就得写两套解析逻辑。

## 两条不看文档一定会踩的绑定规则

**一、`app.useGlobalGuards(new RolesGuard())` 里的注入不生效。**

因为 `new` 出来的实例在 DI 容器之外，构造函数根本没被调用，里面注入的 `Reflector` 会是 `undefined`，然后 `this.reflector.get(...)` 直接抛 TypeError。

官方对这条的说明是：全局守卫在模块之外注册，注册发生在任何模块的上下文之外，因此无法注入依赖。

正确做法是把它当 provider 注册：

```ts
@Module({
  providers: [{ provide: APP_GUARD, useClass: RolesGuard }],
})
export class AppModule {}
```

`APP_GUARD` / `APP_INTERCEPTOR` / `APP_PIPE` / `APP_FILTER` 这四个 token 是框架在启动时消费的伪 provider。用它注册的组件效果上仍是全局的，但**走容器实例化**，注入就正常了。顺带一提，这类 token 是 `app.get()` 取不到的 —— 别想着运行时再把它捞出来。

**二、管道的执行顺序和参数顺序是反的。**

这条冷知识我第一次看到时以为文档写错了：在同一层里，**参数级的管道从最后一个参数开始跑，最后才轮到第一个参数**。控制器级和方法级的管道也遵循同样的方向。

所以如果两个参数各自的管道有副作用（比如都往同一个数组里 push），你看到的顺序会是倒过来的。日常做校验感觉不到，写带顺序的转换时会被坑一下。

## 那张判断准则

回到最开始的问题。判断一段逻辑该写在哪，其实只问一句：**它需要知道「即将执行的是哪个方法」吗？**

- **需要** → 守卫。鉴权、角色、限流、资源归属判断。
- **不需要，但要包住整个执行过程** → 拦截器。耗时、统一响应、缓存、重试。
- **不需要，且只针对某一个参数** → 管道。DTO 校验与转换。
- **不需要，只跟原始请求本身有关** → 中间件。CORS、cookie、session、trace id。
- **以上都不是，而是「出事了统一收拾」** → 异常过滤器。

按这个顺序往下套，基本不会放错。

## 最后

我现在的习惯是：**写任何横切逻辑之前，先问自己「它会想知道是哪个方法吗」，然后从守卫开始往下试。**

中间件是这五种里最「万能」的一个 —— 它什么都能干，所以也最容易被用来干不该它干的事。而它的代价从不在当下，而是在几个月后你想给某个接口开个口子的时候。

> 越靠前的组件，能拿到的东西越少；能拿到的东西越少，就越不该承担带业务含义的判断。
