# WebGL OffscreenCanvas Worker 演示

这个项目展示了使用现代Web技术实现高性能图形应用的方法，通过将渲染工作从主线程分离，确保用户界面始终保持响应。

## 功能特点

- **多线程渲染**：使用Web Worker将WebGL渲染与主UI线程完全分离
- **OffscreenCanvas**：将Canvas控制权转移到Worker线程，实现真正的多线程渲染
- **WebAssembly集成**：通过编译C代码到WASM提升性能
- **实时用户输入**：在主线程捕获用户输入并传递给渲染线程
- **平滑动画**：维持高帧率的同时不影响UI响应性

## 技术架构

这个演示使用了以下关键技术：

1. **Web Worker** - 提供独立的JavaScript执行线程
2. **OffscreenCanvas** - 允许在Worker中进行Canvas渲染
3. **WebGL** - 用于高性能图形渲染
4. **WebAssembly** - 运行编译自C语言的高性能代码
5. **Emscripten** - 将C/C++代码编译为WebAssembly

## 文件结构

- `index.html` - 主页面和用户界面
- `main.js` - 主线程代码，处理用户输入和UI更新
- `worker.js` - Worker线程代码，处理渲染和WASM执行
- `demo.c` - C源代码，编译为WebAssembly
- `demo.js` - 由Emscripten生成的JavaScript胶水代码
- `demo.wasm` - 编译后的WebAssembly模块
- `build_and_run.sh` - 编译脚本

## 运行方法

1. 确保已安装[Emscripten](https://emscripten.org/docs/getting_started/downloads.html)
2. 编译WebAssembly模块：
   ```
   ./build_and_run.sh
   ```
3. 启动HTTP服务器（必须，不能通过文件协议直接打开）：
   ```
   python3 -m http.server 8000
   ```
4. 打开浏览器访问：http://localhost:8000/index.html

## 使用方式

1. 页面加载后，您将看到一个彩色三角形
2. 点击"开始渲染"按钮启动动画
3. 使用键盘控制三角形移动：
   - 方向键(↑ ↓ ← →)控制三角形位置
   - 空格键重置三角形到中心位置
4. 使用速度滑块调整三角形移动速度
5. 点击"停止渲染"暂停动画

## 性能优势

这种架构相较于传统单线程Canvas渲染有显著优势：

1. **UI永不阻塞** - 即使渲染复杂场景，用户界面依然流畅响应
2. **充分利用多核CPU** - 渲染和界面交互在不同的CPU核心上执行
3. **渲染不受主线程影响** - 主线程繁忙时渲染依然平滑

## 进一步探索

您可以通过以下方式扩展此项目：

- 添加更多复杂的3D模型和渲染
- 实现更高级的交互控制
- 集成物理引擎
- 实现多实例渲染

## 浏览器兼容性

此演示需要以下浏览器API支持：
- Web Worker
- OffscreenCanvas
- WebGL2
- WebAssembly

支持的浏览器包括：
- Chrome 69+
- Edge 79+
- Firefox 79+
- Safari 16.4+
