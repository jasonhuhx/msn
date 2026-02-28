# CIBC Chrome Extension: Transactions Sync Plan

## Goal

在现有“账户余额同步到 Notion”的基础上，扩展插件配置层和 UI，使插件能够为后续的“信用卡交易记录同步”提供独立的 Notion Database 连接与字段映射能力。

这一阶段做：

- 设置页 UI 调整
- 两个 Notion Database 的 block link 配置
- 本地存储结构升级
- Transactions Database 的 field mapping
- 基础 schema 校验
- 对空库或“只有 Title/Name 列”的库做自动补列

这一阶段不做：

- 交易记录 DOM 抓取的正式实现
- 交易去重逻辑
- 交易同步写入逻辑

说明：

- `Transactions` 的 DOM 选择器先用 placeholder 思路处理，后续再根据真实页面结构补齐。
- 交易去重先不实现，后续再设计唯一键或幂等策略。
- 现有 Account Balance 同步逻辑尽量不改，但配置命名可以升级为更清晰的 `balanceDatabase`。

## Current State

当前代码结构的核心特点：

- 设置页只支持一个 `selectedDatabase`
- Popup 只支持账户余额同步
- Notion Database 的选择方式是扫描 workspace 中所有可访问数据库，再让用户手动勾选
- 同步逻辑默认将当前页面上的账户名称和余额写入同一个数据库

主要涉及文件：

- [src/options/index.html](/Users/jason/Developer/msn-jason/src/options/index.html)
- [src/options/index.ts](/Users/jason/Developer/msn-jason/src/options/index.ts)
- [src/options/notion.ts](/Users/jason/Developer/msn-jason/src/options/notion.ts)
- [src/popup/index.ts](/Users/jason/Developer/msn-jason/src/popup/index.ts)
- [src/global.d.ts](/Users/jason/Developer/msn-jason/src/global.d.ts)

## Product Direction

插件后续会支持两类数据写入 Notion：

1. `Account Balance`
2. `Transactions`

对应两套独立的 Database 配置：

### 1. Account Balance Database

用于保存已有余额同步数据，目标字段：

- `Account Name`
- `Balance`
- `Date`

### 2. Transactions Database

用于保存新增信用卡交易记录，目标字段：

- `Date`
- `Amount`
- `Merchant` 或 `Description`
- `Account Name`

其中 `Account Name` 的目标格式为：

`信用卡名称 + 卡号后四位`

## New Configuration Flow

不再让用户扫描整个 workspace；改为让用户分别提供两个 Notion database block link。

### User Flow

1. 用户在 Notion 中准备两个 database
2. 用户复制：
   - `Balance Database Block Link`
   - `Transactions Database Block Link`
3. 用户在设置页中粘贴两个 link
4. 插件使用 `Notion API Key` 验证 link 并读取 database 信息
5. 插件对目标库做 schema 检查
6. 如果库为空或缺少必需字段，插件尝试自动补齐字段
7. 对 Transactions Database 让用户完成 field mapping
8. 验证通过后保存配置

## Scope Clarification for "Block Link"

这一期 UI 对用户使用 `Block Link` 文案，但实际支持范围建议收敛为：

- 支持：能解析到原始 database 的 Notion URL / block link
- 暂不承诺：任意 page link、linked database view、无法直接解析到 database 的 block link

原因：

- 插件最终需要的是可写入 database 的 id
- Notion API 读取与更新 schema 时需要直接面向 database
- linked view 和普通 page/block link 不一定能稳定映射到可写入的原始 database

设置页文案建议使用：

- `Balance Database Block Link`
- `Transactions Database Block Link`

## Planned Changes

## 1. Storage Model Upgrade

保持现有 balance sync 的运行逻辑尽量不变，同时新增 transactions 配置，并把命名升级为更清晰的业务语义。

### Current

- `selectedDatabase`
- `notionApiKey`

### Target

- `balanceDatabase`
- `transactionsDatabase`
- `transactionsFieldMapping`
- `notionApiKey`

### Why Rename to `balanceDatabase`

- `selectedDatabase` 这个名字已经不能准确表达业务含义
- 后续会同时存在 Balance 和 Transactions 两套数据库配置
- 使用 `balanceDatabase` 更容易理解，也更利于后续扩展

