#include <chrono>
#include <iostream>
#include <vector>

int main() {
  using clock = std::chrono::high_resolution_clock;
  constexpr int N = 100000; // 100k ops
  std::vector<int> v(1024, 1);

  auto t0 = clock::now();
  long long acc = 0;
  for (int i = 0; i < N; ++i) {
    acc += v[i & 1023];
  }
  auto t1 = clock::now();
  auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0).count();
  double ns_per_op = static_cast<double>(ns) / N;

  std::cout << "bench acc=" << acc << "  ns/op=" << ns_per_op << "\n";
  return 0;
}
