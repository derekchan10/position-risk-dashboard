# 仓位与杠杆看板

静态计算器，配合定时日线缓存与可选行情接口，不自动交易。

适用于线性 U 本位合约；输入为手动数据。费用与滑点为估计，强平规则须在交易平台核实。

## 发布

GitHub Pages 选择 Deploy from a branch，分支 main，目录 / (root)。

## 智能止盈计划

- 常用股票日线由 Yahoo Finance 获取并缓存，工作日 UTC 22:30 定时刷新；正在交易的日线不写入缓存。数据不是实时行情。
- 在 Actions 的 Update daily data and deploy 中手动运行，symbols 可填新增代码（逗号分隔）。其他股票也可在浏览器临时输入 Twelve Data API Key，或导入同格式日线 JSON。密钥不存储、不提交仓库。
- 开仓日期严格使用 `< date` 的已完成日线；日内当时的均线不在此口径内。SMA20/50/100/200 数据不足时显示缺失。
- 水平区使用最近90根日线已确认的左右各2根局部高低点，以及前日高低点；按波动范围聚合。前方至少1R的最近三个区作为候选，不足不补。
- 默认分配25/25/25、留25%；另有40/25/15、留20%，仅为可编辑模板。做多寻找压力区，做空寻找支撑区。
- 收益假设所有档位成交，按原始数量分摊开平仓费与费用预留；止盈滑点未计。价格R不扣费；净收益/总风险预算另行显示。剩余仓位触发原止损的结果仅为情景计算。
- 推荐是透明规则生成的候选，不是已验证盈利策略，也不保证成交、收益或强平安全。

本地检查：`node scripts/test-planner.js`。行情刷新：`python3 scripts/update_market.py`。

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
不跳过近处阻力。最多P1/P2两档，固定原仓40%/30%；只有P1时留60%。
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
历史文档中的一周持仓管理表单不再提供；水平区与两档推荐计算继续保留。