### Runtime Constraint

- 本阶段主要投入在 Transactions Database
- 为降低回归风险，不重构 balance sync 的写入路径
- 即使 storage key 改名，popup 内部也可以在最小改动下继续沿用现有 balance sync 写入方式

### Database Config Shape

每个 database 配置建议保存：

- `id`
- `title`
- `icon`
- `emoji`
- `properties`
- 原始 `link`
- `schemaStatus`

`transactionsFieldMapping` 建议保存：

- `dateProperty`
- `amountProperty`
- `merchantProperty`
- `accountNameProperty`

如后续 Notion API 版本需要，也可预留：

- `dataSourceId`

### Migration

需要做一次向后兼容：

- 如果已有旧版 `selectedDatabase`
- 升级后自动迁移为 `balanceDatabase`
- 不强制用户重新选择 Balance Database
- popup 和 options 在读取配置时应兼容旧 key，直到迁移完成

## 2. Settings UI Redesign

设置页仍保留账户勾选区，但 Notion 配置区改为两个独立的 database 配置面板。

### Keep

- `Notion API Key` 输入框
- `Select Accounts` 区域
- `Save` 按钮

### Replace

- 去掉“扫描 workspace 中所有数据库并勾选”的主流程

### Add

- `Balance Database Block Link` 输入框
- `Transactions Database Block Link` 输入框
- 每个数据库自己的 `Connect` / `Validate` 按钮
- 每个数据库自己的连接结果卡片
- Transactions Database 的 `Field Mapping` 区域

### Proposed UI Structure

设置页里的 Notion 区域建议拆成三个卡片：

1. `Notion API`
   - API Key 输入框
   - API 连通性错误提示

2. `Balance Database`
   - block link 输入框
   - `Connect` 按钮
   - 已连接数据库卡片
   - schema 结果
   - 自动补列结果提示

3. `Transactions Database`
   - block link 输入框
   - `Connect` 按钮
   - 已连接数据库卡片
   - schema 结果
   - 自动补列结果提示
   - field mapping 表单

### Connected Database Card

每张卡片建议展示：

- 数据库标题
- icon 或 emoji
- database id
- 当前属性列表
- schema 校验结果
- 自动补列结果

并提供操作：

- `Reconnect`
- `Clear`

## 3. Notion Link Parsing and Validation

新增“通过 block link 获取 database”的流程。

### Validation Steps

1. 用户输入 database block link
2. 前端从链接中解析 database id
3. 用 `Notion API Key` 初始化 client
4. 调用 Notion API 读取目标 database
5. 校验 integration 是否有权限访问
6. 对 schema 做检查
7. 如果缺失字段且属于可自动补齐范围，则调用 Notion API 更新 database properties
8. 重新读取最新 schema
9. 保存数据库元信息和 schema 快照

### Validation Failure Cases

需要明确处理以下错误：

- API key 无效
- link 格式错误
- 无法从 link 中解析 database id
- integration 没有访问权限
- link 指向的不是可访问的原始 database
- 自动补列失败

## 4. Schema Validation and Auto-Fill

本阶段不再只做“检测后报错”，而是对可确定的缺失字段尝试自动补齐。

### Balance Database Rules

Balance Database 至少需要：

- 1 个 `title`
- 1 个 `number`
- 1 个 `date`

自动补列策略：

- 如果已有 `title`，直接将其视为 `Account Name`
- 如果缺少 `number`，自动新增 `Balance`
- 如果缺少 `date`，自动新增 `Date`

### Transactions Database Rules

Transactions Database 至少需要可映射出：

- `Date`
- `Amount`
- `Merchant/Description`
- `Account Name`

属性类型要求：

- `Date` -> `date`
- `Amount` -> `number`
- `Merchant/Description` -> `title` 或 `rich_text`
- `Account Name` -> `rich_text`

自动补列策略：

- 如果数据库只有默认的 `Title/Name` 列，则优先把它当作 `Merchant/Description`
- 如果缺少 `Amount`，自动新增 `Amount` (`number`)
- 如果缺少 `Date`，自动新增 `Date` (`date`)
- 如果缺少 `Account Name`，自动新增 `Account Name` (`rich_text`)

### Auto-Fill Scope

