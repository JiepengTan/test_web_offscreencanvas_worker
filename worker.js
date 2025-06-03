// worker.js - Worker线程脚本
// 用于在Worker中加载和运行WebGL WASM模块，并通过OffscreenCanvas渲染

// 全局变量
let canvas = null;
let gl = null;
let WasmModule = null;
let animationFrameId = null;
let lastTime = 0;
let running = false;
let pendingMessages = [];
let moduleLoaded = false;
let warnedAboutFrame = false; // 记录是否已经显示过frame函数缺失的警告

// 三角形位置和控制
let triangleX = 0.0;
let triangleY = 0.0;
let moveSpeed = 0.5; // 每秒移动的距离
let keyStates = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

// WebGL相关变量
let shaderProgram = null;
let triangleBuffer = null;
let triangleColorBuffer = null;
let positionAttrib = null;
let colorAttrib = null;
let rotationUniform = null;

// 初始化OffscreenCanvas和WebGL上下文
function initCanvas(offscreenCanvas) {
    console.log('DEBUG: 初始化Canvas, offscreenCanvas尺寸:', 
                offscreenCanvas.width, 'x', offscreenCanvas.height);
    
    canvas = offscreenCanvas;
    try {
        // 尝试获取WebGL上下文
        console.log('DEBUG: 尝试获取WebGL上下文');
        
        // 首先尝试webgl2
        gl = canvas.getContext('webgl2');
        if (gl) {
            console.log('DEBUG: 成功创建WebGL2上下文');
        } else {
            console.log('DEBUG: WebGL2不可用，尝试WebGL1');
            gl = canvas.getContext('webgl');
            if (gl) {
                console.log('DEBUG: 成功创建WebGL1上下文');
            }
        }
        
        if (!gl) {
            console.error('DEBUG: 无法创建WebGL上下文');
            postMessage({ type: 'error', status: '无法创建WebGL上下文' });
            return false;
        }
        
        // 初始化WebGL
        initWebGL();
        return true;
    } catch (e) {
        postMessage({ type: 'error', message: `WebGL错误: ${e.message}` });
        return false;
    }
}

