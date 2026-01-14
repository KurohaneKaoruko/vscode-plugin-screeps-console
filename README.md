# vscode-plugin-screeps-console
在vscode中登录screeps控制台的插件

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
- 在新窗口里打开命令面板（`Ctrl+Shift+P`），运行 `Screeps: Open Console`
- 或者打开底部终端面板，点击新建终端的下拉，选择 `Screeps Console`

## 方式二：打包安装（.vsix）

1. 安装打包工具

```bash
npm i -g @vscode/vsce
```

2. 打包生成 vsix

```bash
vsce package
```

3. 安装

- VS Code 扩展视图 → `...` → `Install from VSIX...`