这一阶段自动补列只处理“安全且明确”的场景：

- 空库
- 只有默认 `Title/Name` 列的库
- 缺少标准必填字段，但可以用固定名称补齐的库

这一阶段暂不做：

- 自动重命名用户已有字段
- 自动删除多余字段
- 自动推断多个同类型字段的业务语义

## 5. Transactions Field Mapping

这一阶段加入 Transactions Database 的 field mapping。

### Why Mapping Is Needed

仅按属性类型校验不够，因为 Transactions 至少有两个文本字段：

- `Merchant/Description`
- `Account Name`

如果只知道“有两个文本列”，后续写入时仍然不知道哪个字段对应哪个业务含义。

### Mapping Scope in This Phase

只对 Transactions Database 加 field mapping：

- `Date`
- `Amount`
- `Merchant/Description`
- `Account Name`

Balance Database 暂不引入 mapping，继续沿用现有基于 `title/number/date` 的读取与写入逻辑。

### Mapping UI Proposal

Transactions Database 连接成功后展示 4 个下拉框：

- `Date Field`
- `Amount Field`
- `Merchant/Description Field`
- `Account Name Field`

约束建议：

- 每个下拉框只显示兼容类型的属性
- 同一属性不能被重复映射到多个业务字段
- 当自动补列后，尽量预选默认映射
- 只有 mapping 完整时才允许保存

### Suggested Default Mapping

优先级建议：

- `Merchant/Description` 优先选择唯一的 `title`；否则选名为 `Merchant` 或 `Description` 的 `rich_text`
- `Account Name` 优先选择名为 `Account Name` 的 `rich_text`
- `Amount` 优先选择名为 `Amount` 的 `number`
- `Date` 优先选择名为 `Date` 的 `date`

## 6. Popup Readiness Update

本阶段虽然不实现交易同步，但 popup 需要为双数据库配置做好准备。

### Popup Changes in This Phase

- 读取 `balanceDatabase` 作为 Account Balance Database
- 新增读取 `transactionsDatabase`
- 新增读取 `transactionsFieldMapping`
- 在 UI 中展示两个数据库的连接状态

### Important Constraint

当前 Account Balance 的同步逻辑尽量不改：

- 存储层可升级为 `balanceDatabase`
- 仍然按现有方式查找 `title` / `number` / `date`
- 不在本阶段引入 balance sync 的 field mapping 或写入逻辑重构

## 7. Recommended Implementation Order

1. 扩展全局类型与 storage schema，补充 transactions database 与 mapping 类型
2. 将 `selectedDatabase` 迁移为 `balanceDatabase`，并新增 `transactionsDatabase + transactionsFieldMapping`
3. 重构设置页 UI，改为两个 block link 输入区
4. 实现 block link 解析和单库校验
5. 实现 schema 检查与自动补列
6. 为 Transactions Database 增加 field mapping UI 与保存逻辑
7. 调整 popup 以展示双数据库状态，但不重构现有 balance sync 主逻辑

## Acceptance Criteria for This Phase

完成本阶段后，应满足以下结果：

- 用户可以输入 `Notion API Key`
- 用户可以分别粘贴 Balance 与 Transactions 的 Notion database block link
- 插件可以校验两个 link 是否对应可访问的 Notion database
- 对空库或仅有默认 `Title/Name` 列的库，插件会自动补上缺失字段
- 设置页可以显示两个数据库的连接状态和字段概览
- Transactions Database 可以完成 4 个业务字段的 mapping
- mapping 不完整时，Transactions Database 配置不可保存
- 已有旧版用户的 `selectedDatabase` 会被兼容并迁移到 `balanceDatabase`
- 现有 Account Balance 同步逻辑不需要大改即可继续工作

## Out of Scope

以下内容不属于本阶段交付：

- 信用卡交易 DOM 选择器定稿
- 交易数据抓取
- 交易同步到 Notion
- 交易去重
- 自动推断复杂 schema 下的业务字段语义
- Balance sync 的写入链路重构

## Open Questions for Later

- 是否要把 Balance Database 也升级到显式 field mapping
- 是否要支持 linked database 或更宽泛的 page/block link
- 交易同步是否需要增量同步与幂等控制
- 自动补列后，是否要允许用户一键重命名为更友好的字段名
