#!/bin/bash
# build_and_run.sh - 编译和运行WebGLWorker OffscreenCanvas Worker示例

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

PORT=8687
# 显示彩色信息
info() {
    echo -e "${BLUE}[信息]${NC} $1"
}

success() {
    echo -e "${GREEN}[成功]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[警告]${NC} $1"
}

error() {
    echo -e "${RED}[错误]${NC} $1"
    exit 1
}

# 确保环境设置正确
check_requirements() {
    info "检查必要的依赖项..."
    
    # 检查Emscripten
    if ! command -v emcc &> /dev/null; then
        error "未找到Emscripten。请确保已安装并激活Emscripten环境。"
    fi
    
    # 检查Python (用于启动HTTP服务器)
    if ! command -v python3 &> /dev/null; then
        warning "未找到Python3。将尝试使用Python2。"
        if ! command -v python &> /dev/null; then
            error "未找到Python。请安装Python以启动HTTP服务器。"
        fi
    fi
    
    success "所有必要的依赖项已找到。"
}

# 下载WebGLWorker头文件（如果尚未存在）
download_headers() {
    info "检查WebGLWorker头文件..."
    
    mkdir -p include
    
    # 不再需要下载WebGLWorker头文件
    info "跳过头文件下载，使用简化WebGL示例"
    
    success "WebGLWorker头文件准备就绪。"
}

# 修改C文件以使用正确的头文件路径
update_includes() {
    info "更新C文件中的头文件路径..."
        
    # 更新头文件路径
    sed -i '' 's|#include "gfx.h"|#include "include/gfx.h"|g' demo.c
    sed -i '' 's|#include "app.h"|#include "include/app.h"|g' demo.c
    sed -i '' 's|#include "glue.h"|#include "include/glue.h"|g' demo.c
    sed -i '' 's|#include "log.h"|#include "include/log.h"|g' demo.c
    
    success "头文件路径已更新。"
}

# 编译C代码
compile_code() {
    info "编译WebGLWorker示例..."
    
    emcc demo.c -o demo.js \
        -s WASM=1 \
        -s EXPORTED_FUNCTIONS="['_init_libs','_frame','_start_rendering','_stop_rendering','_handle_mouse_move','_handle_mouse_button','_handle_resize','_cleanup']" \
        -s EXPORTED_RUNTIME_METHODS="['cwrap']" \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s OFFSCREENCANVAS_SUPPORT=1 \
        -s USE_WEBGL2=1 \
        -s MODULARIZE=1 \
        -s ENVIRONMENT='worker' \
        -s NO_EXIT_RUNTIME=1 \
        -O2
        
    if [ $? -ne 0 ]; then
        error "编译失败。请检查错误信息。"
    fi
    
    success "编译成功。"
}

# 检测并终止已存在的服务器进程
kill_existing_server() {
    info "检测并终止已存在的HTTP服务器进程..."
    
    # 检测是否有进程占用指定端口
    if command -v lsof &> /dev/null; then
        # macOS/Linux
        SERVER_PID=$(lsof -ti :$PORT)
        if [ -n "$SERVER_PID" ]; then
            info "发现占用端口 $PORT 的进程 (PID: $SERVER_PID)。正在终止..."
            kill $SERVER_PID 2>/dev/null || true
            sleep 1
            # 如果进程仍然存在，强制终止
            if lsof -ti :$PORT > /dev/null; then
                info "强制终止进程..."
                kill -9 $SERVER_PID 2>/dev/null || true
            fi
            info "端口 $PORT 已释放"
        else
            info "端口 $PORT 当前未被占用"
        fi
    elif command -v netstat &> /dev/null; then
        # Windows
        info "使用netstat检测端口..."
        # Windows下的终止过程很复杂，这里简化处理
        info "请手动关闭任何可能占用端口 $PORT 的进程"
    else
        info "无法检测端口占用情况，继续启动服务器"
    fi
}

# 启动本地服务器
start_server() {
    info "启动HTTP服务器..."
    
    # 先终止已存在的服务器进程
    kill_existing_server
    
    # 获取当前目录的绝对路径
    DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    
    # 切换到项目根目录
    cd "$DIR"
    
    # 尝试使用Python3启动服务器
    if command -v python3 &> /dev/null; then
        info "使用Python3启动服务器..."
        # 获取本地IP地址
        if command -v ipconfig &> /dev/null; then
            # Windows
            IP=$(ipconfig | grep -i "ipv4" | head -1 | awk '{print $NF}')
        else
            # macOS/Linux
            IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
        fi
        
        URL="http://$IP:$PORT/index.html"
        
        info "服务器启动在: $URL"
        info "按Ctrl+C停止服务器"
        
        python3 -m http.server $PORT
    else
        # 回退到Python2
        info "使用Python2启动服务器..."
        python -m SimpleHTTPServer 8000
    fi
}

# 打开浏览器
open_browser() {
    info "尝试打开浏览器..."
    
    URL="http://localhost:8687/index.html"
    
    # 尝试打开浏览器 (根据操作系统)
    if [ "$(uname)" == "Darwin" ]; then
        # macOS
        open "$URL"
    elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
        # Linux
        xdg-open "$URL"
    elif [ "$(expr substr $(uname -s) 1 10)" == "MINGW32_NT" ] || [ "$(expr substr $(uname -s) 1 10)" == "MINGW64_NT" ]; then
        # Windows
        start "$URL"
    else
        warning "无法自动打开浏览器。请手动访问: $URL"
    fi
}

# 主函数
main() {
    echo "========================================"
    echo "  WebGLWorker OffscreenCanvas Worker 示例构建"
    echo "========================================"
    
    check_requirements
    download_headers
    update_includes
    compile_code
    
    echo "========================================"
    echo "  构建完成，正在启动服务器"
    echo "========================================"
    
    # 在后台打开浏览器，然后启动服务器
    open_browser &
    start_server
}

# 执行主函数
main
