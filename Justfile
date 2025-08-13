set shell := ["wsl","-d","Ubuntu","-e","/bin/bash","-lc"]
default: list
list:
	just --list

# setup
setup:
	./tools/r "pnpm i || npm i"

env:
	./tools/r "printenv | grep -E 'REKTRACE|OPENAI|ANTHROPIC' || true"

# dev / build
dev:
	./tools/r "pnpm dev || npm run dev"
build:
	./tools/r "pnpm build || npm run build"

# logs
logs:
	./tools/r "tail -n 120 -F logs/*.log || true"

# MCP
build-mcp:
	./tools/r "pnpm run -s build:mcp || npm run -s build:mcp"
start-sentinel:
	./tools/r "pnpm run start:sentinel || npm run start:sentinel"

# === rektrace-autopilot ===

sentinel:
	./tools/r "LOG_ROOT=logs NO_PROGRESS_TIMEOUT_S=300 AGENT_STATE_DIR=.cache/rektrace-agent AGENT_STATE_PATH=.cache/rektrace-agent/state.json pnpm run -s start:sentinel || LOG_ROOT=logs NO_PROGRESS_TIMEOUT_S=300 AGENT_STATE_DIR=.cache/rektrace-agent AGENT_STATE_PATH=.cache/rektrace-agent/state.json npm run -s start:sentinel"

spinner_test:
	./tools/r "printf '{\"running\": true, \"ts\": %s}\n' \"$(date +%s)\" > .cache/rektrace-agent/state.json && sleep 1 && ./tools/agent_status.sh && sleep 13 && ./tools/agent_status.sh"

# === mcp-addons ===
pg_test:
	./tools/r 'node -e "console.log(\'skip: run from Cursor mcp tools\')"'

prom_test:
	./tools/r "curl -s http://localhost:9090/-/ready || true"

dev_obs:
	./tools/r "docker compose up -d dragonfly postgres jaeger prometheus grafana"

# workers / servers
tg_worker:
	./tools/r "pnpm tsx workers/tg-worker.ts"

web_up:
	./tools/r "pnpm tsx servers/webhook.ts"

prom_ready:
	./tools/r "curl -s http://localhost:9090/-/ready || true"

# === Windows-friendly WSL wrappers ===
# Always bounce via WSL Ubuntu from Windows shells
wsl_run CMD:
	wsl.exe -d Ubuntu -- bash -lc "cd \"$PWD\" && {{CMD}}"

win_dev_obs:
	just wsl_run "docker compose up -d dragonfly postgres jaeger prometheus grafana"

win_db_schema_load:
	just wsl_run "docker compose cp db/schema.sql postgres:/schema.sql && docker compose exec -T postgres psql -U rektrace -d rektrace -f /schema.sql"

win_build_mcp:
	just wsl_run "just build-mcp"

win_tg_worker:
	just wsl_run "nohup pnpm tsx workers/tg-worker.ts > logs/tg-worker.out 2>&1 & echo worker_pid:$!"

win_web_up:
	just wsl_run "nohup pnpm tsx servers/webhook.ts > logs/webhook.out 2>&1 & echo web_pid:$!"

# === C++ lane (CMake+Ninja) ===
cpp:configure:
	@cmake --preset default

cpp:build:
	@cmake --build --preset default

cpp:run:
	@./build/cpp_demo/rektrace_cpp_demo

cpp:clean:
	@rm -rf build

# Quick single-file compile & run: just cpp:single FILE=path/to/foo.cpp
cpp:single FILE=hello.cpp:
	@g++ -std=c++20 -O2 -g -Wall -Wextra -o a.out {{FILE}} && ./a.out

# === C++ lane (extras) ===
cpp:test:
	@cmake --build build -j
	@ctest --test-dir build --output-on-failure

cpp:format:
	@find cpp_demo -type f \( -name "*.cpp" -o -name "*.hpp" -o -name "*.h" \) -print0 | xargs -0 clang-format -i
	@echo "formatted"

cpp:tidy:
	@clang-tidy cpp_demo/src/main.cpp -p build -- -std=c++20 || true
	@clang-tidy cpp_demo/src/bench.cpp -p build -- -std=c++20 || true
	@clang-tidy cpp_demo/tests/test_basic.cpp -p build -- -std=c++20 || true

cpp:bench:
	@cmake --build build -j --target rektrace_cpp_bench
	@./build/cpp_demo/rektrace_cpp_bench
