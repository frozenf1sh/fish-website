# 前端下一阶段规划

## 本阶段已完成

- 页面路由改为按需加载，博客、相册、搜索、动态详情和个人中心不会阻塞首页首屏。
- 为路由区域增加统一错误兜底，避免单页运行时错误让整个站点变成空白页。
- 统一了中等宽度屏幕的响应式断点：侧栏隐藏时同时显示顶部和底部导航。
- 增加键盘焦点样式和 `prefers-reduced-motion` 支持，改善可访问性。
- 移除了“关于/项目”伪入口，改为明确的规划提示；未登录状态下不再错误打开设置面板。
- 抽取博客、相册和图片引用的共享领域类型，减少页面间 DTO 漂移。
- 抽取带超时清理的异步请求辅助函数，并为博客列表、相册列表和相册详情增加请求序列保护，避免快速切换目录/相册时旧响应覆盖新状态。
- 将 Markdown/KaTeX、樱花粒子、登录弹窗和设置抽屉改为真正按需加载；首屏不再携带富文本渲染和粒子系统的大型依赖。

## 下一阶段建议

### P0：前端领域层拆分

目前 `BlogPage.tsx` 和 `AlbumsPage.tsx` 同时承担页面编排、请求、表单、上传、批量操作和弹窗状态。建议按后端领域边界拆成：

- `features/blog`: article list、folder tree、editor、article detail、blog repository
- `features/album`: album list、image gallery、upload workflow、recycle bin、reference repair
- `features/post`: timeline、composer、post detail
- `shared/api`: Connect RPC client、DTO 到 ViewModel 的映射、统一错误转换

页面组件只负责组合 feature，不直接编排所有请求和副作用。

### P1：数据请求与缓存

当前使用 Zustand + `useEffect` 手写请求状态，存在重复请求、竞态和缓存缺失。建议下一阶段引入 TanStack Query（或在现有基础上实现等价的 query layer），统一处理缓存、取消请求、重试、分页和 mutation invalidation。

### P1：契约与类型生成

当前多个页面重复定义 `BlogArticle`、`AlbumImage` 等近似 DTO。应以生成的 protobuf 类型为边界，在 `shared/api/mappers` 集中转换，避免页面自行猜测时间字段和可选字段。

### P1：上传体验

相册和动态编辑器各自实现上传/重试/压缩，建议抽成可复用的上传任务模型，提供并发数限制、取消、进度、失败重试和断点恢复；同时补充大文件、重复文件和移动端网络切换的处理。

### P2：可观测性与测试

- 补充 Vitest + Testing Library 的关键交互测试：登录过期、博客编辑、图片上传、批量删除/移动。
- 用 Playwright 覆盖首页、博客编辑、相册上传三个核心流程。
- 将 `console.error` 替换为带 request/action context 的 logger，并在生产环境接入错误上报。
- 继续拆分构建产物：当前入口已显著变小，但 Connect RPC、tsparticles 和 Framer Motion 仍是主要公共依赖。

### P2：产品内容模块

“项目”和“关于”应先确定后端内容模型、权限和排序规则，再做页面。推荐设计成可配置模块（项目卡片、时间线、友链、Now 页面），避免继续在导航中堆叠硬编码占位项。
