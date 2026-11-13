# Tally Taskboard

React + FastAPI + Prisma + MySQL 的简易任务 CRUD 项目。

## 架构

生产环境全部运行在**同一台服务器**上，由 Docker Compose 编排：

```
浏览器
  │  HTTP :${APP_PORT}
  ▼
web (nginx)  ──/api/──▶  api (FastAPI :8000)  ──▶  db (MySQL 8.4 :3306)
  静态文件 + 反向代理          容器内部网络              仅在容器网络内可见
```

- 只有 `web` 会映射到宿主机端口（`APP_PORT`，默认 80），`api` 和 `db` 均不暴露到宿主机。
- 前端使用相对路径 `/api`，由 nginx 反向代理，因此不存在跨域问题或硬编码 IP。
- MySQL 数据保存在 Docker 命名卷 `mysql_data` 中，重新构建镜像不会丢数据。

## 本地运行

1. `cp .env.example .env`，填写两个安全密码。
2. `docker compose up --build`
3. 打开 `http://localhost`。

只跑前端开发服务器：`cd frontend && npm install && npm run dev`（Vite 已把 `/api` 代理到 `http://127.0.0.1:8000`）。

只跑后端：先设置 `DATABASE_URL`，然后

```sh
cd backend
uv sync
uv run prisma generate
uv run fastapi dev src/main.py
```

Prisma schema 位于 `backend/prisma/schema.prisma`。API 容器启动时会自动执行 `prisma db push`，本地连接新数据库时也可以手动执行：

```sh
cd backend
DATABASE_URL='mysql://user:password@localhost:3306/taskboard' uv run prisma db push
```

## 服务器部署（单机 + 内部 MySQL）

### 1. 准备服务器

服务器需安装 Docker Engine 与 Docker Compose v2：

```sh
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # 重新登录后生效
```

防火墙只放行 SSH 和 `APP_PORT`（默认 80）。**不要**放行 3306 和 8000。

### 2. 创建部署目录与 `.env`

```sh
sudo mkdir -p /opt/mono && sudo chown "$USER":"$USER" /opt/mono
cd /opt/mono
```

创建 `/opt/mono/.env`（不要提交到 Git）：

```env
MYSQL_DATABASE=taskboard
MYSQL_USER=taskboard
MYSQL_PASSWORD=<足够长的随机密码>
MYSQL_ROOT_PASSWORD=<另一个随机密码>
APP_PORT=80
TZ=Asia/Shanghai
```

> 密码建议只使用字母、数字和 `-` `_`。MySQL 密码会拼进 `DATABASE_URL`，若包含 `@`、`:`、`/` 等字符必须做 URL 编码（如 `@` → `%40`）。

### 3. 配置 GitHub Actions Secrets

在仓库 `Settings → Secrets and variables → Actions` 中添加：

| Secret | 说明 |
| --- | --- |
| `DEPLOY_HOST` | 服务器 IP 或域名 |
| `DEPLOY_USER` | SSH 用户名 |
| `DEPLOY_SSH_KEY` | 部署用私钥（对应公钥放入服务器 `~/.ssh/authorized_keys`） |
| `DEPLOY_PATH` | 部署目录，例如 `/opt/mono` |
| `DEPLOY_PORT` | 可选，SSH 端口，默认 22 |

建议为部署单独生成一对密钥，不要复用个人密钥。

### 4. 触发部署

推送 `main` 或手动运行 `CI/CD` workflow 即可，流程为：

1. **Verify**：`npm ci` + 前端生产构建 + 后端语法检查；PR 只跑这一步。
2. **Deploy**：
   - 通过 SCP 同步 `backend/`、`frontend/`、`docker-compose.yml` 到 `DEPLOY_PATH`（服务器上的 `.env` 不会被覆盖）。
   - SSH 执行 `docker compose up -d --build --remove-orphans`，在服务器本地构建镜像并滚动重启。
   - 通过 `web` 容器访问 `/health` 做健康检查，失败时输出最近日志并让 job 失败。
   - 清理旧镜像。

首次部署会自动创建 MySQL 容器、数据卷和表结构。

### 5. 验证与排障

```sh
cd /opt/mono
docker compose ps
docker compose logs -f --tail=100
curl -fsS http://127.0.0.1/health
```

常见问题：

- **数据库连接失败**：确认 `.env` 中密码与 `MYSQL_*` 一致，且 `docker compose ps` 中 `db` 为 `healthy`。
- **端口占用**：宿主机已有服务占用 80 时，把 `APP_PORT` 改成其他端口并放行防火墙。
- **修改密码后不生效**：`MYSQL_*` 只在数据卷首次初始化时生效，需要进入容器改密码或删除数据卷重建（会丢数据）。

### 数据备份

```sh
# 备份
docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup.sql

# 恢复
docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < backup.sql
```

`mysql_data` 卷是唯一的数据来源，迁移服务器时务必先备份。

## 可选：使用服务器外部的托管 MySQL

如果 MySQL 不在本机（例如 Aiven、云数据库），改用 `docker-compose.cloud.yml`。服务器 `.env` 只需要：

```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:PORT/DATABASE?ssl-mode=REQUIRED
APP_PORT=80
TZ=Asia/Shanghai
```

部署时把 workflow 中的 `docker-compose.yml` 换成 `docker-compose.cloud.yml` 和对应 `source` 即可。

> 如果 MySQL 是**宿主机原生安装**而不是容器：需要给 `api` 加 `extra_hosts: ["host.docker.internal:host-gateway"]`，把 `DATABASE_URL` 的 host 改成 `host.docker.internal`，并确保 MySQL 监听 `0.0.0.0` 且该用户允许从 Docker 网段连接。更推荐用上面的容器化 MySQL。

## GitHub Actions 免费额度

当前流程**完全在免费额度内**：

- **公开仓库**：标准 GitHub 托管 Runner 免费且不限分钟数。
- **私有仓库**：GitHub Free 每月 2,000 分钟；本项目的 `ubuntu-latest` 按 1 倍计费（macOS 为 10 倍，本流程未使用）。
- 单次运行通常 1–3 分钟（前端构建 + SCP + SSH），每月 2,000 分钟约可部署数百次。
- Docker 镜像构建发生在**你的服务器**上，不消耗 GitHub Actions 分钟数。
- 不归档 Actions artifacts，因此不占用 500 MB 的免费存储配额。

如需完全避免分钟数消耗，也可以把 workflow 指向自托管 Runner（`runs-on: self-hosted`），自托管 Runner 不计费。

参考：[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[GitHub 套餐](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)。