// 初始化WebGL
function initWebGL() {
    console.log('DEBUG: 开始初始化WebGL');
    
    // 创建着色器
    const vertexShaderSource = `
        attribute vec3 position;
        attribute vec4 color;
        varying vec4 vColor;
        uniform float rotation;
        
        void main() {
            float rad = rotation * 3.14159 / 180.0;
            float cosA = cos(rad);
            float sinA = sin(rad);
            mat3 rotationMatrix = mat3(
                cosA, -sinA, 0.0,
                sinA, cosA, 0.0,
                0.0, 0.0, 1.0
            );
            vec3 rotatedPosition = rotationMatrix * position;
            gl_Position = vec4(rotatedPosition, 1.0);
            vColor = color;
        }
    `;
    
    const fragmentShaderSource = `
        precision mediump float;
        varying vec4 vColor;
        void main() {
            gl_FragColor = vColor;
        }
    `;
    
    // 编译着色器
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    
    // 检查编译状态
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error('DEBUG: 顶点着色器编译失败:', gl.getShaderInfoLog(vertexShader));
    }
    
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    
    // 检查编译状态
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error('DEBUG: 片段着色器编译失败:', gl.getShaderInfoLog(fragmentShader));
    }
    
    // 创建着色器程序
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    
    // 检查链接状态
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('DEBUG: 着色器程序链接失败:', gl.getProgramInfoLog(shaderProgram));
    }
    
    // 获取属性位置
    positionAttrib = gl.getAttribLocation(shaderProgram, 'position');
    colorAttrib = gl.getAttribLocation(shaderProgram, 'color');
    rotationUniform = gl.getUniformLocation(shaderProgram, 'rotation');
    
    console.log('DEBUG: 属性位置 - position:', positionAttrib, 'color:', colorAttrib);
    
    if (positionAttrib === -1 || colorAttrib === -1) {
        console.error('DEBUG: 无法获取着色器属性位置!');
    }
    
    // 创建顶点缓冲
    triangleBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
    
    // 创建颜色缓冲
    triangleColorBuffer = gl.createBuffer();
    
    // 设置初始顶点数据
    const vertices = [
        0.0,  0.5, 0.0,  // 顶部
       -0.5, -0.5, 0.0,  // 左下
        0.5, -0.5, 0.0   // 右下
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    
    // 设置颜色数据
    const colors = [
        1.0, 0.0, 0.0, 1.0,  // 红色
        0.0, 1.0, 0.0, 1.0,  // 绿色
        0.0, 0.0, 1.0, 1.0   // 蓝色
    ];
    gl.bindBuffer(gl.ARRAY_BUFFER, triangleColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    
    // 设置视口
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // 设置清屏颜色
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
}

// 更新三角形位置
function updateTrianglePosition(dt) {
    // 根据按键状态更新位置
    if (keyStates.ArrowUp) {
        triangleY += moveSpeed * dt;
    }
    if (keyStates.ArrowDown) {
        triangleY -= moveSpeed * dt;
    }
    if (keyStates.ArrowLeft) {
        triangleX -= moveSpeed * dt;
    }
    if (keyStates.ArrowRight) {
        triangleX += moveSpeed * dt;
    }
    
    // 限制移动范围在屏幕内
    triangleX = Math.max(-0.9, Math.min(0.9, triangleX));
    triangleY = Math.max(-0.9, Math.min(0.9, triangleY));
    
    // 如果按空格键，重置位置
    if (keyStates.Space) {
        triangleX = 0.0;
        triangleY = 0.0;
        keyStates.Space = false; // 只重置一次
    }
}

// 处理键盘事件
function handleKeyEvent(key, action) {
    // 只处理我们关心的按键
    if (Object.keys(keyStates).includes(key)) {
        keyStates[key] = (action === 'down');
        console.log(`DEBUG: 键盘输入 - ${key}: ${keyStates[key]}`);
    }
}

// WASM向JS暴露的渲染函数
self.renderFrameFromWasm = function(rotation) {
    // 减少日志输出频率，避免控制台被刷屏
    if (Math.random() < 0.01) { // 只有1%的调用会打印日志
        console.log('DEBUG: renderFrameFromWasm 被调用，旋转角度:', rotation);
    }
    
    if (!gl) {
        console.error('DEBUG: WebGL上下文为空!');
        return;
    }
    
    if (!shaderProgram) {
        console.error('DEBUG: 着色器程序为空!');
        return;
    }
    
    // 强制设置旋转角度防止为null或undefined
    rotation = parseFloat(rotation) || 45.0;

    try {
        // 清屏
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        // 使用着色器程序
        gl.useProgram(shaderProgram);
        
        // 设置旋转uniform
        gl.uniform1f(rotationUniform, rotation);
        
        // 使用固定的顶点数据，但根据位置偏移
        const vertices = [
            0.0 + triangleX,  0.5 + triangleY, 0.0,  // 顶部
           -0.5 + triangleX, -0.5 + triangleY, 0.0,  // 左下
            0.5 + triangleX, -0.5 + triangleY, 0.0   // 右下
        ];
        
        // 确保缓冲对象存在
        if (!triangleBuffer) {
            triangleBuffer = gl.createBuffer();
            if (!triangleBuffer) {
                console.error('DEBUG: 无法创建顶点缓冲!');
                return;
            }
        }
        
        // 更新顶点缓冲
        gl.bindBuffer(gl.ARRAY_BUFFER, triangleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 3, gl.FLOAT, false, 0, 0);
        
        // 确保颜色缓冲对象存在
        if (!triangleColorBuffer) {
            triangleColorBuffer = gl.createBuffer();
            if (!triangleColorBuffer) {
                console.error('DEBUG: 无法创建颜色缓冲!');
                return;
            }
        }
        
        // 设置颜色数据 - 使用鲜艳的RGB颜色
        const colors = [
            1.0, 0.0, 0.0, 1.0,  // 红色 (顶部)
            0.0, 1.0, 0.0, 1.0,  // 绿色 (左下)
            0.0, 0.0, 1.0, 1.0   // 蓝色 (右下)
        ];
        gl.bindBuffer(gl.ARRAY_BUFFER, triangleColorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(colorAttrib);
        gl.vertexAttribPointer(colorAttrib, 4, gl.FLOAT, false, 0, 0);
        
        // 绘制三角形
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        
        // 检查WebGL错误
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.error('DEBUG: WebGL错误:', error);
        }
    } catch (e) {
        console.error('DEBUG: 渲染三角形时出错:', e);
    }
};

// 确保在所有可能的作用域中都可以访问到renderFrameFromWasm函数
// 1. 全局作用域
try {
    renderFrameFromWasm = self.renderFrameFromWasm;
} catch (e) {
    console.log('DEBUG: 无法定义全局renderFrameFromWasm:', e);
}

// 2. globalThis作用域
globalThis.renderFrameFromWasm = self.renderFrameFromWasm;

// 3. 确保Module对象也有这个函数
if (typeof Module !== 'undefined') {
    Module.renderFrameFromWasm = self.renderFrameFromWasm;
}

// 输出调试信息
console.log('DEBUG: 渲染函数已定义: ');
console.log('- self.renderFrameFromWasm:', typeof self.renderFrameFromWasm);
console.log('- globalThis.renderFrameFromWasm:', typeof globalThis.renderFrameFromWasm);
console.log('- renderFrameFromWasm:', typeof renderFrameFromWasm);

// 清理WebGL资源
self.cleanupWebGL = function() {
    if (!gl) return;
    
    // 删除着色器程序和缓冲
    if (shaderProgram) gl.deleteProgram(shaderProgram);
    if (triangleBuffer) gl.deleteBuffer(triangleBuffer);
    if (triangleColorBuffer) gl.deleteBuffer(triangleColorBuffer);
    
    // 重置变量
    shaderProgram = null;
    triangleBuffer = null;
    triangleColorBuffer = null;
    gl = null;
    canvas = null;
    
    console.log('WebGL资源已清理');
};

// 加载WASM模块并初始化
function loadWasmModule() {
    if (moduleLoaded) {
        console.log('DEBUG: WASM模块已经加载过了');
        return;
    }
    
    console.log('DEBUG: 准备加载WASM模块');
    console.log('DEBUG: 设置全局renderFrameFromWasm函数');
    
    // 先清除Module，确保我们重新加载
    self.Module = null;
    
    // 先在所有可能的作用域中定义渲染函数
    globalThis.renderFrameFromWasm = self.renderFrameFromWasm;
    
    // 设置Emscripten模块配置 - 必须在importScripts前设置
    self.Module = {
        // 必要的参数
        canvas: canvas,
        
        // 调试选项
        print: function(text) { console.log('WASM:', text); },
        printErr: function(text) { console.error('WASM Error:', text); },
        
        // 增加内存大小
        TOTAL_MEMORY: 32 * 1024 * 1024,
        
        // 添加渲染函数
        renderFrameFromWasm: self.renderFrameFromWasm,
        
        // 测试函数
        testFunction: function() {
            console.log('DEBUG: WASM模块中的测试函数被调用');
            return true;
        },
        
        // 初始化前的准备工作
        preRun: [
            function() {
                console.log('DEBUG: WASM模块preRun函数被调用');
                // 再次确认渲染函数可用
                console.log('DEBUG: 检查渲染函数: self=', typeof self.renderFrameFromWasm, 
                             'globalThis=', typeof globalThis.renderFrameFromWasm,
                             'Module=', typeof self.Module.renderFrameFromWasm);
            }
        ],
        
        // 初始化完成回调
        onRuntimeInitialized: function() {
            console.log('DEBUG: WASM模块初始化完成');
            
            // 保存引用并设置状态
            WasmModule = self.Module;
            moduleLoaded = true;
            
            // 打印导出的函数
            console.log('DEBUG: WASM模块导出的函数:',
                       Object.keys(self.Module).filter(key => key.startsWith('_')).join(', '));
            
            // 测试调用WASM模块的函数
            try {
                var canvasWidth = gl.canvas.width;
                var canvasHeight = gl.canvas.height;
                console.log('DEBUG: 准备调用init_libs函数, 是否存在:', typeof self.Module._init_libs);
                
                if (typeof self.Module._init_libs === 'function') {
                    self.Module._init_libs(canvasWidth, canvasHeight);
                    console.log('DEBUG: 成功调用init_libs函数');
                    
                    // 尝试调用JS测试函数 - 这将调用js_test_function在C代码中定义的EM_JS函数
                    if (typeof self.Module._js_test_function === 'function') {
                        console.log('DEBUG: 调用js_test_function...');
                        self.Module._js_test_function();
                    } else {
                        console.log('DEBUG: js_test_function不存在');
                    }
                } else {
                    console.error('DEBUG: init_libs函数不存在!');
                }
            } catch (e) {
                console.error('DEBUG: 调用WASM函数出错:', e, e.stack);
            }
        },
        
        // 确保在Worker环境中正确加载WASM
        locateFile: function(path) {
            console.log('DEBUG: 定位文件:', path);
            return path; // 直接返回路径，可以使用相对路径
        }
    };
    
    console.log('DEBUG: preload demo.js');
    
    // 检查Module对象
    console.log('DEBUG: Module对象状态（加载前）:', typeof self.Module, self.Module ? Object.keys(self.Module).length : 'null');
    
    try {
        // 加载WASM模块脚本
        importScripts('demo.js');
        console.log('DEBUG: demo.js loaded');
        
        // 再次检查Module对象
        console.log('DEBUG: Module对象状态（加载后）:', typeof self.Module, self.Module ? Object.keys(self.Module).length : 'null');
        
        // 检查Module对象的状态
        console.log('DEBUG: 检查Module是否是一个函数:', typeof self.Module === 'function');
        
        // 如果Module是一个函数，这是Emscripten的延迟初始化模式
        if (typeof self.Module === 'function') {
            console.log('DEBUG: Module是一个函数，需要手动初始化');
            
            // 获取真正的Module对象
            try {
                // 执行这个函数会返回真正的Module对象或Promise
                var moduleOrPromise = self.Module();
                console.log('DEBUG: 已获取Module返回值，类型:', typeof moduleOrPromise);
                
                if (moduleOrPromise && typeof moduleOrPromise.then === 'function') {
                    // 如果返回的是Promise，等待它解析
                    console.log('DEBUG: Module()返回了Promise，等待解析');
                    moduleOrPromise.then(function(realModule) {
                        console.log('DEBUG: Module Promise已解析');
                        // 设置Module并初始化
                        self.Module = realModule;
                        WasmModule = realModule;
                        moduleLoaded = true;
                        
                        // 挂载渲染函数
                        self.Module.renderFrameFromWasm = self.renderFrameFromWasm;
                        
                        // 初始化
                        initializeWasmModule();
                    }).catch(function(err) {
                        console.error('DEBUG: Module Promise失败:', err);
                    });
                } else {
                    // 如果直接返回了Module对象
                    console.log('DEBUG: Module()直接返回了对象');
                    self.Module = moduleOrPromise;
                    WasmModule = moduleOrPromise;
                    moduleLoaded = true;
                    
                    // 挂载渲染函数
                    self.Module.renderFrameFromWasm = self.renderFrameFromWasm;
                    
                    // 如果有ready Promise，使用它
                    if (self.Module.ready && typeof self.Module.ready.then === 'function') {
                        console.log('DEBUG: 发现Module.ready，等待初始化完成');
                        self.Module.ready.then(function() {
                            console.log('DEBUG: Module.ready Promise已解析');
                            initializeWasmModule();
                        }).catch(function(err) {
                            console.error('DEBUG: Module.ready Promise失败:', err);
                        });
                    } else {
                        // 否则直接初始化
                        console.log('DEBUG: Module.ready不存在，直接初始化');
                        initializeWasmModule();
                    }
                }
            } catch (e) {
                console.error('DEBUG: 执行Module函数出错:', e);
            }
        } 
        // 如果Module已经是一个对象
        else if (self.Module) {
            console.log('DEBUG: Module已经是一个对象，检查属性:', Object.keys(self.Module).join(', '));
            
            // 保存引用
            WasmModule = self.Module;
            moduleLoaded = true;
            
            // 如果有ready Promise，使用它
            if (self.Module.ready && typeof self.Module.ready.then === 'function') {
                console.log('DEBUG: 发现Module.ready，等待初始化完成');
                self.Module.ready.then(function() {
                    console.log('DEBUG: Module.ready Promise已解析');
                    initializeWasmModule();
                }).catch(function(err) {
                    console.error('DEBUG: Module.ready Promise失败:', err);
                });
            } else {
                // 否则直接初始化
                console.log('DEBUG: Module.ready不存在或不是Promise，直接初始化');
                initializeWasmModule();
            }
        } else {
            console.error('DEBUG: 无法获取有效的Module对象');
        }
    } catch (e) {
        console.error('DEBUG: 加载WASM模块出错:', e);
    }
}

// 辅助函数：初始化WASM模块
function initializeWasmModule() {
    if (!WasmModule) {
        console.error('DEBUG: 无法初始化WASM模块，WasmModule为空');
        return;
    }
    
    // 打印导出的函数
    var wasmFunctions = Object.keys(WasmModule).filter(key => key.startsWith('_'));
    console.log('DEBUG: WASM模块导出的函数:', wasmFunctions.join(', '));
    
    // 初始化WebGL
    if (typeof WasmModule._init_libs === 'function') {
        try {
            var canvasWidth = gl.canvas.width;
            var canvasHeight = gl.canvas.height;
            WasmModule._init_libs(canvasWidth, canvasHeight);
            console.log('DEBUG: 成功调用init_libs函数');
            
            // 发送初始化完成消息
            postMessage({ type: 'initialized' });
            
            // 强制开始渲染
            startRenderLoop();
        } catch (e) {
            console.error('DEBUG: 调用init_libs出错:', e);
        }
    } else {
        console.error('DEBUG: _init_libs函数不存在!');
    }
}

// 处理积压的消息
function processPendingMessages() {
    if (!moduleLoaded) return;
    
    pendingMessages.forEach(msg => handleMessage(msg));
    pendingMessages = [];
}

// 启动渲染循环
function startRenderLoop() {
    if (!running) {
        running = true;
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(renderLoop);
        
        postMessage({ type: 'status', status: '渲染循环已启动' });
    }
}

// 停止渲染循环
function stopRenderLoop() {
    if (running) {
        running = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        
        postMessage({ type: 'status', status: '渲染循环已停止' });
    }
}

// 渲染循环
function renderLoop() {
    if (!running) {
        console.log('DEBUG: renderLoop退出 - 渲染没有运行');
        return;
    }
    
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1); // 限制最大时间步长
    lastTime = now;
    
    // 更新三角形位置
    updateTrianglePosition(dt);
    
    // 首先调用我们的renderFrameFromWasm函数来绘制彩色三角形
    // 这确保即使没有WASM模块，我们也能看到三角形
    try {
        // 使用dt*100作为旋转角度，让三角形旋转
        self.renderFrameFromWasm(dt * 100);
    } catch (e) {
        console.error('DEBUG: 调用renderFrameFromWasm出错:', e);
    }
    
    // 如果WASM模块已加载，调用其frame函数
    if (moduleLoaded && WasmModule) {
        try {
            // 检查_frame函数
            if (typeof WasmModule._frame === 'function') {
                // 这里我们不打印太多日志，只在必要时打印
                // console.log('DEBUG: 调用WasmModule._frame, dt =', dt);
                WasmModule._frame(dt);
                
                // 测试调用js_render_frame函数
                if (typeof WasmModule._js_render_frame === 'function' && Math.random() < 0.01) { // 1%的概率调用以避免日志过多
                    console.log('DEBUG: 直接调用_js_render_frame函数...');
                    WasmModule._js_render_frame(dt * 100);
                }
            } else if (!warnedAboutFrame) {
                console.warn('DEBUG: WasmModule._frame函数不存在，可用函数:', 
                             Object.keys(WasmModule).filter(k => k.startsWith('_')).join(', '));
                warnedAboutFrame = true;
            }
        } catch (e) {
            console.error('DEBUG: 调用WASM模块函数出错:', e);
            // 清除模块状态，强制重新加载
            if (e.toString().includes('function not found')) {
                console.log('DEBUG: 检测到函数不存在错误，尝试重新加载WASM');
                moduleLoaded = false;
                WasmModule = null;
                loadWasmModule();
            }
        }
    }
    
    // 发送FPS更新
    const fps = Math.round(1.0 / dt);
    postMessage({ type: 'fps', fps: fps });
    
    // 调度下一帧
    animationFrameId = requestAnimationFrame(renderLoop);
}

