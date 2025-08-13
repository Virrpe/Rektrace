#include <cassert>
#include <iostream>
#include "lib/hello.hpp"

int main() {
  assert(greet("Ada") == "hello, Ada");
  std::cout << "tests ok\n";
  return 0;
}
