#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <stdbool.h>
#include <emscripten.h>

// 全局变量
static bool is_initialized = false;
static bool is_running = false;
static int canvas_width = 800;
static int canvas_height = 600;
static double mouse_x = 0;
static double mouse_y = 0;
static int mouse_buttons = 0;
static float rotation = 45.0f; // 初始旋转角度设置为45度，确保一开始就能看到三角形

// 通过EM_JS定义JavaScript函数，用于WebGL操作
EM_JS(void, js_init_webgl, (int width, int height), {
    console.log('初始化WebGL，尺寸:', width, 'x', height);
    // 注意：实际的WebGL初始化在Worker的JS代码中完成
});

// 测试JavaScript函数调用
EM_JS(void, js_test_function, (), {
    console.log('WASM测试调用JavaScript函数');
    if (typeof Module !== 'undefined' && typeof Module.testFunction === 'function') {
        console.log('Module.testFunction存在，准备调用');
        Module.testFunction();
        console.log('Module.testFunction调用完成');
    } else {
        console.error('Module.testFunction不存在!');
    }
});

// JS渲染函数调用 - 测试不同的调用方式
EM_JS(void, js_render_frame, (float rotation), {
    // 尝试多种不同的作用域查找函数
    if (typeof renderFrameFromWasm === 'function') {
        renderFrameFromWasm(rotation);
    } else if (typeof self !== 'undefined' && typeof self.renderFrameFromWasm === 'function') {
        console.log('2. self作用域找到renderFrameFromWasm函数，准备调用');
        self.renderFrameFromWasm(rotation);
    } else if (typeof globalThis !== 'undefined' && typeof globalThis.renderFrameFromWasm === 'function') {
        console.log('3. globalThis作用域找到renderFrameFromWasm函数，准备调用');
        globalThis.renderFrameFromWasm(rotation);
    } else if (typeof Module !== 'undefined' && typeof Module.renderFrameFromWasm === 'function') {
        console.log('4. Module作用域找到renderFrameFromWasm函数，准备调用');
        Module.renderFrameFromWasm(rotation);
    } else {
        console.error('找不到renderFrameFromWasm函数!');
        // 打印各个可能的作用域
        console.log('全局对象:', typeof globalThis);
        console.log('self对象:', typeof self);
        console.log('Module对象:', typeof Module);
        
        if (typeof Module !== 'undefined') {
            console.log('Module属性:', Object.keys(Module).join(', '));
        }
        
        // 直接测试WebGL渲染
        console.log('尝试直接使用WebGL API绘制...');
        // 这里可以添加简单的WebGL绘制代码
    }
});

// 初始化WebGL上下文
EMSCRIPTEN_KEEPALIVE
void init_libs(int width, int height) {
    if (is_initialized) return;
    
    // 设置canvas尺寸
    canvas_width = width;
    canvas_height = height;
    
    // 调用JavaScript初始化WebGL
    js_init_webgl(width, height);
    
    // 强制立即绘制一帧，确保三角形显示
    js_render_frame(rotation);
    
    // 标记为已初始化
    is_initialized = true;
    printf("WASM: 初始化完成，画布尺寸：%d x %d\n", width, height);
}

// 更新和渲染
EMSCRIPTEN_KEEPALIVE
void frame(float dt) {
    if (!is_initialized || !is_running) return;
    
    // 更新旋转角度
    rotation += dt * 60.0f;
    if (rotation > 360.0f) {
        rotation -= 360.0f;
    }
    
    // 调用JavaScript渲染函数
    js_render_frame(rotation);
}

// 开始渲染循环
EMSCRIPTEN_KEEPALIVE
void start_rendering() {
    is_running = true;
    // 强制立即绘制一帧，确保三角形显示
    js_render_frame(rotation);
}

// 停止渲染循环
EMSCRIPTEN_KEEPALIVE
void stop_rendering() {
    is_running = false;
}

// 处理鼠标移动
EMSCRIPTEN_KEEPALIVE
void handle_mouse_move(double x, double y) {
    mouse_x = x;
    mouse_y = y;
    
    // 这里可以实现鼠标交互逻辑
    printf("鼠标位置: %.1f, %.1f\n", mouse_x, mouse_y);
}

// 处理鼠标按钮
EMSCRIPTEN_KEEPALIVE
void handle_mouse_button(int button, int action) {
    if (action == 1) {
        mouse_buttons |= (1 << button);
    } else {
        mouse_buttons &= ~(1 << button);
    }
    
    printf("鼠标按钮: %d, 状态: %d\n", button, action);
}

// 处理窗口大小变化
EMSCRIPTEN_KEEPALIVE
void handle_resize(int width, int height) {
    canvas_width = width;
    canvas_height = height;
    printf("画布大小改变: %d x %d\n", width, height);
}

// 清理资源
EMSCRIPTEN_KEEPALIVE
void cleanup() {
    if (!is_initialized) return;
    
    // 调用JavaScript清理函数
    EM_ASM({
        if (typeof cleanupWebGL === 'function') {
            cleanupWebGL();
        }
    });
    
    is_initialized = false;
    is_running = false;
    printf("WASM: 清理完成\n");
}

// 主函数 - 在Emscripten环境中不会被调用
int main() {
    return 0;
}
