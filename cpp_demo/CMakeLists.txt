cmake_minimum_required(VERSION 3.16)
project(rektrace_cpp_demo LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Optional ccache
option(USE_CCACHE "Use ccache if available" ON)
if (USE_CCACHE)
  find_program(CCACHE_PROGRAM ccache)
  if (CCACHE_PROGRAM)
    message(STATUS "Using ccache: ${CCACHE_PROGRAM}")
    set(CMAKE_C_COMPILER_LAUNCHER   ${CCACHE_PROGRAM})
    set(CMAKE_CXX_COMPILER_LAUNCHER ${CCACHE_PROGRAM})
  endif()
endif()

# Sanitizers
option(ENABLE_ASAN  "Enable AddressSanitizer" OFF)
option(ENABLE_UBSAN "Enable UBSanitizer" OFF)
function(add_sanitizers target)
  if (ENABLE_ASAN)
    target_compile_options(${target} PRIVATE -fsanitize=address)
    target_link_options(${target}    PRIVATE -fsanitize=address)
  endif()
  if (ENABLE_UBSAN)
    target_compile_options(${target} PRIVATE -fsanitize=undefined)
    target_link_options(${target}    PRIVATE -fsanitize=undefined)
  endif()
endfunction()

# Library
add_library(rektrace_cpp_lib
  src/lib/hello.cpp
)
target_include_directories(rektrace_cpp_lib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_compile_options(rektrace_cpp_lib PRIVATE -Wall -Wextra -Wpedantic -O2 -g)
add_sanitizers(rektrace_cpp_lib)

# App
add_executable(rektrace_cpp_demo src/main.cpp)
target_link_libraries(rektrace_cpp_demo PRIVATE rektrace_cpp_lib)
target_compile_options(rektrace_cpp_demo PRIVATE -Wall -Wextra -Wpedantic -O2 -g)
add_sanitizers(rektrace_cpp_demo)

# Score CLI
add_executable(rektrace_cpp_score src/score.cpp)
target_link_libraries(rektrace_cpp_score PRIVATE rektrace_cpp_lib)
target_compile_options(rektrace_cpp_score PRIVATE -Wall -Wextra -Wpedantic -O2 -g)
add_sanitizers(rektrace_cpp_score)

# Micro-benchmark (optional)
if (EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/src/bench.cpp")
  add_executable(rektrace_cpp_bench src/bench.cpp)
  target_link_libraries(rektrace_cpp_bench PRIVATE rektrace_cpp_lib)
  target_compile_options(rektrace_cpp_bench PRIVATE -Wall -Wextra -Wpedantic -O2 -g)
  add_sanitizers(rektrace_cpp_bench)
endif()

# Tests
enable_testing()
add_executable(rektrace_cpp_tests tests/test_hello.cpp)
target_link_libraries(rektrace_cpp_tests PRIVATE rektrace_cpp_lib)
target_compile_options(rektrace_cpp_tests PRIVATE -Wall -Wextra -Wpedantic -O2 -g)
add_sanitizers(rektrace_cpp_tests)
add_test(NAME basic COMMAND rektrace_cpp_tests)
