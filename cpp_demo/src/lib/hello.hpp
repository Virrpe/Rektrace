#pragma once
#include <string>
#include <string_view>

inline std::string greet(std::string_view name) {
  return std::string("hello, ") + std::string{name};
}