// 监听来自主线程的消息
self.onmessage = function(e) {
    const msg = e.data;
    
    switch (msg.type) {
        case 'init':
            // 初始化Canvas
            if (initCanvas(msg.canvas)) {
                postMessage({ type: 'status', status: '初始化OffscreenCanvas成功' });
                // 开始加载模块
                loadWasmModule();
            }
            break;
            
        case 'key_event':
            // 处理键盘事件
            handleKeyEvent(msg.key, msg.action);
            break;
            
        case 'set_speed':
            // 设置移动速度
            if (typeof msg.speed === 'number') {
                moveSpeed = msg.speed;
                console.log('DEBUG: 移动速度已设置为:', moveSpeed);
                postMessage({ type: 'status', status: `移动速度已设置为 ${moveSpeed.toFixed(1)}` });
            }
            break;
            
        case 'start':
            if (moduleLoaded) {
                console.log('DEBUG: 收到start消息，开始渲染');
                running = true;
                lastTime = performance.now();
                
                try {
                    console.log('DEBUG: 调用WasmModule._start_rendering()');
                    WasmModule._start_rendering();
                    
                    // 立即调用渲染函数一次，确保图形显示
                    console.log('DEBUG: 调用WasmModule._frame(0.016)');
                    WasmModule._frame(0.016); // 等价于60fps的一帧
                    
                    console.log('DEBUG: 请求动画帧');
                    animationFrameId = requestAnimationFrame(renderLoop);
                } catch (e) {
                    console.error('DEBUG: 开始渲染时出错:', e);
                }
                
                postMessage({ type: 'status', status: '渲染已开始' });
            } else {
                // 如果模块还没加载完，将消息添加到待处理队列
                pendingMessages.push(msg);
            }
            break;
            
        case 'stop':
            if (moduleLoaded) {
                WasmModule._stop_rendering();
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                running = false;
                postMessage({ type: 'status', status: '渲染已停止' });
            } else {
                pendingMessages.push(msg);
            }
            break;
            
        case 'resize':
            if (moduleLoaded && gl) {
                WasmModule._handle_resize(msg.width, msg.height);
                gl.viewport(0, 0, msg.width, msg.height);
                postMessage({ type: 'status', status: `画布尺寸已调整为 ${msg.width}x${msg.height}` });
            } else {
                pendingMessages.push(msg);
            }
            break;
            
        case 'mouse_move':
            if (moduleLoaded) {
                WasmModule._handle_mouse_move(msg.x, msg.y);
            }
            break;
            
        case 'mouse_button':
            if (moduleLoaded) {
                WasmModule._handle_mouse_button(msg.button, msg.action);
            }
            break;
            
        case 'terminate':
            // 清理并关闭 Worker
            if (moduleLoaded) {
                WasmModule._cleanup();
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }
                // 清理WebGL资源
                if (typeof cleanupWebGL === 'function') {
                    cleanupWebGL();
                }
            }
            postMessage({ type: 'status', status: 'Worker即将终止' });
            setTimeout(() => {
                self.close();
            }, 100);
            break;
    }
};

// 初始通知
postMessage({ type: 'status', status: 'Sokol Worker已启动' });
console.log('DEBUG: 开始检查浏览器控制台是否有错误信息');
