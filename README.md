# 仓位计算助手

单页仓位计算与水平止盈推荐，仅使用富途授权行情，不自动下单。

线上入口：https://cw-futu-backend.dchan0831.workers.dev

免费日线缓存、定时刷新、第三方 API Key 和文件导入均已移除。
历史测试样本仅用于计算测试，不打包或提供为行情源。
测试：`node scripts/test-planner.js`、`node scripts/test-exits.js`。

## 富途个人行情接入

运行 `python3 scripts/futu_bridge.py`，保持终端运行，然后打开
<http://localhost:8768> → 智能止盈计划 → 行情来源选“富途（本机授权）” → 连接富途。
在富途官方域名 `webapi.futunn.com` 登录，只勾选 `quote:read`（读取行情）。
不要授权交易或账户读取。服务会拒绝交易及写入权限。

本机桥接使用官方 OAuth PKCE / REST，只监听 127.0.0.1，不保存凭证文件、日志、环境变量，
刷新凭证也只在内存中。关闭服务会清除连接；“断开”清除本机凭证，但不等同于在富途撤销授权。
需要彻底撤销时，请在富途的授权管理中撤销 CW 看板。
当前接入美股前复权日线，最多370根；仅请求所选日期之前的日线，不获取当日未完成行情。
这是个人本机使用，不把富途行情上传公共缓存。GitHub Pages 在线版显示入口说明，不能运行此后台。
跨设备在线使用仍需部署独立 HTTPS 私有后台。免费额度和推广权限以富途账号实际状态为准。
官方文档：https://open.futunn.com/api/overview/getting-started

## Cloudflare Worker 线上富途入口

`worker/index.mjs` 提供同源 HTTPS 看板、OAuth PKCE、日线接口。
每个浏览器独立授权，不共享个人富途凭证。令牌以 AES-GCM 加密保存在 KV，
浏览器只持有 Secure/HttpOnly/SameSite=Lax 会话 Cookie。关闭 Worker 请求日志。
只读 `quote:read`；账户及交易权限被拒绝。每次最多370根前复权日线。

部署准备：`sh scripts/package-worker.sh`；创建 KV 并替换 wrangler.jsonc 中的 ID；
通过 `wrangler secret put TOKEN_ENCRYPTION_KEY` 设置随机32字节密钥（base64url），
然后 `wrangler deploy -c worker/wrangler.jsonc`。
勿将密钥、Token 或 `.dev.vars` 提交到 Git。
Worker 同时提供 HTTPS 看板入口，Pages 保持原入口，通过链接进入线上富途版。
首次在线使用需要重新在富途授权；本机授权不会自动上传。
测试：`node scripts/test-worker.mjs`。免费配额用尽会停止服务，不自动升级付费。

线上入口：https://cw-futu-backend.dchan0831.workers.dev

已部署 KV 会话存储与 Worker 加密密钥；密钥只存在 Cloudflare Secret 中。
更新 Worker：`sh scripts/package-worker.sh` 后执行
`npx wrangler@4 deploy --config worker/wrangler.jsonc`。
不要重复生成加密密钥，否则现有会话将无法解密。

## 水平区止盈与余仓参考

候选仅来自已确认水平高低点与前日高低点，均线不参与价位聚合或补足档位。
默认至少1R，最多距开仓4 ATR，可选2/4/6 ATR；这些筛选参数没有收益保证，未经过策略回测。
ATR为最近14根日线真实波幅的简单平均，不是Wilder平滑。
余仓参考需手动填写持仓后极值、当前保护价；做多取 max(初始止损, 当前保护价, 极值−倍数×ATR)，
做空对称取min。倍数默认2可选1.5/3，使用开仓前ATR快照，不是实时追踪或自动订单。
测试 `node scripts/test-exits.js`。

## 一周规则 v1

仓位计算与退出计划共用开仓价、止损、风险预算和费率。P1取最近水平区，若不足1.5R则拒绝开仓候选，
不跳过近处阻力。最多三档，显示距离筛选内最近的实际水平区；默认将原始仓位的70%按档均分，比例可编辑、合计不超过100%，0%跳过该档。
余仓参考需手动确认P1成交和60分钟两根K线结构，填新旧结构价及60分钟ATR，
做多取max(初始止损,当前保护价,新低点−0.25ATR)，做空对称；不自动查询分钟数据或下单。
当前交易日与第2天收盘情况手动复核，第2天无进展退出，第5天收盘前清仓。
实际结算使用勾选的档位及实际均价，剩余部分可另填退出价；未平仓不计浮盈。
开仓费按已卖比例分摊，其他费用替代预算预留；保证金释放只按原仓比例估算。
规则参数没有回测保证。测试 `node scripts/test-week.js`。

## 当前精简界面

同一页只保留仓位计算、水平止盈推荐与分批收益测算。
已移除余仓保护、持仓时间检查、实际成交结算表单及其事件处理。
保证金损失上限与手续费放入高级设置，默认70%及单边0.05%。
历史文档中的一周持仓管理表单不再提供；水平区与动态分档推荐计算继续保留。

## 当前一键界面

股票代码、方向、开仓、止损及风险预算同在交易参数面板。
修改交易参数后自动获取富途日线、生成实际候选档位并计算收益。计划列表采用固定高度，档位较多时在列表内滚动。
日期和ATR筛选放在高级设置；行情依据折叠；常见桌面视口采用紧凑左右布局。
行情请求失败时清空旧推荐，仓位计算保持可用。

## 切换股票自动填价

代码输入停止900ms后读取富途stock-quote（常规时段最新成交价，显示报价时间），
立即清除旧股票开仓/止损与推荐。自动填入新报价，做多参考最近10根已完成日线最低点减0.1日线ATR，
做空参考最高点加0.1ATR；方向不合适则留空要求手动确定，不伪造价格。
切换时亏损预算不变；自动值可手动修改。新股票模式使用当前美股日期，历史日期需在手动价格模式配置。
停止输入、按回车或点击生成均可触发；旧响应被取消或丢弃，读取中手动改价不会被异步覆盖。
参考止损规则未回测，不能代替交易结构判断。测试：`node scripts/test-price-defaults.js`。

## 仅绑定 cw 子域名（GoDaddy 保留权威 DNS）

使用 Cloudflare Pages 高级模式，`scripts/package-pages.sh` 打包相同后端到 `_worker.js`，
独立 KV 命名空间与加密密钥。`pages/wrangler.jsonc` 为 Pages 部署配置。
`cd pages && npx wrangler@4 pages deploy ../_pages-site --project-name cw-position-helper --branch main`。
需要 Pages 部署权限。域名只绑定 cw.dcdddd.com，外部 DNS 使用 Pages 项目返回的 pages.dev CNAME。
不更换 dcdddd.com 名称服务器，不影响其他主机记录。Pages 新域名需要重新完成富途只读授权。

Pages 已部署：https://cw-position-helper.pages.dev
自定义域 cw.dcdddd.com 已添加，等待 GoDaddy CNAME：cw → cw-position-helper.pages.dev。
Pages TOKEN_ENCRYPTION_KEY 已设置（独立于 Worker），不要重复生成。
首次创建 Pages 项目时，当前 Wrangler 必须使用 `pages project create cw-position-helper --production-branch main --force`
以避免自动转换成 Worker；项目已存在，后续 `pages deploy` 无需此参数。
