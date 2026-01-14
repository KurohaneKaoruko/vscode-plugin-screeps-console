# Screeps Console（VS Code 插件）
在 VS Code 中查看 Screeps Console、发送命令，并支持shard切换。

## 功能
- 面板 Console：支持 Connect/Disconnect、发送命令、清空日志、重置 Token
- 自动连接：已保存 Token 时打开面板会自动尝试连接一次；失败后不重试，等待用户手动 Connect
- shard 选择：下拉选择 shard0~shard3；也会从服务器推送中自动识别 shard
- HTML 日志渲染：Screeps 输出的 HTML（颜色/格式）可直接显示
- 终端模式：提供 “Screeps Console” 终端配置文件（Terminal Profile）

## 使用
### 面板 Console（推荐）
1. 打开命令面板（`Ctrl+Shift+P`）
2. 运行 `Screeps: Show Panel Console`
3. 首次使用点击 `Connect`，输入 Screeps Auth Token（Account Settings -> Auth Tokens）
4. 之后再次打开面板会自动连接（仅尝试一次）

### 终端模式
- 命令面板运行 `Screeps: Open Console`
- 或在终端面板新建终端时，选择 `Screeps Console` 配置文件

## Token 管理
- Token 会保存到 VS Code Secret Storage（不会写入文件）
- 面板内 `Reset Token` 可清除 Token
- 也可以通过命令 `Screeps: Reset Auth Token` 清除 Token

## Shard
- 面板右上角下拉选择 shard
- 默认 shard3
- 连接后会根据服务器推送自动识别当前 shard；你也可以手动切换覆盖

## 方式一：开发调试运行（推荐）

1. 安装依赖

```bash
npm install
```

2. 编译

```bash
npm run compile
```

3. 按 `F5` 运行扩展

- 在当前仓库按 `F5` 会启动一个新的 “Extension Development Host” 窗口
- 或者打开底部终端面板，选择 `Screeps`

## 方式二：打包安装（.vsix）

1. 打包生成 VSIX

```bash
npm run package
```

2. 安装

- VS Code 扩展视图 → `...` → `Install from VSIX...`

## 发布（GitHub Actions）
### 自动发布
- 推送 tag（`vX.Y.Z`）到 GitHub 后，会自动构建并创建 Release，附带 `.vsix`

### 手动补发旧版本
- GitHub → Actions → `Release VSIX` → `Run workflow`
- 输入 `tag`（例如 `v1.0.0`）即可针对该 tag 重新发布

### 一条命令发布（本地）
- 交互式发布（上下键选择，回车确认）：

```bash
npm run release
```

- 预演（不做任何改动，仅输出将执行的命令）：

```bash
npm run release:dry
```
