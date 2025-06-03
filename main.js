// main.js - 主线程脚本
// 用于管理Worker、处理用户输入和传递OffscreenCanvas

// 全局变量
let worker = null;
let canvas = null;
let isInitialized = false;
let isRunning = false;
let statusElement = null;
let fpsElement = null;
let startButton = null;
let stopButton = null;

// 初始化
function init() {
    console.log('初始化WebGL Worker示例...');
    
    // 获取DOM元素
    canvas = document.getElementById('canvas');
    fpsElement = document.getElementById('fps');
    statusElement = document.getElementById('status');
    startButton = document.getElementById('startButton');
    stopButton = document.getElementById('stopButton');
    const speedControl = document.getElementById('speedControl');
    const speedValue = document.getElementById('speedValue');
    
    // 检查OffscreenCanvas支持
    if (!canvas.transferControlToOffscreen) {
        updateStatus('错误: 您的浏览器不支持OffscreenCanvas', true);
        return false;
    }
    
    // 创建Worker
    try {
        worker = new Worker('worker.js');
        worker.onmessage = handleWorkerMessage;
        
        // 传输Canvas控制权到Worker
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
        
        // 注册事件处理
        setupEventListeners();
        
        // 设置速度控制滑块
        if (speedControl && speedValue) {
            speedControl.addEventListener('input', function() {
                const speed = parseFloat(this.value);
                speedValue.textContent = speed.toFixed(1);
                worker.postMessage({
                    type: 'set_speed',
                    speed: speed
                });
            });
        }
        
        updateStatus('初始化中...');
        return true;
    } catch (err) {
        updateStatus(`错误: 创建Worker失败: ${err.message}`, true);
        return false;
    }
}

// 处理Worker消息
function handleWorkerMessage(event) {
    const msg = event.data;
    
    switch (msg.type) {
        case 'status':
            updateStatus(msg.status);
            break;
            
        case 'initialized':
            // 当WASM模块初始化完成时，自动开始渲染
            if (!isRunning) {
                worker.postMessage({ type: 'start' });
                isRunning = true;
                startButton.disabled = true;
                stopButton.disabled = false;
                updateStatus('渲染已自动开始');
            }
            break;
            
        case 'error':
            updateStatus(`错误: ${msg.message}`, true);
            console.error(msg.message);
            break;
            
        case 'fps':
            updateFps(msg.fps);
            break;
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 启动按钮
    startButton.addEventListener('click', () => {
        if (!isInitialized || isRunning) return;
        
        worker.postMessage({ type: 'start' });
        isRunning = true;
        startButton.disabled = true;
        stopButton.disabled = false;
    });
    
    // 停止按钮
    stopButton.addEventListener('click', () => {
        if (!isInitialized || !isRunning) return;
        
        worker.postMessage({ type: 'stop' });
        isRunning = false;
        startButton.disabled = false;
        stopButton.disabled = true;
    });
    
    // 添加键盘控制
    window.addEventListener('keydown', (event) => {
        if (!isRunning) return;
        
        // 防止方向键滚动页面
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.key)) {
            event.preventDefault();
        }
        
        // 发送键盘事件到Worker
        worker.postMessage({
            type: 'key_event',
            action: 'down',
            key: event.key
        });
        
        updateStatus(`键盘输入: ${event.key} (按下)`);
    });
    
    window.addEventListener('keyup', (event) => {
        if (!isRunning) return;
        
        // 发送键盘释放事件到Worker
        worker.postMessage({
            type: 'key_event',
            action: 'up',
            key: event.key
        });
        
        updateStatus(`键盘输入: ${event.key} (释放)`);
    });
    
    // 鼠标移动事件
    canvas.addEventListener('mousemove', (event) => {
        if (!isRunning) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        worker.postMessage({
            type: 'mouse_move',
            x: x,
            y: y
        });
    });
    
    // 鼠标按钮事件
    canvas.addEventListener('mousedown', (event) => {
        if (!isRunning) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        worker.postMessage({
            type: 'mouse_button',
            button: event.button,
            action: 1, // 按下
            x: x,
            y: y
        });
    });
    
    canvas.addEventListener('mouseup', (event) => {
        if (!isRunning) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        worker.postMessage({
            type: 'mouse_button',
            button: event.button,
            action: 0, // 释放
            x: x,
            y: y
        });
    });
    
    // 阻止右键菜单
    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        return false;
    });
    
    // 窗口大小改变事件
    window.addEventListener('resize', () => {
        if (!isInitialized) return;
        
        // 调整Canvas尺寸
        updateCanvasSize();
    });
}

// 更新Canvas尺寸
function updateCanvasSize() {
    const width = canvas.width;
    const height = canvas.height;
    
    worker.postMessage({
        type: 'resize',
        width: width,
        height: height
    });
}

// 更新状态显示
function updateStatus(message, isError = false) {
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = isError ? 'error' : '';
    }
    console.log(`状态: ${message}`);
}

// 更新FPS显示
function updateFps(fps) {
    if (fpsElement) {
        fpsElement.textContent = `FPS: ${fps}`;
    }
}

// 终止应用
function terminate() {
    if (worker) {
        worker.postMessage({ type: 'terminate' });
        worker = null;
        isRunning = false;
        isInitialized = false;
        updateStatus('已终止');
    }
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);

// 页面关闭前清理
window.addEventListener('beforeunload', terminate);
