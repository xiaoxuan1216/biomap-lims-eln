# 生产部署与升级

## 必需配置

- `DATABASE_URL`：独立 MySQL/TiDB 数据库账号，限制到本应用数据库。
- `APP_ID` / `APP_SECRET`、`KIMI_AUTH_URL` / `KIMI_OPEN_URL`：Kimi OAuth 登录配置。
- `SESSION_SECRET`：至少 32 字节的独立随机值，不与 OAuth 密钥复用。
- `PUBLIC_BASE_URL`：生产环境必须是 HTTPS 的公开根地址，且 OAuth 回调必须登记为 `<PUBLIC_BASE_URL>/api/oauth/callback`。
- `OWNER_UNION_ID`：首位管理员；其他角色由管理员接口分配。
- `API_TOKENS`：可选，格式见 `docs/api.md`；不配置即关闭开放 API。

可选的开放式模型问答使用 `KIMI_API_KEY`、`KIMI_API_BASE_URL` 和 `KIMI_MODEL`。默认 `KIMI_ALLOW_LAB_CONTEXT=false`，不会自动把实验室摘要发送给模型；只有部署方完成数据出境与保密评估后才应开启。

## 升级步骤

1. 对数据库做可恢复备份，并在隔离环境验证恢复。
2. 先在预发布环境启动新镜像。应用会依次执行 `db/migrations` 中的版本化迁移、验证/初始化审计哈希链，并为旧 ELN 建立初始快照。
3. 如果旧库存在重复冻存格位、节点键或连线键，迁移会给出冲突并停止；先人工核对和清理，不会静默覆盖。
4. 运行 `npm run verify`，再走查登录、库存并发写入、设备冲突预约、ELN 完成→复核签署→追加修订。
5. 切换生产流量后观察 `/healthz`、应用日志和数据库错误；保留旧镜像与备份直到验收完成。

迁移失败时应用不会继续提供服务。不要通过手工修改迁移历史绕过失败；修复数据或迁移脚本后重新部署。

## 运维控制

- TLS 在可信反向代理终止，并保留 `Secure`/`HttpOnly`/`SameSite=Lax` Cookie。
- 定期轮换会话密钥、OAuth 密钥和 API 令牌；轮换 `SESSION_SECRET` 会使现有会话失效。
- 定期备份并做恢复演练；数据库备份、对象附件与应用版本应使用同一恢复点。
- 定期由管理员运行审计链校验，发现断链或签名哈希异常时停止更改并保全证据。
- AI 输出仅供研究参考，关键参数必须按已验证 SOP 和仪器/试剂方法复核。
